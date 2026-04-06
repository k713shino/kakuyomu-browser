import { useEffect, useMemo, useState } from 'react'
import { X, Trash2, Clock, BookOpen, Bookmark, Search, CheckCheck, ChevronDown, ChevronRight, BellRing } from 'lucide-react'
import type { EpisodeCompletionItem } from '../../type/episode-completion'
import type { QuickLink } from '../../type/quick-links'
import { ReadingHistoryItem } from '../../type/reading-history'
import './ReadingHistory.css'

interface ReadingHistoryProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (url: string) => void
}

type HistoryFilter = 'all' | 'bookmark' | 'recent' | 'frequent'

const FILTER_LABELS: Record<HistoryFilter, string> = {
  all: 'すべて',
  bookmark: 'しおりあり',
  recent: '7日以内',
  frequent: '複数回読了',
}

export function ReadingHistory({ isOpen, onClose, onNavigate }: ReadingHistoryProps) {
  const [history, setHistory] = useState<ReadingHistoryItem[]>([])
  const [quickLinksByWorkId, setQuickLinksByWorkId] = useState<Record<string, QuickLink>>({})
  const [completionMap, setCompletionMap] = useState<Record<string, EpisodeCompletionItem>>({})
  const [expandedWorkIds, setExpandedWorkIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>('all')

  const loadHistory = async () => {
    try {
      setLoading(true)
      const [items, completionItems, quickLinksData] = await Promise.all([
        window.readingHistory.getHistory(),
        window.episodeCompletion.getAll(),
        window.quickLinks.get(),
      ])
      setHistory(items)

      const completionLookup: Record<string, EpisodeCompletionItem> = {}
      completionItems.forEach(item => {
        completionLookup[item.workId] = item
      })
      setCompletionMap(completionLookup)

      const quickLinkLookup: Record<string, QuickLink> = {}
      quickLinksData.links.forEach(link => {
        if (link.workId) {
          quickLinkLookup[link.workId] = link
        }
      })
      setQuickLinksByWorkId(quickLinkLookup)
    } catch (error) {
      console.error('Failed to load reading history:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      void loadHistory()
    }
  }, [isOpen])

  const handleDelete = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!confirm('この履歴を削除しますか？')) return
    try {
      await window.readingHistory.deleteHistory(id)
      await loadHistory()
    } catch (error) {
      console.error('Failed to delete history:', error)
    }
  }

  const handleUnmarkEpisode = async (workId: string, episodeId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await window.episodeCompletion.unmark(workId, episodeId)
      setCompletionMap(prev => {
        const item = prev[workId]
        if (!item) return prev
        return {
          ...prev,
          [workId]: {
            ...item,
            completedEpisodes: item.completedEpisodes.filter(ep => ep.episodeId !== episodeId),
          },
        }
      })
    } catch (error) {
      console.error('Failed to unmark episode:', error)
    }
  }

  const toggleEpisodeList = (workId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setExpandedWorkIds(prev => {
      const next = new Set(prev)
      if (next.has(workId)) next.delete(workId)
      else next.add(workId)
      return next
    })
  }

  const handleClearAll = async () => {
    if (!confirm('すべての履歴を削除しますか？')) return
    try {
      await window.readingHistory.clearHistory()
      await loadHistory()
    } catch (error) {
      console.error('Failed to clear history:', error)
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return '今日'
    if (days === 1) return '昨日'
    if (days < 7) return `${days}日前`
    return date.toLocaleDateString('ja-JP')
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredHistory = useMemo(
    () =>
      history.filter(item => {
        const matchesQuery =
          normalizedQuery.length === 0 ||
          item.title.toLowerCase().includes(normalizedQuery) ||
          item.author.toLowerCase().includes(normalizedQuery) ||
          item.lastReadEpisodeTitle.toLowerCase().includes(normalizedQuery)
        if (!matchesQuery) return false
        if (activeFilter === 'bookmark') return item.scrollPosition !== undefined
        if (activeFilter === 'recent') return item.lastReadAt >= Date.now() - 7 * 24 * 60 * 60 * 1000
        if (activeFilter === 'frequent') return item.readCount >= 2
        return true
      }),
    [activeFilter, history, normalizedQuery],
  )

  const hasActiveConditions = normalizedQuery.length > 0 || activeFilter !== 'all'

  if (!isOpen) return null

  return (
    <div className="reading-history-overlay" onClick={onClose}>
      <div className="reading-history-modal" onClick={event => event.stopPropagation()}>
        <div className="reading-history-header">
          <div className="reading-history-heading">
            <h2>読書履歴</h2>
            <p>{history.length}件の履歴</p>
          </div>
          <div className="reading-history-header-actions">
            {history.length > 0 && (
              <button className="clear-all-button" onClick={handleClearAll} title="すべてクリア">
                <Trash2 size={18} />
                すべてクリア
              </button>
            )}
            <button className="close-button" onClick={onClose} title="閉じる">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="reading-history-content">
          {loading ? (
            <div className="loading-state">読み込み中...</div>
          ) : history.length === 0 ? (
            <div className="empty-state">
              <BookOpen size={48} />
              <p>まだ読書履歴がありません</p>
              <p className="empty-state-hint">カクヨムで作品を読むと、ここに履歴が表示されます</p>
            </div>
          ) : (
            <>
              <div className="history-toolbar">
                <label className="history-search">
                  <Search size={16} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="作品名・作者名・話数タイトルで検索"
                  />
                </label>

                <div className="history-filters" role="group" aria-label="読書履歴の絞り込み">
                  {(Object.keys(FILTER_LABELS) as HistoryFilter[]).map(filter => (
                    <button
                      key={filter}
                      type="button"
                      className={`history-filter-chip ${activeFilter === filter ? 'active' : ''}`}
                      onClick={() => setActiveFilter(filter)}
                    >
                      {FILTER_LABELS[filter]}
                    </button>
                  ))}
                </div>

                <div className="history-summary">
                  <span>{filteredHistory.length}件を表示中</span>
                  {hasActiveConditions && (
                    <button
                      type="button"
                      className="history-reset-button"
                      onClick={() => {
                        setSearchQuery('')
                        setActiveFilter('all')
                      }}
                    >
                      条件をクリア
                    </button>
                  )}
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="filtered-empty-state">
                  <Search size={32} />
                  <p>条件に一致する履歴が見つかりませんでした</p>
                  <p className="empty-state-hint">検索語や絞り込み条件を変更してみてください</p>
                </div>
              ) : (
                <div className="history-list">
                  {filteredHistory.map(item => {
                    const completion = completionMap[item.id]
                    const completedCount = completion?.completedEpisodes.length ?? 0
                    const link = quickLinksByWorkId[item.id]
                    const totalEpisodes = link?.totalEpisodes ?? null
                    const unreadCount = link?.unreadEpisodeCount ?? 0
                    const isExpanded = expandedWorkIds.has(item.id)

                    return (
                      <div key={item.id} className="history-item" onClick={() => { onNavigate(item.lastReadUrl); onClose() }}>
                        <div className="history-item-header">
                          <div className="history-item-heading">
                            <h3 className="history-item-title">{item.title}</h3>
                            {item.author && <div className="history-item-author">{item.author}</div>}
                          </div>
                          <button type="button" className="delete-button" onClick={event => handleDelete(item.id, event)} title="削除">
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div className="history-item-episode">{item.lastReadEpisodeTitle}</div>

                        {(totalEpisodes !== null || unreadCount > 0) && (
                          <div className="history-progress-row">
                            {totalEpisodes !== null && (
                              <div className="history-progress-pill">
                                読書進捗: {completedCount}/{totalEpisodes}話
                              </div>
                            )}
                            {unreadCount > 0 && (
                              <div className="history-unread-pill">
                                <BellRing size={13} />
                                新着 {unreadCount}話
                              </div>
                            )}
                          </div>
                        )}

                        <div className="history-item-meta">
                          <span className="history-item-date"><Clock size={14} />{formatDate(item.lastReadAt)}</span>
                          <span className="history-item-count"><BookOpen size={14} />{item.readCount}回</span>
                          {item.scrollPosition !== undefined && <span className="history-item-bookmark"><Bookmark size={14} />しおりあり</span>}
                          {completedCount > 0 && (
                            <button
                              type="button"
                              className={`history-item-completed-badge ${isExpanded ? 'active' : ''}`}
                              onClick={event => toggleEpisodeList(item.id, event)}
                              title="読了エピソード一覧"
                            >
                              <CheckCheck size={14} />
                              {completedCount}話読了
                              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </button>
                          )}
                        </div>

                        {isExpanded && completion && (
                          <div className="history-item-episodes" onClick={event => event.stopPropagation()}>
                            {[...completion.completedEpisodes].sort((a, b) => b.completedAt - a.completedAt).map(ep => (
                              <div key={ep.episodeId} className="history-episode-row">
                                <button
                                  type="button"
                                  className="history-episode-title"
                                  onClick={() => {
                                    onNavigate(ep.episodeUrl)
                                    onClose()
                                  }}
                                  title={ep.episodeTitle}
                                >
                                  {ep.episodeTitle}
                                </button>
                                <button
                                  type="button"
                                  className="history-episode-unmark"
                                  onClick={event => handleUnmarkEpisode(item.id, ep.episodeId, event)}
                                  title="読了を取り消す"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
