export function clampMeetPosition(
  left: number,
  top: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return {
    left: Math.max(0, Math.min(left, viewportWidth - width)),
    top: Math.max(0, Math.min(top, viewportHeight - height)),
  }
}

export function copyMeetStyles(
  source: Document,
  target: Document,
  meetingCss: string,
) {
  const base = target.createElement('base')
  base.href = source.baseURI
  target.head.appendChild(base)
  target.documentElement.lang = source.documentElement.lang || 'ru'
  target.documentElement.className = source.documentElement.className
  target.body.className = source.body.className

  // Snapshot loaded rules rather than fetching the app bundle again from about:blank.
  // Include constructable stylesheets, which have no <style> or <link> node to clone.
  for (const sheet of [
    ...source.styleSheets,
    ...(source.adoptedStyleSheets ?? []),
  ]) {
    if (sheet.disabled) continue
    try {
      const style = target.createElement('style')
      style.textContent = [...sheet.cssRules]
        .map((rule) => rule.cssText)
        .join('\n')
      style.media = sheet.media.mediaText
      target.head.appendChild(style)
    } catch {
      // Cross-origin sheets cannot expose their rules; use their absolute URL.
      if (!sheet.href) continue
      const link = target.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      link.media = sheet.media.mediaText
      target.head.appendChild(link)
    }
  }
  // The meeting's own CSS is bundled inline so controls are styled immediately,
  // even when external app styles are blocked or unavailable in the PiP document.
  const style = target.createElement('style')
  style.dataset.meetWindow = 'true'
  style.textContent = meetingCss
  target.head.appendChild(style)
  target.documentElement.style.cssText =
    'height:100%;margin:0;overflow:hidden;background:#111315'
  target.body.style.cssText = 'height:100%;margin:0;overflow:hidden'
}
