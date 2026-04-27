import { useEffect, useState } from 'react'
import { Type, X, RectangleHorizontal, Text, AudioLines, BookOpenCheck, Bell, RefreshCw } from 'lucide-react'
import { extractWorkId, isKakuyomuWorkUrl } from '../../lib/browser'
import type { DisplaySettings, ReaderFontSize, ReaderWidth, SpeechEngine } from '../../type/display-settings'
import './DisplaySettingsModal.css'

interface DisplaySettingsModalProps {
  currentUrl: string
  isOpen: boolean
  onClose: () => void
  onChange: () => void | Promise<void>
  onRequestSelectedText: () => Promise<string>
  prefillQuickAddText: string
  prefillQuickAddToken: number
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
  currentUrl,
  isOpen,
  onClose,
  onChange,
  onRequestSelectedText,
  prefillQuickAddText,
  prefillQuickAddToken,
}: DisplaySettingsModalProps) {
  const [settings, setSettings] = useState<DisplaySettings>({
    adBlockEnabled: true,
    autoReadEnabled: false,
    readerWidth: 'comfortable',
    readerFontSize: 'medium',
    speechSpeed: 1.05,
    speechIntonation: 1.15,
    speechVolume: 1.0,
    speechPitch: 0.0,
    speechEngine: 'auto',
    speechSpeakerUuid: null,
    speechStyleId: null,
    speechDictionary: [],
    speechWorkDictionaries: {},
    updateCheckEnabled: true,
    updateCheckIntervalHours: 3,
  })
  const [isCheckingNow, setIsCheckingNow] = useState(false)
  const [lastCheckResult, setLastCheckResult] = useState<string | null>(null)
  const [speakers, setSpeakers] = useState<AivisSpeechSpeaker[]>([])
  const [isSpeechLoading, setIsSpeechLoading] = useState(false)
  const [dictionaryText, setDictionaryText] = useState('')
  const [workDictionaryText, setWorkDictionaryText] = useState('')
  const [quickAddSource, setQuickAddSource] = useState('')
  const [quickAddReading, setQuickAddReading] = useState('')
  const [quickAddScope, setQuickAddScope] = useState<'global' | 'work'>('global')
  const [quickAddError, setQuickAddError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const loadSettings = async () => {
      try {
        setIsSpeechLoading(true)
        const nextSettings = await window.displaySettings.get()
        const nextSpeakers = await window.aivisSpeech.getSpeakers()
        setSettings(nextSettings)
        setDictionaryText(
          (nextSettings.speechDictionary ?? [])
            .map(entry => `${entry.from}=${entry.to}`)
            .join('\n'),
        )
        const workId = extractWorkId(currentUrl)
        setWorkDictionaryText(
          workId
            ? (nextSettings.speechWorkDictionaries?.[workId] ?? [])
                .map(entry => `${entry.from}=${entry.to}`)
                .join('\n')
            : '',
        )
        setSpeakers(nextSpeakers)
        setQuickAddSource('')
        setQuickAddReading('')
        setQuickAddError('')
        setQuickAddScope(workId ? 'work' : 'global')
      } catch (error) {
        console.error('Failed to load display settings:', error)
      } finally {
        setIsSpeechLoading(false)
      }
    }

    void loadSettings()
  }, [currentUrl, isOpen])

  useEffect(() => {
    if (!isOpen || prefillQuickAddToken === 0) {
      return
    }

    if (!prefillQuickAddText.trim()) {
      setQuickAddError('作品ページで追加したい語を選択してから「辞書追加」を押してください。')
      return
    }

    setQuickAddSource(prefillQuickAddText.trim())
    setQuickAddReading(prefillQuickAddText.trim())
    setQuickAddError('')
  }, [isOpen, prefillQuickAddText, prefillQuickAddToken])

  const updateSettings = async (partial: Partial<DisplaySettings>) => {
    try {
      const nextSettings = await window.displaySettings.update(partial)
      setSettings(nextSettings)
      await onChange()
      // エンジンが変わったらスピーカー一覧を即座に再取得する
      if ('speechEngine' in partial) {
        try {
          setIsSpeechLoading(true)
          const nextSpeakers = await window.aivisSpeech.getSpeakers()
          setSpeakers(nextSpeakers)
        } catch (error) {
          console.error('Failed to reload speakers after engine change:', error)
          setSpeakers([])
        } finally {
          setIsSpeechLoading(false)
        }
      }
    } catch (error) {
      console.error('Failed to update display settings:', error)
    }
  }

  const resetSettings = async () => {
    try {
      const nextSettings = await window.displaySettings.reset()
      setSettings(nextSettings)
      setDictionaryText(
        (nextSettings.speechDictionary ?? [])
          .map(entry => `${entry.from}=${entry.to}`)
          .join('\n'),
      )
      const workId = extractWorkId(currentUrl)
      setWorkDictionaryText(
        workId
          ? (nextSettings.speechWorkDictionaries?.[workId] ?? [])
              .map(entry => `${entry.from}=${entry.to}`)
              .join('\n')
          : '',
      )
      setQuickAddSource('')
      setQuickAddReading('')
      setQuickAddError('')
      setQuickAddScope(workId ? 'work' : 'global')
      await onChange()
    } catch (error) {
      console.error('Failed to reset display settings:', error)
    }
  }

  const selectedSpeaker =
    speakers.find(speaker => speaker.speakerUuid === settings.speechSpeakerUuid) ?? speakers[0] ?? null
  const selectedStyleId =
    selectedSpeaker?.styles.some(style => style.id === settings.speechStyleId)
      ? settings.speechStyleId
      : selectedSpeaker?.styles[0]?.id ?? null

  const saveDictionaryFromTexts = async (nextDictionaryText: string, nextWorkDictionaryText: string) => {
    const parseDictionaryText = (value: string) =>
      value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const separatorIndex = line.indexOf('=')
        if (separatorIndex === -1) {
          return null
        }

        const from = line.slice(0, separatorIndex).trim()
        const to = line.slice(separatorIndex + 1).trim()
        if (!from) {
          return null
        }

        return { from, to }
      })
      .filter((entry): entry is { from: string; to: string } => entry !== null)

    const workId = extractWorkId(currentUrl)
    const globalEntries = parseDictionaryText(nextDictionaryText)
    const nextWorkDictionaries = { ...(settings.speechWorkDictionaries ?? {}) }

    if (workId) {
      const workEntries = parseDictionaryText(nextWorkDictionaryText)
      if (workEntries.length > 0) {
        nextWorkDictionaries[workId] = workEntries
      } else {
        delete nextWorkDictionaries[workId]
      }
    }

    await updateSettings({
      speechDictionary: globalEntries,
      speechWorkDictionaries: nextWorkDictionaries,
    })
  }

  const saveDictionary = async () => saveDictionaryFromTexts(dictionaryText, workDictionaryText)

  const appendDictionaryLine = (currentValue: string, from: string, to: string) => {
    const trimmedFrom = from.trim()
    const trimmedTo = to.trim()
    if (!trimmedFrom || !trimmedTo) {
      return currentValue
    }

    const nextLine = `${trimmedFrom}=${trimmedTo}`
    const lines = currentValue
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    const existingIndex = lines.findIndex(line => {
      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) {
        return false
      }

      return line.slice(0, separatorIndex).trim() === trimmedFrom
    })

    if (existingIndex >= 0) {
      lines[existingIndex] = nextLine
    } else {
      lines.push(nextLine)
    }

    return lines.join('\n')
  }

  const importSelectedText = async () => {
    try {
      const selectedText = (await onRequestSelectedText()).trim()
      if (!selectedText) {
        setQuickAddError('作品ページで追加したい語を選択してから取り込んでください。')
        return
      }

      setQuickAddSource(selectedText)
      setQuickAddReading(selectedText)
      setQuickAddError('')
    } catch (error) {
      console.error('Failed to import selected text:', error)
      setQuickAddError('選択中の文字列を取り込めませんでした。')
    }
  }

  const addQuickDictionaryEntry = async () => {
    if (!quickAddSource.trim() || !quickAddReading.trim()) {
      setQuickAddError('語と読みを入れてください。')
      return
    }

    if (quickAddScope === 'work' && !currentWorkId) {
      setQuickAddError('作品別辞書は作品ページでのみ追加できます。')
      return
    }

    const nextDictionaryText =
      quickAddScope === 'global'
        ? appendDictionaryLine(dictionaryText, quickAddSource, quickAddReading)
        : dictionaryText
    const nextWorkDictionaryText =
      quickAddScope === 'work'
        ? appendDictionaryLine(workDictionaryText, quickAddSource, quickAddReading)
        : workDictionaryText

    setDictionaryText(nextDictionaryText)
    setWorkDictionaryText(nextWorkDictionaryText)

    setQuickAddError('')
    setQuickAddReading('')
    await saveDictionaryFromTexts(nextDictionaryText, nextWorkDictionaryText)
  }

  const currentWorkId = isKakuyomuWorkUrl(currentUrl) ? extractWorkId(currentUrl) : null

  const runCheckNow = async () => {
    setIsCheckingNow(true)
    setLastCheckResult(null)
    try {
      const links = await window.updateChecker.runNow()
      const newCount = links.filter((l: { unreadEpisodeCount?: number }) => (l.unreadEpisodeCount ?? 0) > 0).length
      setLastCheckResult(newCount > 0 ? `${newCount}件の作品に未読話があります` : 'すべて既読です')
    } catch (error) {
      console.error('Update check failed:', error)
      setLastCheckResult('チェックに失敗しました')
    } finally {
      setIsCheckingNow(false)
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
              <BookOpenCheck size={16} />
              <h3>連続読み</h3>
            </div>
            <label className="display-settings-toggle">
              <div>
                <strong>エピソード末尾で次話へ自動移動</strong>
                <p>ページ末尾までスクロールすると、次のエピソードへ自動で移動します。</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoReadEnabled}
                onChange={event => void updateSettings({ autoReadEnabled: event.target.checked })}
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

          <section className="display-settings-card">
            <div className="display-settings-card-header">
              <AudioLines size={16} />
              <h3>音声読み上げ</h3>
            </div>
            <div className="display-settings-speech-selects">
              <label className="display-settings-select-row">
                <span>話者</span>
                <select
                  value={selectedSpeaker?.speakerUuid ?? ''}
                  disabled={isSpeechLoading || speakers.length === 0}
                  onChange={event => {
                    const nextSpeaker = speakers.find(speaker => speaker.speakerUuid === event.target.value)
                    void updateSettings({
                      speechSpeakerUuid: nextSpeaker?.speakerUuid ?? null,
                      speechStyleId: nextSpeaker?.styles[0]?.id ?? null,
                    })
                  }}
                >
                  {speakers.length === 0 ? (
                    <option value="">AivisSpeech の話者が見つかりません</option>
                  ) : (
                    speakers.map(speaker => (
                      <option key={speaker.speakerUuid} value={speaker.speakerUuid}>
                        {speaker.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="display-settings-select-row">
                <span>話し方</span>
                <select
                  value={selectedStyleId ?? ''}
                  disabled={!selectedSpeaker}
                  onChange={event =>
                    void updateSettings({
                      speechSpeakerUuid: selectedSpeaker?.speakerUuid ?? null,
                      speechStyleId: parseInt(event.target.value, 10),
                    })
                  }
                >
                  {selectedSpeaker?.styles.map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name}
                    </option>
                  )) ?? <option value="">利用可能なスタイルがありません</option>}
                </select>
              </label>
            </div>
            <div className="display-settings-sliders">
              <div className="display-settings-slider-row">
                <div className="display-settings-slider-label">
                  <span>読み上げ速度</span>
                  <span className="display-settings-slider-value">×{settings.speechSpeed.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  title="読み上げ速度"
                  value={settings.speechSpeed}
                  onChange={event => void updateSettings({ speechSpeed: parseFloat(event.target.value) })}
                />
                <div className="display-settings-slider-ticks">
                  <span>遅い</span>
                  <span>標準</span>
                  <span>速い</span>
                </div>
              </div>
              <div className="display-settings-slider-row">
                <div className="display-settings-slider-label">
                  <span>イントネーション</span>
                  <span className="display-settings-slider-value">{settings.speechIntonation.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.05"
                  title="イントネーション"
                  value={settings.speechIntonation}
                  onChange={event => void updateSettings({ speechIntonation: parseFloat(event.target.value) })}
                />
                <div className="display-settings-slider-ticks">
                  <span>平坦</span>
                  <span>標準</span>
                  <span>抑揚強め</span>
                </div>
              </div>
              <div className="display-settings-slider-row">
                <div className="display-settings-slider-label">
                  <span>音量</span>
                  <span className="display-settings-slider-value">{Math.round(settings.speechVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  title="音量"
                  value={settings.speechVolume}
                  onChange={event => void updateSettings({ speechVolume: parseFloat(event.target.value) })}
                />
                <div className="display-settings-slider-ticks">
                  <span>小</span>
                  <span>標準</span>
                  <span>大</span>
                </div>
              </div>
              <div className="display-settings-slider-row">
                <div className="display-settings-slider-label">
                  <span>ピッチ補正</span>
                  <span className="display-settings-slider-value">{(settings.speechPitch >= 0 ? '+' : '') + settings.speechPitch.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="-0.15"
                  max="0.15"
                  step="0.01"
                  title="ピッチ補正"
                  value={settings.speechPitch}
                  onChange={event => void updateSettings({ speechPitch: parseFloat(event.target.value) })}
                />
                <div className="display-settings-slider-ticks">
                  <span>低め</span>
                  <span>標準(0)</span>
                  <span>高め</span>
                </div>
              </div>
            </div>
            <div className="display-settings-speech-selects display-settings-speech-engine">
              <label className="display-settings-select-row">
                <span>読み上げエンジン</span>
                <select
                  value={settings.speechEngine}
                  onChange={event => void updateSettings({ speechEngine: event.target.value as SpeechEngine })}
                >
                  <option value="auto">自動（AivisSpeech → VOICEVOX → システム TTS）</option>
                  <option value="aivis">AivisSpeech のみ</option>
                  <option value="voicevox">VOICEVOX のみ</option>
                  <option value="webspeech">システム TTS（WebSpeech）</option>
                </select>
              </label>
            </div>
            <div className="display-settings-dictionary">
              <div className="display-settings-dictionary-header">
                <strong>全体の読み辞書</strong>
                <button type="button" className="display-settings-dictionary-save" onClick={() => void saveDictionary()}>
                  辞書を保存
                </button>
              </div>
              <p>1行ごとに `置換前=置換後` で登録します。例: `主人公=しゅじんこう`</p>
              <textarea
                value={dictionaryText}
                onChange={event => setDictionaryText(event.target.value)}
                placeholder={'例:\n東雲=しののめ\n凪=なぎ'}
                spellCheck={false}
              />
            </div>
            <div className="display-settings-quick-add">
              <div className="display-settings-dictionary-header">
                <strong>その場で辞書追加</strong>
                <button
                  type="button"
                  className="display-settings-dictionary-save"
                  onClick={() => void importSelectedText()}
                >
                  選択語を取り込む
                </button>
              </div>
              {quickAddSource ? (
                <div className="display-settings-quick-add-selected">
                  <span>選択中の語</span>
                  <strong>{quickAddSource}</strong>
                </div>
              ) : null}
              <p>本文で選択した語をそのまま取り込んで、読みを付けて追加できます。</p>
              <div className="display-settings-quick-add-grid">
                <label className="display-settings-select-row">
                  <span>語</span>
                  <input
                    type="text"
                    value={quickAddSource}
                    onChange={event => setQuickAddSource(event.target.value)}
                    placeholder="例: 東雲"
                  />
                </label>
                <label className="display-settings-select-row">
                  <span>読み</span>
                  <input
                    type="text"
                    value={quickAddReading}
                    onChange={event => setQuickAddReading(event.target.value)}
                    placeholder="例: しののめ"
                  />
                </label>
              </div>
              <div className="display-settings-quick-add-actions">
                <label className="display-settings-select-row">
                  <span>追加先</span>
                  <select
                    value={quickAddScope}
                    onChange={event => setQuickAddScope(event.target.value as 'global' | 'work')}
                  >
                    <option value="global">全体の辞書</option>
                    <option value="work" disabled={!currentWorkId}>
                      この作品だけの辞書
                    </option>
                  </select>
                </label>
                <button
                  type="button"
                  className="display-settings-quick-add-submit"
                  onClick={() => void addQuickDictionaryEntry()}
                >
                  辞書に追加
                </button>
              </div>
              {quickAddError ? <p className="display-settings-quick-add-error">{quickAddError}</p> : null}
            </div>
            {currentWorkId && (
              <div className="display-settings-dictionary">
                <div className="display-settings-dictionary-header">
                  <strong>この作品だけの読み辞書</strong>
                </div>
                <p>現在の作品 `#{currentWorkId}` にだけ適用されます。</p>
                <textarea
                  value={workDictionaryText}
                  onChange={event => setWorkDictionaryText(event.target.value)}
                  placeholder={'例:\n白銀=しろがね\n皇=すめらぎ'}
                  spellCheck={false}
                />
              </div>
            )}
          </section>

          <section className="display-settings-card">
            <div className="display-settings-card-header">
              <Bell size={16} />
              <h3>更新通知</h3>
            </div>
            <label className="display-settings-toggle">
              <div>
                <strong>クイックリンクの新話を定期チェックする</strong>
                <p>クイックリンクに登録した作品の話数を定期的に確認し、新話があればデスクトップ通知でお知らせします。</p>
              </div>
              <input
                type="checkbox"
                checked={settings.updateCheckEnabled}
                onChange={event => void updateSettings({ updateCheckEnabled: event.target.checked })}
              />
            </label>
            {settings.updateCheckEnabled && (
              <>
                <label className="display-settings-select-row">
                  <span>チェック間隔</span>
                  <select
                    value={settings.updateCheckIntervalHours}
                    onChange={event => void updateSettings({ updateCheckIntervalHours: parseInt(event.target.value, 10) })}
                  >
                    <option value={1}>1時間ごと</option>
                    <option value={3}>3時間ごと</option>
                    <option value={6}>6時間ごと</option>
                    <option value={12}>12時間ごと</option>
                    <option value={24}>24時間ごと</option>
                  </select>
                </label>
                <div className="display-settings-update-check-actions">
                  <button
                    type="button"
                    className="display-settings-check-now-button"
                    onClick={() => void runCheckNow()}
                    disabled={isCheckingNow}
                  >
                    <RefreshCw size={14} className={isCheckingNow ? 'spinning' : ''} />
                    {isCheckingNow ? 'チェック中...' : '今すぐチェック'}
                  </button>
                  {lastCheckResult && (
                    <span className="display-settings-check-result">{lastCheckResult}</span>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
