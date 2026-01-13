import { X } from 'lucide-react';
import './About.css';

interface AboutProps {
  isOpen: boolean;
  onClose: () => void;
}

export const About = ({ isOpen, onClose }: AboutProps) => {
  if (!isOpen) return null;

  return (
    <>
      <div className="about-overlay" onClick={onClose}></div>
      <div className="about-modal">
        <div className="about-header">
          <h2>Kakuyomu Browserについて</h2>
          <button type="button" onClick={onClose} className="about-close-button">
            <X size={20} />
          </button>
        </div>

        <div className="about-content">
          <div className="about-section">
            <h3>バージョン情報</h3>
            <p className="about-version">Version 0.1.0 (初期開発版)</p>
            <p className="about-description">
              カクヨム専用ブラウザアプリケーション
            </p>
          </div>

          <div className="about-section">
            <h3>開発者</h3>
            <p>k713shino</p>
            <p className="about-email">shino.techno@gmail.com</p>
          </div>

          <div className="about-section">
            <h3>クレジット</h3>
            <div className="about-credits">
              <div className="credit-item">
                <strong>Electron Vite React Template</strong>
                <p>Original boilerplate by 草鞋没号</p>
                <p className="credit-email">308487730@qq.com</p>
              </div>
              <div className="credit-item">
                <strong>Built with</strong>
                <ul className="tech-list">
                  <li>Electron - デスクトップアプリケーションフレームワーク</li>
                  <li>React - UIライブラリ</li>
                  <li>TypeScript - プログラミング言語</li>
                  <li>Vite - ビルドツール</li>
                  <li>Lucide React - アイコンライブラリ</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="about-section">
            <h3>機能</h3>
            <ul className="features-list">
              <li>カクヨム専用ブラウジング</li>
              <li>広告ブロック機能</li>
              <li>クイックリンク管理（フォルダ対応）</li>
              <li>クイックリンクのエクスポート/インポート</li>
              <li>ドラッグ&ドロップでのリンク整理</li>
              <li>サイドバー表示</li>
            </ul>
          </div>

          <div className="about-section">
            <h3>ライセンス</h3>
            <p>MIT License</p>
            <p className="about-license-text">
              このソフトウェアはMITライセンスの下で配布されています。
            </p>
          </div>
        </div>

        <div className="about-footer">
          <button type="button" onClick={onClose} className="about-ok-button">
            OK
          </button>
        </div>
      </div>
    </>
  );
};
