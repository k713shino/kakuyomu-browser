import { useEffect, useState } from 'react'
import { Type, X, RectangleHorizontal, Text } from 'lucide-react'
import type { DisplaySettings, ReaderFontSize, ReaderWidth } from '../../type/display-settings'
import './DisplaySettingsModal.css'

interface DisplaySettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onChange: () => void | Promise<void>
}

const widthOptions: { value: ReaderWidth; label: string; description: string }[] = [
  { value: 'compact', label: 'コンパクト', description: '横幅を狭めて集中しやすくします' },
  { value: 'comfortable', label: '標準', description: '読みやすさと情報量のバランスが良い設定です' },
  { value: 'wide', label: 'ワイド', description: '広めに表示してスクロール回数を減らします' },
]

const fontSizeOptions: { value: ReaderFontSize; label: string; description: string }[] = [
  { value: 'small', label: '小', description: '一画面の情報量を増やします' },
  { value: 'medium', label: '中', description: '標準的な読みやすさです' },
  { value: 'large', label: '大', description: '長文を追いやすくします' },
]

export function DisplaySettingsModal({
  isOpen,
  onClose,
  onChange,
}: DisplaySettingsModalProps) {
  const [settings, setSettings] = useState<DisplaySettings>({
    adBlockEnabled: true,
    readerWidth: 'comfortable',
    readerFontSize: 'medium',
  })

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const loadSettings = async () => {
      try {
        const nextSettings = await window.displaySettings.get()
        setSettings(nextSettings)
      } catch (error) {
        console.error('Failed to load display settings:', error)
      }
    }

    void loadSettings()
  }, [isOpen])

  const updateSettings = async (partial: Partial<DisplaySettings>) => {
    try {
      const nextSettings = await window.displaySettings.update(partial)
      setSettings(nextSettings)
      await onChange()
    } catch (error) {
      console.error('Failed to update display settings:', error)
    }
  }

  const resetSettings = async () => {
    try {
      const nextSettings = await window.displaySettings.reset()
      setSettings(nextSettings)
      await onChange()
    } catch (error) {
      console.error('Failed to reset display settings:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="display-settings-overlay" onClick={onClose}>
      <div className="display-settings-modal" onClick={event => event.stopPropagation()}>
        <div className="display-settings-header">
          <div className="display-settings-title">
            <h2>表示カスタマイズ</h2>
            <p>作品ページの読みやすさをすばやく調整できます</p>
          </div>
          <div className="display-settings-actions">
            <button type="button" className="display-settings-reset" onClick={() => void resetSettings()}>
              初期値に戻す
            </button>
            <button type="button" className="display-settings-close" onClick={onClose} title="閉じる">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="display-settings-content">
          <section className="display-settings-card">
            <div className="display-settings-card-header">
              <Type size={16} />
              <h3>広告ブロック</h3>
            </div>
            <label className="display-settings-toggle">
              <div>
                <strong>作品ページで広告を非表示にする</strong>
                <p>本文の周辺にある要素を減らして読みやすくします。</p>
              </div>
              <input
                type="checkbox"
                checked={settings.adBlockEnabled}
                onChange={event => void updateSettings({ adBlockEnabled: event.target.checked })}
              />
            </label>
          </section>

          <section className="display-settings-card">
            <div className="display-settings-card-header">
              <RectangleHorizontal size={16} />
              <h3>本文の横幅</h3>
            </div>
            <div className="display-settings-options">
              {widthOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`display-settings-option ${settings.readerWidth === option.value ? 'active' : ''}`}
                  onClick={() => void updateSettings({ readerWidth: option.value })}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="display-settings-card">
            <div className="display-settings-card-header">
              <Text size={16} />
              <h3>本文の文字サイズ</h3>
            </div>
            <div className="display-settings-options">
              {fontSizeOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`display-settings-option ${settings.readerFontSize === option.value ? 'active' : ''}`}
                  onClick={() => void updateSettings({ readerFontSize: option.value })}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
