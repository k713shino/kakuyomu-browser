# Kakuyomu Browser

**Version 0.2.0**

カクヨム専用のデスクトップブラウザアプリケーションです。Electron + React + TypeScript + Vite で構築されており、読書に集中しやすい UI と、作品管理・履歴管理・表示カスタマイズ機能を備えています。

## 主な機能

### ブラウジング
- カクヨム専用ブラウジング
- 広告ブロック
- 縦組み表示のレイアウト補正
- 表示カスタマイズ
  - 広告ブロックの ON/OFF
  - 本文幅の変更
  - 本文文字サイズの変更

### 読書サポート
- 読書履歴の自動保存
- 読書履歴の検索・フィルタ
- スクロール位置の自動保存と復元
- キーボードショートカット
  - `Alt + Left` / `Alt + Right`
  - `Ctrl + R`
  - `Ctrl + H`
  - `Ctrl + B`
  - `Ctrl + T`
  - `Ctrl + W`

### クイックリンク
- クイックリンクの保存と解除
- フォルダ対応
- 検索
- エクスポート / インポート
- サイドバーからのアクセス

### タブ機能
- タブの追加 / 切り替え / クローズ
- ドラッグ&ドロップでの並び替え
- タブの複製
- 前回終了時のタブ復元
- 右クリックメニュー
  - このタブを閉じる
  - 右側を閉じる
  - これ以外をすべて閉じる
  - すべて閉じる

## 必要環境

- Node.js
- npm
- Windows 10 / 11

## セットアップ

```bash
npm install
```

## 開発

```bash
npm run dev
```

## ビルド

通常ビルドでは `win-unpacked` を生成します。

```bash
npm run build
```

出力先:

```text
release/0.2.0/win-unpacked
```

インストーラー `.exe` を生成したい場合:

```bash
npm run build:installer
```

## ディレクトリ構成

```text
├── electron/
│   ├── main/
│   └── preload/
├── src/
│   ├── components/
│   │   ├── About/
│   │   ├── DisplaySettings/
│   │   ├── QuickLinks/
│   │   ├── ReadingHistory/
│   │   └── update/
│   ├── hooks/
│   ├── lib/
│   └── type/
├── public/
└── release/
```

## 技術スタック

- Electron
- React
- TypeScript
- Vite
- Lucide React

## ライセンス

MIT License

## 開発者

k713shino  
shino.techno@gmail.com

## クレジット

このプロジェクトは `electron-vite-react` テンプレートをベースにしています。

Original boilerplate by 草鞋没号 (`308487730@qq.com`)
