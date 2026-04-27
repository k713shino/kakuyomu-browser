import { useEffect, useState, useMemo } from 'react'
import { X, Highlighter, Trash2, ChevronDown, ChevronRight, ExternalLink, Pencil, Check } from 'lucide-react'
import type { Highlight, HighlightColor } from '../../type/highlight'
import './HighlightsPanel.css'

interface HighlightsPanelProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (url: string) => void
}

const COLOR_OPTIONS: { value: HighlightColor; label: string }[] = [
  { value: 'yellow', label: '黄' },
  { value: 'green',  label: '緑' },
  { value: 'blue',   label: '青' },
  { value: 'pink',   label: 'ピンク' },
]

function formatDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

interface WorkGroup {
  workId: string
  workTitle: string
  highlights: Highlight[]
}

export function HighlightsPanel({ isOpen, onClose, onNavigate }: HighlightsPanelProps) {
  const [items, setItems] = useState<Highlight[]>([])
  const [expandedWorks, setExpandedWorks] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editColor, setEditColor] = useState<HighlightColor>('yellow')
  const [query, setQuery] = useState('')

  const load = async () => {
    try {
      const all = await window.highlights.getAll()
      setItems(all.sort((a, b) => b.createdAt - a.createdAt))
    } catch (error) {
      console.error('Failed to load highlights:', error)
    }
  }

  useEffect(() => {
    if (isOpen) void load()
  }, [isOpen])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter(
      h =>
        h.selectedText.toLowerCase().includes(q) ||
        h.note.toLowerCase().includes(q) ||
        h.workTitle.toLowerCase().includes(q) ||
        h.episodeTitle.toLowerCase().includes(q),
    )
  }, [items, query])

  const groups = useMemo<WorkGroup[]>(() => {
    const map = new Map<string, WorkGroup>()
    for (const h of filtered) {
      const key = h.workId || h.workTitle
      if (!map.has(key)) {
        map.set(key, { workId: key, workTitle: h.workTitle || '不明な作品', highlights: [] })
      }
      map.get(key)!.highlights.push(h)
    }
    return Array.from(map.values())
  }, [filtered])

  const toggleWork = (workId: string) => {
    setExpandedWorks(prev => {
      const next = new Set(prev)
      next.has(workId) ? next.delete(workId) : next.add(workId)
      return next
    })
  }

  const startEdit = (h: Highlight) => {
    setEditingId(h.id)
    setEditNote(h.note)
    setEditColor(h.color)
  }

  const saveEdit = async (id: string) => {
    try {
      await window.highlights.update(id, { note: editNote, color: editColor })
      setItems(prev => prev.map(h => h.id === id ? { ...h, note: editNote, color: editColor, updatedAt: Date.now() } : h))
      setEditingId(null)
    } catch (error) {
      console.error('Failed to update highlight:', error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await window.highlights.delete(id)
      setItems(prev => prev.filter(h => h.id !== id))
    } catch (error) {
      console.error('Failed to delete highlight:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="hlp-overlay" onClick={onClose}>
      <div className="hlp-modal" onClick={e => e.stopPropagation()}>
        <div className="hlp-header">
          <div className="hlp-header-left">
            <Highlighter size={18} />
            <div>
              <h2>ハイライト</h2>
              <p>{items.length}件のハイライト</p>
            </div>
          </div>
          <button type="button" className="hlp-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="hlp-search">
          <input
            type="text"
            className="hlp-search-input"
            placeholder="テキスト・メモ・作品名で検索..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="hlp-content">
          {groups.length === 0 ? (
            <div className="hlp-empty">
              {query ? '検索結果がありません' : 'ハイライトがまだありません。作品ページでテキストを選択して右クリックから追加できます。'}
            </div>
          ) : (
            groups.map(group => (
              <div key={group.workId} className="hlp-work-group">
                <button
                  type="button"
                  className="hlp-work-header"
                  onClick={() => toggleWork(group.workId)}
                >
                  {expandedWorks.has(group.workId)
                    ? <ChevronDown size={14} />
                    : <ChevronRight size={14} />
                  }
                  <span className="hlp-work-title">{group.workTitle}</span>
                  <span className="hlp-work-count">{group.highlights.length}件</span>
                </button>

                {expandedWorks.has(group.workId) && (
                  <div className="hlp-items">
                    {group.highlights.map(h => (
                      <div key={h.id} className={`hlp-item hlp-item-${h.color}`}>
                        <blockquote className="hlp-item-quote">{h.selectedText}</blockquote>

                        {editingId === h.id ? (
                          <div className="hlp-edit-form">
                            <div className="hlp-edit-colors">
                              {COLOR_OPTIONS.map(opt => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  className={`hlp-color-dot hlp-color-dot-${opt.value} ${editColor === opt.value ? 'selected' : ''}`}
                                  title={opt.label}
                                  onClick={() => setEditColor(opt.value)}
                                />
                              ))}
                            </div>
                            <textarea
                              className="hlp-edit-note"
                              value={editNote}
                              onChange={e => setEditNote(e.target.value)}
                              placeholder="メモを編集..."
                              rows={2}
                            />
                            <div className="hlp-edit-actions">
                              <button type="button" className="hlp-btn-icon" onClick={() => setEditingId(null)}>キャンセル</button>
                              <button type="button" className="hlp-btn-save-edit" onClick={() => void saveEdit(h.id)}>
                                <Check size={13} /> 保存
                              </button>
                            </div>
                          </div>
                        ) : (
                          h.note && <p className="hlp-item-note">{h.note}</p>
                        )}

                        <div className="hlp-item-meta">
                          <span className="hlp-item-episode">{h.episodeTitle}</span>
                          <span className="hlp-item-date">{formatDate(h.createdAt)}</span>
                        </div>

                        <div className="hlp-item-actions">
                          <button
                            type="button"
                            className="hlp-action-btn"
                            title="エピソードへ移動"
                            onClick={() => { onNavigate(h.episodeUrl); onClose() }}
                          >
                            <ExternalLink size={13} />
                          </button>
                          <button
                            type="button"
                            className="hlp-action-btn"
                            title="メモを編集"
                            onClick={() => startEdit(h)}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            className="hlp-action-btn hlp-action-delete"
                            title="削除"
                            onClick={() => void handleDelete(h.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
