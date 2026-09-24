import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { DEFAULT_SHOP_URL } from '@renderer/velum/shell/default-links'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'

const ExpiryAlert = () => {
  const { t } = useTranslation()
  const { expiryAlert, clearExpiryAlert } = useProfileConfig()

  const expired = expiryAlert !== null && expiryAlert.daysLeft <= 0

  return (
    <AlertDialog open={expiryAlert !== null} onOpenChange={(open) => !open && clearExpiryAlert()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Clock className="size-8 text-warning" />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {expired
              ? t('pages.profiles.expiryExpiredTitle')
              : t('pages.profiles.expiryTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {expired
              ? t('pages.profiles.expiryExpiredDescription', {
                  name: expiryAlert?.name ?? ''
                })
              : t('pages.profiles.expiryDescription', {
                  name: expiryAlert?.name ?? '',
                  days: expiryAlert?.daysLeft ?? 0
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={clearExpiryAlert}>{t('common.close')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              open(expiryAlert?.home || DEFAULT_SHOP_URL)
              clearExpiryAlert()
            }}
          >
            {t('pages.profiles.renew')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default ExpiryAlert
