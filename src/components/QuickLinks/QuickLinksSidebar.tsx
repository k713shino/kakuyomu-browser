import { useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { BellRing, ExternalLink, Folder, ChevronRight, ChevronDown, Settings } from 'lucide-react'
import { extractWorkId } from '../../lib/browser'
import type { EpisodeCompletionItem } from '../../type/episode-completion'
import type { QuickLink, QuickLinkFolder, QuickLinksData } from '../../type/quick-links'
import './QuickLinksSidebar.css'

interface QuickLinksSidebarProps {
  isOpen: boolean
  onNavigate: (url: string) => void
  onOpenSettings: () => void
}

export interface QuickLinksSidebarHandle {
  reload: () => void
}

export const QuickLinksSidebar = forwardRef<QuickLinksSidebarHandle, QuickLinksSidebarProps>(
  ({ isOpen, onNavigate, onOpenSettings }, ref) => {
    const [quickLinks, setQuickLinks] = useState<QuickLink[]>([])
    const [folders, setFolders] = useState<QuickLinkFolder[]>([])
    const [completionMap, setCompletionMap] = useState<Record<string, EpisodeCompletionItem>>({})
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

    const loadQuickLinks = async () => {
      try {
        const [data, completionItems] = await Promise.all([
          window.quickLinks.get(),
          window.episodeCompletion.getAll(),
        ])
        setQuickLinks(data.links)
        setFolders(data.folders)
        setExpandedFolders(new Set(data.folders.filter(folder => folder.isExpanded !== false).map(folder => folder.id)))

        const nextMap: Record<string, EpisodeCompletionItem> = {}
        completionItems.forEach(item => {
          nextMap[item.workId] = item
        })
        setCompletionMap(nextMap)
      } catch (error) {
        console.error('Failed to load quick links:', error)
      }
    }

    useEffect(() => {
      if (isOpen) {
        void loadQuickLinks()
      }
    }, [isOpen])

    useImperativeHandle(ref, () => ({
      reload: () => {
        void loadQuickLinks()
      },
    }))

    const toggleFolder = (folderId: string) => {
      setExpandedFolders(prev => {
        const next = new Set(prev)
        if (next.has(folderId)) {
          next.delete(folderId)
        } else {
          next.add(folderId)
        }
        return next
      })
    }

    const rootLinks = quickLinks.filter(link => !link.folderId)
    const linksByFolder = quickLinks.reduce((acc, link) => {
      if (link.folderId) {
        if (!acc[link.folderId]) acc[link.folderId] = []
        acc[link.folderId].push(link)
      }
      return acc
    }, {} as Record<string, QuickLink[]>)

    const renderLinkButton = (link: QuickLink, className = 'sidebar-link-item') => {
      const workId = link.workId ?? extractWorkId(link.url)
      const completedCount = workId ? completionMap[workId]?.completedEpisodes.length ?? 0 : 0
      const totalEpisodes = link.totalEpisodes ?? null
      const unreadCount = link.unreadEpisodeCount ?? 0

      return (
        <button
          type="button"
          key={link.id}
          className={className}
          onClick={() => onNavigate(link.url)}
          title={link.url}
        >
          <ExternalLink size={16} className="sidebar-link-icon" />
          <div className="sidebar-link-copy">
            <span className="sidebar-link-title">{link.title}</span>
            {(totalEpisodes !== null || unreadCount > 0 || (link.tags?.length ?? 0) > 0) && (
              <div className="sidebar-link-meta">
                {totalEpisodes !== null && (
                  <span className="sidebar-progress-pill">
                    {completedCount}/{totalEpisodes}話
                  </span>
                )}
                {unreadCount > 0 && (
                  <span className="sidebar-unread-pill">
                    <BellRing size={11} />
                    {unreadCount}
                  </span>
                )}
                {(link.tags?.length ?? 0) > 0 && (
                  <span className="sidebar-tag-summary">
                    {link.tags?.slice(0, 2).map(tag => `#${tag}`).join(' ')}
                  </span>
                )}
              </div>
            )}
          </div>
        </button>
      )
    }

    return (
      <div className={`quick-links-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">クイックリンク</h2>
          <button type="button" onClick={onOpenSettings} className="sidebar-settings-button" title="管理">
            <Settings size={18} />
          </button>
        </div>

        <div className="sidebar-content">
          {quickLinks.length === 0 && folders.length === 0 ? (
            <div className="sidebar-empty">
              <p>クイックリンクがありません</p>
              <p className="sidebar-empty-hint">設定から追加できます</p>
            </div>
          ) : (
            <div className="sidebar-links-list">
              {rootLinks.length > 0 && (
                <div className="sidebar-section">
                  <div className="sidebar-section-title">未分類</div>
                  {rootLinks.map(link => renderLinkButton(link))}
                </div>
              )}

              {folders.map(folder => {
                const folderLinks = linksByFolder[folder.id] || []
                if (folderLinks.length === 0) return null

                return (
                  <div key={folder.id} className="sidebar-section">
                    <button type="button" className="sidebar-folder-header" onClick={() => toggleFolder(folder.id)}>
                      {expandedFolders.has(folder.id) ? (
                        <ChevronDown size={16} className="sidebar-folder-chevron" />
                      ) : (
                        <ChevronRight size={16} className="sidebar-folder-chevron" />
                      )}
                      <Folder size={16} className="sidebar-folder-icon" />
                      <span className="sidebar-folder-name">{folder.name}</span>
                      <span className="sidebar-folder-count">({folderLinks.length})</span>
                    </button>

                    {expandedFolders.has(folder.id) && (
                      <div className="sidebar-folder-links">
                        {folderLinks.map(link => renderLinkButton(link, 'sidebar-link-item sidebar-folder-link'))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  },
)
