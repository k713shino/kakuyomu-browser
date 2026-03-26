export type ReaderWidth = 'compact' | 'comfortable' | 'wide'
export type ReaderFontSize = 'small' | 'medium' | 'large'

export interface DisplaySettings {
  adBlockEnabled: boolean
  readerWidth: ReaderWidth
  readerFontSize: ReaderFontSize
}

export interface DisplaySettingsAPI {
  get: () => Promise<DisplaySettings>
  update: (settings: Partial<DisplaySettings>) => Promise<DisplaySettings>
  reset: () => Promise<DisplaySettings>
}

declare global {
  interface Window {
    displaySettings: DisplaySettingsAPI
  }
}
