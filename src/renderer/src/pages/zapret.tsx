import { useEffect, useRef, useState } from 'react'
import BasePage from '@renderer/components/base/base-page'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import {
  zapretIsInstalled,
  zapretIsRunning,
  zapretGetVersion,
  zapretGetStrategies,
  zapretDownload,
  zapretStart,
  zapretStop,
  zapretRunAnalyzer,
  zapretStopAnalyzer,
  type ZapretSource,
  type ZapretStrategy
} from '@renderer/utils/ipc'
import { mihomoVersion } from '@renderer/utils/ipc'
import { Download, Play, Square, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const ZAPRET1_URL = 'https://github.com/Flowseal/zapret-discord-youtube'
const ZAPRET2_URL = 'https://github.com/youtubediscord/zapret2-youtube-discord'

type Tab = 'zapret1' | 'zapret2'

const ZapretPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('zapret1')

  const [z1Installed, setZ1Installed] = useState(false)
  const [z2Installed, setZ2Installed] = useState(false)
  const [z1Version, setZ1Version] = useState<string | null>(null)
  const [z2Version, setZ2Version] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [activeSource, setActiveSource] = useState<ZapretSource | null>(null)

  const [strategies, setStrategies] = useState<ZapretStrategy[]>([])
  const [selectedStrategy, setSelectedStrategy] = useState<ZapretStrategy | null>(null)

  const [downloading, setDownloading] = useState<ZapretSource | null>(null)
  const [starting, setStarting] = useState(false)

  const [analyzerRunning, setAnalyzerRunning] = useState(false)
  const [analyzerLog, setAnalyzerLog] = useState('')
  const analyzerLogRef = useRef<HTMLDivElement>(null)

  const [mihomoRunning, setMihomoRunning] = useState(false)

  const refresh = async (): Promise<void> => {
    const [i1, i2, v1, v2, r, strats] = await Promise.all([
      zapretIsInstalled('flowseal'),
      zapretIsInstalled('zapret2'),
      zapretGetVersion('flowseal'),
      zapretGetVersion('zapret2'),
      zapretIsRunning(),
      zapretGetStrategies()
    ])
    setZ1Installed(i1)
    setZ2Installed(i2)
    setZ1Version(v1)
    setZ2Version(v2)
    setRunning(r)
    setStrategies(strats)
    if (strats.length > 0 && !selectedStrategy) {
      setSelectedStrategy(strats[0])
    }

    try {
      await mihomoVersion()
      setMihomoRunning(true)
    } catch {
      setMihomoRunning(false)
    }
  }

  useEffect(() => {
    refresh()
    const onStopped = (): void => {
      setRunning(false)
      setActiveSource(null)
    }
    const onAnalyzerLog = (_e: unknown, line: string): void => {
      setAnalyzerLog((prev) => prev + line)
      setTimeout(() => {
        analyzerLogRef.current?.scrollTo(0, analyzerLogRef.current.scrollHeight)
      }, 50)
    }
    const onAnalyzerStarted = (): void => setAnalyzerRunning(true)
    const onAnalyzerDone = (): void => setAnalyzerRunning(false)

    window.electron.ipcRenderer.on('zapretStopped', onStopped)
    window.electron.ipcRenderer.on('zapretAnalyzerLog', onAnalyzerLog)
    window.electron.ipcRenderer.on('zapretAnalyzerStarted', onAnalyzerStarted)
    window.electron.ipcRenderer.on('zapretAnalyzerDone', onAnalyzerDone)
    return () => {
      window.electron.ipcRenderer.removeAllListeners('zapretStopped')
      window.electron.ipcRenderer.removeAllListeners('zapretAnalyzerLog')
      window.electron.ipcRenderer.removeAllListeners('zapretAnalyzerStarted')
      window.electron.ipcRenderer.removeAllListeners('zapretAnalyzerDone')
    }
  }, [])

  const handleDownload = async (source: ZapretSource): Promise<void> => {
    setDownloading(source)
    try {
      await zapretDownload(source)
      toast.success(`${source === 'flowseal' ? 'ZAPRET1' : 'ZAPRET2'} загружен`)
      await refresh()
    } catch (e) {
      toast.error(`Ошибка загрузки: ${e}`)
    } finally {
      setDownloading(null)
    }
  }

  const handleStart = async (): Promise<void> => {
    if (!selectedStrategy) return
    if (mihomoRunning) {
      toast.warning('VPN активен. ZAPRET1 требует отключения VPN для корректной работы.')
      return
    }
    setStarting(true)
    try {
      await zapretStart('flowseal', selectedStrategy.args)
      setRunning(true)
      setActiveSource('flowseal')
      toast.success('ZAPRET1 запущен')
    } catch (e) {
      toast.error(`Ошибка: ${e}`)
    } finally {
      setStarting(false)
    }
  }

  const handleStop = async (): Promise<void> => {
    await zapretStop()
    setRunning(false)
    setActiveSource(null)
    toast.info('Zapret остановлен')
  }

  const handleAnalyzer = async (): Promise<void> => {
    if (analyzerRunning) {
      await zapretStopAnalyzer()
      setAnalyzerRunning(false)
      return
    }
    if (mihomoRunning) {
      toast.warning('VPN активен. ZAPRET2 требует отключения VPN для корректной работы.')
      return
    }
    setAnalyzerLog('')
    try {
      await zapretRunAnalyzer()
    } catch (e) {
      toast.error(`Ошибка: ${e}`)
    }
  }

  const isActive = running && activeSource === (tab === 'zapret1' ? 'flowseal' : 'zapret2')

  return (
    <BasePage title="DPI Обход">
      {/* Warning if VPN is running */}
      {mihomoRunning && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertCircle className="size-4 shrink-0" />
          VPN подключён — Zapret и VPN нельзя использовать одновременно. Отключите VPN перед запуском.
        </div>
      )}
      {running && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <span className="size-2 rounded-full bg-success animate-pulse" />
          {activeSource === 'flowseal' ? 'ZAPRET1' : 'ZAPRET2'} активен — VPN недоступен
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mx-4 mb-4">
        {(['zapret1', 'zapret2'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {t === 'zapret1' ? 'ZAPRET1' : 'ZAPRET2'}
          </button>
        ))}
      </div>

      {/* ZAPRET1 tab */}
      {tab === 'zapret1' && (
        <div className="flex flex-col gap-3 px-4">
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">ZAPRET1</span>
                  <Badge variant="ghost" className="text-[10px]">by Flowseal</Badge>
                  {isActive && (
                    <Badge className="text-[10px] bg-success/15 text-success border-0">Активен</Badge>
                  )}
                </div>
                <button
                  onClick={() => window.open(ZAPRET1_URL)}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="Открыть репозиторий"
                >
                  <ExternalLink className="size-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Ручной выбор стратегии DPI-обхода. Поддержка YouTube, Discord и других сервисов.
              </p>
              <div className="flex items-center gap-2">
                {z1Installed ? (
                  <>
                    <span className="text-xs text-muted-foreground">{z1Version}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Обновить"
                      disabled={!!downloading}
                      onClick={() => handleDownload('flowseal')}
                    >
                      <RefreshCw className={`size-3.5 ${downloading === 'flowseal' ? 'animate-spin' : ''}`} />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!downloading}
                    onClick={() => handleDownload('flowseal')}
                  >
                    <Download className="size-3.5 mr-1.5" />
                    {downloading === 'flowseal' ? 'Загрузка...' : 'Загрузить'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {z1Installed && (
            <>
              {/* Strategy selector */}
              <Card>
                <CardContent className="py-3 px-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Стратегия</p>
                  <div className="flex flex-col gap-1">
                    {strategies.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStrategy(s)}
                        className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedStrategy?.id === s.id
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'hover:bg-accent text-foreground'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Start/Stop */}
              <div className="flex gap-2">
                {!isActive ? (
                  <Button
                    className="flex-1"
                    disabled={starting || !selectedStrategy || mihomoRunning}
                    onClick={handleStart}
                  >
                    <Play className="size-4 mr-1.5" />
                    {starting ? 'Запуск...' : 'Запустить'}
                  </Button>
                ) : (
                  <Button className="flex-1" variant="destructive" onClick={handleStop}>
                    <Square className="size-4 mr-1.5" />
                    Остановить
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ZAPRET2 tab */}
      {tab === 'zapret2' && (
        <div className="flex flex-col gap-3 px-4">
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">ZAPRET2</span>
                  <Badge variant="ghost" className="text-[10px]">by youtubediscord</Badge>
                  {isActive && (
                    <Badge className="text-[10px] bg-success/15 text-success border-0">Активен</Badge>
                  )}
                </div>
                <button
                  onClick={() => window.open(ZAPRET2_URL)}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="Открыть репозиторий"
                >
                  <ExternalLink className="size-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Автоматический анализатор — определяет лучшую стратегию для вашего провайдера из 70+ конфигов.
              </p>
              <div className="flex items-center gap-2">
                {z2Installed ? (
                  <>
                    <span className="text-xs text-muted-foreground">{z2Version}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Обновить"
                      disabled={!!downloading}
                      onClick={() => handleDownload('zapret2')}
                    >
                      <RefreshCw className={`size-3.5 ${downloading === 'zapret2' ? 'animate-spin' : ''}`} />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!downloading}
                    onClick={() => handleDownload('zapret2')}
                  >
                    <Download className="size-3.5 mr-1.5" />
                    {downloading === 'zapret2' ? 'Загрузка...' : 'Загрузить'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {z2Installed && (
            <>
              <Button
                disabled={mihomoRunning && !analyzerRunning}
                variant={analyzerRunning ? 'destructive' : 'default'}
                onClick={handleAnalyzer}
              >
                {analyzerRunning ? (
                  <><Square className="size-4 mr-1.5" />Остановить анализатор</>
                ) : (
                  <><Play className="size-4 mr-1.5" />Запустить анализатор</>
                )}
              </Button>

              {analyzerLog && (
                <Card>
                  <CardContent className="py-2 px-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Вывод анализатора</p>
                    <div
                      ref={analyzerLogRef}
                      className="font-mono text-[11px] text-foreground/80 bg-background rounded p-2 max-h-64 overflow-y-auto whitespace-pre-wrap"
                    >
                      {analyzerLog}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Credits */}
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">
                Спасибо разработчикам:{' '}
                <button
                  onClick={() => window.open(ZAPRET1_URL)}
                  className="text-primary hover:underline"
                >
                  Flowseal
                </button>
                {' и '}
                <button
                  onClick={() => window.open(ZAPRET2_URL)}
                  className="text-primary hover:underline"
                >
                  youtubediscord
                </button>
                {' за открытые инструменты DPI-обхода.'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </BasePage>
  )
}

export default ZapretPage
