export type BrowserWebview = Electron.WebviewTag
import type { DisplaySettings } from '../type/display-settings'

export const getSafePageTitle = async (webview: BrowserWebview) => {
  try {
    let title = webview.getTitle()

    if (!title || title.startsWith('http')) {
      const result = await webview.executeJavaScript(`
        (function() {
          if (document.title && document.title.trim()) {
            return document.title.trim();
          }

          const h1 = document.querySelector('h1');
          if (h1 && h1.textContent) {
            return h1.textContent.trim();
          }

          const ogTitle = document.querySelector('meta[property="og:title"]');
          if (ogTitle && ogTitle.content) {
            return ogTitle.content.trim();
          }

          return '';
        })()
      `)

      if (result) {
        title = result
      }
    }

    return title || 'ページタイトル不明'
  } catch (error) {
    console.error('Failed to get page title:', error)
    return webview.getTitle() || 'ページタイトル不明'
  }
}

export const injectAdBlocker = (webview: BrowserWebview) => {
  const adCSS = `
    iframe[id^="google_ads_iframe"],
    iframe[id*="google_ads"],
    .adsbygoogle,
    ins.adsbygoogle,
    div[id^="div-gpt-ad"],
    div[data-google-query-id],
    .ad-container, .ad-wrapper, .ad-banner, .ad-slot,
    .advertisement, .advertising,
    .ad-unit, .ad_unit,
    .widget-ad-pcDoubleRectangle,
    div[class*="widget-ad"],
    #top-ad-regular-next-works-left,
    #top-ad-regular-next-works-right,
    .sponsored-content, .sponsorship,
    .banner-ad, .banner_ad,
    .popup-ad, .popunder,
    #ad-footer, #ad-header, #ad-sidebar,
    iframe[src*="doubleclick"],
    iframe[src*="googlesyndication"],
    iframe[src*="googleadservices"],
    iframe[src*="/ads/"],
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
  `

  webview.insertCSS(adCSS).catch((error: unknown) => {
    console.error('Failed to inject ad blocker CSS:', error)
  })

  webview.executeJavaScript(`
    (function() {
      function removeAds() {
        document.querySelectorAll('script[src*="adsbygoogle"], script[src*="googlesyndication"], script[src*="doubleclick"]').forEach(script => script.remove());
        document.querySelectorAll('iframe[id*="google_ads"], iframe[src*="doubleclick"], iframe[src*="googlesyndication"], iframe[src*="googleadservices"]').forEach(iframe => iframe.remove());
        document.querySelectorAll('.adsbygoogle, ins.adsbygoogle').forEach(el => el.remove());
        document.querySelectorAll('[data-ad-slot], [data-ad-unit]').forEach(el => el.remove());
        document.querySelectorAll('.widget-ad-pcDoubleRectangle, [class*="widget-ad"]').forEach(el => el.remove());
        document.querySelectorAll('#top-ad-regular-next-works-left, #top-ad-regular-next-works-right').forEach(el => el.remove());

        if (window.adsbygoogle) {
          window.adsbygoogle = { push: function() {} };
        }
      }

      removeAds();

      const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType !== 1) {
              return;
            }

            const element = node;
            const classes = (element.className || '').toString().toLowerCase();
            const id = (element.id || '').toLowerCase();

            if (
              classes.includes('adsbygoogle') ||
              classes === 'advertisement' ||
              id.startsWith('google_ads') ||
              (element.tagName === 'INS' && classes.includes('adsbygoogle'))
            ) {
              element.remove();
              return;
            }

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

            if (
              element.hasAttribute &&
              (element.hasAttribute('data-ad-slot') || element.hasAttribute('data-ad-unit'))
            ) {
              element.remove();
            }
          });
        });
      });

      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }

      setTimeout(removeAds, 1000);
    })();
  `).catch((error: unknown) => {
    console.error('Failed to inject ad blocker script:', error)
  })
}

const readerWidthMap: Record<DisplaySettings['readerWidth'], string> = {
  compact: '720px',
  comfortable: '860px',
  wide: '1040px',
}

const readerFontSizeMap: Record<DisplaySettings['readerFontSize'], string> = {
  small: '15px',
  medium: '17px',
  large: '19px',
}

export const applyDisplaySettings = async (
  webview: BrowserWebview,
  settings: DisplaySettings,
  currentUrl: string,
) => {
  if (settings.adBlockEnabled) {
    injectAdBlocker(webview)
  }

  const isReaderPage = currentUrl.includes('kakuyomu.jp/works/')
  if (!isReaderPage) {
    return
  }

  const maxWidth = readerWidthMap[settings.readerWidth]
  const fontSize = readerFontSizeMap[settings.readerFontSize]

  await webview
    .executeJavaScript(`
      (function() {
        const styleId = 'kakuyomu-browser-display-settings';
        let style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement('style');
          style.id = styleId;
          document.head.appendChild(style);
        }

        const episodeBody =
          document.querySelector('.widget-episodeBody') ||
          document.querySelector('.widget-workEpisode');
        const writingMode = episodeBody ? getComputedStyle(episodeBody).writingMode : '';
        const isVertical = writingMode.startsWith('vertical');

        style.textContent = isVertical
          ? \`
              .widget-episodeBody,
              .widget-episodeBody-inner,
              .widget-workEpisode,
              .widget-workEpisode-inner {
                padding-inline-end: 72px !important;
              }

              .widget-episodeBody p,
              .widget-episodeBody-inner p,
              .widget-episodeBody li,
              .widget-episodeBody-inner li,
              .widget-episodeBody blockquote,
              .widget-episodeBody-inner blockquote,
              .widget-workEpisode p,
              .widget-workEpisode-inner p,
              .widget-workEpisode li,
              .widget-workEpisode-inner li,
              .widget-workEpisode blockquote,
              .widget-workEpisode-inner blockquote {
                font-size: ${fontSize} !important;
                line-height: 2 !important;
              }
            \`
          : \`
              .widget-episodeBody,
              .widget-episodeBody-inner,
              .widget-workEpisode,
              .widget-workEpisode-inner {
                max-width: ${maxWidth} !important;
              }

              .widget-episodeBody p,
              .widget-episodeBody-inner p,
              .widget-episodeBody li,
              .widget-episodeBody-inner li,
              .widget-episodeBody blockquote,
              .widget-episodeBody-inner blockquote,
              .widget-workEpisode p,
              .widget-workEpisode-inner p,
              .widget-workEpisode li,
              .widget-workEpisode-inner li,
              .widget-workEpisode blockquote,
              .widget-workEpisode-inner blockquote {
                font-size: ${fontSize} !important;
                line-height: 2 !important;
              }
            \`;
      })();
    `)
    .catch((error: unknown) => {
      console.error('Failed to apply display settings:', error)
    })
}
