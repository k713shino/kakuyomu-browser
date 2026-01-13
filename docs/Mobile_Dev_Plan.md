# モバイルアプリ開発計画 (React Native)

## 背景
現在のElectron製アプリはデスクトップ専用です。
また、カクヨムのセキュリティ設定（`X-Frame-Options: SAMEORIGIN`）により、ハイブリッドアプリ（Capacitor等でiframeを使用する手法）ではサイトを表示できません。
そのため、ネイティブのWebViewコンポーネントを利用できる **React Native** での新規開発を提案します。

## 目標
AndroidおよびiOSで動作する「カクヨム専用ブラウザ」を作成する。

## 技術スタック
- **Framework**: React Native (Expo) - 環境構築が容易で開発スピードが速いため。
- **Language**: TypeScript
- **Component**: `react-native-webview` - カクヨムを表示するために必須。

## 実装ステップ
1. **プロジェクト作成**: `kakuyomu-browser-mobile` ディレクトリを新規作成。
2. **基本機能の実装**:
    - `WebView` コンポーネントの配置。
    - ナビゲーションバー（戻る、進む、更新、ホーム）の実装。
3. **デザイン**:
    - PC版のデザインを踏襲（青基調、Glassmorphism風ヘッダー）。
4. **広告非表示機能**:
    - `injectedJavaScript` を利用してPC版と同様のCSS/JS注入を行う。

## 注意点
- PC版のコード（React DOM）は直接再利用できないため、UI部分は書き直しとなります（ロジックやCSSの考え方は流用可能）。
