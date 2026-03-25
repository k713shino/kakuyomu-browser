import { useEffect, useRef, useState } from 'react'
import { extractWorkId, HOME_URL, isKakuyomuWorkUrl } from '../lib/browser'
import { getSafePageTitle, injectAdBlocker } from '../lib/webview'
import type { BrowserWebview } from '../lib/webview'

export const useBrowserWebview = () => {
  const webviewRef = useRef<BrowserWebview | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [url, setUrl] = useState(HOME_URL)
  const [pageTitle, setPageTitle] = useState('')

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) {
      return
    }

    const syncNavigationState = () => {
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())
      setUrl(webview.getURL())
    }

    const handleDidStartLoading = () => {
      setIsLoading(true)
    }

    const handleDidNavigate = () => {
      syncNavigationState()
      void refreshPageTitle(webview)
      injectAdBlocker(webview)
    }

    const handleDidStopLoading = async () => {
      setIsLoading(false)
      syncNavigationState()

      const title = await refreshPageTitle(webview)
      injectAdBlocker(webview)
      await saveReadingHistory(webview, title)
      await restoreScrollPosition(webview)
    }

    webview.addEventListener('did-start-loading', handleDidStartLoading)
    webview.addEventListener('did-stop-loading', handleDidStopLoading)
    webview.addEventListener('did-navigate', handleDidNavigate)
    webview.addEventListener('did-navigate-in-page', handleDidNavigate)

    return () => {
      webview.removeEventListener('did-start-loading', handleDidStartLoading)
      webview.removeEventListener('did-stop-loading', handleDidStopLoading)
      webview.removeEventListener('did-navigate', handleDidNavigate)
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate)
    }
  }, [])

  const refreshPageTitle = async (webview: BrowserWebview) => {
    const title = await getSafePageTitle(webview)
    setPageTitle(title)
    return title
  }

  const saveReadingHistory = async (webview: BrowserWebview, title: string) => {
    try {
      const currentUrl = webview.getURL()
      if (!isKakuyomuWorkUrl(currentUrl)) {
        return
      }

      const scrollPosition = await webview.executeJavaScript(
        'window.scrollY || document.documentElement.scrollTop || 0',
      )

      await window.readingHistory.addOrUpdateHistory({
        url: currentUrl,
        title,
        scrollPosition,
      })
    } catch (error) {
      console.error('Failed to save reading history:', error)
    }
  }

  const restoreScrollPosition = async (webview: BrowserWebview) => {
    try {
      const currentUrl = webview.getURL()
      if (!isKakuyomuWorkUrl(currentUrl)) {
        return
      }

      const workId = extractWorkId(currentUrl)
      if (!workId) {
        return
      }

      const history = await window.readingHistory.getHistory()
      const historyItem = history.find(item => item.id === workId)
      if (!historyItem?.scrollPosition) {
        return
      }

      window.setTimeout(() => {
        webview
          .executeJavaScript(`window.scrollTo(0, ${historyItem.scrollPosition});`)
          .catch((error: unknown) => {
            console.error('Failed to restore scroll position:', error)
          })
      }, 500)
    } catch (error) {
      console.error('Failed to restore scroll position:', error)
    }
  }

  const goBack = () => {
    if (webviewRef.current?.canGoBack()) {
      webviewRef.current.goBack()
    }
  }

  const goForward = () => {
    if (webviewRef.current?.canGoForward()) {
      webviewRef.current.goForward()
    }
  }

  const reload = () => {
    webviewRef.current?.reload()
  }

  const goHome = () => {
    webviewRef.current?.loadURL(HOME_URL)
  }

  const navigateToUrl = (targetUrl: string) => {
    webviewRef.current?.loadURL(targetUrl)
  }

  return {
    webviewRef,
    canGoBack,
    canGoForward,
    isLoading,
    navigateToUrl,
    goBack,
    goForward,
    reload,
    goHome,
    pageTitle,
    url,
  }
}
