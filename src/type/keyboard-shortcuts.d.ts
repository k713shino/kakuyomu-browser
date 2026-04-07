export type ShortcutAction =
  | 'goBack'
  | 'goForward'
  | 'reload'
  | 'openHistory'
  | 'toggleSidebar'
  | 'newTab'
  | 'closeTab'
  | 'toggleSpeech'

export interface ShortcutKey {
  key: string     // lowercase e.g. 'arrowleft', 'r', 's'
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
}

export type KeyboardShortcutMap = Record<ShortcutAction, ShortcutKey | null>

export interface KeyboardShortcutsAPI {
  get: () => Promise<KeyboardShortcutMap>
  update: (shortcuts: Partial<KeyboardShortcutMap>) => Promise<KeyboardShortcutMap>
  reset: () => Promise<KeyboardShortcutMap>
}

declare global {
  interface Window {
    keyboardShortcuts: KeyboardShortcutsAPI
  }
}
