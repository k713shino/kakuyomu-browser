import { useEffect, useMemo, useState } from 'react'
import { BellRing, Check, Database, Download, Edit2, Folder, FolderPlus, GripVertical, Keyboard, LayoutGrid, Link2, RefreshCw, Search, Tag, Trash2, Type, Upload, X } from 'lucide-react'
import { extractWorkId } from '../../lib/browser'
import { normalizeQuickLinkUrl } from '../../lib/quickLinks'
import type { DisplaySettings, ReaderFontSize, ReaderWidth } from '../../type/display-settings'
import type { EpisodeCompletionItem } from '../../type/episode-completion'
import type { QuickLink, QuickLinkFolder, QuickLinksData } from '../../type/quick-links'
import './QuickLinksSettings.css'

interface QuickLinksSettingsProps {
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
  onDisplaySettingsChange: () => void | Promise<void>
}

type SettingsSection = 'overview' | 'display' | 'folders' | 'links' | 'data'

const SECTION_LABELS: Record<SettingsSection, string> = {
  overview: '概要',
  display: '表示カスタマイズ',
  folders: 'フォルダ',
  links: 'リンク',
  data: 'データ管理',
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

const parseTags = (value: string) => [...new Set(value.split(',').map(tag => tag.trim()).filter(Boolean))]

export function QuickLinksSettings({ isOpen, onClose, onUpdate, onDisplaySettingsChange }: QuickLinksSettingsProps) {
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([])
  const [folders, setFolders] = useState<QuickLinkFolder[]>([])
  const [completionMap, setCompletionMap] = useState<Record<string, EpisodeCompletionItem>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editFolderId, setEditFolderId] = useState<string | null>(null)
  const [editTags, setEditTags] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [isAddingFolder, setIsAddingFolder] = useState(false)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [draggedLinkId, setDraggedLinkId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFolderFilter, setSelectedFolderFilter] = useState('all')
  const [selectedTagFilter, setSelectedTagFilter] = useState('all')
  const [activeSection, setActiveSection] = useState<SettingsSection>('overview')
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>({
    adBlockEnabled: true,
    autoReadEnabled: false,
    readerWidth: 'comfortable',
    readerFontSize: 'medium',
    speechSpeed: 1.05,
    speechIntonation: 1.15,
    speechSpeakerUuid: null,
    speechStyleId: null,
    speechDictionary: [],
    speechWorkDictionaries: {},
  })

  useEffect(() => {
    if (isOpen) {
      setActiveSection('display')
      void loadAll()
      void loadDisplaySettings()
    }
  }, [isOpen])

  const loadAll = async () => {
    try {
      const [data, completionItems] = await Promise.all([window.quickLinks.get(), window.episodeCompletion.getAll()])
      setQuickLinks(data.links)
      setFolders(data.folders)
      const nextMap: Record<string, EpisodeCompletionItem> = {}
      completionItems.forEach(item => {
        nextMap[item.workId] = item
      })
      setCompletionMap(nextMap)
    } catch (error) {
      console.error('Failed to load quick links data:', error)
    }
  }

  const loadDisplaySettings = async () => {
    try {
      setDisplaySettings(await window.displaySettings.get())
    } catch (error) {
      console.error('Failed to load display settings:', error)
    }
  }

  const handleDisplaySettingChange = async (nextSettings: Partial<DisplaySettings>) => {
    try {
      setDisplaySettings(await window.displaySettings.update(nextSettings))
      await onDisplaySettingsChange()
    } catch (error) {
      console.error('Failed to update display settings:', error)
    }
  }

  const handleResetDisplaySettings = async () => {
    try {
      setDisplaySettings(await window.displaySettings.reset())
      await onDisplaySettingsChange()
    } catch (error) {
      console.error('Failed to reset display settings:', error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await window.quickLinks.delete(id)
      await loadAll()
      onUpdate()
    } catch (error) {
      console.error('Failed to delete quick link:', error)
    }
  }

  const handleStartEdit = (link: QuickLink) => {
    setEditingId(link.id)
    setEditTitle(link.title)
    setEditUrl(link.url)
    setEditFolderId(link.folderId || null)
    setEditTags((link.tags ?? []).join(', '))
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    try {
      const link = quickLinks.find(item => item.id === editingId)
      if (!link) return
      await window.quickLinks.update({ ...link, title: editTitle.trim(), url: editUrl.trim(), folderId: editFolderId, tags: parseTags(editTags) })
      await loadAll()
      onUpdate()
      setEditingId(null)
    } catch (error) {
      console.error('Failed to update quick link:', error)
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
    setEditUrl('')
    setEditFolderId(null)
    setEditTags('')
  }

  const handleAddFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await window.quickLinks.addFolder({ name: newFolderName.trim() })
      await loadAll()
      onUpdate()
      setNewFolderName('')
      setIsAddingFolder(false)
    } catch (error) {
      console.error('Failed to add folder:', error)
    }
  }

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('このフォルダを削除しますか？フォルダ内のリンクは移動されます。')) return
    try {
      await window.quickLinks.deleteFolder(id)
      await loadAll()
      onUpdate()
    } catch (error) {
      console.error('Failed to delete folder:', error)
    }
  }

  const handleSaveEditFolder = async () => {
    if (!editingFolderId) return
    try {
      const folder = folders.find(item => item.id === editingFolderId)
      if (!folder) return
      await window.quickLinks.updateFolder({ ...folder, name: editFolderName.trim() })
      await loadAll()
      onUpdate()
      setEditingFolderId(null)
    } catch (error) {
      console.error('Failed to update folder:', error)
    }
  }

  const handleDrop = async (event: React.DragEvent, targetFolderId: string | null) => {
    event.preventDefault()
    if (!draggedLinkId) return
    const link = quickLinks.find(item => item.id === draggedLinkId)
    if (!link || link.folderId === targetFolderId) {
      setDraggedLinkId(null)
      setDragOverFolderId(null)
      return
    }
    try {
      await window.quickLinks.update({ ...link, folderId: targetFolderId })
      await loadAll()
      onUpdate()
    } catch (error) {
      console.error('Failed to move link to folder:', error)
    } finally {
      setDraggedLinkId(null)
      setDragOverFolderId(null)
    }
  }

  const handleExport = async () => {
    try {
      const data = await window.quickLinks.export()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `quicklinks-${new Date().toISOString().split('T')[0]}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export quick links:', error)
      alert('エクスポートに失敗しました')
    }
  }

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = async event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const data = JSON.parse(await file.text())
        if (!data.links || !Array.isArray(data.links)) throw new Error('Invalid data format')
        if (!confirm('現在のクイックリンクをインポートしたデータで置き換えますか?')) return
        await window.quickLinks.import(data)
        await loadAll()
        onUpdate()
        alert('インポートが完了しました')
      } catch (error) {
        console.error('Failed to import quick links:', error)
        alert('インポートに失敗しました。ファイル形式を確認してください。')
      }
    }
    input.click()
  }

  const handleCheckUpdates = async () => {
    try {
      setIsCheckingUpdates(true)
      await window.quickLinks.checkUpdates()
      await loadAll()
      onUpdate()
    } catch (error) {
      console.error('Failed to check quick link updates:', error)
      alert('更新チェックに失敗しました')
    } finally {
      setIsCheckingUpdates(false)
    }
  }

  const availableTags = useMemo(() => [...new Set(quickLinks.flatMap(link => link.tags ?? []))].sort((a, b) => a.localeCompare(b, 'ja')), [quickLinks])
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const visibleLinks = useMemo(() => quickLinks.filter(link => {
    const matchesSearch = normalizedQuery.length === 0 ||
      link.title.toLowerCase().includes(normalizedQuery) ||
      normalizeQuickLinkUrl(link.url).toLowerCase().includes(normalizedQuery) ||
      (link.tags ?? []).some(tag => tag.toLowerCase().includes(normalizedQuery))
    const matchesFolder = selectedFolderFilter === 'all' || (selectedFolderFilter === 'root' ? !link.folderId : link.folderId === selectedFolderFilter)
    const matchesTag = selectedTagFilter === 'all' || (selectedTagFilter === 'untagged' ? (link.tags?.length ?? 0) === 0 : (link.tags ?? []).includes(selectedTagFilter))
    return matchesSearch && matchesFolder && matchesTag
  }), [normalizedQuery, quickLinks, selectedFolderFilter, selectedTagFilter])

  const rootLinks = visibleLinks.filter(link => !link.folderId)
  const linksByFolder = visibleLinks.reduce((acc, link) => {
    if (link.folderId) {
      if (!acc[link.folderId]) acc[link.folderId] = []
      acc[link.folderId].push(link)
    }
    return acc
  }, {} as Record<string, QuickLink[]>)

  const trackedWorkCount = quickLinks.filter(link => Boolean(link.workId ?? extractWorkId(link.url))).length
  const totalUnreadCount = quickLinks.reduce((sum, link) => sum + (link.unreadEpisodeCount ?? 0), 0)
  const taggedLinksCount = quickLinks.filter(link => (link.tags?.length ?? 0) > 0).length
  const quickLinksInFolders = quickLinks.filter(link => link.folderId).length
  const rootQuickLinksCount = quickLinks.length - quickLinksInFolders

  const renderLinkMeta = (link: QuickLink) => {
    const workId = link.workId ?? extractWorkId(link.url)
    const completedCount = workId ? completionMap[workId]?.completedEpisodes.length ?? 0 : 0
    const totalEpisodes = link.totalEpisodes ?? null
    return (
      <div className="quick-link-meta-stack">
        {(link.tags?.length ?? 0) > 0 && <div className="tag-chip-list">{link.tags?.map(tag => <span key={`${link.id}-${tag}`} className="tag-chip">#{tag}</span>)}</div>}
        {(totalEpisodes !== null || (link.unreadEpisodeCount ?? 0) > 0 || link.lastKnownEpisodeTitle) && (
          <div className="quick-link-status-row">
            {workId && <span className="link-status-chip progress">{totalEpisodes !== null ? `${completedCount}/${totalEpisodes}話` : `${completedCount}話読了`}</span>}
            {(link.unreadEpisodeCount ?? 0) > 0 && <span className="link-status-chip unread">新着 {link.unreadEpisodeCount}話</span>}
            {link.lastKnownEpisodeTitle && <span className="link-status-chip latest" title={link.lastKnownEpisodeTitle}>最新: {link.lastKnownEpisodeTitle}</span>}
          </div>
        )}
      </div>
    )
  }

  const renderLinkItem = (link: QuickLink) => (
    <div key={link.id} className={`quick-link-settings-item ${draggedLinkId === link.id ? 'dragging' : ''}`} draggable={editingId !== link.id} onDragStart={() => setDraggedLinkId(link.id)} onDragEnd={() => { setDraggedLinkId(null); setDragOverFolderId(null) }}>
      <div className="drag-handle" title="ドラッグして並び替え"><GripVertical size={18} /></div>
      {editingId === link.id ? (
        <div className="quick-link-edit-form">
          <input type="text" value={editTitle} onChange={event => setEditTitle(event.target.value)} placeholder="タイトル" className="edit-input" autoFocus />
          <input type="url" value={editUrl} onChange={event => setEditUrl(event.target.value)} placeholder="URL" className="edit-input" />
          <select value={editFolderId || ''} onChange={event => setEditFolderId(event.target.value || null)} className="edit-input" aria-label="フォルダを選択">
            <option value="">フォルダなし</option>
            {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          <input type="text" value={editTags} onChange={event => setEditTags(event.target.value)} placeholder="タグをカンマ区切りで入力" className="edit-input" />
          <div className="edit-actions">
            <button onClick={() => void handleSaveEdit()} className="edit-save-button" title="保存"><Check size={16} /></button>
            <button onClick={handleCancelEdit} className="edit-cancel-button" title="キャンセル"><X size={16} /></button>
          </div>
        </div>
      ) : (
        <>
          <div className="quick-link-info">
            <div className="quick-link-settings-title">{link.title}</div>
            <div className="quick-link-settings-url">{link.url}</div>
            {renderLinkMeta(link)}
          </div>
          <div className="quick-link-actions">
            <button onClick={() => handleStartEdit(link)} className="action-button edit-button" title="編集"><Edit2 size={16} /></button>
            <button onClick={() => void handleDelete(link.id)} className="action-button delete-button" title="削除"><Trash2 size={16} /></button>
          </div>
        </>
      )}
    </div>
  )

  if (!isOpen) return null

  return (
    <div className="quick-links-settings-overlay" onClick={onClose}>
      <div className="quick-links-settings-modal" onClick={event => event.stopPropagation()}>
        <div className="settings-modal-header">
          <div className="settings-modal-heading">
            <h2>設定と管理</h2>
            <p>クイックリンク、更新チェック、タグ整理、表示設定をまとめて管理できます</p>
          </div>
          <div className="header-actions">
            <button onClick={() => void handleCheckUpdates()} className="secondary-action-button" title="更新チェック" disabled={isCheckingUpdates}>
              <RefreshCw size={18} className={isCheckingUpdates ? 'spin' : undefined} />
              <span>{isCheckingUpdates ? '確認中...' : '更新チェック'}</span>
            </button>
            <button onClick={handleExport} className="export-button" title="エクスポート"><Download size={18} /><span>エクスポート</span></button>
            <button onClick={handleImport} className="import-button" title="インポート"><Upload size={18} /><span>インポート</span></button>
            <button onClick={onClose} className="close-button" title="閉じる"><X size={20} /></button>
          </div>
        </div>

        <div className="settings-layout">
          <aside className="settings-sidebar">
            {(Object.keys(SECTION_LABELS) as SettingsSection[]).map(section => (
              <button key={section} type="button" className={`settings-nav-item ${activeSection === section ? 'active' : ''}`} onClick={() => setActiveSection(section)}>
                {section === 'overview' && <LayoutGrid size={16} />}
                {section === 'display' && <Type size={16} />}
                {section === 'folders' && <Folder size={16} />}
                {section === 'links' && <Link2 size={16} />}
                {section === 'data' && <Database size={16} />}
                <span>{SECTION_LABELS[section]}</span>
              </button>
            ))}
          </aside>

          <div className="settings-modal-content">
            {activeSection === 'overview' && <div className="settings-panel"><div className="section-header"><h3>概要</h3></div><div className="settings-overview-grid"><div className="overview-card"><span className="overview-card-label">保存リンク数</span><strong>{quickLinks.length}</strong><p>よく開く作品やページをすばやく再訪できます</p></div><div className="overview-card"><span className="overview-card-label">追跡中の作品</span><strong>{trackedWorkCount}</strong><p>更新チェックと読書進捗の対象作品です</p></div><div className="overview-card"><span className="overview-card-label">新着エピソード</span><strong>{totalUnreadCount}</strong><p>未読として見えている話数です</p></div><div className="overview-card"><span className="overview-card-label">タグ付きリンク</span><strong>{taggedLinksCount}</strong><p>フォルダに加えてタグでも分類できます</p></div><div className="overview-card"><span className="overview-card-label">未分類リンク</span><strong>{rootQuickLinksCount}</strong><p>あとで整理する候補です</p></div><div className="overview-card"><span className="overview-card-label">フォルダ数</span><strong>{folders.length}</strong><p>用途や作品群ごとに整理できます</p></div></div><div className="settings-guide-card"><div className="section-header compact"><h3>今回強化したポイント</h3></div><ul className="settings-guide-list"><li>更新チェックでブックマーク作品の新着話数を見つけやすくしました</li><li>フォルダに加えてタグで作品を横断的に分類できます</li><li>各作品の読了数と総話数から進捗を可視化できます</li></ul></div><div className="settings-guide-card"><div className="section-header compact"><h3>主なショートカット</h3></div><div className="shortcut-list"><div className="shortcut-item"><Keyboard size={15} /><span>Alt + Left</span><span>戻る</span></div><div className="shortcut-item"><Keyboard size={15} /><span>Alt + Right</span><span>進む</span></div><div className="shortcut-item"><Keyboard size={15} /><span>Ctrl + H</span><span>読書履歴</span></div><div className="shortcut-item"><Keyboard size={15} /><span>Ctrl + B</span><span>サイドバー</span></div></div></div></div>}

            {activeSection === 'display' && <div className="settings-panel"><div className="section-header"><h3>表示カスタマイズ</h3><button type="button" className="secondary-action-button" onClick={() => void handleResetDisplaySettings()}>初期値に戻す</button></div><div className="settings-guide-card"><div className="section-header compact"><h3>広告ブロック</h3></div><label className="setting-toggle"><div className="setting-toggle-copy"><strong>作品ページで広告を非表示にする</strong><span>読みやすさを優先したいときに便利です</span></div><input type="checkbox" checked={displaySettings.adBlockEnabled} onChange={event => void handleDisplaySettingChange({ adBlockEnabled: event.target.checked })} /></label></div><div className="settings-guide-card"><div className="section-header compact"><h3>本文の横幅</h3></div><div className="option-grid">{widthOptions.map(option => <button key={option.value} type="button" className={`option-card ${displaySettings.readerWidth === option.value ? 'active' : ''}`} onClick={() => void handleDisplaySettingChange({ readerWidth: option.value })}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div></div><div className="settings-guide-card"><div className="section-header compact"><h3>本文の文字サイズ</h3></div><div className="option-grid">{fontSizeOptions.map(option => <button key={option.value} type="button" className={`option-card ${displaySettings.readerFontSize === option.value ? 'active' : ''}`} onClick={() => void handleDisplaySettingChange({ readerFontSize: option.value })}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div></div></div>}

            {activeSection === 'folders' && <div className="settings-panel"><div className="section-header"><h3>フォルダ</h3><button type="button" onClick={() => setIsAddingFolder(true)} className="add-folder-button" title="フォルダを追加"><FolderPlus size={16} /><span>追加</span></button></div>{isAddingFolder && <div className="add-folder-form"><input type="text" value={newFolderName} onChange={event => setNewFolderName(event.target.value)} placeholder="フォルダ名" title="フォルダ名" aria-label="フォルダ名" className="folder-name-input" autoFocus onKeyDown={event => { if (event.key === 'Enter') void handleAddFolder(); if (event.key === 'Escape') setIsAddingFolder(false) }} /><div className="folder-form-actions"><button onClick={() => void handleAddFolder()} className="save-folder-button" aria-label="保存"><Check size={16} /></button><button onClick={() => setIsAddingFolder(false)} className="cancel-folder-button" aria-label="キャンセル"><X size={16} /></button></div></div>}{folders.length === 0 ? <div className="settings-empty-state"><p>フォルダはまだありません</p><p className="settings-empty-hint">作品群や用途ごとに追加すると整理しやすくなります</p></div> : <div className="folders-list">{folders.map(folder => <div key={folder.id} className={`folder-item ${dragOverFolderId === folder.id ? 'drag-over' : ''}`} onDragOver={event => { event.preventDefault(); setDragOverFolderId(folder.id) }} onDragLeave={() => setDragOverFolderId(null)} onDrop={event => void handleDrop(event, folder.id)}>{editingFolderId === folder.id ? <div className="folder-edit-form"><input type="text" value={editFolderName} onChange={event => setEditFolderName(event.target.value)} title="フォルダ名を編集" aria-label="フォルダ名を編集" className="folder-name-input" autoFocus onKeyDown={event => { if (event.key === 'Enter') void handleSaveEditFolder(); if (event.key === 'Escape') { setEditingFolderId(null); setEditFolderName('') } }} /><div className="folder-form-actions"><button onClick={() => void handleSaveEditFolder()} className="save-folder-button" aria-label="保存"><Check size={16} /></button><button onClick={() => { setEditingFolderId(null); setEditFolderName('') }} className="cancel-folder-button" aria-label="キャンセル"><X size={16} /></button></div></div> : <><Folder size={16} className="folder-item-icon" /><span className="folder-item-name">{folder.name}</span><span className="folder-item-count">({linksByFolder[folder.id]?.length || 0})</span><div className="folder-item-actions"><button onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name) }} className="action-button edit-button" title="編集"><Edit2 size={14} /></button><button onClick={() => void handleDeleteFolder(folder.id)} className="action-button delete-button" title="削除"><Trash2 size={14} /></button></div></>}</div>)}</div>}</div>}

            {activeSection === 'links' && <div className="settings-panel"><div className="section-header"><h3>リンク</h3><span className="link-count-badge">{visibleLinks.length}件</span></div><div className="link-tools"><label className="link-search"><Search size={16} /><input type="text" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="タイトル・URL・タグで検索" title="クイックリンクを検索" aria-label="クイックリンクを検索" /></label><select className="link-filter-select" value={selectedFolderFilter} onChange={event => setSelectedFolderFilter(event.target.value)} title="フォルダで絞り込む" aria-label="フォルダで絞り込む"><option value="all">すべてのフォルダ</option><option value="root">未分類</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><select className="link-filter-select" value={selectedTagFilter} onChange={event => setSelectedTagFilter(event.target.value)} title="タグで絞り込む" aria-label="タグで絞り込む"><option value="all">すべてのタグ</option><option value="untagged">タグなし</option>{availableTags.map(tag => <option key={tag} value={tag}>#{tag}</option>)}</select></div>{quickLinks.length === 0 ? <div className="settings-empty-state"><p>クイックリンクがありません</p><p className="settings-empty-hint">ブラウザのブックマークボタンから追加できます</p></div> : visibleLinks.length === 0 ? <div className="settings-empty-state"><p>条件に一致するクイックリンクがありません</p><p className="settings-empty-hint">検索語やフォルダ・タグ条件を見直してください</p></div> : <div className="quick-links-settings-list">{rootLinks.length > 0 && <div className={`links-group ${dragOverFolderId === null ? 'drag-over' : ''}`} onDragOver={event => { event.preventDefault(); setDragOverFolderId(null) }} onDragLeave={() => setDragOverFolderId(null)} onDrop={event => void handleDrop(event, null)}><div className="links-group-header">未分類</div>{rootLinks.map(renderLinkItem)}</div>}{folders.map(folder => { const folderLinks = linksByFolder[folder.id] || []; if (folderLinks.length === 0) return null; return <div key={folder.id} className={`links-group ${dragOverFolderId === folder.id ? 'drag-over' : ''}`} onDragOver={event => { event.preventDefault(); setDragOverFolderId(folder.id) }} onDragLeave={() => setDragOverFolderId(null)} onDrop={event => void handleDrop(event, folder.id)}><div className="links-group-header"><Folder size={14} /><span>{folder.name}</span></div>{folderLinks.map(renderLinkItem)}</div> })}</div>}<div className="settings-guide-card"><div className="section-header compact"><h3>タグ活用のヒント</h3></div><ul className="settings-guide-list"><li>例: `積読`, `追いかけ中`, `完結済み`, `資料`, `お気に入り`</li><li>フォルダで大分類、タグで横断ラベルにすると探しやすくなります</li><li>更新チェック後は新着話数と進捗が各リンクに表示されます</li></ul></div></div>}

            {activeSection === 'data' && <div className="settings-panel"><div className="section-header"><h3>データ管理</h3></div><div className="settings-overview-grid"><button type="button" className="data-action-card" onClick={handleExport}><Download size={18} /><strong>エクスポート</strong><p>クイックリンク、フォルダ、タグ、更新チェック結果を JSON として保存します</p></button><button type="button" className="data-action-card" onClick={handleImport}><Upload size={18} /><strong>インポート</strong><p>バックアップ済みの JSON を読み込んで一覧を復元します</p></button><button type="button" className="data-action-card" onClick={() => void handleCheckUpdates()}><BellRing size={18} /><strong>更新チェック</strong><p>ブックマーク作品の新着エピソード数と総話数をまとめて再取得します</p></button><div className="data-action-card static-card"><Tag size={18} /><strong>タグ一覧</strong><p>{availableTags.length > 0 ? availableTags.map(tag => `#${tag}`).join(' ') : 'タグはまだありません'}</p></div></div><div className="settings-guide-card"><div className="section-header compact"><h3>注意点</h3></div><ul className="settings-guide-list"><li>インポートすると現在のクイックリンク一覧は置き換えられます</li><li>更新チェックは作品ページを参照して進捗表示を更新します</li><li>大きく整理する前に一度エクスポートしておくと安心です</li></ul></div></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
