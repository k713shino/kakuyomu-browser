import { useEffect, useRef, useState } from 'react'
import { About } from './components/About/About'
import { BrowserHeader } from './components/BrowserHeader'
import { BrowserPane } from './components/BrowserPane'
import { DisplaySettingsModal } from './components/DisplaySettings/DisplaySettingsModal'
import { QuickLinksSettings } from './components/QuickLinks/QuickLinksSettings'
import { QuickLinksSidebar } from './components/QuickLinks/QuickLinksSidebar'
import type { QuickLinksDropdownHandle } from './components/QuickLinks/QuickLinksDropdown'
import type { QuickLinksSidebarHandle } from './components/QuickLinks/QuickLinksSidebar'
import { ReadingHistory } from './components/ReadingHistory/ReadingHistory'
import { useBrowserTabs } from './hooks/useBrowserTabs'
import './App.css'

function App() {
  const quickLinksRef = useRef<QuickLinksDropdownHandle>(null)
  const sidebarRef = useRef<QuickLinksSidebarHandle>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isDisplaySettingsOpen, setIsDisplaySettingsOpen] = useState(false)
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
    url,
    createNewTab,
    duplicateTab,
    closeTab,
    closeTabsToRight,
    closeAllTabs,
    activateTab,
    moveTab,
    registerWebview,
  } = useBrowserTabs()

  useEffect(() => {
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

      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          goBack()
          return
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault()
          goForward()
          return
        }
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey) {
        const key = event.key.toLowerCase()

        if (key === 'r') {
          event.preventDefault()
          reload()
          return
        }

        if (key === 'h') {
          event.preventDefault()
          setIsHistoryOpen(true)
          return
        }

        if (key === 'b') {
          event.preventDefault()
          setIsSidebarOpen(prev => !prev)
          return
        }

        if (key === 't') {
          event.preventDefault()
          createNewTab()
          return
        }

        if (key === 'w') {
          event.preventDefault()
          if (activeTabId) {
            closeTab(activeTabId)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeTabId, closeTab, createNewTab, goBack, goForward, reload])

  return (
    <div className="app-container">
      <BrowserHeader
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        currentTitle={pageTitle}
        currentUrl={url}
        isSidebarOpen={isSidebarOpen}
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
        onOpenAbout={() => setIsAboutOpen(true)}
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
        isOpen={isDisplaySettingsOpen}
        onClose={() => setIsDisplaySettingsOpen(false)}
        onChange={() => refreshDisplaySettings()}
      />

      <About isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

      <ReadingHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onNavigate={navigateToUrl}
      />
    </div>
  )
}

export default App
