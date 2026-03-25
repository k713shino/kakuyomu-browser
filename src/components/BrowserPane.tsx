import type { RefObject } from 'react'
import { HOME_URL } from '../lib/browser'
import type { BrowserWebview } from '../lib/webview'

interface BrowserPaneProps {
  isLoading: boolean
  webviewRef: RefObject<BrowserWebview>
}

export function BrowserPane({ isLoading, webviewRef }: BrowserPaneProps) {
  return (
    <div className="webview-wrapper">
      <webview ref={webviewRef} src={HOME_URL} className="webview" allowpopups />
      {isLoading && <div className="loading-bar"></div>}
    </div>
  )
}
