import { Button } from '@renderer/components/ui/button'
import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

const sidebarPaths = new Set(['/home', '/profiles', '/proxies', '/connections', '/rules', '/logs', '/settings'])

interface Props {
  title?: React.ReactNode
  header?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
  showBackButton?: boolean
}

// Page frame for the pages that were not rebuilt yet. The header matches the new pages
// (velum/ui/primitives PageShell): same paddings, same bold 20px title, actions on the right.
const BasePage = forwardRef<HTMLDivElement, Props>((props, ref) => {
  const location = useLocation()
  const navigate = useNavigate()
  const isSubPage = !sidebarPaths.has(location.pathname)

  const contentRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => {
    return contentRef.current as HTMLDivElement
  })

  return (
    <div ref={contentRef} className="flex h-full w-full flex-col">
      <div className="z-40 flex shrink-0 items-center justify-between gap-4 px-5 pt-5 pb-3">
        <div className="title flex min-w-0 items-center gap-1 text-xl font-extrabold text-vl-text">
          {(isSubPage || props.showBackButton) && (
            <Button
              size="icon-sm"
              variant="ghost"
              className="app-nodrag -ml-2"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft className="size-5" />
            </Button>
          )}
          {props.title}
        </div>
        <div className="header flex shrink-0 items-center gap-1">{props.header}</div>
      </div>
      <div className="content custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3">
        {props.children}
      </div>
    </div>
  )
})

BasePage.displayName = 'BasePage'
export default BasePage
