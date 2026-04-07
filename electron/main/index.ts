import { app, BrowserWindow, shell, ipcMain, Menu, dialog, session } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { update } from './update'
import type { DisplaySettings } from '../../src/type/display-settings'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
      webviewTag: true,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Auto update
  update(win)
}

app.whenReady().then(createWindow)

app.on('web-contents-created', (_, contents) => {
  if (contents.getType() !== 'webview') {
    return
  }

  contents.on('context-menu', (_event, params) => {
    const selectedText = params.selectionText?.replace(/\s+/g, ' ').trim()
    if (!selectedText || !win) {
      return
    }

    const menu = Menu.buildFromTemplate([
      {
        label: 'コピー',
        role: 'copy',
      },
      {
        label: '読み辞書に追加',
        click: () => {
          win?.webContents.send('speech-dictionary:add-requested', {
            text: selectedText,
            pageUrl: params.pageURL || contents.getURL(),
          })
        },
      },
    ])

    menu.popup({ window: win })
  })
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

// Quick Links Storage
interface QuickLink {
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

interface QuickLinkFolder {
  id: string
  name: string
  order: number
  isExpanded?: boolean
}

interface QuickLinksData {
  links: QuickLink[]
  folders: QuickLinkFolder[]
}

// ─── プロファイル管理 ────────────────────────────────────────────────────────────

interface ProfileEntry {
  id: string
  name: string
  createdAt: number
}

interface ProfilesConfig {
  activeProfileId: string
  profiles: ProfileEntry[]
}

const profilesConfigPath = path.join(app.getPath('userData'), 'profiles.json')
const profilesRootDir = path.join(app.getPath('userData'), 'profiles')
let activeProfileId = 'default'

function getActiveProfileDir() {
  return path.join(profilesRootDir, activeProfileId)
}

function getQuickLinksPath() {
  return path.join(getActiveProfileDir(), 'quick-links.json')
}

function getReadingHistoryPath() {
  return path.join(getActiveProfileDir(), 'reading-history.json')
}

function getDisplaySettingsPath() {
  return path.join(getActiveProfileDir(), 'display-settings.json')
}

function getEpisodeCompletionPath() {
  return path.join(getActiveProfileDir(), 'episode-completion.json')
}

function getSpeechCacheDir() {
  return path.join(getActiveProfileDir(), 'speech-cache')
}

function getKeyboardShortcutsPath() {
  return path.join(getActiveProfileDir(), 'keyboard-shortcuts.json')
}

function loadProfilesConfig(): ProfilesConfig {
  try {
    if (fs.existsSync(profilesConfigPath)) {
      return JSON.parse(fs.readFileSync(profilesConfigPath, 'utf-8')) as ProfilesConfig
    }
  } catch {
    // ignore
  }

  return { activeProfileId: 'default', profiles: [{ id: 'default', name: 'デフォルト', createdAt: Date.now() }] }
}

function saveProfilesConfig(config: ProfilesConfig) {
  fs.writeFileSync(profilesConfigPath, JSON.stringify(config, null, 2), 'utf-8')
}

function migrateToProfiles() {
  const defaultDir = path.join(profilesRootDir, 'default')
  if (fs.existsSync(defaultDir)) {
    return // すでに移行済み
  }

  fs.mkdirSync(defaultDir, { recursive: true })

  // 旧パスからプロファイルディレクトリへ移行
  const migrations: [string, string][] = [
    ['quick-links.json', 'quick-links.json'],
    ['reading-history.json', 'reading-history.json'],
    ['display-settings.json', 'display-settings.json'],
    ['episode-completion.json', 'episode-completion.json'],
    ['keyboard-shortcuts.json', 'keyboard-shortcuts.json'],
  ]

  for (const [oldName, newName] of migrations) {
    const oldPath = path.join(app.getPath('userData'), oldName)
    const newPath = path.join(defaultDir, newName)
    if (fs.existsSync(oldPath)) {
      try {
        fs.renameSync(oldPath, newPath)
      } catch { /* ignore */ }
    }
  }

  // speech-cache ディレクトリ
  const oldCache = path.join(app.getPath('userData'), 'speech-cache')
  const newCache = path.join(defaultDir, 'speech-cache')
  if (fs.existsSync(oldCache)) {
    try {
      fs.renameSync(oldCache, newCache)
    } catch { /* ignore */ }
  }

  // profiles.json 初期化
  if (!fs.existsSync(profilesConfigPath)) {
    saveProfilesConfig({
      activeProfileId: 'default',
      profiles: [{ id: 'default', name: 'デフォルト', createdAt: Date.now() }],
    })
  }
}

// 起動時にプロファイルを初期化
migrateToProfiles()
const _profilesCfg = loadProfilesConfig()
activeProfileId = _profilesCfg.activeProfileId
// プロファイルディレクトリが存在しない場合は作成
fs.mkdirSync(getActiveProfileDir(), { recursive: true })

// ─── キーボードショートカット ─────────────────────────────────────────────────────

type ShortcutAction =
  | 'goBack'
  | 'goForward'
  | 'reload'
  | 'openHistory'
  | 'toggleSidebar'
  | 'newTab'
  | 'closeTab'
  | 'toggleSpeech'

interface ShortcutKey {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
}

type KeyboardShortcutMap = Record<ShortcutAction, ShortcutKey | null>

const defaultKeyboardShortcuts: KeyboardShortcutMap = {
  goBack: { key: 'arrowleft', alt: true },
  goForward: { key: 'arrowright', alt: true },
  reload: { key: 'r', ctrl: true },
  openHistory: { key: 'h', ctrl: true },
  toggleSidebar: { key: 'b', ctrl: true },
  newTab: { key: 't', ctrl: true },
  closeTab: { key: 'w', ctrl: true },
  toggleSpeech: { key: 's', ctrl: true },
}

function loadKeyboardShortcuts(): KeyboardShortcutMap {
  try {
    if (fs.existsSync(getKeyboardShortcutsPath())) {
      const data = JSON.parse(fs.readFileSync(getKeyboardShortcutsPath(), 'utf-8'))
      return { ...defaultKeyboardShortcuts, ...data }
    }
  } catch { /* ignore */ }

  return defaultKeyboardShortcuts
}

function saveKeyboardShortcuts(shortcuts: KeyboardShortcutMap) {
  fs.writeFileSync(getKeyboardShortcutsPath(), JSON.stringify(shortcuts, null, 2), 'utf-8')
}

// ─── データパス（後方互換用エイリアス）──────────────────────────────────────────────

// 後続のコードが使う静的パス変数を関数呼び出しに変換するため、
// 関数ベースのアクセサを使用する（各 load/save 関数内で呼び出す）

// ─── QuickLinks ──────────────────────────────────────────────────────────────

// デフォルトのクイックリンク
const defaultQuickLinksData: QuickLinksData = {
  links: [
    { id: '1', title: 'カクヨムトップ', url: 'https://kakuyomu.jp', order: 0, folderId: null, tags: [] },
    { id: '2', title: 'マイワークスペース', url: 'https://kakuyomu.jp/my', order: 1, folderId: null, tags: [] },
  ],
  folders: []
}

function normalizeQuickLink(link: QuickLink): QuickLink {
  return {
    ...link,
    folderId: link.folderId ?? null,
    tags: Array.isArray(link.tags)
      ? [...new Set(link.tags.map(tag => String(tag).trim()).filter(Boolean))]
      : [],
    workId: link.workId ?? parseKakuyomuUrl(link.url).workId,
    lastCheckedAt: link.lastCheckedAt ?? null,
    lastKnownEpisodeId: link.lastKnownEpisodeId ?? null,
    lastKnownEpisodeTitle: link.lastKnownEpisodeTitle ?? null,
    lastKnownEpisodeUrl: link.lastKnownEpisodeUrl ?? null,
    lastKnownEpisodePublishedAt: link.lastKnownEpisodePublishedAt ?? null,
    totalEpisodes: typeof link.totalEpisodes === 'number' ? link.totalEpisodes : null,
    unreadEpisodeCount: typeof link.unreadEpisodeCount === 'number' ? link.unreadEpisodeCount : 0,
  }
}

// クイックリンクデータを読み込む
function loadQuickLinksData(): QuickLinksData {
  try {
    if (fs.existsSync(getQuickLinksPath())) {
      const data = fs.readFileSync(getQuickLinksPath(), 'utf-8')
      const parsed = JSON.parse(data)

      // 古い形式（配列）から新しい形式（オブジェクト）への移行
      if (Array.isArray(parsed)) {
        const migrated: QuickLinksData = {
          links: parsed.map((link: any) => normalizeQuickLink({ ...link, folderId: null })),
          folders: []
        }
        saveQuickLinksData(migrated)
        return migrated
      }

      const normalized: QuickLinksData = {
        links: Array.isArray(parsed.links) ? parsed.links.map((link: QuickLink) => normalizeQuickLink(link)) : [],
        folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      }
      return normalized
    } else {
      // 初回起動時はデフォルトリンクを保存
      saveQuickLinksData(defaultQuickLinksData)
      return defaultQuickLinksData
    }
  } catch (error) {
    console.error('Failed to load quick links:', error)
    return defaultQuickLinksData
  }
}

// クイックリンクデータを保存する
function saveQuickLinksData(data: QuickLinksData): void {
  try {
    const normalized: QuickLinksData = {
      links: data.links.map(link => normalizeQuickLink(link)),
      folders: data.folders,
    }
    fs.writeFileSync(getQuickLinksPath(), JSON.stringify(normalized, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save quick links:', error)
  }
}

// IPC Handlers for Quick Links
ipcMain.handle('quick-links:get', () => {
  return loadQuickLinksData()
})

ipcMain.handle('quick-links:add', (_, link: { title: string; url: string; folderId?: string | null; tags?: string[] }) => {
  const data = loadQuickLinksData()
  const newLink = normalizeQuickLink({
    ...link,
    id: Date.now().toString(),
    order: data.links.length,
    folderId: link.folderId || null,
  })
  data.links.push(newLink)
  saveQuickLinksData(data)
  return newLink
})

ipcMain.handle('quick-links:update', (_, updatedLink: QuickLink) => {
  const data = loadQuickLinksData()
  const index = data.links.findIndex((l: QuickLink) => l.id === updatedLink.id)
  if (index !== -1) {
    data.links[index] = normalizeQuickLink(updatedLink)
    saveQuickLinksData(data)
    return true
  }
  return false
})

ipcMain.handle('quick-links:delete', (_, id: string) => {
  const data = loadQuickLinksData()
  data.links = data.links.filter((l: QuickLink) => l.id !== id)
  saveQuickLinksData(data)
  return true
})

ipcMain.handle('quick-links:reorder', (_, reorderedLinks: QuickLink[]) => {
  const data = loadQuickLinksData()
  data.links = reorderedLinks
  saveQuickLinksData(data)
  return true
})

// IPC Handlers for Folders
ipcMain.handle('quick-links:get-folders', () => {
  const data = loadQuickLinksData()
  return data.folders
})

ipcMain.handle('quick-links:add-folder', (_, folder: { name: string }) => {
  const data = loadQuickLinksData()
  const newFolder: QuickLinkFolder = {
    id: `folder-${Date.now()}`,
    name: folder.name,
    order: data.folders.length,
    isExpanded: true,
  }
  data.folders.push(newFolder)
  saveQuickLinksData(data)
  return newFolder
})

ipcMain.handle('quick-links:update-folder', (_, updatedFolder: QuickLinkFolder) => {
  const data = loadQuickLinksData()
  const index = data.folders.findIndex((f: QuickLinkFolder) => f.id === updatedFolder.id)
  if (index !== -1) {
    data.folders[index] = updatedFolder
    saveQuickLinksData(data)
    return true
  }
  return false
})

ipcMain.handle('quick-links:delete-folder', (_, id: string) => {
  const data = loadQuickLinksData()
  // フォルダ内のリンクをルートに移動
  data.links = data.links.map((link: QuickLink) =>
    link.folderId === id ? { ...link, folderId: null } : link
  )
  data.folders = data.folders.filter((f: QuickLinkFolder) => f.id !== id)
  saveQuickLinksData(data)
  return true
})

// Quick Links Export/Import
ipcMain.handle('quick-links:export', () => {
  return loadQuickLinksData()
})

ipcMain.handle('quick-links:import', (_, data: QuickLinksData) => {
  saveQuickLinksData({
    links: Array.isArray(data.links) ? data.links.map(link => normalizeQuickLink(link)) : [],
    folders: Array.isArray(data.folders) ? data.folders : [],
  })
  return true
})

ipcMain.handle('quick-links:check-updates', async () => {
  const data = loadQuickLinksData()
  const nextLinks: QuickLink[] = []

  for (const link of data.links) {
    nextLinks.push(await refreshQuickLinkUpdateInfo(link))
  }

  const nextData: QuickLinksData = {
    ...data,
    links: nextLinks,
  }
  saveQuickLinksData(nextData)
  return nextLinks
})

// Reading History
interface ReadingHistoryItem {
  id: string
  title: string
  author: string
  url: string
  lastReadUrl: string
  lastReadEpisodeTitle: string
  lastReadAt: number
  firstReadAt: number
  readCount: number
  scrollPosition?: number
  speechParagraphIndex?: number
  speechEpisodeUrl?: string
}

interface ReadingHistoryData {
  items: ReadingHistoryItem[]
}

// パスは getReadingHistoryPath() / getDisplaySettingsPath() / getSpeechCacheDir() を使用
const AIVIS_SPEECH_URL = 'http://127.0.0.1:10101'
const VOICEVOX_URL = 'http://127.0.0.1:50021'

const defaultDisplaySettings: DisplaySettings = {
  adBlockEnabled: true,
  autoReadEnabled: false,
  readerWidth: 'comfortable',
  readerFontSize: 'medium',
  speechSpeed: 1.05,
  speechIntonation: 1.15,
  speechVolume: 1.0,
  speechPitch: 0.0,
  speechEngine: 'auto',
  speechSpeakerUuid: null,
  speechStyleId: null,
  speechDictionary: [
    { from: 'AI', to: 'エーアイ' },
    { from: 'SNS', to: 'エスエヌエス' },
    { from: 'VR', to: 'ブイアール' },
    { from: 'AR', to: 'エーアール' },
    { from: 'MMO', to: 'エムエムオー' },
    { from: 'RPG', to: 'アールピージー' },
    { from: 'HP', to: 'エイチピー' },
    { from: 'MP', to: 'エムピー' },
    { from: 'Lv', to: 'レベル' },
    { from: 'XP', to: 'エックスピー' },
    { from: 'YouTube', to: 'ユーチューブ' },
    { from: 'VTuber', to: 'ブイチューバー' },
  ],
  speechWorkDictionaries: {},
}

interface AivisSpeakerStyle {
  id: number
  name: string
}

interface AivisSpeaker {
  name: string
  speaker_uuid: string
  styles: AivisSpeakerStyle[]
}

interface AivisAudioQuery {
  speedScale?: number
  intonationScale?: number
  pitchScale?: number
  [key: string]: unknown
}

interface AivisSpeechSynthesisResult {
  audioBase64: string
  mimeType: string
  speakerId: number
  speakerName: string
  styleId: number
  styleName: string
}

async function fetchVoiceEngine<T>(baseUrl: string, pathName: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${pathName}`, init)
  } catch (error) {
    throw new Error(`音声エンジン (${baseUrl}) に接続できません。アプリを起動してください。`)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `音声エンジンのリクエストに失敗しました: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`,
    )
  }

  return response.json() as Promise<T>
}

async function fetchVoiceEngineBinary(baseUrl: string, pathName: string, init?: RequestInit): Promise<Buffer> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${pathName}`, init)
  } catch (error) {
    throw new Error(`音声エンジン (${baseUrl}) に接続できません。アプリを起動してください。`)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `音声エンジンのリクエストに失敗しました: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// VOICEVOX 互換エンジンのベース URL を解決する。
// 'auto' の場合は AivisSpeech → VOICEVOX の順に試みる。
async function resolveEngineBaseUrl(engine: string): Promise<string> {
  if (engine === 'voicevox') {
    return VOICEVOX_URL
  }
  if (engine === 'aivis') {
    return AIVIS_SPEECH_URL
  }

  // 'auto': 応答のあった最初のエンジンを使用
  const candidates = [AIVIS_SPEECH_URL, VOICEVOX_URL]
  for (const url of candidates) {
    try {
      const speakers = await fetchVoiceEngine<AivisSpeaker[]>(url, '/speakers')
      if (speakers.length > 0) {
        return url
      }
    } catch {
      // 次の候補へ
    }
  }

  throw new Error('利用可能な音声エンジンが見つかりません。AivisSpeech または VOICEVOX を起動してください。')
}

// エンジン URL とスピーカー一覧を同時に取得する（auto 時の二重取得を避ける）
async function resolveEngineWithSpeakers(engine: string): Promise<{ baseUrl: string; speakers: AivisSpeaker[] }> {
  if (engine === 'voicevox') {
    const speakers = await fetchVoiceEngine<AivisSpeaker[]>(VOICEVOX_URL, '/speakers')
    return { baseUrl: VOICEVOX_URL, speakers }
  }
  if (engine === 'aivis') {
    const speakers = await fetchVoiceEngine<AivisSpeaker[]>(AIVIS_SPEECH_URL, '/speakers')
    return { baseUrl: AIVIS_SPEECH_URL, speakers }
  }

  // 'auto': AivisSpeech → VOICEVOX の順に試みる
  for (const url of [AIVIS_SPEECH_URL, VOICEVOX_URL]) {
    try {
      const speakers = await fetchVoiceEngine<AivisSpeaker[]>(url, '/speakers')
      if (speakers.length > 0) {
        return { baseUrl: url, speakers }
      }
    } catch {
      // 次の候補へ
    }
  }

  throw new Error('利用可能な音声エンジンが見つかりません。AivisSpeech または VOICEVOX を起動してください。')
}

async function getConfiguredStyle(baseUrl: string, speakers: AivisSpeaker[]) {
  const settings = loadDisplaySettings()
  const configuredSpeaker = settings.speechSpeakerUuid
    ? speakers.find(speaker => speaker.speaker_uuid === settings.speechSpeakerUuid)
    : null
  const configuredStyle = configuredSpeaker?.styles.find(style => style.id === settings.speechStyleId)

  if (configuredSpeaker && configuredStyle) {
    return {
      baseUrl,
      speakerName: configuredSpeaker.name,
      speakerUuid: configuredSpeaker.speaker_uuid,
      styleId: configuredStyle.id,
      styleName: configuredStyle.name,
    }
  }

  const fallbackStyle = speakers[0]?.styles[0]
  if (!speakers[0] || !fallbackStyle) {
    throw new Error('音声エンジンの話者が見つかりません')
  }

  return {
    baseUrl,
    speakerName: speakers[0].name,
    speakerUuid: speakers[0].speaker_uuid,
    styleId: fallbackStyle.id,
    styleName: fallbackStyle.name,
  }
}

function splitSpeechText(text: string, maxLength = 220): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\u3000/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''

  const pushCurrent = () => {
    if (current.trim()) {
      chunks.push(current.trim())
      current = ''
    }
  }

  for (const line of normalized) {
    const sentences = line
      .split(/(?<=[。！？!?…」』）\)])/)
      .map(part => part.trim())
      .filter(Boolean)

    for (const sentence of sentences) {
      if (sentence.length > maxLength) {
        pushCurrent()

        for (let index = 0; index < sentence.length; index += maxLength) {
          chunks.push(sentence.slice(index, index + maxLength).trim())
        }
        continue
      }

      const candidate = current ? `${current} ${sentence}` : sentence
      if (candidate.length > maxLength) {
        pushCurrent()
        current = sentence
      } else {
        current = candidate
      }
    }

    pushCurrent()
  }

  pushCurrent()
  return chunks
}

function splitSpeechParagraphs(
  paragraphs: Array<{ index: number; text: string }>,
  maxLength = 220,
): Array<{ text: string; paragraphIndexes: number[] }> {
  const chunks: Array<{ text: string; paragraphIndexes: number[] }> = []

  paragraphs.forEach(paragraph => {
    const normalized = paragraph.text.trim()
    if (!normalized) {
      return
    }

    const sentences = normalized
      .split(/(?<=[。！？!?…」』）\)])/)
      .map(part => part.trim())
      .filter(Boolean)

    let current = ''
    const pushCurrent = () => {
      if (!current.trim()) {
        return
      }

      chunks.push({
        text: current.trim(),
        paragraphIndexes: [paragraph.index],
      })
      current = ''
    }

    for (const sentence of sentences) {
      if (sentence.length > maxLength) {
        pushCurrent()

        for (let index = 0; index < sentence.length; index += maxLength) {
          const slice = sentence.slice(index, index + maxLength).trim()
          if (slice) {
            chunks.push({
              text: slice,
              paragraphIndexes: [paragraph.index],
            })
          }
        }
        continue
      }

      const candidate = current ? `${current} ${sentence}` : sentence
      if (candidate.length > maxLength) {
        pushCurrent()
        current = sentence
      } else {
        current = candidate
      }
    }

    pushCurrent()
  })

  return chunks
}

function applySpeechDictionary(
  text: string,
  dictionary: Array<{ from: string; to: string }>,
): string {
  return dictionary.reduce((current, entry) => {
    if (!entry.from) {
      return current
    }

    return current.split(entry.from).join(entry.to)
  }, text)
}

function normalizeSpeechText(
  text: string,
  dictionary: Array<{ from: string; to: string }> = [],
): string {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u3000/g, ' ')
    .replace(/[《〈](.+?)[》〉]/g, '$1')
    .replace(/｜/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—―]/g, ' ')
    .replace(/[…]{2,}/g, '…')
    .replace(/[・]{2,}/g, ' ')
    .replace(/[【】［］\[\]<>]/g, ' ')
    .replace(/[※◆■□▼▽▲△●○◎◇]/g, ' ')
    .replace(/[~〜]{2,}/g, ' ')
    .replace(/[!！?？]{3,}/g, match => match.slice(0, 2))
    .replace(/[.。]{4,}/g, '…。')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')

  return applySpeechDictionary(normalized, dictionary)
}

function buildSpeechDictionary(
  settings: DisplaySettings,
  workId?: string | null,
): Array<{ from: string; to: string }> {
  const globalDictionary = settings.speechDictionary ?? []
  const workDictionary = workId ? settings.speechWorkDictionaries?.[workId] ?? [] : []
  return [...globalDictionary, ...workDictionary]
}

function mergeWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error('No audio buffers to merge')
  }

  if (buffers.length === 1) {
    return buffers[0]
  }

  const headerSize = 44
  const first = Buffer.from(buffers[0])
  let dataSize = first.length - headerSize
  const chunks: Buffer[] = [first]

  for (let index = 1; index < buffers.length; index += 1) {
    const buffer = buffers[index]
    const pcmChunk = buffer.subarray(headerSize)
    dataSize += pcmChunk.length
    chunks.push(pcmChunk)
  }

  const merged = Buffer.concat(chunks)
  merged.writeUInt32LE(36 + dataSize, 4)
  merged.writeUInt32LE(dataSize, 40)
  return merged
}

function ensureSpeechCacheDir() {
  if (!fs.existsSync(getSpeechCacheDir())) {
    fs.mkdirSync(getSpeechCacheDir(), { recursive: true })
  }
}

function getSpeechCachePath(payload: {
  chunk: string
  styleId: number
  speedScale: number
  intonationScale: number
  pitchScale: number
  engineBaseUrl: string
}) {
  const cacheKey = createHash('sha1')
    .update(
      JSON.stringify({
        version: 3,
        chunk: payload.chunk,
        styleId: payload.styleId,
        speedScale: payload.speedScale,
        intonationScale: payload.intonationScale,
        pitchScale: payload.pitchScale,
        engineBaseUrl: payload.engineBaseUrl,
      }),
    )
    .digest('hex')

  return path.join(getSpeechCacheDir(), `${cacheKey}.wav`)
}

ipcMain.handle(
  'aivis-speech:prepare',
  async (_, payload: { title?: string; paragraphs: Array<{ index: number; text: string }>; workId?: string | null; startParagraphIndex?: number }) => {
    const displaySettings = loadDisplaySettings()
    const dictionary = buildSpeechDictionary(displaySettings, payload.workId)
    const allParagraphs = (payload.paragraphs ?? [])
      .map(paragraph => ({
        index: paragraph.index,
        text: normalizeSpeechText(paragraph.text, dictionary),
      }))
      .filter(paragraph => Boolean(paragraph.text))

    // 再開位置が指定されていれば、それ以降の段落のみ対象にする
    const normalizedParagraphs =
      payload.startParagraphIndex !== undefined
        ? allParagraphs.filter(p => p.index >= payload.startParagraphIndex!)
        : allParagraphs

    // 再開時はタイトル読み上げをスキップ
    const includeTitle = payload.startParagraphIndex === undefined
    const title = includeTitle ? normalizeSpeechText(payload.title ?? '', dictionary) : ''

    if (!title && normalizedParagraphs.length === 0) {
      throw new Error('読み上げるテキストがありません')
    }

    const { baseUrl, speakerName, speakerUuid, styleId, styleName } =
      await resolveEngineWithSpeakers(displaySettings.speechEngine).then(({ baseUrl, speakers }) =>
        getConfiguredStyle(baseUrl, speakers),
      )

    const chunks = [
      ...(title
        ? [
            {
              text: title,
              paragraphIndexes: [],
            },
          ]
        : []),
      ...splitSpeechParagraphs(normalizedParagraphs),
    ]
    return {
      chunks,
      styleId,
      speakerUuid,
      speakerName,
      styleName,
      speedScale: displaySettings.speechSpeed,
      intonationScale: displaySettings.speechIntonation,
      pitchScale: displaySettings.speechPitch,
      engineBaseUrl: baseUrl,
    }
  },
)

ipcMain.handle(
  'aivis-speech:synthesize-chunk',
  async (_, payload: { chunk: string; styleId: number; speedScale: number; intonationScale: number; pitchScale: number; engineBaseUrl: string }) => {
    const { chunk, styleId, speedScale, intonationScale, pitchScale, engineBaseUrl } = payload
    const cachePath = getSpeechCachePath({
      chunk,
      styleId,
      speedScale,
      intonationScale,
      pitchScale,
      engineBaseUrl,
    })

    try {
      if (fs.existsSync(cachePath)) {
        const cachedBuffer = fs.readFileSync(cachePath)
        return {
          audioBase64: cachedBuffer.toString('base64'),
          mimeType: 'audio/wav',
          cached: true,
        }
      }
    } catch (error) {
      console.error('Failed to read speech cache:', error)
    }

    const audioQuery = await fetchVoiceEngine<AivisAudioQuery>(
      engineBaseUrl,
      `/audio_query?text=${encodeURIComponent(chunk)}&speaker=${styleId}`,
      { method: 'POST' },
    )
    audioQuery.speedScale = speedScale
    audioQuery.intonationScale = intonationScale
    audioQuery.pitchScale = pitchScale

    const audioBuffer = await fetchVoiceEngineBinary(engineBaseUrl, `/synthesis?speaker=${styleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audioQuery),
    })

    try {
      ensureSpeechCacheDir()
      fs.writeFileSync(cachePath, audioBuffer)
    } catch (error) {
      console.error('Failed to write speech cache:', error)
    }

    return {
      audioBase64: audioBuffer.toString('base64'),
      mimeType: 'audio/wav',
      cached: false,
    }
  },
)

ipcMain.handle('aivis-speech:get-speakers', async () => {
  const displaySettings = loadDisplaySettings()
  const { speakers } = await resolveEngineWithSpeakers(displaySettings.speechEngine)
  return speakers.map(speaker => ({
    name: speaker.name,
    speakerUuid: speaker.speaker_uuid,
    styles: speaker.styles.map(style => ({
      id: style.id,
      name: style.name,
    })),
  }))
})

ipcMain.handle(
  'aivis-speech:synthesize',
  async (_, payload: { text: string; title?: string; workId?: string | null }): Promise<AivisSpeechSynthesisResult> => {
    const displaySettings = loadDisplaySettings()
    const dictionary = buildSpeechDictionary(displaySettings, payload.workId)
    const text = normalizeSpeechText(payload.text ?? '', dictionary)
    if (!text) {
      throw new Error('読み上げるテキストがありません')
    }

    const { baseUrl, speakerName, styleId, styleName } =
      await resolveEngineWithSpeakers(displaySettings.speechEngine).then(({ baseUrl, speakers }) =>
        getConfiguredStyle(baseUrl, speakers),
      )

    const chunks = splitSpeechText(text)
    if (chunks.length === 0) {
      throw new Error('音声エンジンに渡せる本文がありません')
    }

    const audioBuffers: Buffer[] = []
    for (const chunk of chunks) {
      const audioQuery = await fetchVoiceEngine<AivisAudioQuery>(
        baseUrl,
        `/audio_query?text=${encodeURIComponent(chunk)}&speaker=${styleId}`,
        { method: 'POST' },
      )

      audioQuery.speedScale = displaySettings.speechSpeed
      audioQuery.intonationScale = displaySettings.speechIntonation
      audioQuery.pitchScale = displaySettings.speechPitch

      const audioBuffer = await fetchVoiceEngineBinary(baseUrl, `/synthesis?speaker=${styleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioQuery),
      })
      audioBuffers.push(audioBuffer)
    }

    const audioBuffer = mergeWavBuffers(audioBuffers)

    return {
      audioBase64: audioBuffer.toString('base64'),
      mimeType: 'audio/wav',
      speakerId: styleId,
      speakerName,
      styleId,
      styleName,
    }
  },
)

function loadDisplaySettings(): DisplaySettings {
  try {
    if (fs.existsSync(getDisplaySettingsPath())) {
      const data = fs.readFileSync(getDisplaySettingsPath(), 'utf-8')
      const saved = JSON.parse(data)
      // pitchScale の旧形式（0.5〜2.0 の乗数）を新形式（-0.15〜0.15 のオフセット）に移行する
      if (typeof saved.speechPitch === 'number' && (saved.speechPitch > 0.15 || saved.speechPitch < -0.15)) {
        saved.speechPitch = 0.0
      }
      return {
        ...defaultDisplaySettings,
        ...saved,
      }
    }

    saveDisplaySettings(defaultDisplaySettings)
    return defaultDisplaySettings
  } catch (error) {
    console.error('Failed to load display settings:', error)
    return defaultDisplaySettings
  }
}

function saveDisplaySettings(settings: DisplaySettings): void {
  try {
    fs.writeFileSync(getDisplaySettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save display settings:', error)
  }
}

function loadReadingHistoryData(): ReadingHistoryData {
  try {
    if (fs.existsSync(getReadingHistoryPath())) {
      const data = fs.readFileSync(getReadingHistoryPath(), 'utf-8')
      return JSON.parse(data)
    } else {
      const defaultData: ReadingHistoryData = { items: [] }
      saveReadingHistoryData(defaultData)
      return defaultData
    }
  } catch (error) {
    console.error('Failed to load reading history:', error)
    return { items: [] }
  }
}

function saveReadingHistoryData(data: ReadingHistoryData): void {
  try {
    fs.writeFileSync(getReadingHistoryPath(), JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save reading history:', error)
  }
}

// カクヨムURLから作品IDとエピソード情報を抽出
function parseKakuyomuUrl(url: string): { workId: string | null; episodeId: string | null } {
  try {
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/').filter(p => p)

    // /works/{workId} または /works/{workId}/episodes/{episodeId}
    if (pathParts[0] === 'works' && pathParts.length >= 2) {
      const workId = pathParts[1]
      const episodeId = pathParts.length >= 4 && pathParts[2] === 'episodes' ? pathParts[3] : null
      return { workId, episodeId }
    }

    return { workId: null, episodeId: null }
  } catch (error) {
    return { workId: null, episodeId: null }
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

async function fetchKakuyomuWorkSummary(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'kakuyomu-browser/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Kakuyomu work page: ${response.status}`)
  }

  const html = await response.text()
  const { workId } = parseKakuyomuUrl(url)
  if (!workId) {
    return null
  }

  const episodeRegex = new RegExp(`/works/${workId}/episodes/([^"'?#/<>]+)`, 'g')
  const episodeIds: string[] = []
  const seenEpisodeIds = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = episodeRegex.exec(html)) !== null) {
    const episodeId = match[1]
    if (!seenEpisodeIds.has(episodeId)) {
      seenEpisodeIds.add(episodeId)
      episodeIds.push(episodeId)
    }
  }

  const scriptDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (scriptDataMatch) {
    try {
      const nextData = JSON.parse(scriptDataMatch[1])
      const episodes =
        nextData?.props?.pageProps?.__APOLLO_STATE__ &&
        Object.values(nextData.props.pageProps.__APOLLO_STATE__).find((value: any) =>
          Array.isArray(value?.tableOfContents),
        )
      const totalEpisodes = typeof (episodes as any)?.totalEpisodeCount === 'number'
        ? (episodes as any).totalEpisodeCount
        : episodeIds.length
      return {
        workId,
        totalEpisodes,
        latestEpisodeId: episodeIds[0] ?? null,
      }
    } catch (error) {
      console.error('Failed to parse Kakuyomu NEXT_DATA:', error)
    }
  }

  const titleMatch = html.match(/<a[^>]+href="\/works\/[^"]+\/episodes\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
  const latestEpisodeId = titleMatch?.[1] ?? episodeIds[0] ?? null
  const latestEpisodeTitle = titleMatch
    ? decodeHtmlEntities(titleMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    : null
  const dateMatch = html.match(/<time[^>]*datetime="([^"]+)"/)

  return {
    workId,
    totalEpisodes: episodeIds.length,
    latestEpisodeId,
    latestEpisodeTitle,
    latestEpisodeUrl: latestEpisodeId ? `https://kakuyomu.jp/works/${workId}/episodes/${latestEpisodeId}` : null,
    latestEpisodePublishedAt: dateMatch?.[1] ?? null,
  }
}

async function refreshQuickLinkUpdateInfo(link: QuickLink): Promise<QuickLink> {
  const { workId } = parseKakuyomuUrl(link.url)
  if (!workId || !link.url.includes('/works/')) {
    return normalizeQuickLink(link)
  }

  try {
    const summary = await fetchKakuyomuWorkSummary(link.url)
    if (!summary) {
      return normalizeQuickLink(link)
    }

    const completion = loadEpisodeCompletionData().items.find(item => item.workId === workId)
    const completedCount = completion?.completedEpisodes.length ?? 0
    const totalEpisodes = summary.totalEpisodes ?? null

    return normalizeQuickLink({
      ...link,
      workId,
      lastCheckedAt: Date.now(),
      lastKnownEpisodeId: summary.latestEpisodeId ?? link.lastKnownEpisodeId ?? null,
      lastKnownEpisodeTitle: summary.latestEpisodeTitle ?? link.lastKnownEpisodeTitle ?? null,
      lastKnownEpisodeUrl: summary.latestEpisodeUrl ?? link.lastKnownEpisodeUrl ?? null,
      lastKnownEpisodePublishedAt: summary.latestEpisodePublishedAt ?? link.lastKnownEpisodePublishedAt ?? null,
      totalEpisodes,
      unreadEpisodeCount: totalEpisodes !== null ? Math.max(totalEpisodes - completedCount, 0) : 0,
    })
  } catch (error) {
    console.error('Failed to refresh quick link update info:', error)
    return normalizeQuickLink({
      ...link,
      workId,
      lastCheckedAt: Date.now(),
    })
  }
}

ipcMain.handle('reading-history:get', () => {
  const data = loadReadingHistoryData()
  // 最終読書日時の降順でソート
  return data.items.sort((a, b) => b.lastReadAt - a.lastReadAt)
})

ipcMain.handle('reading-history:add-or-update', (_, pageData: { url: string; title: string; scrollPosition?: number }) => {
  const data = loadReadingHistoryData()
  const { workId, episodeId } = parseKakuyomuUrl(pageData.url)

  if (!workId) {
    throw new Error('Invalid Kakuyomu URL')
  }

  // 既存の履歴を検索
  let historyItem = data.items.find(item => item.id === workId)

  const now = Date.now()

  if (historyItem) {
    // 既存の履歴を更新
    historyItem.lastReadUrl = pageData.url
    historyItem.lastReadEpisodeTitle = pageData.title
    historyItem.lastReadAt = now
    historyItem.readCount += 1
    if (pageData.scrollPosition !== undefined) {
      historyItem.scrollPosition = pageData.scrollPosition
    }
  } else {
    // 新しい履歴を作成
    historyItem = {
      id: workId,
      title: pageData.title.split(' - ')[0] || pageData.title, // 作品タイトル（エピソード名を除外）
      author: 'Unknown', // 後で改善可能
      url: `https://kakuyomu.jp/works/${workId}`,
      lastReadUrl: pageData.url,
      lastReadEpisodeTitle: pageData.title,
      lastReadAt: now,
      firstReadAt: now,
      readCount: 1,
      scrollPosition: pageData.scrollPosition
    }
    data.items.push(historyItem)
  }

  saveReadingHistoryData(data)
  return historyItem
})

ipcMain.handle('reading-history:delete', (_, id: string) => {
  const data = loadReadingHistoryData()
  data.items = data.items.filter(item => item.id !== id)
  saveReadingHistoryData(data)
  return true
})

ipcMain.handle('reading-history:clear', () => {
  saveReadingHistoryData({ items: [] })
  return true
})

ipcMain.handle('reading-history:update-scroll', (_, id: string, position: number) => {
  const data = loadReadingHistoryData()
  const item = data.items.find(i => i.id === id)

  if (item) {
    item.scrollPosition = position
    saveReadingHistoryData(data)
    return true
  }

  return false
})

ipcMain.handle('reading-history:update-speech-position', (_, workId: string, paragraphIndex: number | null, episodeUrl: string) => {
  const data = loadReadingHistoryData()
  const item = data.items.find(i => i.id === workId)

  if (item) {
    if (paragraphIndex === null) {
      delete item.speechParagraphIndex
      delete item.speechEpisodeUrl
    } else {
      item.speechParagraphIndex = paragraphIndex
      item.speechEpisodeUrl = episodeUrl
    }
    saveReadingHistoryData(data)
    return true
  }

  return false
})

ipcMain.handle('display-settings:get', () => {
  return loadDisplaySettings()
})

ipcMain.handle('display-settings:update', (_, settings: Partial<DisplaySettings>) => {
  const mergedSettings = {
    ...loadDisplaySettings(),
    ...settings,
  }
  saveDisplaySettings(mergedSettings)
  return mergedSettings
})

ipcMain.handle('display-settings:reset', () => {
  saveDisplaySettings(defaultDisplaySettings)
  return defaultDisplaySettings
})

// Episode Completion Storage
interface CompletedEpisode {
  episodeId: string
  episodeTitle: string
  episodeUrl: string
  completedAt: number
}

interface EpisodeCompletionItem {
  workId: string
  workTitle: string
  workUrl: string
  completedEpisodes: CompletedEpisode[]
}

interface EpisodeCompletionData {
  items: EpisodeCompletionItem[]
}

// パスは getEpisodeCompletionPath() を使用

function loadEpisodeCompletionData(): EpisodeCompletionData {
  try {
    if (fs.existsSync(getEpisodeCompletionPath())) {
      const data = fs.readFileSync(getEpisodeCompletionPath(), 'utf-8')
      return JSON.parse(data)
    } else {
      const defaultData: EpisodeCompletionData = { items: [] }
      saveEpisodeCompletionData(defaultData)
      return defaultData
    }
  } catch (error) {
    console.error('Failed to load episode completion data:', error)
    return { items: [] }
  }
}

function saveEpisodeCompletionData(data: EpisodeCompletionData): void {
  try {
    fs.writeFileSync(getEpisodeCompletionPath(), JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save episode completion data:', error)
  }
}

ipcMain.handle('episode-completion:get-all', () => {
  return loadEpisodeCompletionData().items
})

ipcMain.handle('episode-completion:get-by-work', (_, workId: string) => {
  const data = loadEpisodeCompletionData()
  return data.items.find(item => item.workId === workId) ?? null
})

ipcMain.handle(
  'episode-completion:mark',
  (
    _,
    payload: {
      workId: string
      workTitle: string
      workUrl: string
      episodeId: string
      episodeTitle: string
      episodeUrl: string
    },
  ) => {
    const data = loadEpisodeCompletionData()
    let workItem = data.items.find(item => item.workId === payload.workId)

    if (!workItem) {
      workItem = {
        workId: payload.workId,
        workTitle: payload.workTitle,
        workUrl: payload.workUrl,
        completedEpisodes: [],
      }
      data.items.push(workItem)
    } else {
      // タイトルを最新に更新
      if (payload.workTitle) {
        workItem.workTitle = payload.workTitle
      }
    }

    const alreadyCompleted = workItem.completedEpisodes.some(ep => ep.episodeId === payload.episodeId)
    if (!alreadyCompleted) {
      const newEpisode: CompletedEpisode = {
        episodeId: payload.episodeId,
        episodeTitle: payload.episodeTitle,
        episodeUrl: payload.episodeUrl,
        completedAt: Date.now(),
      }
      workItem.completedEpisodes.push(newEpisode)
      saveEpisodeCompletionData(data)
      return newEpisode
    }

    return workItem.completedEpisodes.find(ep => ep.episodeId === payload.episodeId)
  },
)

ipcMain.handle('episode-completion:unmark', (_, workId: string, episodeId: string) => {
  const data = loadEpisodeCompletionData()
  const workItem = data.items.find(item => item.workId === workId)
  if (!workItem) {
    return false
  }

  const before = workItem.completedEpisodes.length
  workItem.completedEpisodes = workItem.completedEpisodes.filter(ep => ep.episodeId !== episodeId)
  if (workItem.completedEpisodes.length !== before) {
    saveEpisodeCompletionData(data)
    return true
  }

  return false
})

ipcMain.handle('episode-completion:is-completed', (_, workId: string, episodeId: string) => {
  const data = loadEpisodeCompletionData()
  const workItem = data.items.find(item => item.workId === workId)
  return workItem?.completedEpisodes.some(ep => ep.episodeId === episodeId) ?? false
})

ipcMain.handle('episode-completion:clear-by-work', (_, workId: string) => {
  const data = loadEpisodeCompletionData()
  const before = data.items.length
  data.items = data.items.filter(item => item.workId !== workId)
  if (data.items.length !== before) {
    saveEpisodeCompletionData(data)
    return true
  }

  return false
})

// ─── プロファイル IPC ────────────────────────────────────────────────────────────

ipcMain.handle('profiles:list', () => {
  return loadProfilesConfig().profiles
})

ipcMain.handle('profiles:get-active', () => {
  const config = loadProfilesConfig()
  return config.profiles.find(p => p.id === config.activeProfileId)
    ?? { id: 'default', name: 'デフォルト', createdAt: Date.now() }
})

ipcMain.handle('profiles:create', (_, name: string) => {
  const config = loadProfilesConfig()
  const newId = `profile-${Date.now()}`
  const newProfile: ProfileEntry = { id: newId, name: String(name).trim() || '新しいプロファイル', createdAt: Date.now() }
  config.profiles.push(newProfile)
  saveProfilesConfig(config)
  fs.mkdirSync(path.join(profilesRootDir, newId), { recursive: true })
  return newProfile
})

ipcMain.handle('profiles:rename', (_, id: string, name: string) => {
  const config = loadProfilesConfig()
  const profile = config.profiles.find(p => p.id === id)
  if (!profile) {
    throw new Error(`Profile not found: ${id}`)
  }

  profile.name = String(name).trim() || profile.name
  saveProfilesConfig(config)
  return profile
})

ipcMain.handle('profiles:delete', (_, id: string) => {
  if (id === 'default') {
    throw new Error('デフォルトプロファイルは削除できません')
  }

  const config = loadProfilesConfig()
  config.profiles = config.profiles.filter(p => p.id !== id)

  if (config.activeProfileId === id) {
    config.activeProfileId = 'default'
  }

  saveProfilesConfig(config)

  // プロファイルディレクトリを削除
  const profileDir = path.join(profilesRootDir, id)
  try {
    fs.rmSync(profileDir, { recursive: true, force: true })
  } catch { /* ignore */ }

  return true
})

ipcMain.handle('profiles:switch', (_, id: string) => {
  const config = loadProfilesConfig()
  if (!config.profiles.find(p => p.id === id)) {
    throw new Error(`Profile not found: ${id}`)
  }

  config.activeProfileId = id
  saveProfilesConfig(config)
  activeProfileId = id
  fs.mkdirSync(getActiveProfileDir(), { recursive: true })

  // ウィンドウをリロードして新しいプロファイルのデータを読み込む
  win?.reload()
})

// ─── キーボードショートカット IPC ─────────────────────────────────────────────────

ipcMain.handle('keyboard-shortcuts:get', () => {
  return loadKeyboardShortcuts()
})

ipcMain.handle('keyboard-shortcuts:update', (_, shortcuts: Partial<KeyboardShortcutMap>) => {
  const current = loadKeyboardShortcuts()
  const next = { ...current, ...shortcuts }
  saveKeyboardShortcuts(next)
  return next
})

ipcMain.handle('keyboard-shortcuts:reset', () => {
  saveKeyboardShortcuts(defaultKeyboardShortcuts)
  return defaultKeyboardShortcuts
})

// ─── バックアップ/復元 IPC ─────────────────────────────────────────────────────────

ipcMain.handle('backup:export', async () => {
  const result = await dialog.showSaveDialog(win!, {
    title: '設定をエクスポート',
    defaultPath: `kakuyomu-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })

  if (result.canceled || !result.filePath) {
    return { success: false }
  }

  const bundle = {
    version: 1,
    exportedAt: Date.now(),
    profileId: activeProfileId,
    displaySettings: loadDisplaySettings(),
    quickLinks: loadQuickLinksData(),
    readingHistory: loadReadingHistoryData(),
    episodeCompletion: loadEpisodeCompletionData(),
    keyboardShortcuts: loadKeyboardShortcuts(),
  }

  fs.writeFileSync(result.filePath, JSON.stringify(bundle, null, 2), 'utf-8')
  return { success: true, filePath: result.filePath }
})

ipcMain.handle('backup:import', async () => {
  const result = await dialog.showOpenDialog(win!, {
    title: '設定をインポート',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })

  if (result.canceled || !result.filePaths[0]) {
    return { success: false }
  }

  try {
    const raw = fs.readFileSync(result.filePaths[0], 'utf-8')
    const bundle = JSON.parse(raw)

    if (!bundle || typeof bundle !== 'object' || bundle.version !== 1) {
      throw new Error('無効なバックアップファイルです')
    }

    if (bundle.displaySettings) {
      saveDisplaySettings({ ...loadDisplaySettings(), ...bundle.displaySettings })
    }

    if (bundle.quickLinks) {
      saveQuickLinksData({
        links: Array.isArray(bundle.quickLinks.links) ? bundle.quickLinks.links : [],
        folders: Array.isArray(bundle.quickLinks.folders) ? bundle.quickLinks.folders : [],
      })
    }

    if (bundle.readingHistory) {
      saveReadingHistoryData(bundle.readingHistory)
    }

    if (bundle.episodeCompletion) {
      saveEpisodeCompletionData(bundle.episodeCompletion)
    }

    if (bundle.keyboardShortcuts) {
      saveKeyboardShortcuts({ ...defaultKeyboardShortcuts, ...bundle.keyboardShortcuts })
    }

    win?.reload()
    return { success: true }
  } catch (error) {
    console.error('Failed to import backup:', error)
    return { success: false, error: String(error) }
  }
})

// ─── カクヨムAPI連携 IPC ──────────────────────────────────────────────────────────

async function fetchKakuyomuWithSession(url: string): Promise<string> {
  const cookies = await session.defaultSession.cookies.get({ domain: 'kakuyomu.jp' })
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')

  const response = await fetch(url, {
    headers: {
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.9',
    },
  })

  if (!response.ok) {
    throw new Error(`Kakuyomu fetch failed: ${response.status}`)
  }

  return response.text()
}

function extractNextData(html: string): Record<string, unknown> {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!match) {
    return {}
  }

  try {
    return JSON.parse(match[1]) as Record<string, unknown>
  } catch {
    return {}
  }
}

function extractApolloState(nextData: Record<string, unknown>): Record<string, Record<string, unknown>> {
  try {
    const state = (nextData?.props as any)?.pageProps?.apolloState
    return (state && typeof state === 'object') ? state as Record<string, Record<string, unknown>> : {}
  } catch {
    return {}
  }
}

ipcMain.handle('kakuyomu:get-followings', async () => {
  try {
    const html = await fetchKakuyomuWithSession('https://kakuyomu.jp/my/followings/works')
    const nextData = extractNextData(html)
    const apolloState = extractApolloState(nextData)

    // Apollo キャッシュから Work オブジェクトを抽出
    const works: unknown[] = []
    for (const [key, value] of Object.entries(apolloState)) {
      if (key.startsWith('Work:') && value && typeof value === 'object') {
        const w = value as Record<string, unknown>
        const workId = key.replace('Work:', '')
        const latestEpRef = (w.latestEpisode as any)?.__ref as string | undefined
        const latestEp = latestEpRef ? apolloState[latestEpRef] : null

        works.push({
          id: workId,
          title: w.title ?? '',
          authorName: (() => {
            const authorRef = (w.author as any)?.__ref as string | undefined
            const author = authorRef ? apolloState[authorRef] : null
            return (author as any)?.activityName ?? (author as any)?.name ?? ''
          })(),
          url: `https://kakuyomu.jp/works/${workId}`,
          totalEpisodes: w.totalEpisodeCount ?? null,
          latestEpisodeTitle: (latestEp as any)?.title ?? null,
          latestEpisodeUrl: latestEp
            ? `https://kakuyomu.jp/works/${workId}/episodes/${(latestEp as any)?.id ?? ''}`
            : null,
          latestEpisodeAt: (latestEp as any)?.publishedAt ?? null,
        })
      }
    }

    return works
  } catch (error) {
    console.error('Failed to fetch Kakuyomu followings:', error)
    throw error
  }
})

ipcMain.handle('kakuyomu:get-author-notes', async (_, workId: string) => {
  try {
    const html = await fetchKakuyomuWithSession(`https://kakuyomu.jp/works/${workId}/author_notes`)
    const nextData = extractNextData(html)
    const apolloState = extractApolloState(nextData)

    const notes: unknown[] = []
    for (const [key, value] of Object.entries(apolloState)) {
      if ((key.startsWith('AuthorNote:') || key.startsWith('Note:')) && value && typeof value === 'object') {
        const n = value as Record<string, unknown>
        notes.push({
          id: key.split(':')[1] ?? key,
          title: n.title ?? n.subject ?? '（無題）',
          body: n.body ?? n.content ?? '',
          createdAt: n.createdAt ?? n.publishedAt ?? null,
        })
      }
    }

    // createdAt 降順でソート
    notes.sort((a: any, b: any) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return notes
  } catch (error) {
    console.error('Failed to fetch Kakuyomu author notes:', error)
    throw error
  }
})
