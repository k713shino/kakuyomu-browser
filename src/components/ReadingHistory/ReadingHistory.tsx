import { useState, useEffect } from 'react';
import { X, Trash2, Clock, BookOpen, Bookmark } from 'lucide-react';
import { ReadingHistoryItem } from '../../type/reading-history';
import './ReadingHistory.css';

interface ReadingHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (url: string) => void;
}

export function ReadingHistory({ isOpen, onClose, onNavigate }: ReadingHistoryProps) {
  const [history, setHistory] = useState<ReadingHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const items = await window.readingHistory.getHistory();
      setHistory(items);
    } catch (error) {
      console.error('Failed to load reading history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('この履歴を削除しますか？')) {
      try {
        await window.readingHistory.deleteHistory(id);
        await loadHistory();
      } catch (error) {
        console.error('Failed to delete history:', error);
      }
    }
  };

  const handleClearAll = async () => {
    if (confirm('すべての履歴を削除しますか？')) {
      try {
        await window.readingHistory.clearHistory();
        await loadHistory();
      } catch (error) {
        console.error('Failed to clear history:', error);
      }
    }
  };

  const handleOpenHistory = (item: ReadingHistoryItem) => {
    onNavigate(item.lastReadUrl);
    onClose();
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return '今日';
    } else if (days === 1) {
      return '昨日';
    } else if (days < 7) {
      return `${days}日前`;
    } else {
      return date.toLocaleDateString('ja-JP');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="reading-history-overlay" onClick={onClose}>
      <div className="reading-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reading-history-header">
          <h2>📖 読書履歴</h2>
          <div className="reading-history-header-actions">
            {history.length > 0 && (
              <button
                className="clear-all-button"
                onClick={handleClearAll}
                title="すべてクリア"
              >
                <Trash2 size={18} />
                すべてクリア
              </button>
            )}
            <button className="close-button" onClick={onClose}>
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
            <div className="history-list">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="history-item"
                  onClick={() => handleOpenHistory(item)}
                >
                  <div className="history-item-header">
                    <h3 className="history-item-title">{item.title}</h3>
                    <button
                      className="delete-button"
                      onClick={(e) => handleDelete(item.id, e)}
                      title="削除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="history-item-episode">
                    {item.lastReadEpisodeTitle}
                  </div>
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
        </div>
      </div>
    </div>
  );
}
