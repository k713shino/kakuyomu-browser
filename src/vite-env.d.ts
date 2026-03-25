/// <reference types="vite/client" />

import type { IpcRenderer, WebviewTag } from 'electron'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare global {
  interface Window {
    ipcRenderer: IpcRenderer
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<WebviewTag>, WebviewTag> & {
        allowpopups?: boolean
        src?: string
      }
    }
  }
}

export {}
