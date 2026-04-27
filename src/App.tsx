import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardShortcutMap, ShortcutKey } from './type/keyboard-shortcuts'
import { About } from './components/About/About'
import { BrowserHeader } from './components/BrowserHeader'
import { BrowserPane } from './components/BrowserPane'
import { DisplaySettingsModal } from './components/DisplaySettings/DisplaySettingsModal'
import { HighlightAddModal } from './components/Highlights/HighlightAddModal'
import { HighlightsPanel } from './components/Highlights/HighlightsPanel'
import { QuickLinksSettings } from './components/QuickLinks/QuickLinksSettings'
import { QuickLinksSidebar } from './components/QuickLinks/QuickLinksSidebar'
import type { QuickLinksDropdownHandle } from './components/QuickLinks/QuickLinksDropdown'
import type { QuickLinksSidebarHandle } from './components/QuickLinks/QuickLinksSidebar'
import { ReadingHistory } from './components/ReadingHistory/ReadingHistory'
import { ReadingStats } from './components/ReadingStats/ReadingStats'
import { useBrowserTabs } from './hooks/useBrowserTabs'
import './App.css'

function App() {
  const quickLinksRef = useRef<QuickLinksDropdownHandle>(null)
  const sidebarRef = useRef<QuickLinksSidebarHandle>(null)
  const [shortcuts, setShortcuts] = useState<KeyboardShortcutMap | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isDisplaySettingsOpen, setIsDisplaySettingsOpen] = useState(false)
  const [isStatsOpen, setIsStatsOpen] = useState(false)
  const [isHighlightsPanelOpen, setIsHighlightsPanelOpen] = useState(false)
  const [isHighlightAddOpen, setIsHighlightAddOpen] = useState(false)
  const [highlightAddSeed, setHighlightAddSeed] = useState<{ text: string; pageUrl: string }>({ text: '', pageUrl: '' })
  const [quickAddSeed, setQuickAddSeed] = useState<{ text: string; token: number }>({ text: '', token: 0 })
  const {
    tabs,
    activeTabId,
    canGoBack,
    canGoForward,
    isLoading,
    navigateToUrl,
    goBack,
    goForward,
    reload,
    goHome,
    pageTitle,
    refreshDisplaySettings,
    getActiveTabSelectedText,
    speechState,
    stopActiveTabSpeech,
    toggleActiveTabSpeech,
    url,
    createNewTab,
    duplicateTab,
    closeTab,
    closeTabsToRight,
    closeAllTabs,
    activateTab,
    moveTab,
    registerWebview,
    autoReadCountdown,
    cancelAutoRead,
    injectHighlightsToActiveTab,
  } = useBrowserTabs()

  // ショートカットを非同期で読み込む
  useEffect(() => {
    window.keyboardShortcuts.get().then(setShortcuts).catch(() => {})
  }, [])

  const matchesShortcut = useCallback((event: KeyboardEvent, shortcut: ShortcutKey | null | undefined): boolean => {
    if (!shortcut) {
      return false
    }

    return (
      event.key.toLowerCase() === shortcut.key.toLowerCase() &&
      !!event.ctrlKey === !!shortcut.ctrl &&
      !!event.altKey === !!shortcut.alt &&
      !!event.shiftKey === !!shortcut.shift &&
      !event.metaKey
    )
  }, [])

  useEffect(() => {
    if (!shortcuts) {
      return
    }

    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false
      }

      const tagName = target.tagName.toLowerCase()
      return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.isContentEditable
      )
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return
      }

      if (matchesShortcut(event, shortcuts.goBack)) {
        event.preventDefault()
        goBack()
      } else if (matchesShortcut(event, shortcuts.goForward)) {
        event.preventDefault()
        goForward()
      } else if (matchesShortcut(event, shortcuts.reload)) {
        event.preventDefault()
        reload()
      } else if (matchesShortcut(event, shortcuts.openHistory)) {
        event.preventDefault()
        setIsHistoryOpen(true)
      } else if (matchesShortcut(event, shortcuts.toggleSidebar)) {
        event.preventDefault()
        setIsSidebarOpen(prev => !prev)
      } else if (matchesShortcut(event, shortcuts.newTab)) {
        event.preventDefault()
        createNewTab()
      } else if (matchesShortcut(event, shortcuts.closeTab)) {
        event.preventDefault()
        if (activeTabId) {
          closeTab(activeTabId)
        }
      } else if (matchesShortcut(event, shortcuts.toggleSpeech)) {
        event.preventDefault()
        void toggleActiveTabSpeech()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeTabId, closeTab, createNewTab, goBack, goForward, matchesShortcut, reload, shortcuts, toggleActiveTabSpeech])

  useEffect(() => {
    const unsubscribe = window.speechDictionary.onAddRequest(({ text }) => {
      setQuickAddSeed({
        text,
        token: Date.now(),
      })
      setIsDisplaySettingsOpen(true)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = window.highlights.onAddRequest(({ text, pageUrl }) => {
      setHighlightAddSeed({ text, pageUrl })
      setIsHighlightAddOpen(true)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    // システム通知クリック時にナビゲート
    const unsubscribeNavigate = window.updateChecker.onNavigate((url: string) => {
      navigateToUrl(url)
    })

    // バックグラウンドチェック完了時にサイドバーを更新
    const unsubscribeCompleted = window.updateChecker.onCompleted(() => {
      quickLinksRef.current?.reload()
      sidebarRef.current?.reload()
    })

    return () => {
      unsubscribeNavigate()
      unsubscribeCompleted()
    }
  }, [navigateToUrl])

  const openQuickDictionaryAdd = async () => {
    const selectedText = (await getActiveTabSelectedText()).trim()
    setQuickAddSeed({
      text: selectedText,
      token: Date.now(),
    })
    setIsDisplaySettingsOpen(true)
  }

  return (
    <div className="app-container">
      <BrowserHeader
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        currentTitle={pageTitle}
        currentUrl={url}
        isSidebarOpen={isSidebarOpen}
        speechState={speechState}
        quickLinksRef={quickLinksRef}
        onGoBack={goBack}
        onGoForward={goForward}
        onReload={reload}
        onGoHome={goHome}
        onNavigate={navigateToUrl}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenDisplaySettings={() => setIsDisplaySettingsOpen(true)}
        onOpenQuickDictionaryAdd={() => void openQuickDictionaryAdd()}
        onOpenAbout={() => setIsAboutOpen(true)}
        onToggleSpeech={() => void toggleActiveTabSpeech()}
        onStopSpeech={() => void stopActiveTabSpeech()}
        onOpenStats={() => setIsStatsOpen(true)}
        onOpenHighlights={() => setIsHighlightsPanelOpen(true)}
      />

      <BrowserPane
        activeTabId={activeTabId}
        isLoading={isLoading}
        onActivateTab={activateTab}
        onCloseAllTabs={closeAllTabs}
        onCloseTabsToRight={closeTabsToRight}
        onDuplicateTab={duplicateTab}
        onCloseTab={closeTab}
        onMoveTab={moveTab}
        onNewTab={() => createNewTab()}
        registerWebview={registerWebview}
        tabs={tabs}
      />

      <QuickLinksSidebar
        ref={sidebarRef}
        isOpen={isSidebarOpen}
        onNavigate={navigateToUrl}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <QuickLinksSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onDisplaySettingsChange={() => refreshDisplaySettings()}
        onUpdate={() => {
          quickLinksRef.current?.reload()
          sidebarRef.current?.reload()
        }}
      />

      <DisplaySettingsModal
        currentUrl={url}
        isOpen={isDisplaySettingsOpen}
        onClose={() => setIsDisplaySettingsOpen(false)}
        onChange={() => refreshDisplaySettings()}
        onRequestSelectedText={() => getActiveTabSelectedText()}
        prefillQuickAddText={quickAddSeed.text}
        prefillQuickAddToken={quickAddSeed.token}
      />

      <About isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

      <ReadingStats isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} />

      <HighlightsPanel
        isOpen={isHighlightsPanelOpen}
        onClose={() => setIsHighlightsPanelOpen(false)}
        onNavigate={navigateToUrl}
      />

      <HighlightAddModal
        isOpen={isHighlightAddOpen}
        selectedText={highlightAddSeed.text}
        episodeUrl={highlightAddSeed.pageUrl}
        pageTitle={pageTitle}
        onClose={() => setIsHighlightAddOpen(false)}
        onSaved={() => void injectHighlightsToActiveTab()}
      />

      <ReadingHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onNavigate={navigateToUrl}
      />

      {autoReadCountdown !== null && (
        <div className="auto-read-toast">
          <span className="auto-read-toast-message">
            {autoReadCountdown}秒後に次の話へ移動します
          </span>
          <button
            type="button"
            className="auto-read-toast-cancel"
            onClick={cancelAutoRead}
          >
            キャンセル
          </button>
        </div>
      )}
    </div>
  )
}

export default App
