import { useRef, useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, Home, PanelRight, HelpCircle, BookOpen } from 'lucide-react';
import { QuickLinksDropdown } from './components/QuickLinks/QuickLinksDropdown';
import { QuickLinksSettings } from './components/QuickLinks/QuickLinksSettings';
import { QuickLinksSidebar } from './components/QuickLinks/QuickLinksSidebar';
import { About } from './components/About/About';
import { ReadingHistory } from './components/ReadingHistory/ReadingHistory';
import './App.css';

function App() {
  const webviewRef = useRef<any>(null);
  const quickLinksRef = useRef<any>(null);
  const sidebarRef = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [url, setUrl] = useState('https://kakuyomu.jp');
  const [pageTitle, setPageTitle] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDidStartLoading = () => setIsLoading(true);

    const handleDidNavigate = () => {
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
      setUrl(webview.getURL());
      updatePageTitle(webview);
      injectAdBlocker(webview);
    };

    const handleDidStopLoading = async () => {
      setIsLoading(false);
      await updatePageTitle(webview);
      injectAdBlocker(webview);
      // 読書履歴を自動記録（カクヨムの作品ページのみ）
      await saveReadingHistory(webview);
      // しおり位置を復元
      await restoreScrollPosition(webview);
    };

    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigate); // For SPA navigation

    return () => {
      // Cleanup if necessary, though webview refs often don't need explicit removal if component unmounts
      if (webview) {
        webview.removeEventListener('did-start-loading', handleDidStartLoading);
        webview.removeEventListener('did-stop-loading', handleDidStopLoading);
        webview.removeEventListener('did-navigate', handleDidNavigate);
        webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
      }
    };
  }, []);

  const updatePageTitle = async (webview: any) => {
    try {
      // まずWebViewのgetTitle()を試す
      let title = webview.getTitle();

      // タイトルが空または'https://kakuyomu.jp'のような場合、JavaScriptでH1を取得
      if (!title || title.startsWith('http')) {
        const result = await webview.executeJavaScript(`
          (function() {
            // document.titleを優先
            if (document.title && document.title.trim()) {
              return document.title.trim();
            }
            // 次にh1タグを試す
            const h1 = document.querySelector('h1');
            if (h1 && h1.textContent) {
              return h1.textContent.trim();
            }
            // og:titleメタタグを試す
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle && ogTitle.content) {
              return ogTitle.content.trim();
            }
            return '';
          })()
        `);

        if (result) {
          title = result;
        }
      }

      setPageTitle(title || 'ページタイトル不明');
    } catch (error) {
      console.error('Failed to get page title:', error);
      setPageTitle(webview.getTitle() || 'ページタイトル不明');
    }
  };

  const injectAdBlocker = (webview: any) => {
    // 広告ブロック用のCSS
    const adCSS = `
      /* Google Ads */
      iframe[id^="google_ads_iframe"],
      iframe[id*="google_ads"],
      .adsbygoogle,
      ins.adsbygoogle,
      div[id^="div-gpt-ad"],
      div[data-google-query-id],

      /* 広告専用クラス */
      .ad-container, .ad-wrapper, .ad-banner, .ad-slot,
      .advertisement, .advertising,
      .ad-unit, .ad_unit,

      /* カクヨム特有の広告 */
      .widget-ad-pcDoubleRectangle,
      div[class*="widget-ad"],
      #top-ad-regular-next-works-left,
      #top-ad-regular-next-works-right,

      /* スポンサー */
      .sponsored-content, .sponsorship,

      /* バナー広告 */
      .banner-ad, .banner_ad,

      /* ポップアップ広告 */
      .popup-ad, .popunder,

      /* 広告ネットワーク */
      #ad-footer, #ad-header, #ad-sidebar,

      /* iframe広告 */
      iframe[src*="doubleclick"],
      iframe[src*="googlesyndication"],
      iframe[src*="googleadservices"],
      iframe[src*="/ads/"],

      /* data属性 */
      [data-ad-slot],
      [data-ad-unit],
      [data-advertisement="true"] {
        display: none !important;
        height: 0 !important;
        width: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        opacity: 0 !important;
        position: absolute !important;
        left: -9999px !important;
      }
    `;

    webview.insertCSS(adCSS).catch((err: any) => console.error('Failed to inject ad blocker CSS:', err));

    // JavaScriptによる広告ブロック
    webview.executeJavaScript(`
      (function() {
        // 広告要素を削除する関数
        function removeAds() {
          // Google Adsenseスクリプトをブロック
          document.querySelectorAll('script[src*="adsbygoogle"], script[src*="googlesyndication"], script[src*="doubleclick"]').forEach(script => script.remove());

          // 広告iframe要素を削除
          document.querySelectorAll('iframe[id*="google_ads"], iframe[src*="doubleclick"], iframe[src*="googlesyndication"], iframe[src*="googleadservices"]').forEach(iframe => iframe.remove());

          // Google AdSense要素を削除
          document.querySelectorAll('.adsbygoogle, ins.adsbygoogle').forEach(el => el.remove());

          // data-ad属性を持つ要素を削除
          document.querySelectorAll('[data-ad-slot], [data-ad-unit]').forEach(el => el.remove());

          // カクヨム特有の広告を削除
          document.querySelectorAll('.widget-ad-pcDoubleRectangle, [class*="widget-ad"]').forEach(el => el.remove());
          document.querySelectorAll('#top-ad-regular-next-works-left, #top-ad-regular-next-works-right').forEach(el => el.remove());

          // Google AdSenseの挿入をブロック
          if (window.adsbygoogle) {
            window.adsbygoogle = { push: function() {} };
          }
        }

        // 初回実行
        removeAds();

        // DOM変更を監視
        const observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
              if (node.nodeType === 1) {
                const element = node;
                const classes = (element.className || '').toString().toLowerCase();
                const id = (element.id || '').toLowerCase();

                // 広告チェック
                if (
                  classes.includes('adsbygoogle') ||
                  classes === 'advertisement' ||
                  id.startsWith('google_ads') ||
                  (element.tagName === 'INS' && classes.includes('adsbygoogle'))
                ) {
                  element.remove();
                  return;
                }

                // iframe広告をチェック
                if (element.tagName === 'IFRAME') {
                  const src = element.src || '';
                  if (
                    src.includes('doubleclick') ||
                    src.includes('googlesyndication') ||
                    src.includes('googleadservices')
                  ) {
                    element.remove();
                    return;
                  }
                }

                // data-ad-slot属性
                if (element.hasAttribute && (element.hasAttribute('data-ad-slot') || element.hasAttribute('data-ad-unit'))) {
                  element.remove();
                  return;
                }
              }
            });
          });
        });

        // body要素の変更を監視
        if (document.body) {
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
        }

        // ページロード後にも再度実行
        setTimeout(() => {
          removeAds();
        }, 1000);
      })();
    `).catch((err: any) => console.error('Failed to inject ad blocker script:', err));
  };


  const goBack = () => {
    if (webviewRef.current && webviewRef.current.canGoBack()) {
      webviewRef.current.goBack();
    }
  };

  const goForward = () => {
    if (webviewRef.current && webviewRef.current.canGoForward()) {
      webviewRef.current.goForward();
    }
  };

  const reload = () => {
    if (webviewRef.current) {
      webviewRef.current.reload();
    }
  };

  const goHome = () => {
    if (webviewRef.current) {
      webviewRef.current.loadURL('https://kakuyomu.jp');
    }
  };

  const navigateToUrl = (targetUrl: string) => {
    if (webviewRef.current) {
      webviewRef.current.loadURL(targetUrl);
    }
  };

  // 読書履歴を保存
  const saveReadingHistory = async (webview: any) => {
    try {
      const currentUrl = webview.getURL();

      // カクヨムの作品ページ（/works/...）のみ履歴を保存
      if (!currentUrl.includes('kakuyomu.jp/works/')) {
        return;
      }

      const title = pageTitle || webview.getTitle() || 'タイトル不明';

      // スクロール位置を取得
      const scrollPosition = await webview.executeJavaScript(`
        window.scrollY || document.documentElement.scrollTop || 0
      `);

      await window.readingHistory.addOrUpdateHistory({
        url: currentUrl,
        title: title,
        scrollPosition: scrollPosition
      });
    } catch (error) {
      console.error('Failed to save reading history:', error);
    }
  };

  // しおり位置を復元
  const restoreScrollPosition = async (webview: any) => {
    try {
      const currentUrl = webview.getURL();

      // カクヨムの作品ページ（/works/...）のみ復元
      if (!currentUrl.includes('kakuyomu.jp/works/')) {
        return;
      }

      // URLから作品IDを抽出
      const urlMatch = currentUrl.match(/\/works\/([^\/]+)/);
      if (!urlMatch) {
        return;
      }

      const workId = urlMatch[1];

      // 履歴からスクロール位置を取得
      const history = await window.readingHistory.getHistory();
      const historyItem = history.find(item => item.id === workId);

      if (historyItem && historyItem.scrollPosition) {
        // スクロール位置を復元（少し遅延させて確実に復元）
        setTimeout(() => {
          webview.executeJavaScript(`
            window.scrollTo(0, ${historyItem.scrollPosition});
          `).catch((e: any) => console.error('Failed to restore scroll position:', e));
        }, 500);
      }
    } catch (error) {
      console.error('Failed to restore scroll position:', error);
    }
  };

  return (
    <div className="app-container">
      <header className="browser-header">
        <div className="nav-controls">
          <button
            type="button"
            onClick={goBack}
            disabled={!canGoBack}
            className="icon-button"
            title="戻る"
          >
            <ArrowLeft size={20} />
          </button>
          <button
            type="button"
            onClick={goForward}
            disabled={!canGoForward}
            className="icon-button"
            title="進む"
          >
            <ArrowRight size={20} />
          </button>
          <button type="button" onClick={reload} className="icon-button" title="更新">
            <RotateCcw size={20} />
          </button>
          <button type="button" onClick={goHome} className="icon-button" title="ホーム">
            <Home size={20} />
          </button>
          <QuickLinksDropdown
            ref={quickLinksRef}
            onNavigate={navigateToUrl}
            onOpenSettings={() => setIsSettingsOpen(true)}
            currentUrl={url}
            currentTitle={pageTitle}
          />
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="icon-button"
            title="サイドバーを開く/閉じる"
          >
            <PanelRight size={20} />
          </button>
          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            className="icon-button"
            title="読書履歴"
          >
            <BookOpen size={20} />
          </button>
          <button
            type="button"
            onClick={() => setIsAboutOpen(true)}
            className="icon-button"
            title="このアプリについて"
          >
            <HelpCircle size={20} />
          </button>
        </div>
        <div className="url-bar">
          <span>{url}</span>
        </div>
      </header>
      <div className="webview-wrapper">
        <webview
          ref={webviewRef}
          src="https://kakuyomu.jp"
          className="webview"
          // @ts-ignore - webview tag is not standard HTML
          allowpopups="true"
        ></webview>
        {isLoading && <div className="loading-bar"></div>}
      </div>

      <QuickLinksSidebar
        ref={sidebarRef}
        isOpen={isSidebarOpen}
        onNavigate={navigateToUrl}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <QuickLinksSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onUpdate={() => {
          // QuickLinksDropdownを更新
          if (quickLinksRef.current && quickLinksRef.current.reload) {
            quickLinksRef.current.reload();
          }
          // サイドバーも更新
          if (sidebarRef.current && sidebarRef.current.reload) {
            sidebarRef.current.reload();
          }
        }}
      />

      <About
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      <ReadingHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onNavigate={navigateToUrl}
      />
    </div>
  );
}

export default App;