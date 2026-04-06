/// <reference types="vite/client" />

import type { IpcRenderer, WebviewTag } from 'electron'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare global {
  interface AivisSpeechSynthesisResult {
    audioBase64: string
    mimeType: string
    speakerId: number
    speakerName: string
    styleId: number
    styleName: string
  }

  interface AivisSpeechSpeakerStyle {
    id: number
    name: string
  }

  interface AivisSpeechSpeaker {
    name: string
    speakerUuid: string
    styles: AivisSpeechSpeakerStyle[]
  }

  interface AivisSpeechPrepareResult {
    chunks: Array<{
      text: string
      paragraphIndexes: number[]
    }>
    speakerUuid: string
    styleId: number
    speakerName: string
    styleName: string
    speedScale: number
    intonationScale: number
  }

  interface AivisSpeechChunkResult {
    audioBase64: string
    mimeType: string
    cached: boolean
  }

  interface Window {
    ipcRenderer: IpcRenderer
    aivisSpeech: {
      synthesize: (payload: { text: string; title?: string; workId?: string | null }) => Promise<AivisSpeechSynthesisResult>
      getSpeakers: () => Promise<AivisSpeechSpeaker[]>
      prepare: (
        payload: {
          title?: string
          workId?: string | null
          paragraphs: Array<{
            index: number
            text: string
          }>
        },
      ) => Promise<AivisSpeechPrepareResult>
      synthesizeChunk: (payload: { chunk: string; styleId: number; speedScale: number; intonationScale: number }) => Promise<AivisSpeechChunkResult>
    }
    speechDictionary: {
      onAddRequest: (
        callback: (payload: { text: string; pageUrl: string }) => void,
      ) => () => void
    }
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
