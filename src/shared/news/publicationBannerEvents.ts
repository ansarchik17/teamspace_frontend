export const PUBLICATION_BANNERS_CHANGED_EVENT = 'publications:banners-changed'

export const notifyPublicationBannersChanged = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PUBLICATION_BANNERS_CHANGED_EVENT))
}
