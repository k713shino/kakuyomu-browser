import { useEffect, useState } from 'react'
import { X, Trash2, Clock, BookOpen, Bookmark, Search } from 'lucide-react'
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
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>('all')

  const loadHistory = async () => {
    try {
      setLoading(true)
      const items = await window.readingHistory.getHistory()
      setHistory(items)
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
    if (confirm('この履歴を削除しますか？')) {
      try {
        await window.readingHistory.deleteHistory(id)
        await loadHistory()
      } catch (error) {
        console.error('Failed to delete history:', error)
      }
    }
  }

  const handleClearAll = async () => {
    if (confirm('すべての履歴を削除しますか？')) {
      try {
        await window.readingHistory.clearHistory()
        await loadHistory()
      } catch (error) {
        console.error('Failed to clear history:', error)
      }
    }
  }

  const handleOpenHistory = (item: ReadingHistoryItem) => {
    onNavigate(item.lastReadUrl)
    onClose()
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return '今日'
    }
    if (days === 1) {
      return '昨日'
    }
    if (days < 7) {
      return `${days}日前`
    }

    return date.toLocaleDateString('ja-JP')
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredHistory = history.filter(item => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.author.toLowerCase().includes(normalizedQuery) ||
      item.lastReadEpisodeTitle.toLowerCase().includes(normalizedQuery)

    if (!matchesQuery) {
      return false
    }

    if (activeFilter === 'bookmark') {
      return item.scrollPosition !== undefined
    }

    if (activeFilter === 'recent') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      return item.lastReadAt >= sevenDaysAgo
    }

    if (activeFilter === 'frequent') {
      return item.readCount >= 2
    }

    return true
  })

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

                <div className="history-filters" role="tablist" aria-label="読書履歴の絞り込み">
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
                  {filteredHistory.map(item => (
                    <div
                      key={item.id}
                      className="history-item"
                      onClick={() => handleOpenHistory(item)}
                    >
                      <div className="history-item-header">
                        <div className="history-item-heading">
                          <h3 className="history-item-title">{item.title}</h3>
                          {item.author && <div className="history-item-author">{item.author}</div>}
                        </div>
                        <button
                          className="delete-button"
                          onClick={event => handleDelete(item.id, event)}
                          title="削除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="history-item-episode">{item.lastReadEpisodeTitle}</div>
                      <div className="history-item-meta">
                        <span className="history-item-date">
                          <Clock size={14} />
                          {formatDate(item.lastReadAt)}
                        </span>
                        <span className="history-item-count">
                          <BookOpen size={14} />
                          {item.readCount}回
                        </span>
                        {item.scrollPosition !== undefined && (
                          <span className="history-item-bookmark">
                            <Bookmark size={14} />
                            しおりあり
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
