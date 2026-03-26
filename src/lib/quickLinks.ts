export const normalizeQuickLinkUrl = (url: string) => {
  try {
    const normalized = new URL(url)
    normalized.hash = ''
    return normalized.toString().replace(/\/$/, '')
  } catch {
    return url.trim().replace(/\/$/, '')
  }
}
