import React from 'react'
import Logo from '@renderer/assets/velumvpn-logo.svg'
import WindowControls from '@renderer/components/window-controls'
import { platform } from '@renderer/utils/init'
import { IS_BETA } from '@renderer/velum/flavor'

const TitleBar: React.FC = () => {
  const isMac = platform === 'darwin'
  return (
    <div
      className={`app-drag flex h-8 shrink-0 select-none items-center justify-between border-b border-vl-line bg-vl-chrome pr-1.5 ${
        isMac ? 'pl-20' : 'pl-3.5'
      }`}
    >
      <div className="flex items-center gap-2">
        <img src={Logo} alt="" className="size-4" />
        <span className="text-xs font-semibold tracking-wide text-vl-muted">VelumVPN</span>
        {IS_BETA && (
          <span className="rounded bg-vl-accent/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-vl-accent">
            beta
          </span>
        )}
      </div>
      {!isMac && (
        <div className="app-nodrag">
          <WindowControls />
        </div>
      )}
    </div>
  )
}

export default TitleBar
