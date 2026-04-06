export interface CompletedEpisode {
  episodeId: string
  episodeTitle: string
  episodeUrl: string
  completedAt: number
}

export interface EpisodeCompletionItem {
  workId: string
  workTitle: string
  workUrl: string
  completedEpisodes: CompletedEpisode[]
}

export interface EpisodeCompletionData {
  items: EpisodeCompletionItem[]
}

export interface EpisodeCompletionAPI {
  getAll: () => Promise<EpisodeCompletionItem[]>
  getByWorkId: (workId: string) => Promise<EpisodeCompletionItem | null>
  mark: (data: {
    workId: string
    workTitle: string
    workUrl: string
    episodeId: string
    episodeTitle: string
    episodeUrl: string
  }) => Promise<CompletedEpisode>
  unmark: (workId: string, episodeId: string) => Promise<boolean>
  isCompleted: (workId: string, episodeId: string) => Promise<boolean>
  clearByWorkId: (workId: string) => Promise<boolean>
}

declare global {
  interface Window {
    episodeCompletion: EpisodeCompletionAPI
  }
}
