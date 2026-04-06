import { app, BrowserWindow, shell, ipcMain, Menu } from 'electron'
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

const quickLinksPath = path.join(app.getPath('userData'), 'quick-links.json')

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
    if (fs.existsSync(quickLinksPath)) {
      const data = fs.readFileSync(quickLinksPath, 'utf-8')
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
    fs.writeFileSync(quickLinksPath, JSON.stringify(normalized, null, 2), 'utf-8')
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
}

interface ReadingHistoryData {
  items: ReadingHistoryItem[]
}

const readingHistoryPath = path.join(app.getPath('userData'), 'reading-history.json')
const displaySettingsPath = path.join(app.getPath('userData'), 'display-settings.json')
const speechCacheDir = path.join(app.getPath('userData'), 'speech-cache')
const AIVIS_SPEECH_URL = 'http://127.0.0.1:10101'

const defaultDisplaySettings: DisplaySettings = {
  adBlockEnabled: true,
  autoReadEnabled: false,
  readerWidth: 'comfortable',
  readerFontSize: 'medium',
  speechSpeed: 1.05,
  speechIntonation: 1.15,
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

async function fetchAivis<T>(pathName: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${AIVIS_SPEECH_URL}${pathName}`, init)
  } catch (error) {
    throw new Error('AivisSpeech に接続できません。アプリを起動してください。')
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `AivisSpeech request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`,
    )
  }

  return response.json() as Promise<T>
}

async function fetchAivisBinary(pathName: string, init?: RequestInit): Promise<Buffer> {
  let response: Response
  try {
    response = await fetch(`${AIVIS_SPEECH_URL}${pathName}`, init)
  } catch (error) {
    throw new Error('AivisSpeech に接続できません。アプリを起動してください。')
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `AivisSpeech request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function getAivisSpeakers(): Promise<AivisSpeaker[]> {
  return fetchAivis<AivisSpeaker[]>('/speakers')
}

async function getDefaultAivisStyle() {
  const speakers = await getAivisSpeakers()
  const firstStyle = speakers[0]?.styles[0]
  if (!speakers[0] || !firstStyle) {
    throw new Error('No AivisSpeech speakers are available')
  }

  return {
    speakerName: speakers[0].name,
    styleId: firstStyle.id,
    styleName: firstStyle.name,
  }
}

async function getConfiguredAivisStyle() {
  const speakers = await getAivisSpeakers()
  const settings = loadDisplaySettings()
  const configuredSpeaker = settings.speechSpeakerUuid
    ? speakers.find(speaker => speaker.speaker_uuid === settings.speechSpeakerUuid)
    : null
  const configuredStyle = configuredSpeaker?.styles.find(style => style.id === settings.speechStyleId)

  if (configuredSpeaker && configuredStyle) {
    return {
      speakerName: configuredSpeaker.name,
      speakerUuid: configuredSpeaker.speaker_uuid,
      styleId: configuredStyle.id,
      styleName: configuredStyle.name,
    }
  }

  const fallbackStyle = speakers[0]?.styles[0]
  if (!speakers[0] || !fallbackStyle) {
    throw new Error('No AivisSpeech speakers are available')
  }

  return {
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
  if (!fs.existsSync(speechCacheDir)) {
    fs.mkdirSync(speechCacheDir, { recursive: true })
  }
}

function getSpeechCachePath(payload: {
  chunk: string
  styleId: number
  speedScale: number
  intonationScale: number
}) {
  const cacheKey = createHash('sha1')
    .update(
      JSON.stringify({
        version: 1,
        chunk: payload.chunk,
        styleId: payload.styleId,
        speedScale: payload.speedScale,
        intonationScale: payload.intonationScale,
      }),
    )
    .digest('hex')

  return path.join(speechCacheDir, `${cacheKey}.wav`)
}

ipcMain.handle(
  'aivis-speech:prepare',
  async (_, payload: { title?: string; paragraphs: Array<{ index: number; text: string }>; workId?: string | null }) => {
    const displaySettings = loadDisplaySettings()
    const dictionary = buildSpeechDictionary(displaySettings, payload.workId)
    const normalizedParagraphs = (payload.paragraphs ?? [])
      .map(paragraph => ({
        index: paragraph.index,
        text: normalizeSpeechText(paragraph.text, dictionary),
      }))
      .filter(paragraph => Boolean(paragraph.text))

    const title = normalizeSpeechText(payload.title ?? '', dictionary)
    if (!title && normalizedParagraphs.length === 0) {
      throw new Error('Text is required for AivisSpeech synthesis')
    }

    const { speakerName, speakerUuid, styleId, styleName } = await getConfiguredAivisStyle()
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
    }
  },
)

ipcMain.handle(
  'aivis-speech:synthesize-chunk',
  async (_, payload: { chunk: string; styleId: number; speedScale: number; intonationScale: number }) => {
    const { chunk, styleId, speedScale, intonationScale } = payload
    const cachePath = getSpeechCachePath({
      chunk,
      styleId,
      speedScale,
      intonationScale,
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

    const audioQuery = await fetchAivis<AivisAudioQuery>(
      `/audio_query?text=${encodeURIComponent(chunk)}&speaker=${styleId}`,
      { method: 'POST' },
    )
    audioQuery.speedScale = speedScale
    audioQuery.intonationScale = intonationScale

    const audioBuffer = await fetchAivisBinary(`/synthesis?speaker=${styleId}`, {
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
  const speakers = await getAivisSpeakers()
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
      throw new Error('Text is required for AivisSpeech synthesis')
    }

    const { speakerName, styleId, styleName } = await getConfiguredAivisStyle()
    const chunks = splitSpeechText(text)
    if (chunks.length === 0) {
      throw new Error('AivisSpeech に渡せる本文がありません')
    }

    const audioBuffers: Buffer[] = []
    for (const chunk of chunks) {
      const audioQuery = await fetchAivis<AivisAudioQuery>(
        `/audio_query?text=${encodeURIComponent(chunk)}&speaker=${styleId}`,
        {
          method: 'POST',
        },
      )

      audioQuery.speedScale = displaySettings.speechSpeed
      audioQuery.intonationScale = displaySettings.speechIntonation

      const audioBuffer = await fetchAivisBinary(`/synthesis?speaker=${styleId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
    if (fs.existsSync(displaySettingsPath)) {
      const data = fs.readFileSync(displaySettingsPath, 'utf-8')
      return {
        ...defaultDisplaySettings,
        ...JSON.parse(data),
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
    fs.writeFileSync(displaySettingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save display settings:', error)
  }
}

function loadReadingHistoryData(): ReadingHistoryData {
  try {
    if (fs.existsSync(readingHistoryPath)) {
      const data = fs.readFileSync(readingHistoryPath, 'utf-8')
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
    fs.writeFileSync(readingHistoryPath, JSON.stringify(data, null, 2), 'utf-8')
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

const episodeCompletionPath = path.join(app.getPath('userData'), 'episode-completion.json')

function loadEpisodeCompletionData(): EpisodeCompletionData {
  try {
    if (fs.existsSync(episodeCompletionPath)) {
      const data = fs.readFileSync(episodeCompletionPath, 'utf-8')
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
    fs.writeFileSync(episodeCompletionPath, JSON.stringify(data, null, 2), 'utf-8')
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
