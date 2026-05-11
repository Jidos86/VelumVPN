import React, { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { getInterfaces } from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'

const InterfaceSelect: React.FC<{
  value: string
  exclude?: string[]
  onChange: (iface: string) => void
}> = ({ value, onChange, exclude = [] }) => {
  const { t } = useTranslation()
  const [ifaces, setIfaces] = useState<string[]>([])
  useEffect(() => {
    const fetchInterfaces = async (): Promise<void> => {
      const names = Object.keys(await getInterfaces())
      setIfaces(names.filter((name) => !exclude.includes(name)))
    }
    fetchInterfaces()
  }, [])

  const NONE = '__none__'

  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger size="sm" className="w-[300px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t('common.disabled')}</SelectItem>
        {ifaces.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default InterfaceSelect
