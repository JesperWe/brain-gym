let originalHref: string | null = null
let flashInterval: ReturnType<typeof setInterval> | null = null

const ALERT_FAVICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚔️</text></svg>'

function getLinkEl(): HTMLLinkElement | null {
  return document.querySelector('link[rel="icon"]')
}

export function startFaviconFlash() {
  if (flashInterval) return

  const link = getLinkEl()
  if (link) originalHref = link.href

  let on = false
  flashInterval = setInterval(() => {
    const el = getLinkEl()
    if (!el) return
    on = !on
    el.href = on ? ALERT_FAVICON : (originalHref ?? '')
  }, 800)
}

export function stopFaviconFlash() {
  if (flashInterval) {
    clearInterval(flashInterval)
    flashInterval = null
  }
  const el = getLinkEl()
  if (el && originalHref) el.href = originalHref
}
