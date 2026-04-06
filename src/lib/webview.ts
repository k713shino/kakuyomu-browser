export type BrowserWebview = Electron.WebviewTag
import type { DisplaySettings } from '../type/display-settings'

export interface EpisodeSpeechContent {
  title: string
  text: string
  paragraphs: Array<{
    index: number
    text: string
  }>
}

export type SpeechPlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'unavailable'

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

export const extractEpisodeSpeechContent = async (
  webview: BrowserWebview,
): Promise<EpisodeSpeechContent | null> => {
  try {
    return await webview.executeJavaScript(`
      (function() {
        const episodeRoot =
          document.querySelector('.widget-episodeBody') ||
          document.querySelector('.widget-workEpisode') ||
          document.querySelector('article');

        if (!episodeRoot) {
          return null;
        }

        const title =
          document.querySelector('.widget-episodeTitle')?.textContent?.trim() ||
          document.querySelector('h1')?.textContent?.trim() ||
          '';

        const paragraphNodes = Array.from(
          episodeRoot.querySelectorAll('p, li, blockquote, h2, h3')
        );
        const paragraphs = paragraphNodes
          .map((element, index) => {
            element.setAttribute('data-kakuyomu-browser-speech-index', String(index));
            return {
              index,
              text: element.textContent?.replace(/\\s+/g, ' ').trim() || ''
            };
          })
          .filter((item) => Boolean(item.text));

        const body =
          paragraphs.length > 0
            ? paragraphs.map((item) => item.text).join('\\n')
            : (episodeRoot.textContent?.replace(/\\s+/g, ' ').trim() || '');

        const text = [title, body].filter(Boolean).join('\\n\\n');
        if (!text) {
          return null;
        }

        return {
          title,
          text,
          paragraphs
        };
      })();
    `)
  } catch (error) {
    console.error('Failed to extract episode speech content:', error)
    return null
  }
}

export const highlightSpeechParagraphs = async (
  webview: BrowserWebview,
  paragraphIndexes: number[],
): Promise<void> => {
  try {
    await webview.executeJavaScript(`
      (function() {
        const styleId = 'kakuyomu-browser-speech-highlight-style';
        let style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement('style');
          style.id = styleId;
          style.textContent = \`
            [data-kakuyomu-browser-speech-index] {
              transition: background-color 180ms ease, box-shadow 180ms ease;
            }

            [data-kakuyomu-browser-speech-active="true"] {
              background: linear-gradient(180deg, rgba(253, 224, 71, 0.32), rgba(251, 191, 36, 0.22));
              box-shadow: 0 0 0 6px rgba(253, 224, 71, 0.12);
              border-radius: 8px;
            }
          \`;
          document.head.appendChild(style);
        }

        const activeSet = new Set(${JSON.stringify(paragraphIndexes)});
        const nodes = Array.from(document.querySelectorAll('[data-kakuyomu-browser-speech-index]'));

        let firstActive = null;
        nodes.forEach((node) => {
          const index = Number(node.getAttribute('data-kakuyomu-browser-speech-index'));
          const isActive = activeSet.has(index);
          node.setAttribute('data-kakuyomu-browser-speech-active', isActive ? 'true' : 'false');
          if (isActive && !firstActive) {
            firstActive = node;
          }
        });

        if (firstActive && typeof firstActive.scrollIntoView === 'function') {
          firstActive.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'smooth'
          });
        }
      })();
    `)
  } catch (error) {
    console.error('Failed to highlight speech paragraphs:', error)
  }
}

export const clearSpeechParagraphHighlights = async (webview: BrowserWebview): Promise<void> => {
  try {
    await webview.executeJavaScript(`
      (function() {
        document
          .querySelectorAll('[data-kakuyomu-browser-speech-active="true"]')
          .forEach((node) => node.setAttribute('data-kakuyomu-browser-speech-active', 'false'));
      })();
    `)
  } catch (error) {
    console.error('Failed to clear speech paragraph highlights:', error)
  }
}

export const getSelectedText = async (webview: BrowserWebview): Promise<string> => {
  try {
    const selectedText = await webview.executeJavaScript(`
      (function() {
        const selection = window.getSelection();
        return selection ? selection.toString().replace(/\\s+/g, ' ').trim() : '';
      })();
    `)

    return typeof selectedText === 'string' ? selectedText : ''
  } catch (error) {
    console.error('Failed to get selected text:', error)
    return ''
  }
}
