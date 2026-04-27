import type { QuickLink } from './quick-links'

export interface UpdateCheckerAPI {
  runNow: () => Promise<QuickLink[]>
  onCompleted: (callback: (links: QuickLink[]) => void) => () => void
  onNavigate: (callback: (url: string) => void) => () => void
}

declare global {
  interface Window {
    updateChecker: UpdateCheckerAPI
  }
}
