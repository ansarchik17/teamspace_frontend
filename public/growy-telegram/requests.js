/* Sequential requests bound to the current Growy/Telegram identity. */
(function (root) {
  'use strict';
  function createRequestContext() {
    let generation = 0, queue = Promise.resolve();
    return {
      invalidate() { generation++; },
      enqueue(task) {
        const current = generation;
        const check = () => {
          if (current !== generation) throw Object.assign(new Error(''), {code:'context_changed'});
        };
        const result = queue.then(async () => {
          check();
          const value = await task(check);
          check();
          return value;
        });
        queue = result.catch(() => {});
        return result;
      },
    };
  }
  if (typeof module === 'object' && module.exports) module.exports = {createRequestContext};
  else root.GrowyTelegramRequests = {createRequestContext};
})(typeof globalThis === 'object' ? globalThis : this);
