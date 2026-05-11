import { BaseEditor } from '@renderer/components/base/base-editor-lazy'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { readTheme } from '@renderer/utils/ipc'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
interface Props {
  theme: string
  onCancel: () => void
  onConfirm: (script: string) => void
}
const CSSEditorModal: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  const { theme, onCancel, onConfirm } = props
  const [currData, setCurrData] = useState('')

  useEffect(() => {
    if (theme) {
      readTheme(theme).then((css) => {
        setCurrData(css)
      })
    }
  }, [theme])

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent
        className="h-[calc(100%-111px)] w-[calc(100%-100px)] max-w-none sm:max-w-none flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="app-drag pb-0">
          <DialogTitle>{t('settings.appearance.editTheme')}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <BaseEditor
            language="css"
            value={currData}
            onChange={(value) => setCurrData(value || '')}
          />
        </div>
        <DialogFooter className="pt-0">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={() => onConfirm(currData)}>
            {t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CSSEditorModal
