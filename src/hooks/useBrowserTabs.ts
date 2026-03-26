import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { extractWorkId, HOME_URL, isKakuyomuWorkUrl } from '../lib/browser'
import { applyDisplaySettings, getSafePageTitle, injectAdBlocker } from '../lib/webview'
import type { BrowserWebview } from '../lib/webview'

export interface BrowserTab {
  id: string
  title: string
  url: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

const createTabId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const createTab = (url = HOME_URL): BrowserTab => ({
  id: createTabId(),
  title: '新しいタブ',
  url,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
})

const TAB_SESSION_STORAGE_KEY = 'kakuyomu-browser.tabs.v1'

interface StoredBrowserTab {
  title: string
  url: string
}

interface StoredTabSession {
  activeIndex: number
  tabs: StoredBrowserTab[]
}

const loadStoredTabSession = (): { activeTabId: string; tabs: BrowserTab[] } => {
  const fallbackTab = createTab()

  if (typeof window === 'undefined') {
    return {
      activeTabId: fallbackTab.id,
      tabs: [fallbackTab],
    }
  }

  try {
    const raw = window.localStorage.getItem(TAB_SESSION_STORAGE_KEY)
    if (!raw) {
      return {
        activeTabId: fallbackTab.id,
        tabs: [fallbackTab],
      }
    }

    const parsed = JSON.parse(raw) as StoredTabSession
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) {
      return {
        activeTabId: fallbackTab.id,
        tabs: [fallbackTab],
      }
    }

    const restoredTabs = parsed.tabs.map(tab => ({
      ...createTab(tab.url || HOME_URL),
      title: tab.title || '新しいタブ',
      url: tab.url || HOME_URL,
    }))

    const activeIndex =
      typeof parsed.activeIndex === 'number' &&
      parsed.activeIndex >= 0 &&
      parsed.activeIndex < restoredTabs.length
        ? parsed.activeIndex
        : 0

    return {
      activeTabId: restoredTabs[activeIndex].id,
      tabs: restoredTabs,
    }
  } catch (error) {
    console.error('Failed to restore tab session:', error)
    return {
      activeTabId: fallbackTab.id,
      tabs: [fallbackTab],
    }
  }
}

export const useBrowserTabs = () => {
  const initialSessionRef = useRef<{ activeTabId: string; tabs: BrowserTab[] } | null>(null)
  if (!initialSessionRef.current) {
    initialSessionRef.current = loadStoredTabSession()
  }

  const [tabs, setTabs] = useState<BrowserTab[]>(() => initialSessionRef.current?.tabs ?? [createTab()])
  const [activeTabId, setActiveTabId] = useState(
    () => initialSessionRef.current?.activeTabId ?? createTab().id,
  )
  const webviewRefs = useRef<Record<string, BrowserWebview | null>>({})
  const cleanupMap = useRef<Record<string, () => void>>({})

  useEffect(() => {
    if (!tabs.some(tab => tab.id === activeTabId) && tabs[0]) {
      setActiveTabId(tabs[0].id)
    }
  }, [activeTabId, tabs])

  useEffect(() => {
    if (typeof window === 'undefined' || tabs.length === 0) {
      return
    }

    const activeIndex = Math.max(
      0,
      tabs.findIndex(tab => tab.id === activeTabId),
    )

    const payload: StoredTabSession = {
      activeIndex,
      tabs: tabs.map(tab => ({
        title: tab.title,
        url: tab.url,
      })),
    }

    try {
      window.localStorage.setItem(TAB_SESSION_STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      console.error('Failed to persist tab session:', error)
    }
  }, [activeTabId, tabs])

  const activeTab = useMemo(
    () => tabs.find(tab => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  )

  const updateTab = useCallback((tabId: string, updater: (tab: BrowserTab) => BrowserTab) => {
    setTabs(prev => prev.map(tab => (tab.id === tabId ? updater(tab) : tab)))
  }, [])

  const syncDisplaySettings = useCallback(async (webview: BrowserWebview) => {
    try {
      const settings = await window.displaySettings.get()
      const currentUrl = webview.getURL()
      await applyDisplaySettings(webview, settings, currentUrl)
    } catch (error) {
      console.error('Failed to sync display settings:', error)
      injectAdBlocker(webview)
    }
  }, [])

  const saveReadingHistory = useCallback(async (webview: BrowserWebview, title: string) => {
    try {
      const currentUrl = webview.getURL()
      if (!isKakuyomuWorkUrl(currentUrl)) {
        return
      }

      const scrollPosition = await webview.executeJavaScript(
        'window.scrollY || document.documentElement.scrollTop || 0',
      )

      await window.readingHistory.addOrUpdateHistory({
        url: currentUrl,
        title,
        scrollPosition,
      })
    } catch (error) {
      console.error('Failed to save reading history:', error)
    }
  }, [])

  const restoreScrollPosition = useCallback(async (webview: BrowserWebview) => {
    try {
      const currentUrl = webview.getURL()
      if (!isKakuyomuWorkUrl(currentUrl)) {
        return
      }

      const workId = extractWorkId(currentUrl)
      if (!workId) {
        return
      }

      const history = await window.readingHistory.getHistory()
      const historyItem = history.find(item => item.id === workId)
      if (!historyItem?.scrollPosition) {
        return
      }

      window.setTimeout(() => {
        webview
          .executeJavaScript(`window.scrollTo(0, ${historyItem.scrollPosition});`)
          .catch((error: unknown) => {
            console.error('Failed to restore scroll position:', error)
          })
      }, 500)
    } catch (error) {
      console.error('Failed to restore scroll position:', error)
    }
  }, [])

  const bindWebview = useCallback(
    (tabId: string, webview: BrowserWebview) => {
      const syncNavigationState = () => {
        updateTab(tabId, tab => ({
          ...tab,
          canGoBack: webview.canGoBack(),
          canGoForward: webview.canGoForward(),
          url: webview.getURL() || tab.url,
        }))
      }

      const refreshPageTitle = async () => {
        const title = await getSafePageTitle(webview)
        updateTab(tabId, tab => ({ ...tab, title }))
        return title
      }

      const handleDidStartLoading = () => {
        updateTab(tabId, tab => ({ ...tab, isLoading: true }))
      }

      const handleDidNavigate = () => {
        syncNavigationState()
        void refreshPageTitle()
        void syncDisplaySettings(webview)
      }

      const handleDidStopLoading = async () => {
        updateTab(tabId, tab => ({ ...tab, isLoading: false }))
        syncNavigationState()
        const title = await refreshPageTitle()
        await syncDisplaySettings(webview)
        await saveReadingHistory(webview, title)
        await restoreScrollPosition(webview)
      }

      webview.addEventListener('did-start-loading', handleDidStartLoading)
      webview.addEventListener('did-stop-loading', handleDidStopLoading)
      webview.addEventListener('did-navigate', handleDidNavigate)
      webview.addEventListener('did-navigate-in-page', handleDidNavigate)

      cleanupMap.current[tabId] = () => {
        webview.removeEventListener('did-start-loading', handleDidStartLoading)
        webview.removeEventListener('did-stop-loading', handleDidStopLoading)
        webview.removeEventListener('did-navigate', handleDidNavigate)
        webview.removeEventListener('did-navigate-in-page', handleDidNavigate)
      }
    },
    [restoreScrollPosition, saveReadingHistory, syncDisplaySettings, updateTab],
  )

  const registerWebview = useCallback(
    (tabId: string) => (node: BrowserWebview | null) => {
      const current = webviewRefs.current[tabId]
      if (current === node) {
        return
      }

      if (current && cleanupMap.current[tabId]) {
        cleanupMap.current[tabId]()
        delete cleanupMap.current[tabId]
      }

      webviewRefs.current[tabId] = node

      if (node) {
        bindWebview(tabId, node)
      }
    },
    [bindWebview],
  )

  const createNewTab = useCallback((url = HOME_URL, activate = true) => {
    const nextTab = createTab(url)
    setTabs(prev => [...prev, nextTab])
    if (activate) {
      setActiveTabId(nextTab.id)
    }
  }, [])

  const duplicateTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const sourceIndex = prev.findIndex(tab => tab.id === tabId)
      if (sourceIndex === -1) {
        return prev
      }

      const sourceTab = prev[sourceIndex]
      const duplicate = {
        ...createTab(sourceTab.url),
        title: sourceTab.title,
      }

      const nextTabs = [...prev]
      nextTabs.splice(sourceIndex + 1, 0, duplicate)
      setActiveTabId(duplicate.id)
      return nextTabs
    })
  }, [])

  const moveTab = useCallback((sourceTabId: string, targetTabId: string) => {
    if (sourceTabId === targetTabId) {
      return
    }

    setTabs(prev => {
      const sourceIndex = prev.findIndex(tab => tab.id === sourceTabId)
      const targetIndex = prev.findIndex(tab => tab.id === targetTabId)

      if (sourceIndex === -1 || targetIndex === -1) {
        return prev
      }

      const nextTabs = [...prev]
      const [movedTab] = nextTabs.splice(sourceIndex, 1)
      nextTabs.splice(targetIndex, 0, movedTab)
      return nextTabs
    })
  }, [])

  const closeTabsToRight = useCallback(
    (tabId: string) => {
      setTabs(prev => {
        const currentIndex = prev.findIndex(tab => tab.id === tabId)
        if (currentIndex === -1 || currentIndex === prev.length - 1) {
          return prev
        }

        const nextTabs = prev.slice(0, currentIndex + 1)
        if (!nextTabs.some(tab => tab.id === activeTabId)) {
          setActiveTabId(tabId)
        }
        return nextTabs
      })
    },
    [activeTabId],
  )

  const closeAllTabs = useCallback(
    (keepTabId?: string) => {
      setTabs(prev => {
        if (keepTabId) {
          const keptTab = prev.find(tab => tab.id === keepTabId)
          if (keptTab) {
            setActiveTabId(keptTab.id)
            return [keptTab]
          }
        }

        const replacementTab = createTab()
        setActiveTabId(replacementTab.id)
        return [replacementTab]
      })
    },
    [],
  )

  const closeTab = useCallback(
    (tabId: string) => {
      const currentWebview = webviewRefs.current[tabId]

      setTabs(prev => {
        if (prev.length === 1) {
          currentWebview?.loadURL(HOME_URL)
          setActiveTabId(tabId)
          return prev.map(tab =>
            tab.id === tabId
              ? {
                  ...tab,
                  title: '新しいタブ',
                  url: HOME_URL,
                  isLoading: false,
                  canGoBack: false,
                  canGoForward: false,
                }
              : tab,
          )
        }

        const index = prev.findIndex(tab => tab.id === tabId)
        const nextTabs = prev.filter(tab => tab.id !== tabId)

        if (activeTabId === tabId) {
          const nextActive = nextTabs[index] ?? nextTabs[index - 1] ?? nextTabs[0]
          if (nextActive) {
            setActiveTabId(nextActive.id)
          }
        }

        return nextTabs
      })

      if (tabs.length > 1) {
        cleanupMap.current[tabId]?.()
        delete cleanupMap.current[tabId]
        delete webviewRefs.current[tabId]
      }
    },
    [activeTabId, tabs.length],
  )

  const activateTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
  }, [])

  const getActiveWebview = useCallback(
    () => (activeTab ? webviewRefs.current[activeTab.id] : null),
    [activeTab],
  )

  const goBack = useCallback(() => {
    const webview = getActiveWebview()
    if (webview?.canGoBack()) {
      webview.goBack()
    }
  }, [getActiveWebview])

  const goForward = useCallback(() => {
    const webview = getActiveWebview()
    if (webview?.canGoForward()) {
      webview.goForward()
    }
  }, [getActiveWebview])

  const reload = useCallback(() => {
    getActiveWebview()?.reload()
  }, [getActiveWebview])

  const goHome = useCallback(() => {
    getActiveWebview()?.loadURL(HOME_URL)
  }, [getActiveWebview])

  const navigateToUrl = useCallback(
    (targetUrl: string) => {
      getActiveWebview()?.loadURL(targetUrl)
    },
    [getActiveWebview],
  )

  const refreshDisplaySettings = useCallback(async () => {
    const webview = getActiveWebview()
    if (webview) {
      await syncDisplaySettings(webview)
    }
  }, [getActiveWebview, syncDisplaySettings])

  return {
    tabs,
    activeTab,
    activeTabId,
    createNewTab,
    duplicateTab,
    closeTab,
    closeTabsToRight,
    closeAllTabs,
    activateTab,
    moveTab,
    registerWebview,
    canGoBack: activeTab?.canGoBack ?? false,
    canGoForward: activeTab?.canGoForward ?? false,
    isLoading: activeTab?.isLoading ?? false,
    navigateToUrl,
    goBack,
    goForward,
    reload,
    goHome,
    pageTitle: activeTab?.title ?? '',
    refreshDisplaySettings,
    url: activeTab?.url ?? HOME_URL,
  }
}
