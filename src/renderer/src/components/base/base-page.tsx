import { Button } from '@renderer/components/ui/button'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { platform } from '@renderer/utils/init'
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

const sidebarPaths = new Set(['/home', '/profiles', '/proxies', '/connections', '/rules', '/logs', '/settings'])
interface Props {
  title?: React.ReactNode
  header?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
}

const BasePage = forwardRef<HTMLDivElement, Props>((props, ref) => {
  const { appConfig } = useAppConfig()
  const location = useLocation()
  const navigate = useNavigate()
  const isSubPage = !sidebarPaths.has(location.pathname)
  const { useWindowFrame = false } = appConfig || {}
  const [overlayWidth, setOverlayWidth] = React.useState(0)

  useEffect(() => {
    if (platform !== 'darwin' && !useWindowFrame) {
      try {
        // @ts-ignore windowControlsOverlay
        const windowControlsOverlay = window.navigator.windowControlsOverlay
        setOverlayWidth(window.innerWidth - windowControlsOverlay.getTitlebarAreaRect().width)
      } catch (e) {
        // ignore
      }
    }
  }, [])

  const contentRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => {
    return contentRef.current as HTMLDivElement
  })

  return (
    <div ref={contentRef} className="w-full h-full">
      <div className="sticky top-0 z-40 h-[57px] w-full">
        <div className="app-drag px-2 pt-3 pb-2 flex justify-between h-[57px]">
          <div className="title h-full text-lg leading-8 flex items-center gap-1">
            {isSubPage && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="app-nodrag"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="size-5" />
              </Button>
            )}
            {props.title}
          </div>
          <div style={{ marginRight: overlayWidth }} className="header flex gap-1 h-full">
            {props.header}
          </div>
        </div>
      </div>
      <div className="content h-[calc(100vh-57px)] overflow-y-auto custom-scrollbar">
        {props.children}
      </div>
    </div>
  )
})

BasePage.displayName = 'BasePage'
export default BasePage
