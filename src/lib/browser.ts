export const HOME_URL = 'https://kakuyomu.jp'

export const isKakuyomuWorkUrl = (url: string) => url.includes('kakuyomu.jp/works/')

export const extractWorkId = (url: string) => {
  const match = url.match(/\/works\/([^/]+)/)
  return match?.[1] ?? null
}
