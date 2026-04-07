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
    pitchScale: number
    engineBaseUrl: string
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
          startParagraphIndex?: number
        },
      ) => Promise<AivisSpeechPrepareResult>
      synthesizeChunk: (payload: { chunk: string; styleId: number; speedScale: number; intonationScale: number; pitchScale: number; engineBaseUrl: string }) => Promise<AivisSpeechChunkResult>
    }
    speechDictionary: {
      onAddRequest: (
        callback: (payload: { text: string; pageUrl: string }) => void,
      ) => () => void
    }
    profiles: {
      list: () => Promise<Array<{ id: string; name: string; createdAt: number }>>
      getActive: () => Promise<{ id: string; name: string; createdAt: number }>
      create: (name: string) => Promise<{ id: string; name: string; createdAt: number }>
      rename: (id: string, name: string) => Promise<{ id: string; name: string; createdAt: number }>
      delete: (id: string) => Promise<boolean>
      switch: (id: string) => Promise<void>
    }
    keyboardShortcuts: {
      get: () => Promise<Record<string, { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean } | null>>
      update: (shortcuts: Record<string, unknown>) => Promise<Record<string, { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean } | null>>
      reset: () => Promise<Record<string, { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean } | null>>
    }
    backup: {
      export: () => Promise<{ success: boolean; filePath?: string }>
      import: () => Promise<{ success: boolean; error?: string }>
    }
    kakuyomu: {
      getFollowings: () => Promise<Array<{
        id: string
        title: string
        authorName: string
        url: string
        totalEpisodes: number | null
        latestEpisodeTitle: string | null
        latestEpisodeUrl: string | null
        latestEpisodeAt: string | null
      }>>
      getAuthorNotes: (workId: string) => Promise<Array<{
        id: string
        title: string
        body: string
        createdAt: string | null
      }>>
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
