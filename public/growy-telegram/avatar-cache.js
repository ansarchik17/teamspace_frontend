/* Versioned avatars only: no messages, credentials or session data in IndexedDB. */
(function(root) {
  'use strict';
  const ttl = 24 * 60 * 60 * 1000;
  let opened;
  function database() {
    if (!root.indexedDB) return Promise.resolve(null);
    if (!opened) opened = new Promise(resolve => {
      const request = root.indexedDB.open('growy-telegram-avatars', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('avatars', {keyPath:'key'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    });
    return opened;
  }
  async function transact(mode, work) {
    try {
      const db = await database(); if (!db) return null;
      return await new Promise(resolve => {
        const tx = db.transaction('avatars', mode), store = tx.objectStore('avatars');
        let result = null;
        work(store, value => {result = value;});
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => resolve(null);
      });
    } catch { return null; }
  }
  root.GrowyTelegramAvatarCache = {
    get(scope, key) {
      if (!scope) return Promise.resolve(null);
      return transact('readonly', (store, done) => {
        const request = store.get(`${scope}:${key}`);
        request.onsuccess = () => { const row = request.result; done(row && row.expires > Date.now() ? row.blob : null); };
      });
    },
    put(scope, key, blob) {
      if (!scope || blob.size > 1024 * 1024) return Promise.resolve(null);
      return transact('readwrite', store => {
        store.put({key:`${scope}:${key}`, scope, blob, expires:Date.now() + ttl});
        const all = store.getAll(); all.onsuccess = () => {
          const rows = all.result.sort((a,b) => b.expires-a.expires);
          rows.forEach((row, i) => {if (row.expires <= Date.now() || i >= 200) store.delete(row.key);});
        };
      });
    },
    clear(scope, account) {
      if (!scope) return Promise.resolve(null);
      return transact('readwrite', store => {
        const request = store.openCursor(); request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {if (cursor.value.scope === scope && (!account || cursor.key.startsWith(`${scope}:${account}:`))) cursor.delete(); cursor.continue();}
        };
      });
    }
  };
})(typeof globalThis === 'object' ? globalThis : this);
