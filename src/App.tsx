import { useRef, useState } from 'react'
import { About } from './components/About/About'
import { BrowserHeader } from './components/BrowserHeader'
import { BrowserPane } from './components/BrowserPane'
import { QuickLinksSettings } from './components/QuickLinks/QuickLinksSettings'
import { QuickLinksSidebar } from './components/QuickLinks/QuickLinksSidebar'
import type { QuickLinksDropdownHandle } from './components/QuickLinks/QuickLinksDropdown'
import type { QuickLinksSidebarHandle } from './components/QuickLinks/QuickLinksSidebar'
import { ReadingHistory } from './components/ReadingHistory/ReadingHistory'
import { useBrowserWebview } from './hooks/useBrowserWebview'
import './App.css'

function App() {
  const quickLinksRef = useRef<QuickLinksDropdownHandle>(null)
  const sidebarRef = useRef<QuickLinksSidebarHandle>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const {
    webviewRef,
    canGoBack,
    canGoForward,
    isLoading,
    navigateToUrl,
    goBack,
    goForward,
    reload,
    goHome,
    pageTitle,
    url,
  } = useBrowserWebview()

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
        onOpenAbout={() => setIsAboutOpen(true)}
      />

      <BrowserPane webviewRef={webviewRef} isLoading={isLoading} />

      <QuickLinksSidebar
        ref={sidebarRef}
        isOpen={isSidebarOpen}
        onNavigate={navigateToUrl}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <QuickLinksSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onUpdate={() => {
          quickLinksRef.current?.reload()
          sidebarRef.current?.reload()
        }}
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
