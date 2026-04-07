export type ReaderWidth = 'compact' | 'comfortable' | 'wide'
export type ReaderFontSize = 'small' | 'medium' | 'large'
export type SpeechEngine = 'auto' | 'aivis' | 'voicevox' | 'webspeech'

export interface DisplaySettings {
  adBlockEnabled: boolean
  autoReadEnabled: boolean
  readerWidth: ReaderWidth
  readerFontSize: ReaderFontSize
  speechSpeed: number
  speechIntonation: number
  speechVolume: number
  speechPitch: number
  speechEngine: SpeechEngine
  speechSpeakerUuid: string | null
  speechStyleId: number | null
  speechDictionary: Array<{
    from: string
    to: string
  }>
  speechWorkDictionaries: Record<
    string,
    Array<{
      from: string
      to: string
    }>
  >
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
