import React, { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useTranslation } from 'react-i18next'
import { Modal } from '@renderer/velum/ui/primitives'
import { getFullChangelog } from '@renderer/utils/ipc'
import { Spinner } from '@renderer/components/ui/spinner'

// Splits "## 1.3.x\n...\n## 1.3.y\n..." into one chunk per version (heading included), so each
// can be rendered in its own bordered card instead of one long scroll of same-looking text.
const splitByVersion = (raw: string): string[] => {
  const lines = raw.split('\n')
  const chunks: string[] = []
  let current: string[] = []
  for (const line of lines) {
    if (/^##\s/.test(line) && current.length > 0) {
      chunks.push(current.join('\n').trim())
      current = []
    }
    current.push(line)
  }
  if (current.length > 0) chunks.push(current.join('\n').trim())
  return chunks.filter(Boolean)
}

const markdownComponents = {
  h2: ({ ...props }: React.ComponentProps<'h2'>) => (
    <h2 className="mb-2 text-base font-extrabold text-vl-text" {...props} />
  ),
  // The one-line tagline right under each version heading (e.g. "Иконки в правилах...").
  p: ({ ...props }: React.ComponentProps<'p'>) => <p className="mb-2 text-sm text-vl-muted" {...props} />,
  h3: ({ ...props }: React.ComponentProps<'h3'>) => (
    <h3 className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-vl-accent first:mt-0" {...props} />
  ),
  ul: ({ ...props }: React.ComponentProps<'ul'>) => <ul className="flex flex-col gap-1.5" {...props} />,
  li: ({ children }: React.ComponentProps<'li'>) => (
    <li className="flex gap-2 text-sm leading-snug text-vl-text">
      <span className="mt-2 size-1 shrink-0 rounded-full bg-vl-faint" />
      <span>{children}</span>
    </li>
  ),
  strong: ({ ...props }: React.ComponentProps<'strong'>) => (
    <strong className="font-semibold text-vl-text" {...props} />
  ),
  a: ({ ...props }: React.ComponentProps<'a'>) => (
    <a target="_blank" className="text-vl-accent underline" {...props} />
  ),
  code: ({ className, children, ...props }: React.ComponentProps<'code'>) => (
    <code
      className={['rounded bg-white/6 px-1.5 py-0.5 font-mono text-xs text-vl-text', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </code>
  ),
  pre: ({ children, ...props }: React.ComponentProps<'pre'>) => (
    <pre
      className="overflow-x-auto rounded-lg bg-white/6 p-3 [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0"
      {...props}
    >
      {children}
    </pre>
  )
}

// Shows the whole changelog.md history (every released version), unlike UpdaterModal which only
// ever sees the single-version excerpt latest.yml carries for the update-available toast.
const ChangelogModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation()
  const [changelog, setChangelog] = useState<string | null>(null)
  const versions = useMemo(() => (changelog ? splitByVersion(changelog) : []), [changelog])

  useEffect(() => {
    getFullChangelog()
      .then(setChangelog)
      .catch(() => setChangelog(''))
  }, [])

  return (
    <Modal title={t('velumUi.changelog.title')} onClose={onClose} widthClass="max-w-2xl">
      {changelog === null ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {versions.map((chunk, i) => (
            <div key={i} className="rounded-xl border border-vl-line bg-vl-tile px-4 py-3.5">
              <ReactMarkdown components={markdownComponents}>{chunk}</ReactMarkdown>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

export default ChangelogModal
