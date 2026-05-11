import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { getInterfaces } from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'

interface Props {
  onClose: () => void
}

const InterfaceModal: React.FC<Props> = (props) => {
  const { onClose } = props
  const { t } = useTranslation()
  const [info, setInfo] = useState<Record<string, NetworkInterfaceInfo[]>>({})
  const getInfo = async (): Promise<void> => {
    setInfo(await getInterfaces())
  }

  useEffect(() => {
    getInfo()
  }, [])

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader className="app-drag">
          <DialogTitle>{t('mihomo.interfaceModal.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 overflow-y-auto max-h-[60vh]">
          {Object.entries(info).map(([key, value]) => {
            return (
              <div key={key} className="space-y-2">
                <h4 className="font-bold">{key}</h4>
                <div className="space-y-2">
                  {value.map((v) => {
                    return (
                      <div key={v.address} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">{v.family}</span>
                        <Badge
                          variant="outline"
                          className="font-mono text-xs max-w-[70%] whitespace-normal break-all"
                        >
                          {v.address}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t('common.close')}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default InterfaceModal
