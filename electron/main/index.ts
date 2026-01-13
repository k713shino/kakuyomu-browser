import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { update } from './update'

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
    { id: '1', title: 'カクヨムトップ', url: 'https://kakuyomu.jp', order: 0, folderId: null },
    { id: '2', title: 'マイワークスペース', url: 'https://kakuyomu.jp/my', order: 1, folderId: null },
  ],
  folders: []
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
          links: parsed.map((link: any) => ({ ...link, folderId: null })),
          folders: []
        }
        saveQuickLinksData(migrated)
        return migrated
      }

      return parsed
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
    fs.writeFileSync(quickLinksPath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save quick links:', error)
  }
}

// IPC Handlers for Quick Links
ipcMain.handle('quick-links:get', () => {
  return loadQuickLinksData()
})

ipcMain.handle('quick-links:add', (_, link: { title: string; url: string; folderId?: string | null }) => {
  const data = loadQuickLinksData()
  const newLink: QuickLink = {
    ...link,
    id: Date.now().toString(),
    order: data.links.length,
    folderId: link.folderId || null,
  }
  data.links.push(newLink)
  saveQuickLinksData(data)
  return newLink
})

ipcMain.handle('quick-links:update', (_, updatedLink: QuickLink) => {
  const data = loadQuickLinksData()
  const index = data.links.findIndex((l: QuickLink) => l.id === updatedLink.id)
  if (index !== -1) {
    data.links[index] = updatedLink
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
  saveQuickLinksData(data)
  return true
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
