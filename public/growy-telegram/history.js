/* Shared history state transition, also exercised without a browser. */
(function (root) {
  'use strict';
  function mergeHistory(current, page, older) {
    const fresh = page.results;
    let results;
    if (older) {
      // Keep current messages authoritative when a page overlaps the latest window.
      results = [...new Map([...fresh, ...current.results].map(m => [m.id, m])).values()];
    } else if (!fresh.length) {
      results = [];
    } else {
      const boundary = Math.min(...fresh.map(m => m.id));
      results = [...fresh, ...current.results.filter(m => m.id < boundary)];
    }
    const loadedOlder = older || current.loadedOlder;
    return {
      results: results.sort((a, b) => b.id - a.id),
      loadedOlder: results.length ? loadedOlder : false,
      nextBefore: !results.length ? null : older || !loadedOlder ? page.next_before : current.nextBefore,
    };
  }
  function mergeDialogs(current, page, older) {
    const loadedOlder = older || current.loadedOlder;
    if (!older && !page.next_cursor) return {results:page.results, nextCursor:null, loadedOlder:false};
    const fresh = new Map(page.results.map(d => [d.id, d]));
    const results = older
      ? [...new Map([...current.results, ...page.results].map(d => [d.id, d])).values()]
      : [...page.results, ...(loadedOlder ? current.results.filter(d => !fresh.has(d.id)) : [])];
    return {results, loadedOlder, nextCursor:older || !loadedOlder ? page.next_cursor : current.nextCursor};
  }
  if (typeof module === 'object' && module.exports) module.exports = {mergeHistory, mergeDialogs};
  else root.GrowyTelegramHistory = {mergeHistory, mergeDialogs};
})(typeof globalThis === 'object' ? globalThis : this);
