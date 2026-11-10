import { useEffect } from 'react'

// Secret-link pages suppress referrers while mounted. Browsers retain the last
// document policy after a meta is removed, so restore it before detaching it.
// Otherwise a later cross-origin form POST sends Origin: null and tenant login
// correctly fails its platform-origin check.
export function useNoReferrer() {
  useEffect(() => {
    const previous = document.querySelector<HTMLMetaElement>('meta[name="referrer"]')
    const original = previous?.content
    const meta = previous ?? document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    if (!previous) document.head.append(meta)
    return () => {
      meta.content = original || 'strict-origin-when-cross-origin'
      if (!previous) meta.remove()
    }
  }, [])
}
