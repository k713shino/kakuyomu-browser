export interface QuickLink {
  id: string
  title: string
  url: string
  order: number
  folderId?: string | null
  tags?: string[]
  workId?: string | null
  lastCheckedAt?: number | null
  lastKnownEpisodeId?: string | null
  lastKnownEpisodeTitle?: string | null
  lastKnownEpisodeUrl?: string | null
  lastKnownEpisodePublishedAt?: string | null
  totalEpisodes?: number | null
  unreadEpisodeCount?: number
}

export interface QuickLinkFolder {
  id: string
  name: string
  order: number
  isExpanded?: boolean
}

export interface QuickLinksData {
  links: QuickLink[]
  folders: QuickLinkFolder[]
}

export interface QuickLinksAPI {
  get: () => Promise<QuickLinksData>
  add: (link: { title: string; url: string; folderId?: string | null; tags?: string[] }) => Promise<QuickLink>
  update: (link: QuickLink) => Promise<boolean>
  delete: (id: string) => Promise<boolean>
  reorder: (links: QuickLink[]) => Promise<boolean>
  checkUpdates: () => Promise<QuickLink[]>

  // Folder operations
  getFolders: () => Promise<QuickLinkFolder[]>
  addFolder: (folder: { name: string }) => Promise<QuickLinkFolder>
  updateFolder: (folder: QuickLinkFolder) => Promise<boolean>
  deleteFolder: (id: string) => Promise<boolean>

  // Export/Import operations
  export: () => Promise<QuickLinksData>
  import: (data: QuickLinksData) => Promise<boolean>
}

declare global {
  interface Window {
    quickLinks: QuickLinksAPI
  }
}
