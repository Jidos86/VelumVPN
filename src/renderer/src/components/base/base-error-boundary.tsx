import { Button } from '@renderer/components/ui/button'
import { JSX, ReactNode } from 'react'
import { ErrorBoundary, FallbackProps } from 'react-error-boundary'
import { useTranslation } from 'react-i18next'

const ErrorFallback = ({ error }: FallbackProps): JSX.Element => {
  const { t } = useTranslation()
  return (
    <div className="p-4">
      <h2 className="my-2 text-lg font-bold">
        {t('errorBoundary.title')}
      </h2>

      <Button
        size="sm"
        variant="secondary"
        className="ml-2"
        onClick={() =>
          navigator.clipboard.writeText('```\n' + error.message + '\n' + error.stack + '\n```')
        }
      >
        {t('errorBoundary.copyErrorInfo')}
      </Button>

      <p className="my-2">{error.message}</p>

      <details title="Error Stack">
        <summary>Error Stack</summary>
        <pre>{error.stack}</pre>
      </details>
    </div>
  )
}

interface Props {
  children?: ReactNode
}

const BaseErrorBoundary = (props: Props): JSX.Element => {
  return <ErrorBoundary FallbackComponent={ErrorFallback}>{props.children}</ErrorBoundary>
}

export default BaseErrorBoundary
