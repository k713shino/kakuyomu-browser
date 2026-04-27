import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { extractWorkId, HOME_URL, isKakuyomuWorkUrl } from '../lib/browser'
import {
  applyDisplaySettings,
  checkIsNearPageBottom,
  clearSpeechParagraphHighlights,
  extractEpisodeSpeechContent,
  getNextEpisodeUrl,
  getSelectedText,
  getSafePageTitle,
  highlightSpeechParagraphs,
  injectAdBlocker,
  injectHighlights,
  type SpeechPlaybackState,
} from '../lib/webview'
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
  const [speechStates, setSpeechStates] = useState<Record<string, SpeechPlaybackState>>({})
  const speechStatesRef = useRef<Record<string, SpeechPlaybackState>>({})
  const webviewRefs = useRef<Record<string, BrowserWebview | null>>({})
  const cleanupMap = useRef<Record<string, () => void>>({})
  const refCallbackMap = useRef<Record<string, (node: BrowserWebview | null) => void>>({})
  const speechCurrentRef = useRef<HTMLAudioElement | null>(null)
  const speechQueueRef = useRef<HTMLAudioElement[]>([])
  const speechTabIdRef = useRef<string | null>(null)
  const speechRequestIdRef = useRef(0)
  const speechCurrentParagraphRef = useRef<number | null>(null)
  const speechEngineRef = useRef<'idle' | 'aivis' | 'webspeech'>('idle')
  const speechIsCompletedRef = useRef(false)
  const autoReadIntervalMap = useRef<Record<string, ReturnType<typeof setInterval> | null>>({})
  const autoReadPendingRef = useRef<{
    tabId: string
    nextUrl: string
    timer: ReturnType<typeof setInterval>
  } | null>(null)
  const [autoReadCountdown, setAutoReadCountdown] = useState<number | null>(null)

  useEffect(() => {
    if (!tabs.some(tab => tab.id === activeTabId) && tabs[0]) {
      setActiveTabId(tabs[0].id)
    }
  }, [activeTabId, tabs])

  useEffect(() => {
    speechStatesRef.current = speechStates
  }, [speechStates])

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

  const updateSpeechState = useCallback((tabId: string, state: SpeechPlaybackState) => {
    setSpeechStates(prev => ({ ...prev, [tabId]: state }))
  }, [])

  const clearSpeechState = useCallback((tabId: string | null, state: SpeechPlaybackState = 'idle') => {
    if (!tabId) {
      return
    }

    updateSpeechState(tabId, state)
  }, [updateSpeechState])

  const stopAudioPlayback = useCallback((state: SpeechPlaybackState = 'idle') => {
    speechRequestIdRef.current += 1
    const activeSpeechTabId = speechTabIdRef.current
    const current = speechCurrentRef.current

    if (current) {
      current.pause()
      current.src = ''
      speechCurrentRef.current = null
    }

    speechQueueRef.current.forEach(audio => { audio.src = '' })
    speechQueueRef.current = []

    if (speechEngineRef.current === 'webspeech') {
      window.speechSynthesis.cancel()
    }
    speechEngineRef.current = 'idle'

    if (activeSpeechTabId) {
      const activeWebview = webviewRefs.current[activeSpeechTabId]
      if (activeWebview) {
        void clearSpeechParagraphHighlights(activeWebview)
      }
    }

    speechTabIdRef.current = null
    clearSpeechState(activeSpeechTabId, state)
  }, [clearSpeechState])

  useEffect(() => () => stopAudioPlayback(), [stopAudioPlayback])

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

  const markEpisodeAsCompleted = useCallback(async (webview: BrowserWebview, episodeTitle: string) => {
    try {
      const currentUrl = webview.getURL()
      const match = currentUrl.match(/\/works\/([^/?#]+)\/episodes\/([^/?#]+)/)
      if (!match) {
        return
      }

      const [, workId, episodeId] = match
      const workUrl = `https://kakuyomu.jp/works/${workId}`

      // 読書履歴からworkTitleを取得する
      const history = await window.readingHistory.getHistory()
      const historyItem = history.find(item => item.id === workId)
      const workTitle = historyItem?.title ?? ''

      await window.episodeCompletion.mark({
        workId,
        workTitle,
        workUrl,
        episodeId,
        episodeTitle,
        episodeUrl: currentUrl,
      })
    } catch (error) {
      console.error('Failed to mark episode as completed:', error)
    }
  }, [])

  const clearAutoReadPending = useCallback(() => {
    if (autoReadPendingRef.current) {
      clearInterval(autoReadPendingRef.current.timer)
      autoReadPendingRef.current = null
      setAutoReadCountdown(null)
    }
  }, [])

  const stopAutoReadWatcher = useCallback((tabId: string) => {
    const interval = autoReadIntervalMap.current[tabId]
    if (interval !== null && interval !== undefined) {
      clearInterval(interval)
      autoReadIntervalMap.current[tabId] = null
    }
    // このタブのカウントダウンが進行中なら一緒にキャンセル
    if (autoReadPendingRef.current?.tabId === tabId) {
      clearAutoReadPending()
    }
  }, [clearAutoReadPending])

  const isSpeechBlockingAutoRead = useCallback((tabId: string) => {
    const speechState = speechStatesRef.current[tabId] ?? 'idle'
    return speechState === 'loading' || speechState === 'playing' || speechState === 'paused'
  }, [])

  const startAutoReadWatcher = useCallback((tabId: string, webview: BrowserWebview) => {
    stopAutoReadWatcher(tabId)

    // did-stop-loading 直後はDOMレンダリングが完了していないため、
    // 最初の数ティックはチェックをスキップしてレンダリング完了を待つ
    let warmupTicksRemaining = 4 // 4 × 500ms = 2秒のウォームアップ

    autoReadIntervalMap.current[tabId] = setInterval(async () => {
      if (warmupTicksRemaining > 0) {
        warmupTicksRemaining--
        return
      }

      try {
        if (isSpeechBlockingAutoRead(tabId)) {
          if (autoReadPendingRef.current?.tabId === tabId) {
            clearAutoReadPending()
          }
          return
        }

        // カウントダウン中: 上にスクロールしたら自動キャンセル
        if (autoReadPendingRef.current?.tabId === tabId) {
          const isStillNearBottom = await checkIsNearPageBottom(webview)
          if (!isStillNearBottom) {
            clearAutoReadPending()
          }
          return
        }

        const isNearBottom = await checkIsNearPageBottom(webview)
        if (!isNearBottom) {
          return
        }

        const nextUrl = await getNextEpisodeUrl(webview)
        if (!nextUrl) {
          return
        }

        // 即ナビゲートせず 3 秒のカウントダウンを開始
        const COUNTDOWN_SECONDS = 3
        let remaining = COUNTDOWN_SECONDS
        setAutoReadCountdown(remaining)

        const countdownTimer = setInterval(() => {
          remaining--
          if (remaining <= 0) {
            clearInterval(countdownTimer)
            autoReadPendingRef.current = null
            setAutoReadCountdown(null)
            stopAutoReadWatcher(tabId)
            webview.loadURL(nextUrl)
          } else {
            setAutoReadCountdown(remaining)
          }
        }, 1000)

        autoReadPendingRef.current = { tabId, nextUrl, timer: countdownTimer }
      } catch (error) {
        console.error('Auto-read watcher error:', error)
      }
    }, 500)
  }, [clearAutoReadPending, isSpeechBlockingAutoRead, stopAutoReadWatcher])

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

  const saveSpeechPosition = useCallback(async (webview: BrowserWebview, paragraphIndex: number | null) => {
    try {
      const currentUrl = webview.getURL()
      const workId = extractWorkId(currentUrl)
      if (!workId) {
        return
      }

      await window.readingHistory.updateSpeechPosition(workId, paragraphIndex, currentUrl)
    } catch (error) {
      console.error('Failed to save speech position:', error)
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
        stopAutoReadWatcher(tabId)
        syncNavigationState()
        if (speechTabIdRef.current === tabId) {
          // ナビゲート前に読み上げ位置を保存（自然終了でない場合のみ）
          if (!speechIsCompletedRef.current && speechCurrentParagraphRef.current !== null) {
            void saveSpeechPosition(webview, speechCurrentParagraphRef.current)
          }
          speechCurrentParagraphRef.current = null
          speechIsCompletedRef.current = false
          stopAudioPlayback()
        } else {
          updateSpeechState(tabId, 'idle')
        }
        void refreshPageTitle()
        void syncDisplaySettings(webview)
      }

      const handleDidStopLoading = async () => {
        updateTab(tabId, tab => ({ ...tab, isLoading: false }))
        if (speechTabIdRef.current !== tabId) {
          updateSpeechState(tabId, 'idle')
        }
        syncNavigationState()
        const title = await refreshPageTitle()
        await syncDisplaySettings(webview)
        await saveReadingHistory(webview, title)
        await restoreScrollPosition(webview)

        // エピソードページなら読了マーク
        const currentUrl = webview.getURL()
        if (currentUrl.includes('/episodes/')) {
          await markEpisodeAsCompleted(webview, title)
        }

        // ハイライトを注入
        if (currentUrl.includes('/episodes/')) {
          try {
            const highlightItems = await window.highlights.getByEpisodeUrl(currentUrl)
            if (highlightItems.length > 0) {
              await injectHighlights(webview, highlightItems)
            }
          } catch (error) {
            console.error('Failed to inject highlights:', error)
          }
        }

        // 連続読みウォッチャーの起動
        stopAutoReadWatcher(tabId)
        try {
          const settings = await window.displaySettings.get()
          if (settings.autoReadEnabled && currentUrl.includes('/episodes/')) {
            startAutoReadWatcher(tabId, webview)
          }
        } catch (error) {
          console.error('Failed to check auto-read settings:', error)
        }
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
        stopAutoReadWatcher(tabId)
      }
    },
    [
      clearAutoReadPending,
      markEpisodeAsCompleted,
      restoreScrollPosition,
      saveReadingHistory,
      saveSpeechPosition,
      startAutoReadWatcher,
      stopAutoReadWatcher,
      syncDisplaySettings,
      stopAudioPlayback,
      updateSpeechState,
      updateTab,
    ],
  )

  const registerWebview = useCallback(
    (tabId: string) => {
      if (!refCallbackMap.current[tabId]) {
        refCallbackMap.current[tabId] = (node: BrowserWebview | null) => {
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
        }
      }

      return refCallbackMap.current[tabId]
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

      setSpeechStates(prev => {
        const next = { ...prev }
        const currentIndex = tabs.findIndex(tab => tab.id === tabId)
        if (currentIndex === -1) {
          return prev
        }

        tabs.slice(currentIndex + 1).forEach(tab => {
          delete next[tab.id]
        })

        return next
      })

      const currentIndex = tabs.findIndex(tab => tab.id === tabId)
      if (currentIndex !== -1) {
        const removedTabs = tabs.slice(currentIndex + 1).map(tab => tab.id)
        removedTabs.forEach(removedTabId => {
          delete cleanupMap.current[removedTabId]
          delete webviewRefs.current[removedTabId]
          delete refCallbackMap.current[removedTabId]
        })
        if (removedTabs.includes(speechTabIdRef.current ?? '')) {
          stopAudioPlayback()
        }
      }
    },
    [activeTabId, stopAudioPlayback, tabs],
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

      setSpeechStates(keepTabId ? prev => (prev[keepTabId] ? { [keepTabId]: prev[keepTabId] } : {}) : {})
      Object.keys(refCallbackMap.current).forEach(tabId => {
        if (!keepTabId || tabId !== keepTabId) {
          delete cleanupMap.current[tabId]
          delete webviewRefs.current[tabId]
          delete refCallbackMap.current[tabId]
        }
      })
      if (!keepTabId || speechTabIdRef.current !== keepTabId) {
        stopAudioPlayback()
      }
    },
    [stopAudioPlayback],
  )

  const closeTab = useCallback(
    (tabId: string) => {
      if (speechTabIdRef.current === tabId) {
        stopAudioPlayback()
      }

      setTabs(prev => {
        if (prev.length === 1) {
          const currentWebview = webviewRefs.current[tabId]
          currentWebview?.loadURL(HOME_URL)
          updateSpeechState(tabId, 'idle')
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
        delete refCallbackMap.current[tabId]
        setSpeechStates(prev => {
          const next = { ...prev }
          delete next[tabId]
          return next
        })
      }
    },
    [activeTabId, stopAudioPlayback, tabs.length, updateSpeechState],
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
    if (!webview) {
      return
    }

    await syncDisplaySettings(webview)

    // 連続読み設定が変わった可能性があるのでウォッチャーを再同期
    const tabId = activeTab?.id
    if (!tabId) {
      return
    }

    try {
      const settings = await window.displaySettings.get()
      const currentUrl = webview.getURL()
      stopAutoReadWatcher(tabId)
      if (settings.autoReadEnabled && currentUrl.includes('/episodes/')) {
        startAutoReadWatcher(tabId, webview)
      }
    } catch (error) {
      console.error('Failed to refresh auto-read watcher:', error)
    }
  }, [activeTab, getActiveWebview, startAutoReadWatcher, stopAutoReadWatcher, syncDisplaySettings])

  const getActiveTabSelectedText = useCallback(async () => {
    const webview = getActiveWebview()
    if (!webview) {
      return ''
    }

    return getSelectedText(webview)
  }, [getActiveWebview])

  const injectHighlightsToActiveTab = useCallback(async () => {
    const webview = getActiveWebview()
    if (!webview) return
    const currentUrl = webview.getURL()
    if (!currentUrl.includes('/episodes/')) return
    try {
      const items = await window.highlights.getByEpisodeUrl(currentUrl)
      await injectHighlights(webview, items)
    } catch (error) {
      console.error('Failed to inject highlights to active tab:', error)
    }
  }, [getActiveWebview])

  const toggleActiveTabSpeech = useCallback(async () => {
    const activeId = activeTab?.id
    const webview = getActiveWebview()
    if (!activeId || !webview) {
      return
    }

    const currentState = speechStates[activeId] ?? 'idle'

    // --- AivisSpeech: 一時停止 ---
    if (speechTabIdRef.current === activeId && currentState === 'playing' && speechCurrentRef.current && speechEngineRef.current === 'aivis') {
      speechCurrentRef.current.pause()
      updateSpeechState(activeId, 'paused')
      if (speechCurrentParagraphRef.current !== null) {
        void saveSpeechPosition(webview, speechCurrentParagraphRef.current)
      }
      return
    }

    // --- WebSpeech: 一時停止 ---
    if (speechTabIdRef.current === activeId && currentState === 'playing' && speechEngineRef.current === 'webspeech') {
      window.speechSynthesis.pause()
      updateSpeechState(activeId, 'paused')
      if (speechCurrentParagraphRef.current !== null) {
        void saveSpeechPosition(webview, speechCurrentParagraphRef.current)
      }
      return
    }

    // --- AivisSpeech: 再開 ---
    if (speechTabIdRef.current === activeId && currentState === 'paused' && speechCurrentRef.current && speechEngineRef.current === 'aivis') {
      try {
        await speechCurrentRef.current.play()
        updateSpeechState(activeId, 'playing')
      } catch (error) {
        console.error('Failed to resume AivisSpeech audio:', error)
        stopAudioPlayback('unavailable')
      }
      return
    }

    // --- WebSpeech: 再開 ---
    if (speechTabIdRef.current === activeId && currentState === 'paused' && speechEngineRef.current === 'webspeech') {
      window.speechSynthesis.resume()
      updateSpeechState(activeId, 'playing')
      return
    }

    // --- 新規開始 ---
    stopAudioPlayback()
    updateSpeechState(activeId, 'loading')
    speechIsCompletedRef.current = false
    speechCurrentParagraphRef.current = null
    const requestId = speechRequestIdRef.current

    const content = await extractEpisodeSpeechContent(webview)
    if (requestId !== speechRequestIdRef.current) {
      return
    }

    if (!content?.text) {
      updateSpeechState(activeId, 'unavailable')
      return
    }

    // 設定を取得
    let settings: { speechSpeed: number; speechIntonation: number; speechVolume: number; speechPitch: number; speechEngine: string }
    try {
      settings = await window.displaySettings.get()
    } catch (error) {
      console.error('Failed to load display settings for speech:', error)
      updateSpeechState(activeId, 'unavailable')
      return
    }
    if (requestId !== speechRequestIdRef.current) {
      return
    }

    // 保存済みの読み上げ位置を確認
    const currentUrl = webview.getURL()
    const workId = extractWorkId(currentUrl)
    let startParagraphIndex: number | undefined
    if (workId) {
      try {
        const history = await window.readingHistory.getHistory()
        const historyItem = history.find(item => item.id === workId)
        if (
          historyItem?.speechEpisodeUrl === currentUrl &&
          historyItem.speechParagraphIndex !== undefined
        ) {
          startParagraphIndex = historyItem.speechParagraphIndex
        }
      } catch (error) {
        console.error('Failed to load speech position:', error)
      }
    }
    if (requestId !== speechRequestIdRef.current) {
      return
    }

    // --- WebSpeech 再生 ---
    const playWithWebSpeech = () => {
      const paragraphs = startParagraphIndex !== undefined
        ? content.paragraphs.filter(p => p.index >= startParagraphIndex!)
        : content.paragraphs

      if (paragraphs.length === 0) {
        updateSpeechState(activeId, 'unavailable')
        return
      }

      speechTabIdRef.current = activeId
      speechEngineRef.current = 'webspeech'
      window.speechSynthesis.cancel()

      let localRequestId = requestId
      const checkCancelled = () => localRequestId !== speechRequestIdRef.current

      paragraphs.forEach((paragraph, index) => {
        const utterance = new SpeechSynthesisUtterance(paragraph.text)
        utterance.lang = 'ja-JP'
        utterance.rate = settings.speechSpeed
        utterance.volume = settings.speechVolume
        // speechPitch は VOICEVOX 互換のオフセット値（-0.15〜0.15）。
        // WebSpeech の pitch は 0〜2 の乗数（1.0 が標準）なので変換する。
        utterance.pitch = Math.max(0, Math.min(2, 1.0 + settings.speechPitch / 0.15))

        utterance.onstart = () => {
          if (checkCancelled()) {
            return
          }
          speechCurrentParagraphRef.current = paragraph.index
          updateSpeechState(activeId, 'playing')
          void highlightSpeechParagraphs(webview, [paragraph.index])
        }

        utterance.onend = () => {
          if (checkCancelled()) {
            return
          }
          if (index === paragraphs.length - 1) {
            // 全段落読み終わり
            speechIsCompletedRef.current = true
            speechCurrentParagraphRef.current = null
            if (workId) {
              void window.readingHistory.updateSpeechPosition(workId, null, currentUrl)
            }
            stopAudioPlayback('idle')
          }
        }

        utterance.onerror = (event) => {
          if (checkCancelled() || event.error === 'interrupted' || event.error === 'canceled') {
            return
          }
          console.error('WebSpeech error:', event.error)
          stopAudioPlayback('unavailable')
        }

        window.speechSynthesis.speak(utterance)
      })
    }

    // WebSpeech 固定指定の場合
    if (settings.speechEngine === 'webspeech') {
      playWithWebSpeech()
      return
    }

    // --- AivisSpeech 再生（失敗時は auto なら WebSpeech へフォールバック）---
    try {
      const prepared = await window.aivisSpeech.prepare({
        title: content.title,
        workId: extractWorkId(webview.getURL()),
        paragraphs: content.paragraphs,
        startParagraphIndex,
      })
      if (requestId !== speechRequestIdRef.current) {
        return
      }

      if (prepared.chunks.length === 0) {
        updateSpeechState(activeId, 'unavailable')
        return
      }

      speechTabIdRef.current = activeId
      speechEngineRef.current = 'aivis'
      let synthesisDone = false

      const playNext = () => {
        if (requestId !== speechRequestIdRef.current) {
          return
        }
        const next = speechQueueRef.current.shift()
        if (!next) {
          if (synthesisDone) {
            // 自然終了: 位置リセット
            speechIsCompletedRef.current = true
            speechCurrentParagraphRef.current = null
            if (workId) {
              void window.readingHistory.updateSpeechPosition(workId, null, currentUrl)
            }
            stopAudioPlayback('idle')
          } else {
            updateSpeechState(activeId, 'loading')
          }
          return
        }

        speechCurrentRef.current = next
        if (next.dataset.paragraphIndexes) {
          const paragraphIndexes = JSON.parse(next.dataset.paragraphIndexes) as number[]
          if (paragraphIndexes.length > 0) {
            speechCurrentParagraphRef.current = paragraphIndexes[0]
            void highlightSpeechParagraphs(webview, paragraphIndexes)
          } else {
            void clearSpeechParagraphHighlights(webview)
          }
        }

        // 音量を適用
        next.volume = settings.speechVolume

        next.addEventListener('play', () => {
          if (requestId === speechRequestIdRef.current && speechTabIdRef.current === activeId) {
            updateSpeechState(activeId, 'playing')
          }
        })
        next.addEventListener('pause', () => {
          if (requestId === speechRequestIdRef.current && speechTabIdRef.current === activeId && !next.ended) {
            updateSpeechState(activeId, 'paused')
          }
        })
        next.addEventListener('error', () => {
          if (requestId === speechRequestIdRef.current) {
            stopAudioPlayback('unavailable')
          }
        })
        next.addEventListener('ended', () => {
          if (requestId !== speechRequestIdRef.current) {
            return
          }
          speechCurrentRef.current = null
          playNext()
        })

        next.play().catch(() => {
          if (requestId === speechRequestIdRef.current) {
            stopAudioPlayback('unavailable')
          }
        })
      }

      for (const chunk of prepared.chunks) {
        if (requestId !== speechRequestIdRef.current) {
          return
        }

        const result = await window.aivisSpeech.synthesizeChunk({
          chunk: chunk.text,
          styleId: prepared.styleId,
          speedScale: prepared.speedScale,
          intonationScale: prepared.intonationScale,
          pitchScale: prepared.pitchScale,
          engineBaseUrl: prepared.engineBaseUrl,
        })
        if (requestId !== speechRequestIdRef.current) {
          return
        }

        const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`)
        audio.preload = 'auto'
        audio.dataset.paragraphIndexes = JSON.stringify(chunk.paragraphIndexes)
        speechQueueRef.current.push(audio)

        if (speechCurrentRef.current === null && speechTabIdRef.current === activeId) {
          playNext()
        }
      }

      synthesisDone = true
      if (
        speechCurrentRef.current === null &&
        speechQueueRef.current.length === 0 &&
        speechTabIdRef.current === activeId &&
        requestId === speechRequestIdRef.current
      ) {
        speechIsCompletedRef.current = true
        speechCurrentParagraphRef.current = null
        if (workId) {
          void window.readingHistory.updateSpeechPosition(workId, null, currentUrl)
        }
        stopAudioPlayback('idle')
      }
    } catch (error) {
      if (requestId !== speechRequestIdRef.current) {
        return
      }

      if (settings.speechEngine === 'auto') {
        // AivisSpeech 失敗 → WebSpeech にフォールバック
        console.warn('AivisSpeech unavailable, falling back to WebSpeech:', error)
        playWithWebSpeech()
      } else {
        console.error('Failed to synthesize AivisSpeech audio:', error)
        stopAudioPlayback('unavailable')
      }
    }
  }, [activeTab, getActiveWebview, saveSpeechPosition, speechStates, stopAudioPlayback, updateSpeechState])

  const stopActiveTabSpeech = useCallback(async () => {
    const activeId = activeTab?.id
    if (!activeId) {
      return
    }

    const currentState = speechStates[activeId] ?? 'idle'
    if (speechTabIdRef.current === activeId || currentState === 'loading') {
      stopAudioPlayback()
      updateSpeechState(activeId, 'idle')
      return
    }

    updateSpeechState(activeId, 'idle')
  }, [activeTab, speechStates, stopAudioPlayback, updateSpeechState])

  // キャンセル: countdown とポーリングウォッチャーを両方停止。
  // ウォッチャーは次のページ読み込み（did-stop-loading）で再起動されるため、
  // 同じエピソードでは再発動せず、次の話へ移動したら再び有効になる。
  const cancelAutoRead = useCallback(() => {
    if (!autoReadPendingRef.current) return
    const tabId = autoReadPendingRef.current.tabId
    clearAutoReadPending()
    stopAutoReadWatcher(tabId)
  }, [clearAutoReadPending, stopAutoReadWatcher])

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
    getActiveTabSelectedText,
    speechState: activeTab ? speechStates[activeTab.id] ?? 'idle' : 'idle',
    stopActiveTabSpeech,
    toggleActiveTabSpeech,
    url: activeTab?.url ?? HOME_URL,
    autoReadCountdown,
    cancelAutoRead,
    injectHighlightsToActiveTab,
  }
}
