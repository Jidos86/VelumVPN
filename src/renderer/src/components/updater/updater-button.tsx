import { Button } from '@renderer/components/ui/button'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import UpdaterModal from './updater-modal'
import { cancelUpdate } from '@renderer/utils/ipc'
import { useUpdaterStore } from '@renderer/store/updater-store'
import { useShallow } from 'zustand/react/shallow'
import { CircleFadingArrowUp } from 'lucide-react'

interface Props {
  iconOnly?: boolean
  // Overrides the default "update available" caption of the wide button.
  label?: string
  // 'card' renders a two-line tile (label + sublabel) instead of the wide button.
  variant?: 'button' | 'card'
  sublabel?: string
  latest?: {
    version: string
    changelog: string
  }
}

const UpdaterButton: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  const { iconOnly, latest, label, variant = 'button', sublabel } = props
  const [openModal, setOpenModal] = useState(false)
  const updateStatus = useUpdaterStore(
    useShallow((s) => ({ downloading: s.downloading, progress: s.progress, error: s.error }))
  )
  const resetUpdateStatus = useUpdaterStore((s) => s.reset)

  const handleCancelUpdate = async (): Promise<void> => {
    try {
      await cancelUpdate()
      resetUpdateStatus()
    } catch (e) {
      // ignore
    }
  }

  if (!latest) return null

  return (
    <>
      {openModal && (
        <UpdaterModal
          version={latest.version}
          changelog={latest.changelog}
          updateStatus={updateStatus}
          onCancel={handleCancelUpdate}
          onClose={() => {
            setOpenModal(false)
          }}
        />
      )}
      {variant === 'card' ? (
        <button
          type="button"
          className="app-nodrag flex w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-gradient-to-br from-gradient-start-power-on to-gradient-end-power-on px-3.5 py-2.5 text-left text-white shadow-md transition-opacity hover:opacity-90"
          onClick={() => {
            setOpenModal(true)
          }}
        >
          <CircleFadingArrowUp className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{label ?? t('common.updateAvailable')}</span>
            {sublabel && <span className="block truncate text-xs text-white/85">{sublabel}</span>}
          </span>
        </button>
      ) : iconOnly ? (
        <Button
          size="icon-lg"
          className="app-nodrag cursor-pointer rounded-md font-medium transition-colors bg-gradient-to-br from-gradient-start-power-on to-gradient-end-power-on hover:opacity-90 border-0 text-white shadow-md"
          onClick={() => {
            setOpenModal(true)
          }}
        >
          <CircleFadingArrowUp className="size-5" />
        </Button>
      ) : (
        <Button
          className="app-nodrag w-full rounded-md h-10 font-medium transition-colors bg-gradient-to-br from-gradient-start-power-on to-gradient-end-power-on hover:opacity-90 border-0 text-white shadow-md"
          onClick={() => {
            setOpenModal(true)
          }}
        >
          <CircleFadingArrowUp />
          <span className="truncate">{label ?? t('common.updateAvailable')}</span>
        </Button>
      )}
    </>
  )
}

export default UpdaterButton
