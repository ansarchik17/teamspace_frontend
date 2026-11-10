import React from 'react'

/**
 * Renders text with clickable URLs (http://, https://, www.) that wrap properly without overflowing containers.
 */
export const renderTextWithLinks = (text: string | null | undefined): React.ReactNode => {
  if (!text) return null

  // Regex matching http://, https://, or www. URLs
  const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
  const parts = text.split(urlRegex)

  return parts.map((part, index) => {
    if (/^https?:\/\//i.test(part) || /^www\./i.test(part)) {
      let cleanHref = part
      let trailingPunctuation = ''

      // Separate trailing punctuation like .,;:!?) if present at the end
      const matchPunct = part.match(/[.,;:!?)]+$/)
      if (matchPunct) {
        trailingPunctuation = matchPunct[0]
        cleanHref = part.slice(0, -trailingPunctuation.length)
      }

      if (cleanHref.toLowerCase().startsWith('www.')) {
        cleanHref = `https://${cleanHref}`
      }

      const linkText = part.slice(0, part.length - trailingPunctuation.length)

      return (
        <React.Fragment key={index}>
          <a
            href={cleanHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2F4BE2] hover:text-[#253CB1] hover:underline break-words [overflow-wrap:anywhere] [word-break:break-word] font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {linkText}
          </a>
          {trailingPunctuation}
        </React.Fragment>
      )
    }
    return part
  })
}
