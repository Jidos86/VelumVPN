import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react'
import React, { useEffect, useState, useMemo } from 'react'
import { BaseEditor } from '../base/base-editor-lazy'
import { getFileStr, setFileStr, convertMrsRuleset, getRuntimeConfig } from '@renderer/utils/ipc'
import yaml from 'js-yaml'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { t } from 'i18next'
type Language = 'yaml' | 'javascript' | 'css' | 'json' | 'text'

interface Props {
  onClose: () => void
  path: string
  type: string
  title: string
  privderType: string
  format?: string
  behavior?: string
}
const Viewer: React.FC<Props> = (props) => {
  const { type, path, title, format, privderType, behavior, onClose } = props
  const { appConfig: { disableAnimation = false } = {} } = useAppConfig()
  const [currData, setCurrData] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const language: Language = useMemo(() => {
    if (format === 'MrsRule') return 'text'
    if (type === 'Inline') return 'yaml'
    if (!format || format === 'YamlRule') return 'yaml'
    return 'text'
  }, [format, type])

  useEffect(() => {
    const loadContent = async (): Promise<void> => {
      setIsLoading(true)
      try {
        let fileContent: React.SetStateAction<string>

        if (format === 'MrsRule') {
          let ruleBehavior: string = behavior || 'domain'
          if (!behavior) {
            try {
              const runtimeConfig = await getRuntimeConfig()
              const provider = runtimeConfig['rule-providers']?.[title]
              ruleBehavior = provider?.behavior || 'domain'
            } catch {
              ruleBehavior = 'domain'
            }
          }

          fileContent = await convertMrsRuleset(path, ruleBehavior)
          setCurrData(fileContent)
          return
        }

        if (type === 'Inline') {
          fileContent = await getFileStr('config.yaml')
        } else {
          fileContent = await getFileStr(path)
        }
        try {
          const parsedYaml = yaml.load(fileContent)
          if (parsedYaml && typeof parsedYaml === 'object') {
            const yamlObj = parsedYaml as Record<string, unknown>
            const payload = yamlObj[privderType]?.[title]?.payload
            if (payload) {
              if (privderType === 'proxy-providers') {
                setCurrData(
                  yaml.dump({
                    proxies: payload
                  })
                )
              } else {
                setCurrData(
                  yaml.dump({
                    rules: payload
                  })
                )
              }
            } else {
              const targetObj = yamlObj[privderType]?.[title]
              if (targetObj) {
                setCurrData(yaml.dump(targetObj))
              } else {
                setCurrData(fileContent)
              }
            }
          } else {
            setCurrData(fileContent)
          }
        } catch (error) {
          setCurrData(fileContent)
        }
      } finally {
        setIsLoading(false)
      }
    }
    loadContent()
  }, [path, type, title, format, privderType, behavior])

  return (
    <Modal
      backdrop={disableAnimation ? 'transparent' : 'blur'}
      disableAnimation={disableAnimation}
      classNames={{
        base: 'max-w-none w-full',
        backdrop: 'top-[48px]'
      }}
      size="5xl"
      hideCloseButton
      isOpen={true}
      onOpenChange={onClose}
      scrollBehavior="inside"
    >
      <ModalContent className="h-full w-[calc(100%-100px)]">
        <ModalHeader className="flex pb-0 app-drag">{title}</ModalHeader>
        <ModalBody className="h-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-foreground-500">{t('common.loading')}</div>
            </div>
          ) : (
            <BaseEditor
              language={language}
              value={currData}
              readOnly={type !== 'File' || format === 'MrsRule'}
              onChange={(value) => setCurrData(value)}
            />
          )}
        </ModalBody>
        <ModalFooter className="pt-0">
          <Button size="sm" variant="light" onPress={onClose}>
            {t('common.close')}
          </Button>
          {type === 'File' && format !== 'MrsRule' && (
            <Button
              size="sm"
              color="primary"
              onPress={async () => {
                await setFileStr(path, currData)
                onClose()
              }}
            >
              {t('common.save')}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default Viewer
