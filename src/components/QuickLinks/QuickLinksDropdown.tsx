import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Bookmark, Plus, Settings, ExternalLink, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import type { QuickLink, QuickLinkFolder, QuickLinksData } from '../../type/quick-links';
import './QuickLinksDropdown.css';

interface QuickLinksDropdownProps {
  onNavigate: (url: string) => void;
  onOpenSettings: () => void;
  currentUrl: string;
  currentTitle?: string;
}

export interface QuickLinksDropdownHandle {
  reload: () => void;
}

export const QuickLinksDropdown = forwardRef<QuickLinksDropdownHandle, QuickLinksDropdownProps>(
  ({ onNavigate, onOpenSettings, currentUrl, currentTitle }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [folders, setFolders] = useState<QuickLinkFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadQuickLinks();
  }, []);

  // 親コンポーネントから呼び出せるreloadメソッドを公開
  useImperativeHandle(ref, () => ({
    reload: () => {
      loadQuickLinks();
    }
  }));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const loadQuickLinks = async () => {
    try {
      const data: QuickLinksData = await window.quickLinks.get();
      setQuickLinks(data.links);
      setFolders(data.folders);

      // デフォルトで全フォルダを展開
      const expanded = new Set(data.folders.filter(f => f.isExpanded !== false).map(f => f.id));
      setExpandedFolders(expanded);
    } catch (error) {
      console.error('Failed to load quick links:', error);
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const handleAddCurrentPage = async () => {
    try {
      // タイトルがない場合、または不適切な場合の処理
      let title = currentTitle && currentTitle.trim() && !currentTitle.startsWith('http')
        ? currentTitle
        : '';

      // それでもタイトルがない場合はURLからホスト名を取得
      if (!title) {
        try {
          const urlObj = new URL(currentUrl);
          title = urlObj.hostname.replace('www.', '');
        } catch {
          title = 'ブックマーク';
        }
      }

      await window.quickLinks.add({ title, url: currentUrl });
      await loadQuickLinks();
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to add quick link:', error);
    }
  };

  const handleLinkClick = (url: string) => {
    onNavigate(url);
    setIsOpen(false);
  };

  // リンクをフォルダでグループ化
  const rootLinks = quickLinks.filter(link => !link.folderId);
  const linksByFolder = quickLinks.reduce((acc, link) => {
    if (link.folderId) {
      if (!acc[link.folderId]) acc[link.folderId] = [];
      acc[link.folderId].push(link);
    }
    return acc;
  }, {} as Record<string, QuickLink[]>);

  return (
    <div className="quick-links-container" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="icon-button"
        title="クイックリンク"
      >
        <Bookmark size={20} />
      </button>

      {isOpen && (
        <div className="quick-links-dropdown">
          <div className="quick-links-header">
            <span className="quick-links-title">クイックリンク</span>
            <button
              type="button"
              onClick={onOpenSettings}
              className="settings-icon-button"
              title="管理"
            >
              <Settings size={16} />
            </button>
          </div>

          <div className="quick-links-list">
            {quickLinks.length === 0 && folders.length === 0 ? (
              <div className="quick-links-empty">
                クイックリンクがありません
              </div>
            ) : (
              <>
                {/* ルートレベルのリンク */}
                {rootLinks.map((link) => (
                  <button
                    type="button"
                    key={link.id}
                    className="quick-link-item"
                    onClick={() => handleLinkClick(link.url)}
                    title={link.url}
                  >
                    <ExternalLink size={14} className="quick-link-icon" />
                    <span className="quick-link-title">{link.title}</span>
                  </button>
                ))}

                {/* フォルダとその中のリンク */}
                {folders.map((folder) => (
                  <div key={folder.id} className="quick-link-folder">
                    <button
                      type="button"
                      className="folder-header"
                      onClick={() => toggleFolder(folder.id)}
                    >
                      {expandedFolders.has(folder.id) ? (
                        <ChevronDown size={14} className="folder-chevron" />
                      ) : (
                        <ChevronRight size={14} className="folder-chevron" />
                      )}
                      <Folder size={14} className="folder-icon" />
                      <span className="folder-name">{folder.name}</span>
                      <span className="folder-count">({linksByFolder[folder.id]?.length || 0})</span>
                    </button>

                    {expandedFolders.has(folder.id) && linksByFolder[folder.id] && (
                      <div className="folder-links">
                        {linksByFolder[folder.id].map((link) => (
                          <button
                            type="button"
                            key={link.id}
                            className="quick-link-item folder-link-item"
                            onClick={() => handleLinkClick(link.url)}
                            title={link.url}
                          >
                            <ExternalLink size={14} className="quick-link-icon" />
                            <span className="quick-link-title">{link.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="quick-links-footer">
            <button
              type="button"
              onClick={handleAddCurrentPage}
              className="add-current-page-button"
            >
              <Plus size={16} />
              <span>このページを追加</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
