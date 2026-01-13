import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ExternalLink, Settings, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import type { QuickLink, QuickLinkFolder, QuickLinksData } from '../../type/quick-links';
import './QuickLinksSidebar.css';

interface QuickLinksSidebarProps {
  isOpen: boolean;
  onNavigate: (url: string) => void;
  onOpenSettings: () => void;
}

export interface QuickLinksSidebarHandle {
  reload: () => void;
}

export const QuickLinksSidebar = forwardRef<QuickLinksSidebarHandle, QuickLinksSidebarProps>(
  ({ isOpen, onNavigate, onOpenSettings }, ref) => {
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [folders, setFolders] = useState<QuickLinkFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      loadQuickLinks();
    }
  }, [isOpen]);

  // 親コンポーネントから呼び出せるreloadメソッドを公開
  useImperativeHandle(ref, () => ({
    reload: () => {
      loadQuickLinks();
    }
  }));

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

  const handleLinkClick = (url: string) => {
    onNavigate(url);
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
    <div className={`quick-links-sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h2 className="sidebar-title">クイックリンク</h2>
        <button
          type="button"
          onClick={onOpenSettings}
          className="sidebar-settings-button"
          title="管理"
        >
          <Settings size={18} />
        </button>
      </div>

      <div className="sidebar-content">
        {quickLinks.length === 0 && folders.length === 0 ? (
          <div className="sidebar-empty">
            <p>クイックリンクがありません</p>
            <p className="sidebar-empty-hint">
              設定から追加できます
            </p>
          </div>
        ) : (
          <div className="sidebar-links-list">
            {/* ルートレベルのリンク */}
            {rootLinks.length > 0 && (
              <div className="sidebar-section">
                <div className="sidebar-section-title">未分類</div>
                {rootLinks.map((link) => (
                  <button
                    type="button"
                    key={link.id}
                    className="sidebar-link-item"
                    onClick={() => handleLinkClick(link.url)}
                    title={link.url}
                  >
                    <ExternalLink size={16} className="sidebar-link-icon" />
                    <span className="sidebar-link-title">{link.title}</span>
                  </button>
                ))}
              </div>
            )}

            {/* フォルダとその中のリンク */}
            {folders.map((folder) => {
              const folderLinks = linksByFolder[folder.id] || [];
              if (folderLinks.length === 0) return null;

              return (
                <div key={folder.id} className="sidebar-section">
                  <button
                    type="button"
                    className="sidebar-folder-header"
                    onClick={() => toggleFolder(folder.id)}
                  >
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
                      {folderLinks.map((link) => (
                        <button
                          type="button"
                          key={link.id}
                          className="sidebar-link-item sidebar-folder-link"
                          onClick={() => handleLinkClick(link.url)}
                          title={link.url}
                        >
                          <ExternalLink size={16} className="sidebar-link-icon" />
                          <span className="sidebar-link-title">{link.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
