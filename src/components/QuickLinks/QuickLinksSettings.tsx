import { useState, useEffect } from 'react';
import { X, Trash2, GripVertical, Edit2, Check, Folder, FolderPlus, Download, Upload } from 'lucide-react';
import type { QuickLink, QuickLinkFolder, QuickLinksData } from '../../type/quick-links';
import './QuickLinksSettings.css';

interface QuickLinksSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function QuickLinksSettings({ isOpen, onClose, onUpdate }: QuickLinksSettingsProps) {
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [folders, setFolders] = useState<QuickLinkFolder[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [draggedLinkId, setDraggedLinkId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadQuickLinks();
    }
  }, [isOpen]);

  const loadQuickLinks = async () => {
    try {
      const data: QuickLinksData = await window.quickLinks.get();
      setQuickLinks(data.links);
      setFolders(data.folders);
    } catch (error) {
      console.error('Failed to load quick links:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.quickLinks.delete(id);
      await loadQuickLinks();
      onUpdate();
    } catch (error) {
      console.error('Failed to delete quick link:', error);
    }
  };

  const handleStartEdit = (link: QuickLink) => {
    setEditingId(link.id);
    setEditTitle(link.title);
    setEditUrl(link.url);
    setEditFolderId(link.folderId || null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    try {
      const link = quickLinks.find(l => l.id === editingId);
      if (link) {
        await window.quickLinks.update({
          ...link,
          title: editTitle,
          url: editUrl,
          folderId: editFolderId,
        });
        await loadQuickLinks();
        onUpdate();
        setEditingId(null);
      }
    } catch (error) {
      console.error('Failed to update quick link:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditUrl('');
    setEditFolderId(null);
  };

  const handleAddFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      await window.quickLinks.addFolder({ name: newFolderName.trim() });
      await loadQuickLinks();
      onUpdate();
      setNewFolderName('');
      setIsAddingFolder(false);
    } catch (error) {
      console.error('Failed to add folder:', error);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('このフォルダを削除しますか？フォルダ内のリンクは移動されます。')) return;

    try {
      await window.quickLinks.deleteFolder(id);
      await loadQuickLinks();
      onUpdate();
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const handleStartEditFolder = (folder: QuickLinkFolder) => {
    setEditingFolderId(folder.id);
    setEditFolderName(folder.name);
  };

  const handleSaveEditFolder = async () => {
    if (!editingFolderId) return;

    try {
      const folder = folders.find(f => f.id === editingFolderId);
      if (folder) {
        await window.quickLinks.updateFolder({
          ...folder,
          name: editFolderName,
        });
        await loadQuickLinks();
        onUpdate();
        setEditingFolderId(null);
      }
    } catch (error) {
      console.error('Failed to update folder:', error);
    }
  };

  const handleCancelEditFolder = () => {
    setEditingFolderId(null);
    setEditFolderName('');
  };

  // ドラッグ&ドロップハンドラー
  const handleDragStart = (linkId: string) => {
    setDraggedLinkId(linkId);
  };

  const handleDragEnd = () => {
    setDraggedLinkId(null);
    setDragOverFolderId(null);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = () => {
    setDragOverFolderId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();

    if (!draggedLinkId) return;

    const link = quickLinks.find(l => l.id === draggedLinkId);
    if (!link) return;

    // すでに同じフォルダにいる場合は何もしない
    if (link.folderId === targetFolderId) {
      setDraggedLinkId(null);
      setDragOverFolderId(null);
      return;
    }

    try {
      await window.quickLinks.update({
        ...link,
        folderId: targetFolderId,
      });
      await loadQuickLinks();
      onUpdate();
    } catch (error) {
      console.error('Failed to move link to folder:', error);
    } finally {
      setDraggedLinkId(null);
      setDragOverFolderId(null);
    }
  };

  const handleExport = async () => {
    try {
      const data = await window.quickLinks.export();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quicklinks-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export quick links:', error);
      alert('エクスポートに失敗しました');
    }
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // データの検証
        if (!data.links || !Array.isArray(data.links)) {
          throw new Error('Invalid data format');
        }

        if (!confirm('現在のクイックリンクをインポートしたデータで置き換えますか?')) {
          return;
        }

        await window.quickLinks.import(data);
        await loadQuickLinks();
        onUpdate();
        alert('インポートが完了しました');
      } catch (error) {
        console.error('Failed to import quick links:', error);
        alert('インポートに失敗しました。ファイル形式を確認してください。');
      }
    };
    input.click();
  };

  if (!isOpen) return null;

  // リンクをフォルダごとにグループ化
  const rootLinks = quickLinks.filter(link => !link.folderId);
  const linksByFolder = quickLinks.reduce((acc, link) => {
    if (link.folderId) {
      if (!acc[link.folderId]) acc[link.folderId] = [];
      acc[link.folderId].push(link);
    }
    return acc;
  }, {} as Record<string, QuickLink[]>);

  return (
    <div className="quick-links-settings-overlay" onClick={onClose}>
      <div className="quick-links-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>クイックリンク管理</h2>
          <div className="header-actions">
            <button onClick={handleExport} className="export-button" title="エクスポート">
              <Download size={18} />
              <span>エクスポート</span>
            </button>
            <button onClick={handleImport} className="import-button" title="インポート">
              <Upload size={18} />
              <span>インポート</span>
            </button>
            <button onClick={onClose} className="close-button" title="閉じる">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="settings-modal-content">
          {/* フォルダ管理セクション */}
          <div className="folders-section">
            <div className="section-header">
              <h3>フォルダ</h3>
              <button
                type="button"
                onClick={() => setIsAddingFolder(true)}
                className="add-folder-button"
                title="フォルダを追加"
              >
                <FolderPlus size={16} />
                <span>追加</span>
              </button>
            </div>

            {isAddingFolder && (
              <div className="add-folder-form">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="フォルダ名"
                  className="folder-name-input"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddFolder();
                    if (e.key === 'Escape') setIsAddingFolder(false);
                  }}
                />
                <div className="folder-form-actions">
                  <button onClick={handleAddFolder} className="save-folder-button" aria-label="保存">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setIsAddingFolder(false)} className="cancel-folder-button" aria-label="キャンセル">
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}

            {folders.length > 0 && (
              <div className="folders-list">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className={`folder-item ${dragOverFolderId === folder.id ? 'drag-over' : ''}`}
                    onDragOver={(e) => handleDragOver(e, folder.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, folder.id)}
                  >
                    {editingFolderId === folder.id ? (
                      <div className="folder-edit-form">
                        <input
                          type="text"
                          value={editFolderName}
                          onChange={(e) => setEditFolderName(e.target.value)}
                          className="folder-name-input"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditFolder();
                            if (e.key === 'Escape') handleCancelEditFolder();
                          }}
                        />
                        <div className="folder-form-actions">
                          <button onClick={handleSaveEditFolder} className="save-folder-button" aria-label="保存">
                            <Check size={16} />
                          </button>
                          <button onClick={handleCancelEditFolder} className="cancel-folder-button" aria-label="キャンセル">
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Folder size={16} className="folder-item-icon" />
                        <span className="folder-item-name">{folder.name}</span>
                        <span className="folder-item-count">({linksByFolder[folder.id]?.length || 0})</span>
                        <div className="folder-item-actions">
                          <button
                            onClick={() => handleStartEditFolder(folder)}
                            className="action-button edit-button"
                            title="編集"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteFolder(folder.id)}
                            className="action-button delete-button"
                            title="削除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* リンク管理セクション */}
          <div className="links-section">
            <h3>リンク</h3>
            {quickLinks.length === 0 ? (
              <div className="settings-empty-state">
                <p>クイックリンクがありません</p>
                <p className="settings-empty-hint">
                  ブラウザのブックマークボタンから追加できます
                </p>
              </div>
            ) : (
              <div className="quick-links-settings-list">
                {/* ルートレベルのリンク */}
                {rootLinks.length > 0 && (
                  <div
                    className={`links-group ${dragOverFolderId === null ? 'drag-over' : ''}`}
                    onDragOver={(e) => handleDragOver(e, null)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, null)}
                  >
                    <div className="links-group-header">未分類</div>
                    {rootLinks.map((link) => (
                      <div
                        key={link.id}
                        className={`quick-link-settings-item ${draggedLinkId === link.id ? 'dragging' : ''}`}
                        draggable={editingId !== link.id}
                        onDragStart={() => handleDragStart(link.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="drag-handle" title="ドラッグして並び替え">
                          <GripVertical size={18} />
                        </div>

                        {editingId === link.id ? (
                          <div className="quick-link-edit-form">
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              placeholder="タイトル"
                              className="edit-input edit-title-input"
                              autoFocus
                            />
                            <input
                              type="url"
                              value={editUrl}
                              onChange={(e) => setEditUrl(e.target.value)}
                              placeholder="URL"
                              className="edit-input edit-url-input"
                            />
                            <select
                              value={editFolderId || ''}
                              onChange={(e) => setEditFolderId(e.target.value || null)}
                              className="edit-input edit-folder-select"
                              aria-label="フォルダを選択"
                            >
                              <option value="">フォルダなし</option>
                              {folders.map((folder) => (
                                <option key={folder.id} value={folder.id}>
                                  {folder.name}
                                </option>
                              ))}
                            </select>
                            <div className="edit-actions">
                              <button
                                onClick={handleSaveEdit}
                                className="edit-save-button"
                                title="保存"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="edit-cancel-button"
                                title="キャンセル"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="quick-link-info">
                              <div className="quick-link-settings-title">{link.title}</div>
                              <div className="quick-link-settings-url">{link.url}</div>
                            </div>

                            <div className="quick-link-actions">
                              <button
                                onClick={() => handleStartEdit(link)}
                                className="action-button edit-button"
                                title="編集"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(link.id)}
                                className="action-button delete-button"
                                title="削除"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* フォルダごとのリンク */}
                {folders.map((folder) => {
                  const folderLinks = linksByFolder[folder.id] || [];
                  if (folderLinks.length === 0) return null;

                  return (
                    <div
                      key={folder.id}
                      className={`links-group ${dragOverFolderId === folder.id ? 'drag-over' : ''}`}
                      onDragOver={(e) => handleDragOver(e, folder.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, folder.id)}
                    >
                      <div className="links-group-header">
                        <Folder size={14} />
                        <span>{folder.name}</span>
                      </div>
                      {folderLinks.map((link) => (
                        <div
                          key={link.id}
                          className={`quick-link-settings-item ${draggedLinkId === link.id ? 'dragging' : ''}`}
                          draggable={editingId !== link.id}
                          onDragStart={() => handleDragStart(link.id)}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="drag-handle" title="ドラッグして並び替え">
                            <GripVertical size={18} />
                          </div>

                          {editingId === link.id ? (
                            <div className="quick-link-edit-form">
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="タイトル"
                                className="edit-input edit-title-input"
                                autoFocus
                              />
                              <input
                                type="url"
                                value={editUrl}
                                onChange={(e) => setEditUrl(e.target.value)}
                                placeholder="URL"
                                className="edit-input edit-url-input"
                              />
                              <select
                                value={editFolderId || ''}
                                onChange={(e) => setEditFolderId(e.target.value || null)}
                                className="edit-input edit-folder-select"
                                aria-label="フォルダを選択"
                              >
                                <option value="">フォルダなし</option>
                                {folders.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                              <div className="edit-actions">
                                <button
                                  onClick={handleSaveEdit}
                                  className="edit-save-button"
                                  title="保存"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="edit-cancel-button"
                                  title="キャンセル"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="quick-link-info">
                                <div className="quick-link-settings-title">{link.title}</div>
                                <div className="quick-link-settings-url">{link.url}</div>
                              </div>

                              <div className="quick-link-actions">
                                <button
                                  onClick={() => handleStartEdit(link)}
                                  className="action-button edit-button"
                                  title="編集"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDelete(link.id)}
                                  className="action-button delete-button"
                                  title="削除"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
