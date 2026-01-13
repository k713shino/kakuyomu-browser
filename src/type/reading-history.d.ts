// 読書履歴のデータ構造

export interface ReadingHistoryItem {
  id: string // 作品ID (カクヨムのworks ID)
  title: string // 作品タイトル
  author: string // 著者名
  url: string // 作品のURL
  lastReadUrl: string // 最後に読んだページのURL
  lastReadEpisodeTitle: string // 最後に読んだエピソードのタイトル
  lastReadAt: number // 最後に読んだ日時（タイムスタンプ）
  firstReadAt: number // 初めて読んだ日時
  readCount: number // 読んだ回数
  scrollPosition?: number // スクロール位置（しおり機能）
}

export interface ReadingHistoryData {
  items: ReadingHistoryItem[]
}

// Preload API
export interface ReadingHistoryAPI {
  // 履歴を取得
  getHistory: () => Promise<ReadingHistoryItem[]>

  // 履歴を追加/更新
  addOrUpdateHistory: (data: {
    url: string
    title: string
    scrollPosition?: number
  }) => Promise<ReadingHistoryItem>

  // 履歴を削除
  deleteHistory: (id: string) => Promise<boolean>

  // 履歴をクリア
  clearHistory: () => Promise<boolean>

  // しおり位置を更新
  updateScrollPosition: (id: string, position: number) => Promise<boolean>
}

declare global {
  interface Window {
    readingHistory: ReadingHistoryAPI
  }
}
