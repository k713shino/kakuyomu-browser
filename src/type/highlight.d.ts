export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'

export interface Highlight {
  id: string
  workId: string
  episodeId: string
  episodeUrl: string
  workTitle: string
  episodeTitle: string
  selectedText: string
  note: string
  color: HighlightColor
  createdAt: number
  updatedAt: number
}

export interface HighlightsData {
  items: Highlight[]
}

export interface HighlightsAPI {
  getAll: () => Promise<Highlight[]>
  getByEpisodeUrl: (episodeUrl: string) => Promise<Highlight[]>
  add: (data: {
    workId: string
    episodeId: string
    episodeUrl: string
    workTitle: string
    episodeTitle: string
    selectedText: string
    note: string
    color: HighlightColor
  }) => Promise<Highlight>
  update: (id: string, data: { note?: string; color?: HighlightColor }) => Promise<Highlight | null>
  delete: (id: string) => Promise<boolean>
  onAddRequest: (callback: (payload: { text: string; pageUrl: string }) => void) => () => void
}

declare global {
  interface Window {
    highlights: HighlightsAPI
  }
}
