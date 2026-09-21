import axios, { AxiosRequestConfig, CancelTokenSource } from 'axios'
import { parseYaml } from '../utils/yaml'
import { app, shell } from 'electron'
import { getRuntimeConfig } from '../core/factory'
import { dataDir, exeDir, exePath, isPortable, resourcesFilesDir } from '../utils/dirs'
import { copyFile, rm, writeFile, readFile } from 'fs/promises'
import { writeFileSync } from 'fs'
import path from 'path'
import { existsSync } from 'fs'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { createHash } from 'crypto'
import { setNotQuitDialog, mainWindow } from '..'
import { getAppConfig } from '../config'
import { IS_BETA } from '../utils/flavor'
import { disableSysProxy } from '../sys/sysproxy'
import { t } from '../utils/i18n'

let downloadCancelToken: CancelTokenSource | null = null

async function axiosWithFallback(config: AxiosRequestConfig): Promise<import('axios').AxiosResponse> {
  try {
    return await axios({ ...config, proxy: false, timeout: 10000 })
  } catch {
    const { 'mixed-port': mixedPort = 0 } = (await getRuntimeConfig()) ?? {}
    if (mixedPort === 0) throw new Error(t('error.downloadFailed'))
    return await axios({
      ...config,
      proxy: { protocol: 'http', host: '127.0.0.1', port: mixedPort },
      timeout: 15000
    })
  }
}

function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string): number[] => v.split('.').map((n) => parseInt(n, 10) || 0)
  const r = parse(remote)
  const c = parse(current)
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    const diff = (r[i] ?? 0) - (c[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

// The newest release found by the last successful check (undefined when up to date).
// Read by the tray menu, so it is the same answer the window and the watcher got.
let availableUpdate: AppVersion | undefined

export function getAvailableUpdate(): AppVersion | undefined {
  return availableUpdate
}

export async function checkUpdate(): Promise<AppVersion | undefined> {
  const url = 'https://github.com/Jidos86/VelumVPN/releases/latest/download/latest.yml'
  const res = await axiosWithFallback({
    url,
    headers: { 'Content-Type': 'application/octet-stream' },
    responseType: 'text'
  })
  const latest = parseYaml<AppVersion>(res.data)
  const currentVersion = app.getVersion()
  availableUpdate = isNewerVersion(latest.version, currentVersion) ? latest : undefined
  return availableUpdate
}

// ── Installer file ────────────────────────────────────────────────────────────

function installerFile(): string | undefined {
  const fileMap = {
    'win32-x64': `VelumVPN_x64-setup.exe`,
    'win32-arm64': `VelumVPN_arm64-setup.exe`,
    'darwin-x64': `VelumVPN_x64.pkg`,
    'darwin-arm64': `VelumVPN_arm64.pkg`
  }
  let file: string | undefined = fileMap[`${process.platform}-${process.arch}`]
  if (file && isPortable()) {
    file = file.replace('-setup.exe', '-portable.7z')
  }
  return file
}

// Installing without a click (at launch or on exit) is only done for the Windows installer build:
// macOS needs an administrator password and the portable build is replaced in place by the user.
// Never from a dev run or the beta flavor: the installer is machine-wide and would replace the
// real installed app.
export function autoInstallSupported(): boolean {
  return process.platform === 'win32' && !isPortable() && app.isPackaged && !IS_BETA
}

// ── Pending update: a verified installer waiting to be run ───────────────────

interface PendingUpdate {
  version: string
  file: string
  // SHA-256 the installer was verified against when it was downloaded
  sha256: string
  // how many times an automatic install of it was started; stops a broken installer from
  // taking the app down on every launch
  attempts: number
}

const MAX_INSTALL_ATTEMPTS = 2
const pendingPath = (): string => path.join(dataDir(), 'pending-update.json')

async function readPending(): Promise<PendingUpdate | null> {
  try {
    const data = JSON.parse(await readFile(pendingPath(), 'utf-8')) as Partial<PendingUpdate>
    if (!data.version || !data.file || !data.sha256) return null
    return { version: data.version, file: data.file, sha256: data.sha256, attempts: data.attempts ?? 0 }
  } catch {
    return null
  }
}

async function writePending(pending: PendingUpdate): Promise<void> {
  await writeFile(pendingPath(), JSON.stringify(pending), 'utf-8')
}

async function clearPending(pending?: PendingUpdate | null): Promise<void> {
  if (pending) await rm(path.join(dataDir(), pending.file), { force: true })
  await rm(pendingPath(), { force: true })
}

async function sha256Of(file: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex')
    .toLowerCase()
}

// A pending update that may be installed automatically right now, or null.
async function usablePending(): Promise<{ pending: PendingUpdate; installerPath: string } | null> {
  if (!autoInstallSupported()) return null
  const { autoUpdate = true } = await getAppConfig()
  if (!autoUpdate) return null
  const pending = await readPending()
  if (!pending) return null
  if (!isNewerVersion(pending.version, app.getVersion())) {
    // already installed (or an older one): nothing to do, clean up the leftover
    await clearPending(pending)
    return null
  }
  const installerPath = path.join(dataDir(), pending.file)
  if (!existsSync(installerPath) || pending.attempts >= MAX_INSTALL_ATTEMPTS) return null
  if ((await sha256Of(installerPath)) !== pending.sha256) {
    await clearPending(pending)
    return null
  }
  return { pending, installerPath }
}

// ── Download ──────────────────────────────────────────────────────────────────

class UpdateCancelled extends Error {}

async function fetchInstaller(version: string, silent: boolean): Promise<PendingUpdate> {
  const file = installerFile()
  if (!file) {
    throw new Error(t('error.autoUpdateNotSupported'))
  }
  const releaseTag = version
  const baseUrl = `https://github.com/Jidos86/VelumVPN/releases/download/${releaseTag}/`
  downloadCancelToken = axios.CancelToken.source()

  const apiUrl = `https://api.github.com/repos/Jidos86/VelumVPN/releases/tags/${releaseTag}`
  // A background download must not touch the window or the taskbar.
  const report = (status: { downloading: boolean; progress: number; error?: string }): void => {
    if (!silent) mainWindow?.webContents.send('update-status', status)
  }
  const taskbar = (value: number): void => {
    if (!silent) mainWindow?.setProgressBar(value)
  }

  try {
    report({ downloading: true, progress: 0 })
    taskbar(0)

    const releaseRes = await axiosWithFallback({
      url: apiUrl,
      headers: { Accept: 'application/vnd.github.v3+json' },
      cancelToken: downloadCancelToken.token
    })
    const assets: Array<{ name: string; digest?: string }> = releaseRes.data.assets || []
    const matchedAsset = assets.find((a) => a.name === file)
    if (!matchedAsset || !matchedAsset.digest) {
      throw new Error(`${t('error.sha256NotFound')}: "${file}"`)
    }
    const expectedHash = matchedAsset.digest.split(':')[1].toLowerCase()

    if (!existsSync(path.join(dataDir(), file))) {
      const { 'mixed-port': mixedPort = 0 } = (await getRuntimeConfig()) ?? {}
      const downloadConfig: AxiosRequestConfig = {
        url: `${baseUrl}${file}`,
        responseType: 'arraybuffer',
        proxy: false,
        headers: { 'Content-Type': 'application/octet-stream' },
        cancelToken: downloadCancelToken.token,
        onDownloadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          )
          report({ downloading: true, progress: percentCompleted })
          taskbar(percentCompleted / 100)
        }
      }
      let res
      try {
        res = await axios({ ...downloadConfig, timeout: 60000 })
      } catch {
        if (mixedPort !== 0) {
          res = await axios({
            ...downloadConfig,
            proxy: { protocol: 'http', host: '127.0.0.1', port: mixedPort },
            timeout: 120000
          })
        } else {
          throw new Error(t('error.downloadFailed'))
        }
      }
      await writeFile(path.join(dataDir(), file), res.data)
    }

    const localHash = await sha256Of(path.join(dataDir(), file))
    if (localHash !== expectedHash) {
      await rm(path.join(dataDir(), file), { force: true })
      throw new Error(
        `${t('error.sha256VerificationFailed')}：${t('error.localHash')} ${localHash} ${t('error.expectedHash')} ${expectedHash} ${t('error.mismatch')}`
      )
    }

    report({ downloading: false, progress: 100 })
    taskbar(-1)
    return { version, file, sha256: expectedHash, attempts: 0 }
  } catch (e) {
    await rm(path.join(dataDir(), file), { force: true })
    taskbar(-1)
    if (axios.isCancel(e)) {
      report({ downloading: false, progress: 0, error: t('error.downloadCancelled') })
      throw new UpdateCancelled()
    }
    report({
      downloading: false,
      progress: 0,
      error: e instanceof Error ? e.message : t('error.downloadFailed')
    })
    throw e
  } finally {
    downloadCancelToken = null
  }
}

let activeDownload: { version: string; promise: Promise<PendingUpdate> } | null = null

// Downloads and verifies the installer of `version` and remembers it as the pending update.
// Returns at once if that version is already downloaded; concurrent calls share one download.
export async function downloadUpdate(version: string, silent = false): Promise<PendingUpdate> {
  if (activeDownload?.version === version) return activeDownload.promise
  const existing = await readPending()
  if (existing?.version === version && existsSync(path.join(dataDir(), existing.file))) {
    return existing
  }
  // an installer of an older release must not be mistaken for this one (the file name is the same)
  if (existing) await clearPending(existing)

  const promise = (async (): Promise<PendingUpdate> => {
    const pending = await fetchInstaller(version, silent)
    await writePending(pending)
    return pending
  })()
  activeDownload = { version, promise }
  try {
    return await promise
  } finally {
    activeDownload = null
  }
}

// ── Running the installer, with a progress window ────────────────────────────

// While the installer runs there is no window of ours (the app has closed) and the silent
// installer shows nothing, so the computer looks frozen for several seconds. This tiny separate
// window stays until the installer process is gone.
const PROGRESS_SCRIPT = `param(
  [string]$ProcessName,
  [string]$Title,
  [string]$Text,
  [int]$TimeoutSec = 300
)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$bg = [System.Drawing.ColorTranslator]::FromHtml('#111826')
$border = [System.Drawing.ColorTranslator]::FromHtml('#2a3345')
$track = [System.Drawing.ColorTranslator]::FromHtml('#1c2433')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#39d5e8')
$fg = [System.Drawing.ColorTranslator]::FromHtml('#f2f5f8')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#98a1b0')

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.Size = New-Object System.Drawing.Size(400, 132)
$form.BackColor = $bg
$form.Add_Paint({
  param($s, $e)
  $pen = New-Object System.Drawing.Pen($border)
  $e.Graphics.DrawRectangle($pen, 0, 0, $form.Width - 1, $form.Height - 1)
})

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = $Title
$titleLabel.ForeColor = $fg
$titleLabel.BackColor = $bg
$titleLabel.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$titleLabel.Location = New-Object System.Drawing.Point(22, 20)
$titleLabel.AutoSize = $true
$form.Controls.Add($titleLabel)

$textLabel = New-Object System.Windows.Forms.Label
$textLabel.Text = $Text
$textLabel.ForeColor = $muted
$textLabel.BackColor = $bg
$textLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)
$textLabel.Location = New-Object System.Drawing.Point(22, 52)
$textLabel.MaximumSize = New-Object System.Drawing.Size(356, 0)
$textLabel.AutoSize = $true
$form.Controls.Add($textLabel)

$trackPanel = New-Object System.Windows.Forms.Panel
$trackPanel.BackColor = $track
$trackPanel.Location = New-Object System.Drawing.Point(22, 104)
$trackPanel.Size = New-Object System.Drawing.Size(356, 4)
$form.Controls.Add($trackPanel)

$segment = New-Object System.Windows.Forms.Panel
$segment.BackColor = $accent
$segment.Size = New-Object System.Drawing.Size(110, 4)
$segment.Location = New-Object System.Drawing.Point(-110, 0)
$trackPanel.Controls.Add($segment)

$script:x = -110
$animation = New-Object System.Windows.Forms.Timer
$animation.Interval = 20
$animation.Add_Tick({
  $script:x += 6
  if ($script:x -gt 356) { $script:x = -110 }
  $segment.Left = $script:x
})
$animation.Start()

$clock = [System.Diagnostics.Stopwatch]::StartNew()
$script:seen = $false
$script:gone = 0
$watch = New-Object System.Windows.Forms.Timer
$watch.Interval = 700
$watch.Add_Tick({
  $running = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
  if ($running) {
    $script:seen = $true
    $script:gone = 0
  } elseif ($script:seen -or $clock.Elapsed.TotalSeconds -gt 25) {
    $script:gone++
  }
  if ($script:gone -ge 3 -or $clock.Elapsed.TotalSeconds -gt $TimeoutSec) { $form.Close() }
})
$watch.Start()

[void]$form.ShowDialog()
`

function showInstallProgress(installerPath: string, version: string, relaunches: boolean): void {
  if (process.platform !== 'win32') return
  try {
    const script = path.join(dataDir(), 'update-progress.ps1')
    // a BOM makes Windows PowerShell read the file as UTF-8 (the texts are not ASCII)
    writeFileSync(script, '﻿' + PROGRESS_SCRIPT, 'utf-8')
    const hint = relaunches ? t('notification.updateInstallingRestart') : t('notification.updateInstallingQuit')
    spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        script,
        '-ProcessName',
        path.basename(installerPath, '.exe'),
        '-Title',
        t('notification.updateInstallingTitle'),
        '-Text',
        `${t('notification.updateInstallingText')} ${version}. ${hint}`
      ],
      { detached: true, stdio: 'ignore', windowsHide: true }
    ).unref()
  } catch {
    // the update itself does not depend on this window
  }
}

// Runs the installer now; it closes the app, installs and starts the new version.
function launchInstallerNow(installerPath: string, version: string): void {
  showInstallProgress(installerPath, version, true)
  spawn(installerPath, ['/S', '--force-run'], {
    detached: true,
    stdio: 'ignore'
  }).unref()
}

// Runs the installer once this process has exited, without starting the app afterwards
// (the user was closing it on purpose).
function launchInstallerAfterExit(installerPath: string, version: string): void {
  showInstallProgress(installerPath, version, false)
  // ping is the delay: `timeout` refuses to run without a console
  const command = `"ping -n 3 127.0.0.1 >nul && "${installerPath}" /S"`
  spawn('cmd.exe', ['/d', '/s', '/c', command], {
    windowsVerbatimArguments: true,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref()
}

// A restart (app.relaunch) starts the app again right after exit; installing underneath it would
// kill that fresh instance, so the update is left for the next launch in that case.
let relaunchRequested = false
if (process.platform === 'win32') {
  const originalRelaunch = app.relaunch.bind(app)
  app.relaunch = ((options?: Electron.RelaunchOptions): void => {
    relaunchRequested = true
    originalRelaunch(options)
  }) as typeof app.relaunch
}

// At launch: a downloaded update that was not installed yet (the computer was switched off, the
// app crashed...) is installed before anything else starts. Returns true when the app is exiting
// for it, so the caller stops starting up.
export async function installPendingUpdateAtStartup(): Promise<boolean> {
  try {
    const usable = await usablePending()
    if (!usable) return false
    await writePending({ ...usable.pending, attempts: usable.pending.attempts + 1 })
    launchInstallerNow(usable.installerPath, usable.pending.version)
    app.exit(0)
    return true
  } catch {
    return false
  }
}

// On a deliberate exit: install the downloaded update after the app has closed.
export async function installPendingUpdateOnExit(): Promise<void> {
  try {
    if (relaunchRequested) return
    const usable = await usablePending()
    if (!usable) return
    await writePending({ ...usable.pending, attempts: usable.pending.attempts + 1 })
    launchInstallerAfterExit(usable.installerPath, usable.pending.version)
  } catch {
    // never block quitting
  }
}

// ── Manual update (the "Update" button) ───────────────────────────────────────

export async function downloadAndInstallUpdate(version: string): Promise<void> {
  let pending: PendingUpdate
  try {
    pending = await downloadUpdate(version)
  } catch (e) {
    if (e instanceof UpdateCancelled) return
    throw e
  }
  const file = pending.file

  try {
    disableSysProxy(false)
    if (file.endsWith('.exe')) {
      // the installer takes over from here: a failed attempt must not block the next automatic one
      await clearPendingMarker()
      launchInstallerNow(path.join(dataDir(), file), version)
    }
    if (file.endsWith('.7z')) {
      await clearPendingMarker()
      await copyFile(path.join(resourcesFilesDir(), '7za.exe'), path.join(dataDir(), '7za.exe'))
      spawn(
        'cmd',
        [
          '/C',
          `"timeout /t 2 /nobreak >nul && "${path.join(dataDir(), '7za.exe')}" x -o"${exeDir()}" -y "${path.join(dataDir(), file)}" & start "" "${exePath()}""`
        ],
        {
          shell: true,
          detached: true
        }
      ).unref()
      setNotQuitDialog()
      app.quit()
    }
    if (file.endsWith('.pkg')) {
      await clearPendingMarker()
      try {
        const execPromise = promisify(exec)
        const shell = `installer -pkg ${path.join(dataDir(), file).replace(' ', '\\\\ ')} -target /`
        const command = `do shell script "${shell}" with administrator privileges`
        await execPromise(`osascript -e '${command}'`)
        app.relaunch()
        setNotQuitDialog()
        app.quit()
      } catch {
        shell.openPath(path.join(dataDir(), file))
      }
    }
  } catch (e) {
    await rm(path.join(dataDir(), file), { force: true })
    mainWindow?.setProgressBar(-1)
    throw e
  }
}

// The installer file stays, but it is no longer a candidate for an automatic install.
async function clearPendingMarker(): Promise<void> {
  await rm(pendingPath(), { force: true })
}

export async function cancelUpdate(): Promise<void> {
  if (downloadCancelToken) {
    downloadCancelToken.cancel(t('error.userCancelledDownload'))
    downloadCancelToken = null
  }
}
