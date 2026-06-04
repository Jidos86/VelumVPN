import { useEffect, useState } from 'react'
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
  type ZapretStrategy
} from '@renderer/utils/ipc'
import { mihomoVersion } from '@renderer/utils/ipc'
import { Download, Play, Square, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const REPO_URL = 'https://github.com/Flowseal/zapret-discord-youtube'

const Zapret1Page: React.FC = () => {
  const [installed, setInstalled] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [strategies, setStrategies] = useState<ZapretStrategy[]>([])
  const [selected, setSelected] = useState<ZapretStrategy | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [mihomoRunning, setMihomoRunning] = useState(false)

  const refresh = async (): Promise<void> => {
    const [inst, ver, run, strats] = await Promise.all([
      zapretIsInstalled('flowseal'),
      zapretGetVersion('flowseal'),
      zapretIsRunning(),
      zapretGetStrategies()
    ])
    setInstalled(inst)
    setVersion(ver)
    setRunning(run)
    setStrategies(strats)
    if (strats.length > 0 && !selected) setSelected(strats[0])
    try {
      await mihomoVersion()
      setMihomoRunning(true)
    } catch {
      setMihomoRunning(false)
    }
  }

  useEffect(() => {
    refresh()
    const onStopped = (): void => setRunning(false)
    window.electron.ipcRenderer.on('zapretStopped', onStopped)
    return () => { window.electron.ipcRenderer.removeAllListeners('zapretStopped') }
  }, [])

  const handleDownload = async (): Promise<void> => {
    setDownloading(true)
    try {
      await zapretDownload('flowseal')
      toast.success('ZAPRET1 загружен')
      await refresh()
    } catch (e) {
      toast.error(`Ошибка загрузки: ${e}`)
    } finally {
      setDownloading(false)
    }
  }

  const handleStart = async (): Promise<void> => {
    if (!selected) return
    if (mihomoRunning) {
      toast.warning('Отключите VPN перед запуском ZAPRET1')
      return
    }
    setStarting(true)
    try {
      await zapretStart('flowseal', selected.args)
      setRunning(true)
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
    toast.info('ZAPRET1 остановлен')
  }

  return (
    <BasePage title="ZAPRET1">
      {mihomoRunning && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertCircle className="size-4 shrink-0" />
          VPN активен — отключите его перед запуском ZAPRET1
        </div>
      )}
      {running && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <span className="size-2 rounded-full bg-success animate-pulse" />
          ZAPRET1 активен
        </div>
      )}

      <div className="flex flex-col gap-3 px-4">
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">ZAPRET1</span>
                <Badge variant="ghost" className="text-[10px]">by Flowseal</Badge>
                {running && (
                  <Badge className="text-[10px] bg-success/15 text-success border-0">Активен</Badge>
                )}
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
              Ручной выбор стратегии DPI-обхода. Поддержка YouTube, Discord и других сервисов.
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
            <Card>
              <CardContent className="py-3 px-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Стратегия</p>
                <div className="flex flex-col gap-1">
                  {strategies.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelected(s)}
                      className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selected?.id === s.id
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

            {!running ? (
              <Button disabled={starting || !selected || mihomoRunning} onClick={handleStart}>
                <Play className="size-4 mr-1.5" />
                {starting ? 'Запуск...' : 'Запустить'}
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleStop}>
                <Square className="size-4 mr-1.5" />
                Остановить
              </Button>
            )}
          </>
        )}
      </div>
    </BasePage>
  )
}

export default Zapret1Page
