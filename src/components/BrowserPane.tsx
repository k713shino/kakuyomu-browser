import { Copy, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BrowserTab } from '../hooks/useBrowserTabs'
import type { BrowserWebview } from '../lib/webview'

interface BrowserPaneProps {
  activeTabId: string
  onCloseAllTabs: (keepTabId?: string) => void
  onCloseTabsToRight: (tabId: string) => void
  onDuplicateTab: (tabId: string) => void
  isLoading: boolean
  onActivateTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onMoveTab: (sourceTabId: string, targetTabId: string) => void
  onNewTab: () => void
  registerWebview: (tabId: string) => (node: BrowserWebview | null) => void
  tabs: BrowserTab[]
}

export function BrowserPane({
  activeTabId,
  onCloseAllTabs,
  onCloseTabsToRight,
  onDuplicateTab,
  isLoading,
  onActivateTab,
  onCloseTab,
  onMoveTab,
  onNewTab,
  registerWebview,
  tabs,
}: BrowserPaneProps) {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    tabId: string
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const handleWindowClick = () => {
      setContextMenu(null)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    window.addEventListener('click', handleWindowClick)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('click', handleWindowClick)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenu])

  return (
    <>
      <div className="tab-strip">
        <div className="tab-list">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`tab-item ${tab.id === activeTabId ? 'is-active' : ''} ${
                tab.id === draggedTabId ? 'is-dragging' : ''
              }`}
              title={tab.title || tab.url}
              draggable
              onDragStart={() => setDraggedTabId(tab.id)}
              onDragEnd={() => setDraggedTabId(null)}
              onDragOver={event => {
                event.preventDefault()
              }}
              onContextMenu={event => {
                event.preventDefault()
                onActivateTab(tab.id)
                setContextMenu({
                  tabId: tab.id,
                  x: event.clientX,
                  y: event.clientY,
                })
              }}
              onDrop={event => {
                event.preventDefault()
                if (draggedTabId) {
                  onMoveTab(draggedTabId, tab.id)
                }
                setDraggedTabId(null)
              }}
            >
              <button
                type="button"
                className={`tab-button ${tab.id === activeTabId ? 'is-active' : ''}`}
                onClick={() => onActivateTab(tab.id)}
              >
                <span className="tab-button-title">{tab.title}</span>
              </button>
              <button
                type="button"
                className="tab-duplicate-button"
                onClick={() => onDuplicateTab(tab.id)}
                aria-label="タブを複製"
                title="タブを複製"
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                className="tab-close-button"
                onClick={() => onCloseTab(tab.id)}
                aria-label="タブを閉じる"
                title="タブを閉じる"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="tab-add-button" onClick={onNewTab} title="新しいタブ">
          <Plus size={16} />
        </button>
      </div>

      <div className="webview-wrapper">
        {tabs.map(tab => (
          <webview
            key={tab.id}
            ref={registerWebview(tab.id)}
            src={tab.url}
            className={`webview ${tab.id === activeTabId ? 'is-visible' : 'is-hidden'}`}
            allowpopups
          />
        ))}
        {isLoading && <div className="loading-bar"></div>}
      </div>

      {contextMenu && (
        <div
          className="tab-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={event => event.stopPropagation()}
        >
          <button
            type="button"
            className="tab-context-menu-item"
            onClick={() => {
              onDuplicateTab(contextMenu.tabId)
              setContextMenu(null)
            }}
          >
            タブを複製
          </button>
          <button
            type="button"
            className="tab-context-menu-item"
            onClick={() => {
              onCloseTab(contextMenu.tabId)
              setContextMenu(null)
            }}
          >
            このタブを閉じる
          </button>
          <button
            type="button"
            className="tab-context-menu-item"
            onClick={() => {
              onCloseTabsToRight(contextMenu.tabId)
              setContextMenu(null)
            }}
          >
            右側を閉じる
          </button>
          <button
            type="button"
            className="tab-context-menu-item danger"
            onClick={() => {
              onCloseAllTabs(contextMenu.tabId)
              setContextMenu(null)
            }}
          >
            これ以外をすべて閉じる
          </button>
          <button
            type="button"
            className="tab-context-menu-item danger"
            onClick={() => {
              onCloseAllTabs()
              setContextMenu(null)
            }}
          >
            すべて閉じる
          </button>
        </div>
      )}
    </>
  )
}
