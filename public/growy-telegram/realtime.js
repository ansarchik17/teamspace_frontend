/* Adapted from workspace-front: one-use tickets, events over WS, HTTP snapshots. */
(function (root) {
  'use strict';
  function create({ticket, onEvent, onState, Socket = root.WebSocket,
    setTimer = setTimeout, clearTimer = clearTimeout, random = Math.random}) {
    let socket = null, timer = null, watchdog = null;
    let epoch = 0, account = null, attempts = 0, active = false;
    function state(value) { active = value === 'connected'; onState(value); }
    function stop() {
      epoch++; account = null;
      clearTimer(timer); clearTimer(watchdog); timer = watchdog = null;
      if (socket) {
        const current = socket; socket = null;
        current.onmessage = current.onclose = current.onerror = null;
        current.close();
      }
      state('stopped');
    }
    function retry(generation, retryAfter = 0) {
      if (generation !== epoch || !account) return;
      const backoff = Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)) * (0.8 + random() * 0.4);
      timer = setTimer(() => connect(generation), Math.max(backoff, retryAfter * 1000));
    }
    async function connect(generation) {
      if (generation !== epoch || !account) return;
      try {
        const auth = await ticket(account);
        if (generation !== epoch) return;
        if (!auth.enabled || !Socket) {
          state('fallback'); timer = setTimer(() => connect(generation), 30000); return;
        }
        const url = new URL(auth.url);
        if (!['wss:', 'ws:'].includes(url.protocol) ||
          url.pathname !== `/ws/telegram/accounts/${account}/` || url.username || url.password || url.hash)
          throw new Error('Invalid realtime URL');
        socket = new Socket(url.href);
        const current = socket;
        const valid = () => generation === epoch && current === socket;
        const touch = () => {
          clearTimer(watchdog);
          watchdog = setTimer(() => { if (valid()) current.close(); }, 45000);
        };
        touch();
        current.onmessage = event => {
          if (!valid()) return;
          let data; try { data = JSON.parse(event.data); } catch { return; }
          if (!data || typeof data !== 'object' || data.account_id !== account) return;
          touch();
          if (data.kind === 'connected') {
            const firstHandshake = !active;
            attempts = 0; state('connected');
            if (firstHandshake) onEvent({kind: 'resync', account_id: account});
          } else if ((active || data.kind === 'session_revoked') && !['heartbeat', 'pong'].includes(data.kind)) {
            onEvent(data);
          }
        };
        current.onclose = () => {
          if (!valid()) return;
          clearTimer(watchdog); socket = null;
          state('fallback'); retry(generation);
        };
        current.onerror = () => { if (valid()) current.close(); };
      } catch (error) {
        if (generation !== epoch) return;
        if (error?.status === 403 || error?.status === 401) { state('forbidden'); return; }
        state('fallback'); retry(generation, Number(error?.retryAfter) || 0);
      }
    }
    return {
      start(id) {
        if (!Number.isSafeInteger(id) || id <= 0 || account === id) return;
        stop(); account = id; state('connecting'); void connect(epoch);
      },
      stop,
      isActive() { return active; },
    };
  }
  root.GrowyTelegramRealtime = {create};
  if (typeof module === 'object' && module.exports) module.exports = {create};
})(typeof globalThis === 'object' ? globalThis : this);
