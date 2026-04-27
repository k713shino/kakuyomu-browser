import { ipcRenderer, contextBridge } from 'electron'
import type { DisplaySettings } from '../../src/type/display-settings'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

// Quick Links API
contextBridge.exposeInMainWorld('quickLinks', {
  get: () => ipcRenderer.invoke('quick-links:get'),
  add: (link: any) => ipcRenderer.invoke('quick-links:add', link),
  update: (link: any) => ipcRenderer.invoke('quick-links:update', link),
  delete: (id: string) => ipcRenderer.invoke('quick-links:delete', id),
  reorder: (links: any[]) => ipcRenderer.invoke('quick-links:reorder', links),
  checkUpdates: () => ipcRenderer.invoke('quick-links:check-updates'),

  // Folder operations
  getFolders: () => ipcRenderer.invoke('quick-links:get-folders'),
  addFolder: (folder: any) => ipcRenderer.invoke('quick-links:add-folder', folder),
  updateFolder: (folder: any) => ipcRenderer.invoke('quick-links:update-folder', folder),
  deleteFolder: (id: string) => ipcRenderer.invoke('quick-links:delete-folder', id),

  // Export/Import operations
  export: () => ipcRenderer.invoke('quick-links:export'),
  import: (data: any) => ipcRenderer.invoke('quick-links:import', data),
})

// Reading History API
contextBridge.exposeInMainWorld('readingHistory', {
  getHistory: () => ipcRenderer.invoke('reading-history:get'),
  addOrUpdateHistory: (data: { url: string; title: string; scrollPosition?: number }) =>
    ipcRenderer.invoke('reading-history:add-or-update', data),
  deleteHistory: (id: string) => ipcRenderer.invoke('reading-history:delete', id),
  clearHistory: () => ipcRenderer.invoke('reading-history:clear'),
  updateScrollPosition: (id: string, position: number) =>
    ipcRenderer.invoke('reading-history:update-scroll', id, position),
  updateSpeechPosition: (workId: string, paragraphIndex: number | null, episodeUrl: string) =>
    ipcRenderer.invoke('reading-history:update-speech-position', workId, paragraphIndex, episodeUrl),
})

contextBridge.exposeInMainWorld('displaySettings', {
  get: () => ipcRenderer.invoke('display-settings:get'),
  update: (settings: Partial<DisplaySettings>) => ipcRenderer.invoke('display-settings:update', settings),
  reset: () => ipcRenderer.invoke('display-settings:reset'),
})

contextBridge.exposeInMainWorld('aivisSpeech', {
  synthesize: (payload: { text: string; title?: string; workId?: string | null }) =>
    ipcRenderer.invoke('aivis-speech:synthesize', payload),
  getSpeakers: () => ipcRenderer.invoke('aivis-speech:get-speakers'),
  prepare: (payload: { title?: string; workId?: string | null; paragraphs: Array<{ index: number; text: string }> }) =>
    ipcRenderer.invoke('aivis-speech:prepare', payload),
  synthesizeChunk: (payload: { chunk: string; styleId: number; speedScale: number; intonationScale: number }) =>
    ipcRenderer.invoke('aivis-speech:synthesize-chunk', payload),
})

contextBridge.exposeInMainWorld('episodeCompletion', {
  getAll: () => ipcRenderer.invoke('episode-completion:get-all'),
  getByWorkId: (workId: string) => ipcRenderer.invoke('episode-completion:get-by-work', workId),
  mark: (data: {
    workId: string
    workTitle: string
    workUrl: string
    episodeId: string
    episodeTitle: string
    episodeUrl: string
  }) => ipcRenderer.invoke('episode-completion:mark', data),
  unmark: (workId: string, episodeId: string) =>
    ipcRenderer.invoke('episode-completion:unmark', workId, episodeId),
  isCompleted: (workId: string, episodeId: string) =>
    ipcRenderer.invoke('episode-completion:is-completed', workId, episodeId),
  clearByWorkId: (workId: string) => ipcRenderer.invoke('episode-completion:clear-by-work', workId),
})

contextBridge.exposeInMainWorld('profiles', {
  list: () => ipcRenderer.invoke('profiles:list'),
  getActive: () => ipcRenderer.invoke('profiles:get-active'),
  create: (name: string) => ipcRenderer.invoke('profiles:create', name),
  rename: (id: string, name: string) => ipcRenderer.invoke('profiles:rename', id, name),
  delete: (id: string) => ipcRenderer.invoke('profiles:delete', id),
  switch: (id: string) => ipcRenderer.invoke('profiles:switch', id),
})

contextBridge.exposeInMainWorld('keyboardShortcuts', {
  get: () => ipcRenderer.invoke('keyboard-shortcuts:get'),
  update: (shortcuts: Record<string, unknown>) => ipcRenderer.invoke('keyboard-shortcuts:update', shortcuts),
  reset: () => ipcRenderer.invoke('keyboard-shortcuts:reset'),
})

contextBridge.exposeInMainWorld('backup', {
  export: () => ipcRenderer.invoke('backup:export'),
  import: () => ipcRenderer.invoke('backup:import'),
})

contextBridge.exposeInMainWorld('kakuyomu', {
  getFollowings: () => ipcRenderer.invoke('kakuyomu:get-followings'),
  getAuthorNotes: (workId: string) => ipcRenderer.invoke('kakuyomu:get-author-notes', workId),
})

contextBridge.exposeInMainWorld('highlights', {
  getAll: () => ipcRenderer.invoke('highlights:get-all'),
  getByEpisodeUrl: (episodeUrl: string) => ipcRenderer.invoke('highlights:get-by-episode', episodeUrl),
  add: (data: any) => ipcRenderer.invoke('highlights:add', data),
  update: (id: string, patch: any) => ipcRenderer.invoke('highlights:update', id, patch),
  delete: (id: string) => ipcRenderer.invoke('highlights:delete', id),
  onAddRequest: (callback: (payload: { text: string; pageUrl: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { text: string; pageUrl: string }) => {
      callback(payload)
    }
    ipcRenderer.on('highlight:add-requested', listener)
    return () => {
      ipcRenderer.removeListener('highlight:add-requested', listener)
    }
  },
})

contextBridge.exposeInMainWorld('updateChecker', {
  runNow: () => ipcRenderer.invoke('update-checker:run-now'),
  onCompleted: (callback: (links: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, links: unknown[]) => {
      callback(links)
    }
    ipcRenderer.on('update-checker:completed', listener)
    return () => {
      ipcRenderer.removeListener('update-checker:completed', listener)
    }
  },
  onNavigate: (callback: (url: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, url: string) => {
      callback(url)
    }
    ipcRenderer.on('navigate-to-url', listener)
    return () => {
      ipcRenderer.removeListener('navigate-to-url', listener)
    }
  },
})

contextBridge.exposeInMainWorld('speechDictionary', {
  onAddRequest: (callback: (payload: { text: string; pageUrl: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { text: string; pageUrl: string }) => {
      callback(payload)
    }

    ipcRenderer.on('speech-dictionary:add-requested', listener)
    return () => {
      ipcRenderer.removeListener('speech-dictionary:add-requested', listener)
    }
  },
})

// --------- Preload scripts loading ---------
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise(resolve => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child)
    }
  },
}

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading() {
  const className = `loaders-css__square-spin`
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)
