import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Home,
  PanelRight,
  HelpCircle,
  BookOpen,
  Type,
} from 'lucide-react'
import type { RefObject } from 'react'
import { QuickLinksDropdown } from './QuickLinks/QuickLinksDropdown'
import type { QuickLinksDropdownHandle } from './QuickLinks/QuickLinksDropdown'

interface BrowserHeaderProps {
  canGoBack: boolean
  canGoForward: boolean
  currentTitle: string
  currentUrl: string
  isSidebarOpen: boolean
  quickLinksRef: RefObject<QuickLinksDropdownHandle>
  onGoBack: () => void
  onGoForward: () => void
  onReload: () => void
  onGoHome: () => void
  onNavigate: (url: string) => void
  onOpenSettings: () => void
  onToggleSidebar: () => void
  onOpenHistory: () => void
  onOpenDisplaySettings: () => void
  onOpenAbout: () => void
}

export function BrowserHeader({
  canGoBack,
  canGoForward,
  currentTitle,
  currentUrl,
  isSidebarOpen,
  quickLinksRef,
  onGoBack,
  onGoForward,
  onReload,
  onGoHome,
  onNavigate,
  onOpenSettings,
  onToggleSidebar,
  onOpenHistory,
  onOpenDisplaySettings,
  onOpenAbout,
}: BrowserHeaderProps) {
  return (
    <header className="browser-header">
      <div className="nav-controls">
        <button
          type="button"
          onClick={onGoBack}
          disabled={!canGoBack}
          className="icon-button"
          title="戻る"
        >
          <ArrowLeft size={20} />
        </button>
        <button
          type="button"
          onClick={onGoForward}
          disabled={!canGoForward}
          className="icon-button"
          title="進む"
        >
          <ArrowRight size={20} />
        </button>
        <button type="button" onClick={onReload} className="icon-button" title="更新">
          <RotateCcw size={20} />
        </button>
        <button type="button" onClick={onGoHome} className="icon-button" title="ホーム">
          <Home size={20} />
        </button>
        <QuickLinksDropdown
          ref={quickLinksRef}
          onNavigate={onNavigate}
          onOpenSettings={onOpenSettings}
          currentUrl={currentUrl}
          currentTitle={currentTitle}
        />
        <button
          type="button"
          onClick={onOpenDisplaySettings}
          className="icon-button"
          title="表示カスタマイズ"
        >
          <Type size={20} />
        </button>
        <button
          type="button"
          onClick={onToggleSidebar}
          className={`icon-button ${isSidebarOpen ? 'is-active' : ''}`}
          title="サイドバーを開く/閉じる"
        >
          <PanelRight size={20} />
        </button>
        <button
          type="button"
          onClick={onOpenHistory}
          className="icon-button"
          title="読書履歴"
        >
          <BookOpen size={20} />
        </button>
        <button
          type="button"
          onClick={onOpenAbout}
          className="icon-button"
          title="このアプリについて"
        >
          <HelpCircle size={20} />
        </button>
      </div>
      <div className="url-bar">
        <span>{currentUrl}</span>
      </div>
    </header>
  )
}
