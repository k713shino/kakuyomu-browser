import { useState, useEffect } from 'react'
import { X, Highlighter } from 'lucide-react'
import type { HighlightColor } from '../../type/highlight'
import './HighlightAddModal.css'

interface HighlightAddModalProps {
  isOpen: boolean
  selectedText: string
  episodeUrl: string
  pageTitle: string
  onClose: () => void
  onSaved: () => void
}

const COLOR_OPTIONS: { value: HighlightColor; label: string; className: string }[] = [
  { value: 'yellow', label: '黄', className: 'hl-color-yellow' },
  { value: 'green',  label: '緑', className: 'hl-color-green' },
  { value: 'blue',   label: '青', className: 'hl-color-blue' },
  { value: 'pink',   label: 'ピンク', className: 'hl-color-pink' },
]

function parsePageTitle(pageTitle: string): { workTitle: string; episodeTitle: string } {
  const parts = pageTitle.split(' - ')
  if (parts.length >= 2) {
    return {
      episodeTitle: parts[0].trim(),
      workTitle: parts.slice(1).join(' - ').trim(),
    }
  }
  return { workTitle: pageTitle, episodeTitle: '' }
}

function extractIds(url: string): { workId: string; episodeId: string } {
  const m = url.match(/\/works\/([^/?#]+)\/episodes\/([^/?#]+)/)
  return m ? { workId: m[1], episodeId: m[2] } : { workId: '', episodeId: '' }
}

export function HighlightAddModal({
  isOpen,
  selectedText,
  episodeUrl,
  pageTitle,
  onClose,
  onSaved,
}: HighlightAddModalProps) {
  const [note, setNote] = useState('')
  const [color, setColor] = useState<HighlightColor>('yellow')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setNote('')
      setColor('yellow')
    }
  }, [isOpen])

  const handleSave = async () => {
    if (!selectedText.trim()) return
    setIsSaving(true)
    try {
      const { workTitle, episodeTitle } = parsePageTitle(pageTitle)
      const { workId, episodeId } = extractIds(episodeUrl)
      await window.highlights.add({
        workId,
        episodeId,
        episodeUrl,
        workTitle,
        episodeTitle,
        selectedText: selectedText.trim(),
        note: note.trim(),
        color,
      })
      onSaved()
      onClose()
    } catch (error) {
      console.error('Failed to save highlight:', error)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="hl-modal-overlay" onClick={onClose}>
      <div className="hl-modal" onClick={e => e.stopPropagation()}>
        <div className="hl-modal-header">
          <div className="hl-modal-title">
            <Highlighter size={16} />
            <h3>ハイライト・メモを追加</h3>
          </div>
          <button type="button" className="hl-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="hl-modal-body">
          <div className="hl-selected-text">
            <div className="hl-selected-label">選択テキスト</div>
            <blockquote className={`hl-quote hl-quote-${color}`}>{selectedText}</blockquote>
          </div>

          <div className="hl-color-row">
            <span className="hl-color-label">カラー</span>
            <div className="hl-colors">
              {COLOR_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`hl-color-btn ${opt.className} ${color === opt.value ? 'selected' : ''}`}
                  title={opt.label}
                  onClick={() => setColor(opt.value)}
                />
              ))}
            </div>
          </div>

          <label className="hl-note-label">
            メモ（任意）
            <textarea
              className="hl-note-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="このシーンへの感想やメモを書けます..."
              rows={3}
            />
          </label>
        </div>

        <div className="hl-modal-footer">
          <button type="button" className="hl-btn-cancel" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="hl-btn-save"
            onClick={() => void handleSave()}
            disabled={isSaving || !selectedText.trim()}
          >
            {isSaving ? '保存中...' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  )
}
