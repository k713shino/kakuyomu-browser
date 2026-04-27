import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Square,
  Home,
  PanelRight,
  HelpCircle,
  BookOpen,
  Type,
  TextCursorInput,
  Settings,
  BarChart2,
  Highlighter,
} from 'lucide-react'
import type { RefObject } from 'react'
import { QuickLinksDropdown } from './QuickLinks/QuickLinksDropdown'
import type { QuickLinksDropdownHandle } from './QuickLinks/QuickLinksDropdown'
import type { SpeechPlaybackState } from '../lib/webview'

interface BrowserHeaderProps {
  canGoBack: boolean
  canGoForward: boolean
  currentTitle: string
  currentUrl: string
  isSidebarOpen: boolean
  speechState: SpeechPlaybackState
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
  onOpenQuickDictionaryAdd: () => void
  onOpenAbout: () => void
  onToggleSpeech: () => void
  onStopSpeech: () => void
  onOpenStats: () => void
  onOpenHighlights: () => void
}

export function BrowserHeader({
  canGoBack,
  canGoForward,
  currentTitle,
  currentUrl,
  isSidebarOpen,
  speechState,
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
  onOpenQuickDictionaryAdd,
  onOpenAbout,
  onToggleSpeech,
  onStopSpeech,
  onOpenStats,
  onOpenHighlights,
}: BrowserHeaderProps) {
  const isSpeechBusy = speechState === 'loading'
  const isSpeechActive = speechState === 'playing' || speechState === 'paused' || speechState === 'loading'
  const speechTitle =
    speechState === 'loading'
      ? 'AivisSpeech で音声を生成中'
      : speechState === 'playing'
      ? '読み上げを一時停止'
      : speechState === 'paused'
        ? '読み上げを再開'
        : speechState === 'unavailable'
          ? 'AivisSpeech が見つからないか、このページは読み上げできません'
          : 'AivisSpeech で読み上げを開始'

  return (
    <header className="browser-header">
      <div className="nav-controls">
        {/* ナビゲーショングループ */}
        <div className="nav-group">
          <button
            type="button"
            onClick={onGoBack}
            disabled={!canGoBack}
            className="icon-button"
            title="戻る"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            type="button"
            onClick={onGoForward}
            disabled={!canGoForward}
            className="icon-button"
            title="進む"
          >
            <ArrowRight size={18} />
          </button>
          <button type="button" onClick={onReload} className="icon-button" title="更新">
            <RotateCcw size={18} />
          </button>
          <button type="button" onClick={onGoHome} className="icon-button" title="ホーム">
            <Home size={18} />
          </button>
        </div>

        <div className="nav-separator" />

        {/* クイックリンク & ブックマーク */}
        <div className="nav-group">
          <QuickLinksDropdown
            ref={quickLinksRef}
            onNavigate={onNavigate}
            onOpenSettings={onOpenSettings}
            currentUrl={currentUrl}
            currentTitle={currentTitle}
          />
        </div>

        <div className="nav-separator" />

        {/* 表示・ツールグループ */}
        <div className="nav-group">
          <button
            type="button"
            onClick={onOpenDisplaySettings}
            className="icon-button"
            title="表示カスタマイズ"
          >
            <Type size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenQuickDictionaryAdd}
            className="icon-button quick-dictionary-button"
            title="選択中の語を読み辞書に追加"
          >
            <TextCursorInput size={16} />
            <span>辞書追加</span>
          </button>
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`icon-button ${isSidebarOpen ? 'is-active' : ''}`}
            title="サイドバーを開く/閉じる"
          >
            <PanelRight size={18} />
          </button>
        </div>

        <div className="nav-separator" />

        {/* 音声グループ */}
        <div className="nav-group">
          <button
            type="button"
            onClick={onToggleSpeech}
            className={`icon-button ${isSpeechActive ? 'is-active' : ''}`}
            title={speechTitle}
            disabled={isSpeechBusy}
          >
            {speechState === 'loading' ? (
              <LoaderCircle size={18} className="spin" />
            ) : speechState === 'playing' ? (
              <Pause size={18} />
            ) : (
              <Play size={18} />
            )}
          </button>
          <button
            type="button"
            onClick={onStopSpeech}
            className="icon-button"
            title="読み上げを停止"
            disabled={!isSpeechActive}
          >
            <Square size={16} />
          </button>
        </div>

        <div className="nav-separator" />

        {/* ユーティリティグループ */}
        <div className="nav-group">
          <button
            type="button"
            onClick={onOpenHighlights}
            className="icon-button"
            title="ハイライト"
          >
            <Highlighter size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenStats}
            className="icon-button"
            title="読書統計"
          >
            <BarChart2 size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenHistory}
            className="icon-button"
            title="読書履歴"
          >
            <BookOpen size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="icon-button"
            title="設定・管理"
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenAbout}
            className="icon-button"
            title="このアプリについて"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </div>

      <div className="url-bar">
        <span>{currentUrl}</span>
      </div>
    </header>
  )
}
