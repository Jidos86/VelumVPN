import { useEffect, useRef, useState } from 'react'
import BasePage from '@renderer/components/base/base-page'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import {
  zapretIsInstalled,
  zapretGetVersion,
  zapretDownload,
  zapretRunAnalyzer,
  zapretStopAnalyzer
} from '@renderer/utils/ipc'
import { mihomoVersion } from '@renderer/utils/ipc'
import { Download, Play, Square, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const REPO_URL = 'https://github.com/youtubediscord/zapret2-youtube-discord'

const Zapret2Page: React.FC = () => {
  const [installed, setInstalled] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [analyzerRunning, setAnalyzerRunning] = useState(false)
  const [analyzerLog, setAnalyzerLog] = useState('')
  const [mihomoRunning, setMihomoRunning] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const refresh = async (): Promise<void> => {
    const [inst, ver] = await Promise.all([
      zapretIsInstalled('zapret2'),
      zapretGetVersion('zapret2')
    ])
    setInstalled(inst)
    setVersion(ver)
    try {
      await mihomoVersion()
      setMihomoRunning(true)
    } catch {
      setMihomoRunning(false)
    }
  }

  useEffect(() => {
    refresh()
    const onLog = (_e: unknown, line: string): void => {
      setAnalyzerLog((prev) => prev + line)
      setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50)
    }
    const onStarted = (): void => setAnalyzerRunning(true)
    const onDone = (): void => setAnalyzerRunning(false)
    window.electron.ipcRenderer.on('zapretAnalyzerLog', onLog)
    window.electron.ipcRenderer.on('zapretAnalyzerStarted', onStarted)
    window.electron.ipcRenderer.on('zapretAnalyzerDone', onDone)
    return () => {
      window.electron.ipcRenderer.removeAllListeners('zapretAnalyzerLog')
      window.electron.ipcRenderer.removeAllListeners('zapretAnalyzerStarted')
      window.electron.ipcRenderer.removeAllListeners('zapretAnalyzerDone')
    }
  }, [])

  const handleDownload = async (): Promise<void> => {
    setDownloading(true)
    try {
      await zapretDownload('zapret2')
      toast.success('ZAPRET2 загружен')
      await refresh()
    } catch (e) {
      toast.error(`Ошибка загрузки: ${e}`)
    } finally {
      setDownloading(false)
    }
  }

  const handleAnalyzer = async (): Promise<void> => {
    if (analyzerRunning) {
      await zapretStopAnalyzer()
      setAnalyzerRunning(false)
      return
    }
    if (mihomoRunning) {
      toast.warning('Отключите VPN перед запуском анализатора')
      return
    }
    setAnalyzerLog('')
    try {
      await zapretRunAnalyzer()
    } catch (e) {
      toast.error(`Ошибка: ${e}`)
    }
  }

  return (
    <BasePage title="ZAPRET2">
      {mihomoRunning && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertCircle className="size-4 shrink-0" />
          VPN активен — отключите его перед запуском анализатора
        </div>
      )}

      <div className="flex flex-col gap-3 px-4">
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">ZAPRET2</span>
                <Badge variant="ghost" className="text-[10px]">by youtubediscord</Badge>
              </div>
              <button
                onClick={() => window.open(REPO_URL)}
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
              {installed ? (
                <>
                  <span className="text-xs text-muted-foreground">{version}</span>
                  <Button size="icon-sm" variant="ghost" disabled={downloading} onClick={handleDownload}>
                    <RefreshCw className={`size-3.5 ${downloading ? 'animate-spin' : ''}`} />
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" disabled={downloading} onClick={handleDownload}>
                  <Download className="size-3.5 mr-1.5" />
                  {downloading ? 'Загрузка...' : 'Загрузить'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {installed && (
          <>
            <Button
              variant={analyzerRunning ? 'destructive' : 'default'}
              disabled={mihomoRunning && !analyzerRunning}
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
                    ref={logRef}
                    className="font-mono text-[11px] text-foreground/80 bg-background rounded p-2 max-h-64 overflow-y-auto whitespace-pre-wrap"
                  >
                    {analyzerLog}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">
              Спасибо{' '}
              <button onClick={() => window.open('https://github.com/Flowseal/zapret-discord-youtube')} className="text-primary hover:underline">Flowseal</button>
              {' и '}
              <button onClick={() => window.open(REPO_URL)} className="text-primary hover:underline">youtubediscord</button>
              {' за открытые инструменты DPI-обхода.'}
            </p>
          </CardContent>
        </Card>
      </div>
    </BasePage>
  )
}

export default Zapret2Page
