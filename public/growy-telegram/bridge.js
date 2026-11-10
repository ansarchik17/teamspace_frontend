/* Workspace authorizes requests in its parent; credentials never enter this frame. */
'use strict';
(() => {
  window.GrowyTelegramWorkspace = true;
  const pending = new Map();
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'workspace:telegram-response') return;
    const task = pending.get(event.data.id); if (!task) return;
    pending.delete(event.data.id); task.cleanup();
    if (event.data.error) task.reject(new Error(event.data.error));
    else task.resolve(new Response(event.data.body, {status:event.data.status, headers:event.data.headers}));
  });
  window.fetch = (url, options = {}) => new Promise((resolve, reject) => {
    if (typeof url !== 'string' || !url.startsWith('/api/my/telegram/')) { reject(new Error('Unsupported Telegram request.')); return; }
    if (options.signal?.aborted) { reject(new DOMException('Aborted','AbortError')); return; }
    const id = crypto.randomUUID();
    const cancel = () => {
      pending.delete(id); options.signal?.removeEventListener('abort',cancel);
      window.parent.postMessage({type:'workspace:telegram-cancel',id},location.origin);
      reject(new DOMException('Aborted','AbortError'));
    };
    pending.set(id, {resolve,reject,cleanup:()=>options.signal?.removeEventListener('abort',cancel)});
    options.signal?.addEventListener('abort',cancel,{once:true});
    const form = options.body instanceof FormData ? [...options.body.entries()] : undefined;
    window.parent.postMessage({type:'workspace:telegram-request',id,path:url.slice('/api/my/'.length),
      method:options.method || 'GET',body:form ? undefined : options.body,form},location.origin);
  });
})();
