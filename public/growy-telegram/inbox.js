'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const base = '/api/my/telegram/';
  let access = '', refresh = '', challenge = null, state = '', selected = null;
  let accounts = [], accountID = null, cacheScope = '';
  let selectedTopic = null, topics = [], topicMessages = [], topicsOffset = null, chatDetails = {}, editingID = null, editDraft = '', mentionChoices = [];
  let mentionTimer = null, mentionGeneration = 0;
  const accountPath = path => base + `accounts/${accountID}/` + path;
  let dialogs = [], nextCursor = null, dialogsLoadedMore = false, archivedDialogs = [], archivePreviewLoaded = false, archiveUnreadCount = null, messages = [], nextBefore = null, loadedOlder = false, replyTo = null;
  let pinnedMessages = [], currentPinnedIndex = 0, pinnedBrowserOpen = false;
  const requestContext = GrowyTelegramRequests.createRequestContext();
  let timer = null, generation = 0, ticks = 0, search = '';
  let liveVersion = 0, liveChanges = [], historyGeneration = 0;
  const drafts = new Map();
  let pendingSend = null, qrURL = '', noticeTimer, attachmentPreviewURL = null, composeBusy = false;
  let topicsLoadedMore = false;
  const hide = (id, value = true) => { $(id).hidden = value; };
  function notify(text) { if(!text) return; $('notice').textContent = text; hide('notice', false); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => hide('notice'), 9000); }
  function renderAttachmentPreview(file) {
    const panel = $('attachment-preview');
    if (attachmentPreviewURL) { URL.revokeObjectURL(attachmentPreviewURL); attachmentPreviewURL = null; }
    panel.replaceChildren();
    if (!file) { hide('attachment-preview'); return; }

    if (file.type.startsWith('image/')) {
      const image = document.createElement('img');
      image.className = 'attachment-preview-image';
      image.alt = 'Предпросмотр изображения';
      attachmentPreviewURL = URL.createObjectURL(file);
      image.src = attachmentPreviewURL;
      panel.append(image);
    } else {
      const icon = document.createElement('span');
      icon.className = 'attachment-preview-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '↗';
      panel.append(icon);
    }

    const details = document.createElement('span');
    details.className = 'attachment-preview-details';
    const name = document.createElement('strong');
    name.textContent = file.name || 'Вложение';
    const size = document.createElement('small');
    size.textContent = file.size >= 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toLocaleString('ru-RU', {maximumFractionDigits: 1})} МБ`
      : `${Math.max(1, Math.round(file.size / 1024))} КБ`;
    details.append(name, size);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'attachment-preview-remove';
    remove.setAttribute('aria-label', 'Убрать вложение');
    remove.title = 'Убрать вложение';
    remove.textContent = '×';
    remove.addEventListener('click', () => { clearAttachment(); $('text').focus(); });
    panel.append(details, remove);
    hide('attachment-preview', false);
  }
  function clearAttachment() {
    $('attachment').value = '';
    renderAttachmentPreview(null);
  }
  function setAttachmentFile(file) {
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      $('attachment').files = transfer.files;
      $('attachment').dispatchEvent(new Event('change', {bubbles: true}));
      return true;
    } catch {
      notify('Не удалось вставить изображение. Прикрепите его кнопкой «＋».');
      return false;
    }
  }
  const errorMessages = {invalid_media:'Формат медиа не поддерживается. Используйте JPEG, PNG или MP4.',invite_restricted:'Настройки приватности участника запрещают приглашение.',premium_required:'Telegram требует Premium для этого действия.',invalid_member:'Выберите участника или укажите корректный @username.',unsupported_group:'Это действие доступно в супергруппах Telegram.',telegram_forbidden:'У подключённого Telegram-аккаунта нет прав на это действие.',edit_expired:'Telegram больше не разрешает редактировать это сообщение.',not_forum:'В этой группе нет тем.',invalid_mentions:'Не удалось вставить упоминание. Выберите участника заново.',resend_wait:'Подождите перед повторной отправкой кода.',resend_unavailable:'Telegram не смог отправить код повторно. Попробуйте вход по QR-коду.',realtime_unavailable:'Не удалось обновить Telegram. Повторите через несколько секунд.',not_configured:'Подключение Telegram не настроено на сервере.',busy:'Другой запрос Telegram ещё выполняется. Повторите через несколько секунд.',rate_limited:'Telegram просит подождать перед следующим запросом.',session_revoked:'Сессия Telegram отозвана. Подключите аккаунт заново.',not_connected:'Сначала подключите Telegram.',login_expired:'Срок входа истёк. Начните подключение заново.',code_expired:'Код устарел. Запросите новый код.',invalid_credentials:'Неверный код или пароль Telegram.',unavailable:'Telegram временно недоступен. Повторите позже.',invalid_phone:'Проверьте номер телефона.',already_connected:'Сначала отключите текущий Telegram-аккаунт.',not_found:'Чат или вложение не найдено.'};
  const errorText = data => errorMessages[data.code] || data.detail || data.message || Object.values(data).flat().filter(x => typeof x === 'string').join(' ') || 'Не удалось выполнить запрос.';
  function request(path, options = {}, raw = false) {
    return requestContext.enqueue(async check => {
      let response, requestAccess = access;
      const requestRefresh = refresh;
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const fetchOnce = () => fetch(path, {...options, signal: controller.signal, headers: {...(options.body instanceof FormData ? {} : {'Content-Type': 'application/json'}), ...(requestAccess ? {Authorization: `Bearer ${requestAccess}`} : {}), ...options.headers}});
        response = await fetchOnce(); check();
        if (response.status === 401 && requestRefresh && path.startsWith(base)) {
          const renew = await fetch('/api/token/refresh/', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({refresh: requestRefresh}), signal:controller.signal});
          check();
          if (renew.ok) { const tokens = await renew.json(); check(); requestAccess = access = tokens.access; refresh = tokens.refresh || requestRefresh; response = await fetchOnce(); check(); }
        }
        if (!response.ok) {
          const data = await response.json().catch(() => ({})); check();
          if (response.status === 401 && data.code !== 'session_revoked') signedOut();
          if (data.code === 'session_revoked' || data.code === 'not_connected' || data.code === 'code_expired' || data.code === 'login_expired') { requestContext.invalidate(); clearInbox(); state = 'disconnected'; showState(); }
          const error = new Error(errorText(data)); error.code = data.code; error.status = response.status; error.retryAfter = Number(data.retry_after || response.headers.get('Retry-After') || 0); throw error;
        }
        return raw ? response.blob() : response.json();
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('Сервер не ответил вовремя. Обновите чат перед повторной отправкой.');
        throw e;
      } finally { clearTimeout(timeout); }
    });
  }
  const api = (path, data) => request(accountPath(path), data === undefined ? {} : {method:'POST', body:JSON.stringify(data)});
  function stop() {
    generation++; clearTimeout(timer); realtime?.stop(); clearTimeout(realtimeRefresh);
    realtimeRefresh = null; pendingRealtime = null;
    clearTimeout(typingTimeout); hide('typing-status');
  }
  function resetLiveHistory() {
    historyGeneration++; liveChanges = [];
    clearTimeout(typingTimeout); hide('typing-status');
  }
  function clearInbox() {
    resetLiveHistory();
    topicsLoadedMore = false;
    $('chat-modal').close?.(); clearStoryMedia();
    clearMedia(); clearAvatars(); selectedTopic = null; topics = []; topicMessages = []; topicsOffset = null; chatDetails = {}; archivedDialogs = []; archivePreviewLoaded = false; archiveUnreadCount = null; $('folder').value = '0'; $('chat-filter').value = ''; $('sidebar-title').textContent = 'Чаты'; hide('folder-back'); hide('archive-unread'); mentionChoices = []; mentionGeneration++;
    hide('topics-aside'); hide('topics-panel'); hide('topics-empty'); hide('more-topics'); hide('mentions'); hide('topics-back');
    selected = null; dialogs = []; messages = []; pinnedMessages = []; currentPinnedIndex = 0; pinnedBrowserOpen = false; nextCursor = nextBefore = null; loadedOlder = dialogsLoadedMore = false;
    drafts.clear(); $('text').value = ''; clearAttachment(); pendingSend = null; replyTo = null;
    $('dialogs').replaceChildren(); $('messages').replaceChildren(); $('sponsored').replaceChildren(); $('pinned-list').replaceChildren(); $('topics-list').replaceChildren();
    sponsorObserver?.disconnect(); $('inbox').classList.remove('forum-open','topic-active'); $('empty').classList.remove('topic-empty'); $('empty-title').textContent = 'Выберите чат'; $('empty-description').textContent = 'История и новые сообщения появятся здесь.'; hide('pinned-bar'); hide('pinned-browser'); hide('chat-head'); hide('pinned-footer'); hide('sponsored'); hide('reply'); hide('chat-content'); hide('empty', false); renderArchiveShortcut();
  }
  function signedOut() {
    window.GrowyTelegramAvatarCache?.clear(cacheScope); cacheScope = ''; $('chat-modal').close?.();
    stop(); requestContext.invalidate(); access = refresh = ''; challenge = null; state = 'disconnected'; accountID = null; accounts = []; clearInbox(); hide('account-controls'); hide('no-accounts'); $('account-select').replaceChildren();
    $('site-password').value = $('site-code').value = $('password').value = '';
    hide('site-form', false); hide('site-code-form'); hide('site-login', false); hide('connect'); hide('inbox'); hide('logout'); hide('disconnect'); $('identity').textContent = '';
  }
  function showState() {
    stop(); hide('site-login'); hide('logout', false); hide('account-controls', false);
    hide('no-accounts', !!accountID);
    const connected = state === 'connected'; hide('show-stories', !connected); hide('connect', connected || !accountID); hide('inbox', !connected); hide('disconnect', !connected);
    hide('connect-options', connected || ['qr_required','password_required'].includes(state));
    hide('password-form', state !== 'password_required'); hide('qr-panel', state !== 'qr_required'); hide('qr-placeholder', state === 'qr_required');
    $('connect').dataset.state = state;
    $('connect-title').textContent = state === 'password_required' ? 'Введите пароль Telegram' : 'Подключите Telegram по QR-коду';
    $('connect-text').textContent = state === 'password_required' ? 'В аккаунте включена двухэтапная аутентификация. Введите облачный пароль Telegram, чтобы завершить подключение.' : 'Чаты подключённого аккаунта увидят владелец и администраторы организации. Подключайте аккаунт, который хотите использовать совместно.';
    $('qr-placeholder-text').textContent = state === 'password_required' ? 'QR-код уже отсканирован' : 'QR-код появится здесь';
    if (connected) { realtime?.start(accountID); hide('chat-content', !selected); hide('empty', !!selected); startPolling(); }
    if (state === 'qr_required') startPolling();
  }
  function renderAccounts() {
    $('account-select').replaceChildren();
    accounts.forEach(account => {
      const option = document.createElement('option'); option.value = account.id;
      option.textContent = account.label || account.display_name || account.phone || `Аккаунт #${account.id}`;
      if (account.state !== 'connected') option.textContent += ' · не подключён';
      $('account-select').append(option);
    });
    $('account-select').value = accountID || '';
    $('account-select').disabled = !accounts.length;
    const palette = ['#2458D3', '#0E8F80', '#6545D6', '#C46900', '#C2305B', '#17202E'];
    $('account-list').replaceChildren(...accounts.map(account => {
      const name = account.label || account.display_name || account.phone || `Аккаунт #${account.id}`;
      const connected = account.state === 'connected';
      const item = document.createElement('button'); item.type = 'button'; item.className = 'account-item'; item.setAttribute('role', 'listitem');
      if (account.id === accountID) item.setAttribute('aria-current', 'true');
      const avatar = document.createElement('span'); avatar.className = 'account-avatar'; avatar.style.background = palette[account.id % palette.length];
      avatar.textContent = name.trim().split(/\s+/).map(part => (part.match(/[\p{L}\p{N}]/u) || [''])[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '#';
      const copy = document.createElement('span'); copy.className = 'account-copy';
      const title = document.createElement('strong'); title.textContent = name;
      const sub = document.createElement('small');
      const chip = document.createElement('span'); chip.className = `account-status${connected ? ' is-connected' : ''}`; chip.textContent = connected ? 'Подключён' : 'Нужен вход';
      const details = [account.display_name !== name ? account.display_name : '', account.phone !== name ? account.phone : ''].filter(Boolean).join(' · ');
      sub.append(chip, details ? ` · ${details}` : '');
      copy.append(title, sub);
      item.append(avatar, copy);
      item.onclick = () => { if (account.id === accountID) return; $('account-select').value = String(account.id); $('account-select').dispatchEvent(new Event('change')); };
      return item;
    }));
    $('rename-account').disabled = !accountID;
  }
  async function loadStatus() {
    const listing = await request(base + 'accounts/'); accounts = listing.results; cacheScope = listing.cache_scope || '';
    if (!accounts.some(account => account.id === accountID)) accountID = accounts[0]?.id || null;
    renderAccounts();
    const data = accountID ? await api('status/') : {state:'disconnected'};
    state = data.state; $('identity').textContent = data.display_name || '';
    if (!listing.configured) { state = 'disconnected'; notify('Подключение Telegram ещё не настроено на сервере.'); }
    showState(); if (state === 'connected') { await loadDialogs(); await loadArchivePreview().catch(() => {}); }
  }
  $('account-select').onchange = async () => {
    stop(); requestContext.invalidate(); clearInbox(); qrURL = '';
    $('password').value = ''; $('qr-image').removeAttribute('src');
    accountID = Number($('account-select').value);
    try { await loadStatus(); } catch(e) { notify(e.message); }
  };
  $('add-account').onclick = async () => {
    $('add-account').disabled = true;
    try {
      stop(); requestContext.invalidate(); clearInbox(); qrURL = '';
      $('password').value = ''; $('qr-image').removeAttribute('src');
      const account = await request(base + 'accounts/', {method:'POST',body:JSON.stringify({})});
      accountID = account.id; await loadStatus();
    } catch(e) { notify(e.message); } finally { $('add-account').disabled = false; }
  };
  $('add-account-inline').onclick = () => $('add-account').click();
  $('add-account-empty').onclick = () => $('add-account').click();
  $('rename-account').onclick = async () => {
    const label = prompt('Название Telegram-аккаунта', accounts.find(a => a.id === accountID)?.label || '');
    if (label === null) return;
    try { await request(accountPath(''), {method:'PATCH',body:JSON.stringify({label})}); await loadStatus(); }
    catch(e) { notify(e.message); }
  };
  async function loginResult(data) {
    data = data.data || data;
    if (data.two_factor_required) { challenge = data.challenge_id; hide('site-form'); hide('site-code-form', false); return; }
    if (!data.access) throw new Error('Вход не завершён.');
    access = data.access; refresh = data.refresh || ''; $('site-password').value = ''; $('site-code').value = ''; await loadStatus();
  }
  function bindForm(id, handler) {
    $(id).addEventListener('submit', async event => {
      if (id === 'compose' && composeBusy) { event.preventDefault(); return; }
      event.preventDefault(); const buttons = [...event.target.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
      if (id === 'compose') composeBusy = true;
      try { await handler(); } catch(e) { notify(e.message); } finally {
        if (id === 'compose') composeBusy = false;
        buttons.forEach(b => b.disabled = id === 'compose' && !!selectedTopic?.closed);
      }
    });
  }
  bindForm('site-form', async () => loginResult(await request('/api/token/', {method:'POST',body:JSON.stringify({username:$('site-username').value,password:$('site-password').value})})));
  bindForm('site-code-form', async () => loginResult(await request('/api/token/2fa/verify/', {method:'POST',body:JSON.stringify({challenge_id:challenge,code:$('site-code').value})})));
  async function acceptTelegram(data) {
    state = data.state; showState();
    if (state === 'connected') { requestContext.invalidate(); clearInbox(); $('password').value = ''; await loadStatus(); }
  }
  bindForm('password-form', async () => { const password = $('password').value; $('password').value = ''; await acceptTelegram(await api('auth/password/', {password})); });
  function showQR(data) { if (data.url !== qrURL) { qrURL = data.url; $('qr-image').src = data.qr_image; } }
  $('qr-start').onclick = async () => { $('qr-start').disabled = true; try { const data = await api('auth/qr/', {}); showQR(data); await acceptTelegram(data); } catch(e) { notify(e.message); } finally { $('qr-start').disabled = false; } };
  document.querySelectorAll('.reset').forEach(button => button.onclick = () => { stop(); state = 'disconnected'; $('password').value = ''; showState(); });
  $('logout').onclick = () => { signedOut(); hide('site-form', false); hide('site-code-form'); };
  $('disconnect').onclick = async () => { if (!confirm('Отключить этот Telegram-аккаунт для всей организации?')) return; try { stop(); requestContext.invalidate(); await api('disconnect/', {}); window.GrowyTelegramAvatarCache?.clear(cacheScope, accountID); clearInbox(); state = 'disconnected'; await loadStatus(); } catch(e) { notify(e.message); startPolling(); } };
  const avatarURLs = new Map(), avatarPending = new Set();
  let avatarEpoch = 0;
  function clearAvatars() {
    avatarEpoch++; avatarPending.clear();
    avatarURLs.forEach(url => { if (url) URL.revokeObjectURL(url); }); avatarURLs.clear();
    avatarObserver?.disconnect();
  }
  function showAvatar(node, url) {
    if (!url) return;
    const image = document.createElement('img'); image.src = url; image.alt = ''; node.replaceChildren(image);
  }
  const avatarObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { avatarObserver.unobserve(entry.target); fetchAvatar(entry.target, entry.target.avatarDialog); } });
  }, {rootMargin:'60px'});
  function attachAvatar(node, dialog) {
    if (dialog.avatar_preview) showAvatar(node, dialog.avatar_preview);
    if (!dialog.avatar_version) return;
    const key = `${accountID}:${dialog.id}:${dialog.avatar_version}`;
    if (avatarURLs.has(key)) { showAvatar(node, avatarURLs.get(key)); return; }
    node.dataset.avatarKey = key; node.avatarDialog = dialog;
    if (avatarObserver) avatarObserver.observe(node);
  }
  let avatarChain = Promise.resolve();
  function fetchAvatar(node, dialog) {
    const epoch = avatarEpoch;
    // Only one photo enters the shared request queue at a time, leaving room
    // for history, typing and sends between downloads.
    avatarChain = avatarChain.catch(() => {}).then(() => epoch === avatarEpoch ? fetchAvatarNow(node, dialog) : undefined);
  }
  async function fetchAvatarNow(node, dialog) {
    const epoch = avatarEpoch, key = `${accountID}:${dialog.id}:${dialog.avatar_version}`;
    if (avatarPending.has(key)) return;
    if (avatarURLs.has(key)) {showAvatar(node, avatarURLs.get(key));return;}
    avatarPending.add(key);
    try {
      const scope = cacheScope;
      let blob = await window.GrowyTelegramAvatarCache?.get(scope, key);
      if (epoch !== avatarEpoch) return;
      if (!blob) { blob = await request(accountPath(`dialogs/${dialog.id}/avatar/?v=${encodeURIComponent(dialog.avatar_version)}`), {}, true); if (epoch === avatarEpoch) window.GrowyTelegramAvatarCache?.put(scope, key, blob); }
      if (epoch !== avatarEpoch) return;
      const url = URL.createObjectURL(blob); avatarURLs.set(key, url); showAvatar(node, url);
      document.querySelectorAll(`[data-avatar-key="${key}"]`).forEach(target => showAvatar(target, url));
      // Other rows/header sharing this avatar are updated on the next render.
    } catch(e) { if (epoch === avatarEpoch && e.code === 'not_found') avatarURLs.set(key, null); }
    finally { if (epoch === avatarEpoch) avatarPending.delete(key); }
  }
  function renderDialogs() {
    $('dialogs').querySelectorAll('[data-avatar-key]').forEach(node => avatarObserver?.unobserve(node));
    const previousTop = $('dialogs').scrollTop; const filter = $('chat-filter').value.toLocaleLowerCase(); $('dialogs').replaceChildren();
    dialogs.filter(d => d.title.toLocaleLowerCase().includes(filter)).forEach(dialog => {
      const button = document.createElement('button'); button.className = 'dialog' + (selected?.id === dialog.id ? ' active' : '');
      const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = dialog.title.slice(0,1) || '?'; attachAvatar(avatar, dialog);
      const info = document.createElement('span'); info.className = 'dialog-info';
      const top = document.createElement('span'); top.className = 'dialog-line';
      const title = document.createElement('strong'); title.textContent = dialog.title;
      if (dialog.kind && dialog.kind !== 'user') { const kind = document.createElement('span'); kind.className = 'dialog-kind'; kind.setAttribute('aria-hidden', 'true'); kind.innerHTML = '<svg viewBox="0 0 24 24"><path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>'; top.append(kind); }
      top.append(title);
      const lastDate = dialog.last_message?.date ? new Date(dialog.last_message.date) : null;
      if (lastDate && !Number.isNaN(lastDate.getTime())) {
        const time = document.createElement('time'); time.dateTime = lastDate.toISOString();
        time.textContent = lastDate.toDateString() === new Date().toDateString() ? lastDate.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) : lastDate.toLocaleDateString('ru-RU', {day:'numeric', month:'short'});
        top.append(time);
      }
      const bottom = document.createElement('span'); bottom.className = 'dialog-line';
      const preview = document.createElement('small'); preview.textContent = dialog.last_message?.text || (dialog.last_message?.attachment ? 'Вложение' : dialog.kind === 'channel' ? 'Канал / группа' : 'Нет сообщений');
      bottom.append(preview);
      if (dialog.unread_count) { const unread = document.createElement('span'); unread.className = 'unread'; unread.textContent = dialog.unread_count > 99 ? '99+' : dialog.unread_count; bottom.append(unread); button.classList.add('has-unread'); }
      info.append(top, bottom); button.append(avatar, info);
      button.onclick = () => selectDialog(dialog).catch(e => notify(e.message)); $('dialogs').append(button);
    });
    $('dialogs').scrollTop = previousTop; hide('more-dialogs'); renderArchiveShortcut();
  }
  function renderArchiveShortcut() {
    const inArchive = $('folder').value === '1';
    $('sidebar-title').textContent = inArchive ? 'Архив' : 'Чаты';
    hide('folder-back', !inArchive);
    hide('archive-shortcut', inArchive || (archivePreviewLoaded && !archivedDialogs.length));
    const preview = archivedDialogs.slice(0, 3).map(dialog => dialog.title).filter(Boolean).join(', ');
    $('archive-preview').textContent = preview || (archivePreviewLoaded ? 'Архив пуст' : 'Открыть архивированные чаты');
    const unread = archiveUnreadCount;
    $('archive-unread').textContent = unread > 99 ? '99+' : String(unread || '');
    hide('archive-unread', inArchive || !unread);
  }
  async function loadArchivePreview() {
    const account = accountID;
    const data = await api('dialogs/?' + new URLSearchParams({folder:'1', limit:50}));
    if (accountID !== account) return;
    archivedDialogs = data.results || [];
    archiveUnreadCount = data.next_cursor ? null : archivedDialogs.reduce((total, dialog) => total + Number(dialog.unread_count || 0), 0);
    archivePreviewLoaded = true; renderArchiveShortcut();
  }
  async function loadDialogs(more = false) {
    const folder = $('folder').value;
    const query = new URLSearchParams({folder,limit:50}); if (more && nextCursor) query.set('cursor',nextCursor);
    const data = await api('dialogs/?' + query);
    if ($('folder').value !== folder) return;
    if (folder === '1' && !more) {
      archivedDialogs = data.results || [];
      archiveUnreadCount = data.next_cursor ? null : archivedDialogs.reduce((total, dialog) => total + Number(dialog.unread_count || 0), 0);
      archivePreviewLoaded = true;
    }
    const merged = GrowyTelegramHistory.mergeDialogs({results:dialogs, nextCursor, loadedOlder:dialogsLoadedMore}, data, more);
    dialogs = merged.results; nextCursor = merged.nextCursor; dialogsLoadedMore = merged.loadedOlder; renderDialogs();
  }
  $('chat-filter').oninput = renderDialogs;
  $('folder').onchange = () => { dialogs = []; nextCursor = null; dialogsLoadedMore = false; $('dialogs').scrollTop = 0; $('chat-filter').value = ''; renderArchiveShortcut(); loadDialogs().catch(e => notify(e.message)); };
  $('archive-shortcut').onclick = () => { $('folder').value = '1'; $('folder').dispatchEvent(new Event('change', {bubbles:true})); };
  $('folder-back').onclick = () => { $('folder').value = '0'; $('folder').dispatchEvent(new Event('change', {bubbles:true})); };
  let moreDialogsLoading = false, moreMessagesLoading = false;
  async function scrollDialogs() {
    const pane = $('dialogs');
    if (moreDialogsLoading || !nextCursor || pane.scrollHeight - pane.scrollTop - pane.clientHeight > 150) return;
    moreDialogsLoading = true; hide('more-dialogs', false);
    try { await loadDialogs(true); } catch(e) { notify(e.message); } finally { moreDialogsLoading = false; hide('more-dialogs'); }
  }
  $('dialogs').onscroll = scrollDialogs;
  function resetConversation() {
    resetLiveHistory();
    clearMedia(); renderedMessages = ''; messages = []; pinnedMessages = []; currentPinnedIndex = 0; nextBefore = null; loadedOlder = false; search = ''; replyTo = null; editingID = null; hide('pinned-bar'); hide('show-pinned'); hide('sponsored'); sponsorObserver?.disconnect();
    mentionGeneration++; mentionChoices = []; hide('mentions'); $('message-search').value = ''; hide('reply');
    $('messages').replaceChildren(); $('text').value = ''; clearAttachment(); pinnedBrowserOpen = false; hide('pinned-browser'); hide('pinned-footer'); hide('chat-head', false); hide('topics-aside'); $('inbox').classList.remove('forum-open','topic-active'); $('pinned-search').value = ''; $('pinned-list').replaceChildren();
  }
  const draftKey = () => `${selected?.id}:${selectedTopic?.id || 0}`;
  function showTopicMode() {
    const forum = !!selected?.forum, choosing = forum && !selectedTopic;
    $('inbox').classList.toggle('forum-open', forum); $('inbox').classList.toggle('topic-active', forum && !!selectedTopic);
    hide('topics-aside', !forum); hide('topics-panel', !forum); hide('messages', choosing); hide('compose', choosing);
    hide('chat-content', choosing); hide('empty', !choosing);
    $('empty').classList.toggle('topic-empty', choosing);
    $('empty-title').textContent = choosing ? 'Выберите тему, чтобы начать переписку' : 'Выберите чат';
    $('empty-description').textContent = choosing ? '' : 'История и новые сообщения появятся здесь.';
    hide('more-messages'); hide('topics-back', !selectedTopic);
    $('message-search').hidden = choosing; hide('show-pinned', choosing || !pinnedMessages.length); hide('pinned-bar', choosing || !pinnedMessages.length);
    $('topics-title').textContent = selected?.title || '';
    $('chat-title').textContent = selectedTopic ? selectedTopic.title : selected?.title || '';
    updateTopicComposer();
  }
  function updateTopicComposer() {
    $('text').disabled = !!selectedTopic?.closed; $('send').disabled = !!selectedTopic?.closed || composeBusy;
    $('text').placeholder = selectedTopic?.closed ? 'Тема закрыта в Telegram' : 'Написать сообщение…';
  }
  async function loadTopics(more = false, background = false) {
    const id = selected?.id; if (!id || !selected.forum) return;
    if (!more && !background) { topicsLoadedMore = false; topics = []; topicMessages = []; topicsOffset = null; $('topics-list').replaceChildren(); hide('more-topics'); $('topics-empty').textContent = 'Загружаем темы…'; hide('topics-empty', false); }
    const query = new URLSearchParams(more && topicsOffset ? topicsOffset : {});
    let data;
    try { data = await api(`dialogs/${id}/topics/?${query}`); }
    catch (error) { if (selected?.id === id && !more && !background) { $('topics-empty').textContent = 'Не удалось загрузить темы.'; hide('topics-empty', false); } throw error; }
    if (selected?.id !== id) return;
    const pageTopics = data.results || [];
    const preserveOlder = background && !more && topicsLoadedMore && !!data.next_offset;
    const oldOffset = topicsOffset;
    topics = more ? [...new Map([...topics, ...pageTopics].map(t => [t.id,t])).values()]
      : preserveOlder ? [...pageTopics, ...topics.filter(topic => !pageTopics.some(fresh => fresh.id === topic.id))] : pageTopics;
    topicsLoadedMore = more || preserveOlder;
    topicMessages = [...new Map([...topicMessages, ...(data.messages || [])].map(message => [String(message.id), message])).values()];
    topicsOffset = preserveOlder ? oldOffset : data.next_offset;
    const refreshedTopic = topics.find(topic => topic.id === selectedTopic?.id);
    if (refreshedTopic) {
      selectedTopic = refreshedTopic;
      $('chat-title').textContent = selectedTopic.title; updateTopicComposer();
    }
    $('topics-list').replaceChildren();
    topics.forEach(topic => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'topic-row';
      const isSelected = String(selectedTopic?.id) === String(topic.id);
      button.classList.toggle('active', isSelected);
      if (isSelected) button.setAttribute('aria-current', 'true');
      button.dataset.topicId = topic.id;
      const icon = document.createElement('span'); icon.className = 'topic-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = topic.icon_emoji || topic.emoji || '#';
      const copy = document.createElement('span'); copy.className = 'topic-row-copy';
      const title = document.createElement('strong'); title.textContent = topic.title;
      const last = topicMessages.find(message => String(message.id) === String(topic.top_message)) || topic.last_message || null;
      const preview = document.createElement('small');
      const previewText = last ? (last.text || (last.attachment ? `📎 ${last.attachment.name || 'Вложение'}` : 'Медиа')) : topic.closed ? 'Тема закрыта' : 'Нет сообщений';
      preview.textContent = last?.sender?.name ? `${last.sender.name}: ${previewText}` : previewText;
      copy.append(title, preview);
      const meta = document.createElement('span'); meta.className = 'topic-row-meta';
      if (last?.date) {
        const date = new Date(last.date);
        if (!Number.isNaN(date.getTime())) {
          const time = document.createElement('time'); time.dateTime = date.toISOString();
          const today = new Date();
          time.textContent = date.toDateString() === today.toDateString()
            ? date.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})
            : date.toLocaleDateString('ru-RU', {day:'numeric', month:'short'});
          meta.append(time);
        }
      }
      if (topic.unread_count) {const count=document.createElement('span');count.className='unread';count.textContent=topic.unread_count;meta.append(count);}
      button.append(icon, copy, meta);
      button.onclick = async () => {
        if (selected?.id !== id) return;
        if (selectedTopic) drafts.set(draftKey(), $('text').value);
        $('topics-list').querySelectorAll('.topic-row').forEach(row => { const active = row === button; row.classList.toggle('active', active); if (active) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current'); });
        selectedTopic = topic; resetConversation(); showTopicMode(); $('text').value = drafts.get(draftKey()) || '';
        try {await Promise.all([loadMessages(false,true), loadPinnedMessages()]);} catch(e) {notify(e.message);}
      }; $('topics-list').append(button);
    });
    $('topics-empty').textContent = topics.length ? '' : 'В этой группе пока нет тем.';
    hide('topics-empty', !!topics.length);
    hide('more-topics', !topicsOffset);
  }
  $('more-topics').onclick = () => loadTopics(true).catch(e => notify(e.message));
  $('topics-back').onclick = () => { drafts.set(draftKey(),$('text').value); selectedTopic = null; resetConversation(); showTopicMode(); Promise.all([loadTopics(), loadPinnedMessages()]).catch(e => notify(e.message)); };
  function returnToDialogList() {
    if (selected) drafts.set(draftKey(), $('text').value);
    selected = null; selectedTopic = null; hide('topics-aside'); hide('chat-content'); hide('empty', false);
    $('empty').classList.remove('topic-empty'); $('empty-title').textContent = 'Выберите чат'; $('empty-description').textContent = 'История и новые сообщения появятся здесь.';
    $('inbox').classList.remove('selected','forum-open','topic-active'); renderDialogs();
  }
  $('topics-list-back').onclick = returnToDialogList;
  async function selectDialog(dialog) {
    topicsLoadedMore = false;
    if(selected) drafts.set(draftKey(), $('text').value);
    $('chat-modal').close?.(); selected = dialog; selectedTopic = null; chatDetails = {}; topics = []; topicMessages = []; topicsOffset = null; $('topics-list').replaceChildren(); hide('topics-empty'); hide('more-topics'); resetConversation(); $('inbox').classList.add('selected');
    $('chat-title').textContent = dialog.title; $('chat-avatar').replaceChildren(); const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = dialog.title.slice(0,1) || '?'; attachAvatar(avatar, dialog); $('chat-avatar').append(avatar);
    hide('empty'); hide('chat-content', false); renderDialogs(); showTopicMode();
    const id = dialog.id;
    const details = await api(`dialogs/${id}/details/`); if(selected?.id !== id) return; chatDetails = details;
    selected.forum = chatDetails.forum; showTopicMode();
    if (selected.forum) { await Promise.all([loadTopics(), loadPinnedMessages()]); }
    else { $('text').value = drafts.get(draftKey()) || ''; renderMessages(); await Promise.all([loadMessages(false,true), loadPinnedMessages()]); await loadSponsored(dialog); }
  }
  $('close-modal').onclick = () => $('chat-modal').close();
  function openModal(title) { $('chat-modal').classList.remove('forward-modal'); clearStoryMedia(); $('modal-title').textContent = title; $('modal-content').replaceChildren(); if (!$('chat-modal').open) $('chat-modal').showModal(); }
  let storyURL = null;
  function clearStoryMedia() { if(storyURL) URL.revokeObjectURL(storyURL);storyURL=null; }
  $('chat-modal').addEventListener('close', () => { clearStoryMedia(); $('chat-modal').classList.remove('forward-modal'); });
  $('show-stories').onclick = async () => {
    const account = accountID; openModal('Истории Telegram'); clearStoryMedia();
    const content = $('modal-content');
    const valid = () => accountID === account && $('chat-modal').open && content === $('modal-content');
    const publish = document.createElement('button');publish.textContent='Опубликовать историю';content.append(publish);
    publish.onclick = () => {
      openModal('Новая история');
      const form=document.createElement('form');form.className='story-viewer';
      const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,video/mp4';file.required=true;
      const caption=document.createElement('textarea');caption.placeholder='Подпись';caption.maxLength=200;
      const privacy=document.createElement('select');
      [['contacts','Мои контакты'],['everyone','Все пользователи Telegram']].forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;privacy.append(option);});
      const submit=document.createElement('button');submit.type='submit';submit.textContent='Опубликовать на 24 часа';
      const hint=document.createElement('p');hint.textContent='Фото JPEG/PNG или видео MP4 до 60 секунд, размер до 20 МБ. Публикация от имени подключённого аккаунта.';
      form.append(hint,file,caption,privacy,submit);$('modal-content').append(form);
      let requestID=crypto.randomUUID();
      file.onchange=caption.oninput=privacy.onchange=()=>{requestID=crypto.randomUUID();};
      form.onsubmit=async event=>{
        event.preventDefault();if(!valid() || !form.isConnected || !file.files[0])return;
        const selectedFile=file.files[0];if(selectedFile.size>20*1024*1024){notify('Максимальный размер — 20 МБ');return;}
        submit.disabled=true;
        try {
          const data=new FormData();data.append('file',selectedFile);data.append('caption',caption.value);data.append('privacy',privacy.value);data.append('request_id',requestID);
          if(selectedFile.type==='video/mp4') {
            const video=document.createElement('video'), url=URL.createObjectURL(selectedFile);
            try {
              await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Не удалось прочитать видео')),10000);video.onloadedmetadata=()=>{clearTimeout(timeout);resolve();};video.onerror=()=>{clearTimeout(timeout);reject(new Error('Не удалось прочитать MP4'));};video.src=url;});
              if(!Number.isFinite(video.duration) || video.duration>60)throw new Error('Видео должно быть не длиннее 60 секунд');
              data.append('duration',String(video.duration));data.append('width',String(video.videoWidth));data.append('height',String(video.videoHeight));
            } finally {video.removeAttribute('src');URL.revokeObjectURL(url);}
          }
          if(!valid() || !form.isConnected)return;
          await request(base+`accounts/${account}/stories/`,{method:'POST',body:data});
          if(valid()){$('chat-modal').close();notify('История опубликована в Telegram');}
        } catch(e){notify(e.message);} finally {submit.disabled=false;}
      };
    };
    const listing=document.createElement('div');content.append(listing);
    const more=document.createElement('button');more.textContent='Ещё истории';more.hidden=true;content.append(more);let cursor=null;
    async function watch(group, index=0) {
      if(!valid())return;const story=group.stories[index];if(!story)return;
      openModal(group.sender.name);clearStoryMedia();
      const viewer=document.createElement('div');viewer.className='story-viewer';$('modal-content').append(viewer);
      const loading=document.createElement('p');loading.textContent='Загрузка истории…';viewer.append(loading);
      try {
        const blob=await request(base+`accounts/${account}/stories/${group.sender.peer_id}/${story.id}/`,{},true);
        if(!valid() || !viewer.isConnected)return;
        storyURL=URL.createObjectURL(blob);
        const media=document.createElement(blob.type.startsWith('video/')?'video':'img');media.src=storyURL;
        if(blob.type.startsWith('video/')){media.controls=true;media.playsInline=true;}else media.alt=story.caption || 'История Telegram';
        loading.remove();viewer.append(media);
        const text=document.createElement('p');text.textContent=story.caption;viewer.append(text);
        await request(base+`accounts/${account}/stories/${group.sender.peer_id}/${story.id}/`,{method:'POST',body:JSON.stringify({action:'read'})});
        if(!valid() || !viewer.isConnected)return;
        const navigation=document.createElement('div');
        if(index>0){const previous=document.createElement('button');previous.textContent='←';previous.onclick=()=>watch(group,index-1);navigation.append(previous);}
        if(index+1<group.stories.length){const next=document.createElement('button');next.textContent='Следующая →';next.onclick=()=>watch(group,index+1);navigation.append(next);}
        const back=document.createElement('button');back.textContent='Все истории';back.onclick=()=>$('show-stories').onclick();navigation.append(back);viewer.append(navigation);
        if(group.own){const remove=document.createElement('button');remove.textContent='Удалить историю';remove.onclick=async()=>{if(!confirm('Удалить эту историю из Telegram?'))return;try{await api(`stories/${group.sender.peer_id}/${story.id}/`,{action:'delete'});$('show-stories').onclick();}catch(e){notify(e.message);}};viewer.append(remove);}
        else {const reaction=document.createElement('button');reaction.textContent='❤️';reaction.onclick=async()=>{try{await api(`stories/${group.sender.peer_id}/${story.id}/`,{action:'reaction',emoji:'❤️'});notify('Реакция отправлена');}catch(e){notify(e.message);}};viewer.append(reaction);}
      } catch(e){if(viewer.isConnected)loading.textContent=e.message;}
    }
    async function load() {
      more.disabled=true;
      try {
        const data=await request(base+`accounts/${account}/stories/`+(cursor?'?'+new URLSearchParams({cursor}):''));
        if(!valid() || !listing.isConnected)return;
        data.results.forEach(group=>{if(!group.stories.length)return;const button=document.createElement('button');button.className='story-person';
          const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=group.sender.name.slice(0,1);attachAvatar(avatar,{id:group.sender.peer_id,avatar_version:group.sender.avatar_version,avatar_preview:group.sender.avatar_preview});
          const label=document.createElement('span');label.textContent=`${group.own?'Мои истории':group.sender.name} · ${group.stories.length}`;button.append(avatar,label);button.onclick=()=>watch(group);listing.append(button);});
        cursor=data.next_cursor;more.hidden=!cursor;if(!listing.childNodes.length)listing.textContent='Сейчас нет доступных историй.';
      } catch(e){notify(e.message);} finally {more.disabled=false;}
    }
    more.onclick=load;await load();
  };
  function pinnedText(message) {
    return message?.text?.trim() || (message?.attachment ? 'Вложение' : 'Сообщение без текста');
  }
  function renderPinnedBar() {
    const available = pinnedMessages.length > 0 && !!selected && !(selected.forum && !selectedTopic);
    hide('pinned-bar', !available);
    hide('show-pinned', !available);
    if (!available) return;
    currentPinnedIndex = Math.max(0, Math.min(currentPinnedIndex, pinnedMessages.length - 1));
    const message = pinnedMessages[currentPinnedIndex];
    $('pinned-count').textContent = String(pinnedMessages.length);
    $('show-pinned').setAttribute('aria-label', `Показать все закреплённые сообщения · ${pinnedMessages.length}`);
    $('show-pinned').title = `Все закреплённые сообщения · ${pinnedMessages.length}`;
    $('pinned-preview-label').textContent = `Закреплённое · ${currentPinnedIndex + 1} из ${pinnedMessages.length}`;
    $('pinned-preview-text').textContent = `${message.sender?.name ? `${message.sender.name}: ` : ''}${pinnedText(message)}`;
    $('pinned-preview').setAttribute('aria-label', `Перейти к закреплённому сообщению ${currentPinnedIndex + 1} из ${pinnedMessages.length}`);
  }
  function renderPinnedList() {
    const list = $('pinned-list');
    if (!list) return;
    list.replaceChildren();
    const query = $('pinned-search').value.trim().toLocaleLowerCase('ru');
    const rows = pinnedMessages.filter(message => !query || `${message.sender?.name || ''} ${message.text || ''}`.toLocaleLowerCase('ru').includes(query));
    $('pinned-browser-title').textContent = `Закреплённые сообщения · ${pinnedMessages.length}`;
    hide('pinned-footer', !chatDetails.can_pin || !pinnedMessages.length);
    $('unpin-all').textContent = `Открепить все · ${pinnedMessages.length}`;
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'pinned-list-empty';
      empty.textContent = query ? 'Ничего не найдено' : 'В этом чате пока нет закреплённых сообщений';
      list.append(empty);
      return;
    }
    rows.forEach(message => {
      const item = document.createElement('div');
      item.className = 'pinned-row-wrap';
      item.setAttribute('role', 'listitem');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'pinned-row';
      open.setAttribute('aria-label', `Перейти к сообщению: ${pinnedText(message)}`);
      const marker = document.createElement('span');
      marker.className = 'pinned-row-marker';
      marker.setAttribute('aria-hidden', 'true');
      const content = document.createElement('span');
      content.className = 'pinned-row-content';
      const author = document.createElement('strong');
      author.textContent = message.sender?.name || (message.outgoing ? 'Вы' : 'Сообщение');
      const preview = document.createElement('span');
      preview.className = 'pinned-row-preview';
      preview.textContent = pinnedText(message);
      const date = document.createElement('small');
      const timestamp = message.date ? new Date(message.date) : null;
      date.textContent = !timestamp || Number.isNaN(timestamp.getTime()) ? '' : timestamp.toLocaleString('ru-RU', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      content.append(author, preview, date);
      open.append(marker, content);
      open.onclick = () => navigateToPinned(message);
      item.append(open);
      if (chatDetails.can_pin) {
        const unpin = document.createElement('button');
        unpin.type = 'button';
        unpin.className = 'pinned-row-unpin';
        unpin.textContent = 'Открепить';
        unpin.setAttribute('aria-label', `Открепить сообщение: ${pinnedText(message)}`);
        unpin.onclick = async () => {
          if (selected?.id !== messagePeerID || accountID !== messageAccountID) return;
          try {
            await api(`dialogs/${messagePeerID}/messages/${message.id}/pin/`, {unpin:true});
            pinnedMessages = pinnedMessages.filter(item => String(item.id) !== String(message.id));
            messages = messages.map(item => String(item.id) === String(message.id) ? {...item, pinned:false} : item);
            currentPinnedIndex = Math.min(currentPinnedIndex, Math.max(0, pinnedMessages.length - 1));
            renderMessages(); renderPinnedBar(); renderPinnedList();
            await loadPinnedMessages();
          } catch(e) { notify(e.message); }
        };
        const messagePeerID = selected.id, messageAccountID = accountID;
        item.append(unpin);
      }
      list.append(item);
    });
  }
  async function loadPinnedMessages() {
    if (!selected) return;
    const id = selected.id, topic = selectedTopic?.id, account = accountID;
    try {
      const data = await api(`dialogs/${id}/pinned/`);
      if (selected?.id !== id || accountID !== account) return;
      const previousID = pinnedMessages[currentPinnedIndex]?.id;
      pinnedMessages = (data.results || []).filter(message => !topic || Number(message.topic_id || 1) === Number(topic));
      const previousIndex = pinnedMessages.findIndex(message => String(message.id) === String(previousID));
      currentPinnedIndex = previousIndex >= 0 ? previousIndex : Math.max(0, pinnedMessages.length - 1);
      renderPinnedBar();
      if (pinnedBrowserOpen) renderPinnedList();
    } catch(e) {
      notify(e.message);
      if (pinnedBrowserOpen) {
        const list = $('pinned-list'); list.replaceChildren();
        const error = document.createElement('div'); error.className = 'pinned-list-empty'; error.textContent = 'Не удалось загрузить закреплённые сообщения.';
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Повторить'; retry.onclick = loadPinnedMessages;
        list.append(error, retry);
      }
    }
  }
  async function openPinnedBrowser() {
    if (!selected) return;
    pinnedBrowserOpen = true;
    hide('typing-status'); clearTimeout(typingTimeout);
    hide('chat-head'); hide('pinned-bar'); hide('topics-panel'); hide('more-messages'); hide('messages'); hide('sponsored'); hide('reply'); hide('mentions'); hide('attachment-preview'); hide('compose');
    hide('pinned-browser', false);
    $('pinned-search').value = '';
    $('pinned-list').replaceChildren();
    const loading = document.createElement('div'); loading.className = 'pinned-list-empty'; loading.textContent = 'Загружаем закреплённые сообщения…'; $('pinned-list').append(loading);
    await loadPinnedMessages();
    $('pinned-search').focus();
  }
  function closePinnedBrowser() {
    if (!pinnedBrowserOpen) return;
    pinnedBrowserOpen = false;
    hide('pinned-browser'); hide('chat-head', false);
    showTopicMode();
    hide('reply', !replyTo && !editingID);
    hide('attachment-preview', !$('attachment').files.length);
    if (selected?.kind === 'channel') loadSponsored(selected).catch(e => notify(e.message));
    renderPinnedBar();
    if (!pinnedBrowserOpen && !$('show-pinned').hidden) $('show-pinned').focus();
  }
  async function navigateToPinned(message) {
    if (!selected || !message) return;
    closePinnedBrowser();
    const id = selected.id, account = accountID, targetID = message.id;
    if (search) {
      resetLiveHistory();
      search = ''; $('message-search').value = ''; messages = []; nextBefore = null; loadedOlder = false; renderedMessages = '';
      await loadMessages(false, true);
    }
    if (!messages.some(item => String(item.id) === String(targetID))) {
      moreMessagesLoading = true;
      $('more-messages').textContent = 'Загружаем закреплённое сообщение…';
      hide('more-messages', false);
      try {
        while (selected?.id === id && accountID === account && nextBefore && !messages.some(item => String(item.id) === String(targetID))) {
          const before = nextBefore;
          await loadMessages(true, false);
          if (nextBefore === before) break;
        }
      } catch(e) { notify(e.message); }
      finally { moreMessagesLoading = false; $('more-messages').textContent = 'Загрузка истории…'; hide('more-messages'); }
    }
    if (selected?.id !== id || accountID !== account) return;
    const row = [...$('messages').querySelectorAll('.message')].find(node => String(node.dataset.messageId) === String(targetID));
    if (!row) { notify('Не удалось найти это сообщение в истории чата.'); return; }
    row.scrollIntoView({behavior:'smooth', block:'center'});
    row.classList.add('pinned-message-focus');
    setTimeout(() => row.classList.remove('pinned-message-focus'), 1800);
  }
  $('show-pinned').onclick = openPinnedBrowser;
  $('pinned-back').onclick = closePinnedBrowser;
  $('pinned-search').oninput = renderPinnedList;
  $('pinned-preview').onclick = () => {
    const message = pinnedMessages[currentPinnedIndex];
    if (!message) return;
    currentPinnedIndex = currentPinnedIndex <= 0 ? pinnedMessages.length - 1 : currentPinnedIndex - 1;
    renderPinnedBar();
    navigateToPinned(message);
  };
  $('unpin-all').onclick = async () => {
    if (!chatDetails.can_pin || !pinnedMessages.length || !selected) return;
    const id = selected.id, account = accountID, rows = [...pinnedMessages];
    if (!confirm(`Открепить все ${rows.length} сообщений в этом чате?`)) return;
    if(selected?.id!==id || accountID!==account)return;
    $('unpin-all').disabled = true;
    try {
      for (const message of rows) {
        if (selected?.id !== id || accountID !== account) return;
        await api(`dialogs/${id}/messages/${message.id}/pin/`, {unpin:true});
      }
    } catch(e) {
      notify(e.message);
    } finally {
      $('unpin-all').disabled = false;
    }
    if (selected?.id !== id || accountID !== account) return;
    messages = messages.map(item => rows.some(pinned => String(pinned.id) === String(item.id)) ? {...item, pinned:false} : item);
    renderMessages();
    await loadPinnedMessages();
    await loadMessages().catch(e => notify(e.message));
  };
  let sponsorObserver;
  async function loadSponsored(dialog) {
    hide('sponsored'); $('sponsored').replaceChildren(); sponsorObserver?.disconnect();
    if(dialog.kind !== 'channel') return;
    const id = dialog.id, data = await api(`dialogs/${id}/sponsored/`);
    if(selected?.id !== id) return;
    data.results.forEach(ad => {
      const row = document.createElement('div'); row.className = 'sponsored-message';
      const label = document.createElement('small'); label.textContent = 'Реклама · Telegram';
      const title = document.createElement('strong'); title.textContent = ad.title;
      const text = document.createElement('p'); text.textContent = ad.text;
      row.append(label,title,text);
      if(ad.sponsor_info || ad.additional_info) { const info = document.createElement('small'); info.textContent = [ad.sponsor_info,ad.additional_info].filter(Boolean).join(' · '); row.append(info); }
      try {
        const url = new URL(ad.url);
        if(['https:','tg:'].includes(url.protocol)) {
          const link = document.createElement('a'); link.textContent = ad.button_text; link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.onclick = () => api(`dialogs/${id}/sponsored/`, {token:ad.token,action:'click'}).catch(e => notify(e.message)); row.append(link);
        }
      } catch(_) {}
      row.dataset.token = ad.token; $('sponsored').append(row);
    });
    hide('sponsored', !data.results.length);
    sponsorObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if(entry.isIntersecting && !document.hidden) { sponsorObserver.unobserve(entry.target); api(`dialogs/${id}/sponsored/`, {token:entry.target.dataset.token,action:'view'}).catch(e => notify(e.message)); }
    }), {threshold:0.75});
    $('sponsored').querySelectorAll('.sponsored-message').forEach(row => sponsorObserver.observe(row));
  }
  $('back').onclick = returnToDialogList;
  const mediaURLs = new Map(), mediaJobs = new Map();
  let mediaEpoch = 0, mediaBytes = 0, mediaChain = Promise.resolve();
  const mediaObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {mediaObserver.unobserve(entry.target); entry.target.loadMedia?.();}
  }, {root:$('messages'), rootMargin:'150px'}) : null;
  let mediaViewerRequest = 0, mediaViewerTrigger = null;
  const mediaViewer = $('media-viewer'), mediaViewerImage = $('media-viewer-image');
  const closeMediaViewer = () => { if(mediaViewer.open)mediaViewer.close(); };
  $('media-viewer-close').onclick = closeMediaViewer;
  mediaViewer.addEventListener('click',event=>{if(event.target===mediaViewer)closeMediaViewer();});
  mediaViewer.addEventListener('close',()=>{
    mediaViewerRequest++;mediaViewer.removeAttribute('aria-busy');mediaViewerImage.removeAttribute('src');mediaViewerImage.hidden=true;hide('media-viewer-loading');
    const trigger=mediaViewerTrigger;mediaViewerTrigger=null;if(trigger?.isConnected)trigger.focus({preventScroll:true});
  });
  function clearMedia() {
    closeMediaViewer();mediaEpoch++; mediaObserver?.disconnect(); mediaJobs.clear();
    for (const item of mediaURLs.values()) URL.revokeObjectURL(item.url);
    mediaURLs.clear(); mediaBytes = 0;
  }
  async function mediaURL(path, key) {
    if (mediaURLs.has(key)) return mediaURLs.get(key).url;
    if (mediaJobs.has(key)) return mediaJobs.get(key);
    const epoch = mediaEpoch;
    const job = (async () => {
      const blob = await request(path, {}, true);
      if (epoch !== mediaEpoch) return null;
      // Bound memory retained between five-second history refreshes.
      while (mediaBytes + blob.size > 50 * 1024 * 1024 && mediaURLs.size) {
        const [oldKey, old] = mediaURLs.entries().next().value;
        URL.revokeObjectURL(old.url); mediaBytes -= old.size; mediaURLs.delete(oldKey);
      }
      const url = URL.createObjectURL(blob); mediaURLs.set(key, {url, size:blob.size}); mediaBytes += blob.size;
      return url;
    })();
    mediaJobs.set(key, job);
    try {return await job;} finally {if(epoch === mediaEpoch) mediaJobs.delete(key);}
  }
  async function openImageViewer(trigger,path,key,name,thumbnailOnly) {
    mediaViewerTrigger=trigger;const request=++mediaViewerRequest;
    mediaViewerImage.alt=name||'Фотография';mediaViewerImage.hidden=true;mediaViewerImage.removeAttribute('src');hide('media-viewer-loading',false);
    mediaViewer.setAttribute('aria-busy','true');if(!mediaViewer.open)mediaViewer.showModal();
    try {
      const currentURL=trigger.currentSrc?.startsWith('blob:')?trigger.currentSrc:null;
      const url=currentURL||await mediaURL(path+(thumbnailOnly?'?thumbnail=1':''),key+(thumbnailOnly?':thumb':''));
      if(!url||request!==mediaViewerRequest||!mediaViewer.open)return;
      mediaViewerImage.src=url;mediaViewerImage.hidden=false;hide('media-viewer-loading');
    } catch(error) {
      if(request===mediaViewerRequest){mediaViewer.close();notify(error.message);}
    } finally {if(request===mediaViewerRequest)mediaViewer.removeAttribute('aria-busy');}
  }
  function renderMedia(row, message, peer, account) {
    const attachment = message.attachment, mime = attachment.mime_type || '';
    const path = base + `accounts/${account}/dialogs/${peer}/messages/${message.id}/attachment/`;
    const key = `${account}:${peer}:${message.id}:${message.edited_at || ''}`;
    const image = /^image\/(jpeg|png|webp|gif)$/.test(mime);
    const playable = /^video\/(mp4|webm)$/.test(mime) || /^audio\//.test(mime);
    const large = attachment.size > 20 * 1024 * 1024;
    const holder = document.createElement('div'); holder.className = 'media-holder'; row.append(holder);
    if (image || playable) {
      const element = document.createElement(image ? 'img' : mime.startsWith('video/') ? 'video' : 'audio');
      element.className = 'inline-media'; element.setAttribute('aria-label', attachment.name);
      if (image) {
        element.alt = attachment.name; element.loading = 'lazy'; element.tabIndex=0; element.setAttribute('role','button');
        element.setAttribute('aria-label',`Открыть фото: ${attachment.name||'изображение'}`); element.title='Открыть фото';
        const open=()=>openImageViewer(element,path,key,attachment.name,large);
        element.addEventListener('click',open);
        element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
      }
      else {element.controls = true; element.preload = 'metadata';}
      if (attachment.width && attachment.height && image) element.style.aspectRatio = `${attachment.width}/${attachment.height}`;
      holder.append(element);
      const loader = document.createElement('button'); loader.textContent = large ? 'Показать миниатюру' : image ? 'Загрузить фото' : 'Загрузить для воспроизведения'; holder.append(loader);
      const thumbnail = large || (playable && !mime.startsWith('audio/'));
      const epoch = mediaEpoch;
      async function load(preview = false) {
        if (epoch !== mediaEpoch) return;
        loader.disabled = true;
        try {
          const url = await mediaURL(path + (preview ? '?thumbnail=1' : ''), key + (preview ? ':thumb' : ''));
          if (!url || epoch !== mediaEpoch) return;
          if(preview && !image) element.poster = url; else element.src = url;
          loader.hidden = !preview || image; loader.textContent = 'Загрузить для воспроизведения';
        } catch(e) {loader.textContent = 'Повторить загрузку'; notify(e.message);}
        finally {loader.disabled = false;}
      }
      loader.onclick = () => load(large);
      const cached = mediaURLs.get(key); if(cached) {element.src = cached.url;loader.hidden = true;}
      else if(image || thumbnail) {
        holder.loadMedia = () => {mediaChain = mediaChain.catch(()=>{}).then(() => epoch === mediaEpoch && load(thumbnail));};
        if(mediaObserver) mediaObserver.observe(holder); else holder.loadMedia();
      }
      if(large) {loader.onclick = () => notify('Файл больше 20 МБ. Полная версия доступна в Telegram.');}
    }
    const download = document.createElement('button'); download.className = 'media-download'; download.textContent = '↓ ' + attachment.name;
    download.onclick = async () => {
      if (large) {notify('Файл больше 20 МБ. Скачайте его в Telegram.'); return;}
      download.disabled = true;
      try {const url = await mediaURL(path, key); if(!url)return; const link = document.createElement('a');link.href=url;link.download=attachment.name;link.click();}
      catch(e) {notify(e.message);} finally {download.disabled=false;}
    };
    holder.append(download);
  }
  const QUICK_REACTIONS = ['👍','👌','🔥','❤️','😘','😭','🤩'];
  const MORE_REACTIONS = ['😂','👏','🎉','😮','😢','🙏','😍','🤔','🥳','💯','👎','🤝','💪','🥰','😎','💔','✅','☕','🍾','😡','🤮','🌚','⚡'];
  const ACTION_MENU_ICONS = {
    'Переслать': '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0-5 5v1"/>',
    'Копировать текст': '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    'Редактировать': '<path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z"/>',
    'Удалить у всех': '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
    'Закрепить': '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    'Открепить': '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  };
  let renderedMessages = '';
  document.addEventListener('pointerdown', event => {
    const target = event.target instanceof Element ? event.target.closest('.message-actions') : null;
    $('messages').querySelectorAll('.message-actions[open]').forEach(menu => { if (menu !== target) menu.open = false; });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && pinnedBrowserOpen) { closePinnedBrowser(); return; }
    if (event.key === 'Escape') $('messages').querySelectorAll('.message-actions[open]').forEach(menu => { menu.open = false; });
  });
  function renderMessages(scroll = false, prepend = false) {
    const fingerprint = `${accountID}:${selected?.id}:${selectedTopic?.id || 0}:` + JSON.stringify(messages);
    if(!scroll && fingerprint === renderedMessages) return;
    renderedMessages = fingerprint;
    const pane = $('messages'), oldHeight = pane.scrollHeight, oldTop = pane.scrollTop;
    const atBottom = oldHeight - oldTop - pane.clientHeight < 100;
    const reuse = typeof pane.insertBefore === 'function';
    const previous = reuse ? new Map([...pane.children].map(node => [Number(node.dataset.messageId), node])) : new Map();
    if(reuse) {const ids=new Set(messages.map(m=>m.id));for(const node of previous.values())if(!ids.has(Number(node.dataset.messageId)))node.remove();}
    else {mediaObserver?.disconnect();pane.replaceChildren();}
    let cursor = pane.firstChild;
    const orderedMessages = [...messages].sort((a,b) => a.id-b.id);
    const belongsToSameBubbleGroup = (first, second) => {
      if (!first || !second || first.service || second.service || !!first.outgoing !== !!second.outgoing) return false;
      let sameSender = !!first.outgoing && !!second.outgoing;
      if (!sameSender) {
        const firstPeer = first.sender?.peer_id, secondPeer = second.sender?.peer_id;
        sameSender = firstPeer != null && secondPeer != null && String(firstPeer) === String(secondPeer);
      }
      const firstTime = new Date(first.date).getTime(), secondTime = new Date(second.date).getTime();
      return sameSender && Number.isFinite(firstTime) && Number.isFinite(secondTime) && secondTime >= firstTime && secondTime - firstTime <= 15 * 60 * 1000;
    };
    orderedMessages.forEach((message, index) => {
      const joinsPrevious = belongsToSameBubbleGroup(orderedMessages[index - 1], message);
      const joinsNext = belongsToSameBubbleGroup(message, orderedMessages[index + 1]);
      const groupPosition = joinsPrevious ? (joinsNext ? 'middle' : 'end') : (joinsNext ? 'start' : 'single');
      const version = JSON.stringify(message) + JSON.stringify(chatDetails) + groupPosition;
      const existing = previous.get(message.id);
      if(existing?.dataset.messageVersion === version) {
        if(existing !== cursor) pane.insertBefore(existing, cursor || null);
        cursor = existing.nextSibling; return;
      }
      const messagePeer = selected.id, messageAccount = accountID;
      const row = document.createElement('div');
      row.className = `message message-group-${groupPosition}${message.outgoing ? ' outgoing' : ''}${message.sender && !message.service && !message.outgoing ? ' incoming-author' : ''}`;
      row.dataset.messageId = String(message.id); row.dataset.messageVersion = version;
      if (message.sender && !message.service && !message.outgoing) {
        const avatarSlot=document.createElement('span');avatarSlot.className='message-avatar-slot';avatarSlot.setAttribute('aria-hidden','true');
        if (!joinsNext && message.sender.peer_id && message.sender.avatar_version) {
          const avatar=document.createElement('span');avatar.className='avatar sender-avatar';avatar.textContent=message.sender.name?.slice(0,1)||'?';
          attachAvatar(avatar,{id:message.sender.peer_id,avatar_version:message.sender.avatar_version,avatar_preview:message.sender.avatar_preview});avatarSlot.append(avatar);
        }
        row.append(avatarSlot);
      }
      const bubble=document.createElement('div');bubble.className='message-bubble';row.append(bubble);
      const bubbleHead=document.createElement('div');bubbleHead.className='message-bubble-head';
      if (message.sender && !message.service && !message.outgoing && !joinsPrevious) {
        const author=document.createElement('strong');author.className='message-author';author.textContent=message.sender.name || 'Telegram';bubbleHead.append(author);
      }
      if (message.pinned) {const pin=document.createElement('small');pin.className='pinned-message-label';pin.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg><span>Закреплено</span>';bubble.append(pin);}
      if (message.reply_to_id) { const note = document.createElement('small'); note.className = 'reply-preview'; note.textContent = messages.find(m => m.id === message.reply_to_id)?.text || 'Ответ на сообщение #' + message.reply_to_id; bubble.append(note); }
      const content=document.createElement('div');content.className='message-content';
      const text = document.createElement('span'); text.className='message-text'; text.textContent = message.text || (message.service ? 'Событие Telegram' : ''); content.append(text);
      bubble.append(content);
      if (message.attachment) renderMedia(bubble, message, messagePeer, messageAccount);
      if (!message.service) {
        const reply = document.createElement('button');
        reply.type = 'button';
        reply.className = 'message-reply-trigger';
        reply.setAttribute('aria-label', 'Ответить на сообщение');
        reply.title = 'Ответить';
        reply.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="m9 14-5-5 5-5M4 9h10a6 6 0 0 1 6 6v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        reply.onclick = event => {
          event.stopPropagation();
          if(selected?.id!==messagePeer || accountID!==messageAccount)return;
          editingID = null;
          replyTo = message.id;
          $('reply').querySelector('span').textContent = message.text || (message.attachment ? 'Вложение' : 'Сообщение');
          hide('reply', false);
          $('text').focus();
        };
        bubble.append(reply);
        window.GrowyTelegramBindReply(row, reply);
      }
      let messageActions=null, reactionPicker=null, moreReactions=null, reactionPending=false;
      const setReaction=async emoji=>{
        if(selected?.id!==messagePeer || accountID!==messageAccount || reactionPending)return;
        const current=message.reactions?.find(reaction=>reaction.chosen)?.emoji;
        reactionPending=true;
        row.querySelectorAll('.reaction-choice,.reaction-more-toggle,.reactions button').forEach(button=>{button.disabled=true;});
        try{
          await api(`dialogs/${messagePeer}/messages/${message.id}/reaction/`,{emoji:current===emoji?'':emoji});
          if(selected?.id!==messagePeer || accountID!==messageAccount)return;
          if(messageActions)messageActions.open=false;
          if(reactionPicker)reactionPicker.hidden=true;
          moreReactions?.setAttribute('aria-expanded','false');
          await loadMessages();
        }catch(e){notify(e.message);}
        finally{reactionPending=false;}
      };
      if (!message.service) {
        const menu=document.createElement('details');menu.className='message-actions';const toggle=document.createElement('summary');toggle.textContent='⋯';toggle.setAttribute('aria-label','Действия и реакции с сообщением');menu.append(toggle);
        const actions=document.createElement('div');actions.className='action-menu';
        const addAction=(label,handler)=>{
          const button=document.createElement('button');button.type='button';button.className='action-menu-item';
          const icon=document.createElement('span');icon.className='action-menu-icon';icon.setAttribute('aria-hidden','true');
          icon.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ACTION_MENU_ICONS[label] || ''}</svg>`;
          const caption=document.createElement('span');caption.textContent=label;
          button.append(icon,caption);
          if(label.startsWith('Удалить')){const divider=document.createElement('span');divider.className='action-menu-divider';divider.setAttribute('aria-hidden','true');actions.append(divider);button.classList.add('is-destructive');}
          button.onclick=async()=>{menu.open=false;if(selected?.id!==messagePeer || accountID!==messageAccount)return;try{await handler();}catch(e){notify(e.message);}};actions.append(button);
        };
        messageActions=menu;
        const toolbar=document.createElement('div');toolbar.className='reaction-toolbar';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Быстрые реакции');
        const ownReaction=message.reactions?.find(reaction=>reaction.chosen)?.emoji;
        const quickReactions=[...QUICK_REACTIONS];if(ownReaction&&!quickReactions.includes(ownReaction))quickReactions[quickReactions.length-1]=ownReaction;
        quickReactions.forEach(emoji=>{const chosen=ownReaction===emoji;const button=document.createElement('button');button.type='button';button.className='reaction-choice';button.textContent=emoji;button.title=chosen?`Убрать реакцию ${emoji}`:`Реакция ${emoji}`;button.setAttribute('aria-label',`${chosen?'Убрать':'Поставить'} реакцию ${emoji}`);button.setAttribute('aria-pressed',String(chosen));if(chosen)button.classList.add('chosen');button.onclick=()=>setReaction(emoji);toolbar.append(button);});
        moreReactions=document.createElement('button');moreReactions.type='button';moreReactions.className='reaction-more-toggle';moreReactions.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';moreReactions.title='Другие реакции';moreReactions.setAttribute('aria-label','Другие реакции');moreReactions.setAttribute('aria-haspopup','true');moreReactions.setAttribute('aria-expanded','false');
        reactionPicker=document.createElement('div');reactionPicker.className='reaction-picker';reactionPicker.id=`reaction-picker-${message.id}`;reactionPicker.setAttribute('role','group');reactionPicker.setAttribute('aria-label','Выбор реакции');reactionPicker.hidden=true;moreReactions.setAttribute('aria-controls',reactionPicker.id);
        const allReactions=[...new Set([...QUICK_REACTIONS,...MORE_REACTIONS,...(ownReaction?[ownReaction]:[])])];
        allReactions.forEach(emoji=>{const chosen=ownReaction===emoji;const button=document.createElement('button');button.type='button';button.className='reaction-choice';button.textContent=emoji;button.title=chosen?`Убрать реакцию ${emoji}`:`Реакция ${emoji}`;button.setAttribute('aria-label',`${chosen?'Убрать':'Поставить'} реакцию ${emoji}`);button.setAttribute('aria-pressed',String(chosen));if(chosen)button.classList.add('chosen');button.onclick=()=>setReaction(emoji);reactionPicker.append(button);});
        moreReactions.onclick=()=>{reactionPicker.hidden=!reactionPicker.hidden;moreReactions.setAttribute('aria-expanded',String(!reactionPicker.hidden));};toolbar.append(moreReactions,reactionPicker);
        menu.append(toolbar,actions);
        menu.addEventListener('toggle',()=>{
          if(!menu.open){
            reactionPicker.hidden=true;moreReactions.setAttribute('aria-expanded','false');
            menu.classList.remove('reaction-below','menu-above');
            toolbar.style.left='';toolbar.style.right='';toolbar.style.top='';toolbar.style.bottom='';
            actions.style.left='';actions.style.right='';return;
          }
          const bounds=pane.getBoundingClientRect(),messageBounds=row.getBoundingClientRect();
          menu.classList.remove('menu-above');
          menu.classList.toggle('reaction-below',messageBounds.top-bounds.top<58);
          const initialActionsBounds=actions.getBoundingClientRect();
          const openAbove=initialActionsBounds.bottom>bounds.bottom-8;
          if(openAbove){
            menu.classList.remove('reaction-below');menu.classList.add('menu-above');
            const menuHeight=actions.getBoundingClientRect().height,toolbarHeight=toolbar.getBoundingClientRect().height;
            toolbar.style.top=`-${menuHeight+toolbarHeight+16}px`;toolbar.style.bottom='auto';
          } else {toolbar.style.top='';toolbar.style.bottom='';}
          const menuBounds=menu.getBoundingClientRect(),toolbarBounds=toolbar.getBoundingClientRect(),actionsBounds=actions.getBoundingClientRect();
          const left=Math.max(bounds.left+8,Math.min(toolbarBounds.left,bounds.right-toolbarBounds.width-8));
          const actionsLeft=Math.max(bounds.left+8,Math.min(actionsBounds.left,bounds.right-actionsBounds.width-8));
          toolbar.style.left=`${left-menuBounds.left}px`;toolbar.style.right='auto';
          actions.style.left=`${actionsLeft-menuBounds.left}px`;actions.style.right='auto';
        });
        if(chatDetails.can_pin) addAction(message.pinned?'Открепить':'Закрепить',async()=>{await api(`dialogs/${selected.id}/messages/${message.id}/pin/`,{unpin:!!message.pinned});await Promise.all([loadMessages(),loadPinnedMessages()]);});
        addAction('Копировать текст',async()=>{await navigator.clipboard.writeText(message.text);notify('Текст скопирован');});
        addAction('Переслать',()=>forwardMessage(message));
        if(message.outgoing || chatDetails.can_edit_others) addAction('Редактировать',()=>{editDraft=$('text').value;editingID=message.id;replyTo=null;clearAttachment();$('text').value=message.text;$('reply').querySelector('span').textContent='Редактирование сообщения';hide('reply',false);$('text').focus();});
        if(message.outgoing || selected.kind==='user' || chatDetails.can_delete_others) addAction('Удалить у всех',async()=>{if(!confirm('Удалить это сообщение у всех участников в Telegram?'))return;if(selected?.id!==messagePeer || accountID!==messageAccount)return;await api(`dialogs/${messagePeer}/messages/${message.id}/delete/`,{});if(selected?.id!==messagePeer || accountID!==messageAccount)return;messages=messages.filter(m=>m.id!==message.id);renderMessages();if(message.pinned)await loadPinnedMessages();});
        bubbleHead.append(menu);
      }
      if (bubbleHead.childElementCount) bubble.prepend(bubbleHead);
      if(message.reactions?.length){const reactions=document.createElement('div');reactions.className='reactions';message.reactions.forEach(reaction=>{const button=document.createElement('button');button.className=reaction.chosen?'chosen':'';button.textContent=`${reaction.emoji} ${reaction.count}`;button.title=`Реакция ${reaction.emoji}, ${reaction.count}`;button.setAttribute('aria-label',`${reaction.chosen?'Убрать':'Поставить'} реакцию ${reaction.emoji}; ${reaction.count} всего`);button.setAttribute('aria-pressed',String(!!reaction.chosen));button.onclick=()=>setReaction(reaction.emoji);reactions.append(button);});bubble.append(reactions);}
      const meta=document.createElement('div');meta.className='message-meta';
      const time = document.createElement('span'); time.className='message-time';
      const messageDate = new Date(message.date);
      const sameDay = messageDate.toDateString() === new Date().toDateString();
      time.textContent = (sameDay ? messageDate.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'}) : messageDate.toLocaleString('ru-RU', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})) + (message.edited_at ? ' · изменено' : '');
      meta.append(time); bubble.append(meta);
      if(reuse) {
        if(existing) {if(cursor === existing) cursor=existing.nextSibling;existing.remove();}
        pane.insertBefore(row,cursor || null);cursor=row.nextSibling;
      } else pane.append(row);
    });
    if (scroll || atBottom) pane.scrollTop = pane.scrollHeight; else pane.scrollTop = oldTop + (prepend ? Math.max(0,pane.scrollHeight-oldHeight) : 0);
    hide('more-messages');
  }
  async function loadMessages(more = false, scroll = false) {
    if (!selected || (selected.forum && !selectedTopic)) return; const id = selected.id, currentSearch = search, currentTopic = selectedTopic?.id;
    const query = new URLSearchParams({limit:50}); if(currentTopic)query.set('topic_id',currentTopic); if (more && nextBefore) query.set('before',nextBefore); if (search) query.set('search',search);
    const revision = liveVersion, history = historyGeneration;
    const data = await api(`dialogs/${id}/messages/?` + query);
    if (history !== historyGeneration || selected?.id !== id || search !== currentSearch || selectedTopic?.id !== currentTopic) return;
    const merged = GrowyTelegramHistory.mergeHistory({results: messages, nextBefore, loadedOlder}, data, more);
    messages = merged.results;
    if (!search) for (const change of liveChanges.filter(change => change.revision > revision)) {
      if (change.ids) messages = messages.filter(row => !change.ids.includes(row.id));
      else {
        const index = messages.findIndex(row => row.id === change.row.id);
        if (index >= 0) messages[index] = change.row;
        else if (change.kind === 'message_new') messages.push(change.row);
      }
    }
    nextBefore = merged.nextBefore; loadedOlder = merged.loadedOlder;
    renderMessages(scroll, more);
    if (!search && data.results.length && !document.hidden) {
      const maxID = Math.max(...data.results.map(m => m.id)); await api(`dialogs/${id}/read/`, {max_id:maxID,...(currentTopic ? {topic_id:currentTopic}:{})});
    }
  }
  $('messages').onscroll = async () => {
    if (moreMessagesLoading || !nextBefore || $('messages').scrollTop > 100) return;
    moreMessagesLoading = true; hide('more-messages', false);
    try { await loadMessages(true); } catch(e) { notify(e.message); } finally { moreMessagesLoading = false; hide('more-messages'); }
  };
  let searchTimer;
  $('message-search').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { resetLiveHistory(); search = $('message-search').value; messages = []; nextBefore = null; loadedOlder = false; loadMessages(false,true).catch(e => notify(e.message)); },400); };
  $('cancel-reply').onclick = () => { replyTo = null; if(editingID){editingID=null;$('text').value=editDraft;} hide('reply'); };
  bindForm('compose', async () => {
    if (!selected) return; const text = $('text').value, file = $('attachment').files[0], id = selected.id, reply = replyTo;
    if (!text.trim() && !file) return;
    const topic = selectedTopic?.id, mentions = selectedMentions(text);
        if(editingID){const edited=messages.find(message=>message.id===editingID);await api(`dialogs/${id}/messages/${editingID}/edit/`,{text,mentions});editingID=null;$('text').value=editDraft;hide('reply');await loadMessages();if(edited?.pinned)await loadPinnedMessages();return;}
    if (file) {
      if (file.size > 20*1024*1024) throw new Error('Максимальный размер файла — 20 МБ.');
      if (text.length > 1024) throw new Error('Подпись к файлу — не более 1024 символов.');
      const data = new FormData(); data.append('file',file); data.append('caption',text); data.append('request_id',pendingSend?.key || crypto.randomUUID()); if(reply) data.append('reply_to',reply); if(topic)data.append('topic_id',topic); data.append('mentions',JSON.stringify(mentions));
      if (!pendingSend || pendingSend.peer !== id || pendingSend.topic !== topic || pendingSend.text !== text || pendingSend.file !== file || pendingSend.reply !== reply) pendingSend = {peer:id,topic,text,file,reply,key:crypto.randomUUID()};
      data.set('request_id',pendingSend.key);
      await request(accountPath(`dialogs/${id}/attachments/`), {method:'POST',body:data});
    } else {
      if (!pendingSend || pendingSend.peer !== id || pendingSend.topic !== topic || pendingSend.text !== text || pendingSend.reply !== reply) pendingSend = {peer:id,topic,text,reply,key:crypto.randomUUID()};
      await api(`dialogs/${id}/messages/`, {text,mentions,...(topic?{topic_id:topic}:{}),request_id:pendingSend.key,...(reply ? {reply_to:reply} : {})});
    }
    pendingSend = null; drafts.delete(draftKey());
    if (selected?.id === id && selectedTopic?.id === topic && $('text').value === text) { $('text').value = ''; clearAttachment(); replyTo = null; hide('reply'); await loadMessages(false,true); }
  });
  function forwardMessage(message) {
    const source=selected.id, sourceAccount=accountID, sourceFolder=$('folder').value, requestIDs=new Map();
    openModal('Переслать сообщение'); $('chat-modal').classList.add('forward-modal');
    const content=$('modal-content'), picker=document.createElement('div'); picker.className='forward-picker'; content.append(picker);
    let pickerDialogs=[...dialogs], cursor=nextCursor, activeFilter='all', loading=false, loadFailed=false;
    const search=document.createElement('input'); search.type='search'; search.className='forward-search'; search.placeholder='Поиск чатов'; search.setAttribute('aria-label','Поиск среди загруженных чатов');
    const searchHint=document.createElement('div'); searchHint.className='forward-hint'; searchHint.textContent='Поиск среди загруженных чатов';
    const filters=document.createElement('div'); filters.className='forward-filters'; filters.setAttribute('role','group'); filters.setAttribute('aria-label','Фильтр по типу чата');
    const filterOptions=[['all','Все'],['user','Личные'],['group','Группы'],['channel','Каналы']];
    const filterButtons=new Map();
    filterOptions.forEach(([id,label])=>{const button=document.createElement('button');button.type='button';button.className='forward-filter';button.textContent=label;button.setAttribute('aria-pressed',String(id==='all'));button.onclick=()=>{activeFilter=id;render();};filterButtons.set(id,button);filters.append(button);});
    const list=document.createElement('div'); list.className='forward-list';
    picker.append(search,searchHint,filters,list);

    const normalized=value=>String(value||'').normalize('NFKC').toLocaleLowerCase();
    const kindOf=dialog=>dialog.kind==='user'?'user':dialog.kind==='channel'?'channel':'group';
    const kindLabel=dialog=>kindOf(dialog)==='user'?'Личный чат':kindOf(dialog)==='channel'?'Канал':'Группа';
    const render=()=>{
      if(!picker.isConnected)return;
      const query=normalized(search.value);
      filterButtons.forEach((button,id)=>button.setAttribute('aria-pressed',String(activeFilter===id)));
      const matches=pickerDialogs.filter(dialog=>{
        const matchesFilter=activeFilter==='all'||kindOf(dialog)===activeFilter;
        const matchesSearch=!query||normalized(`${dialog.title} ${dialog.username||''}`).includes(query);
        return matchesFilter&&matchesSearch;
      });
      list.replaceChildren();
      if(!matches.length){const empty=document.createElement('div');empty.className='forward-empty';empty.textContent=query?'По этому запросу ничего не найдено':'В этой категории пока нет чатов';list.append(empty);}
      matches.forEach(dialog=>{
        const button=document.createElement('button');button.type='button';button.className='forward-dialog';
        const avatar=document.createElement('span');avatar.className='avatar forward-avatar';avatar.textContent=dialog.title?.slice(0,1)||'?';attachAvatar(avatar,dialog);
        const info=document.createElement('span');info.className='forward-dialog-info';
        const title=document.createElement('strong');title.textContent=dialog.title||'Без названия';
        const subtitle=document.createElement('small');subtitle.textContent=kindLabel(dialog);info.append(title,subtitle);
        button.append(avatar,info);button.setAttribute('aria-label',`${title.textContent}, ${subtitle.textContent}`);
        const send=async(topic)=>{if(accountID!==sourceAccount)return;const key=`${dialog.id}:${topic||0}`;if(!requestIDs.has(key))requestIDs.set(key,crypto.randomUUID());try{await api(`dialogs/${source}/messages/${message.id}/forward/`,{target_peer_id:dialog.id,request_id:requestIDs.get(key),...(topic?{topic_id:topic}:{})});$('chat-modal').close();notify('Сообщение переслано');if(selected?.id===dialog.id)await loadMessages();}catch(e){notify(e.message);}};
        button.onclick=async()=>{if(!dialog.forum){await send();return;}try{const data=await api(`dialogs/${dialog.id}/topics/`);if(accountID!==sourceAccount||!picker.isConnected||!$('chat-modal').open)return;openModal(`Выберите тему · ${dialog.title}`);data.results.forEach(topic=>{const choice=document.createElement('button');choice.className='topic-row';choice.textContent=topic.title;choice.onclick=()=>send(topic.id);$('modal-content').append(choice);});}catch(e){notify(e.message);}};
        list.append(button);
      });
      if(cursor){
        const more=document.createElement('button');more.type='button';more.className='forward-load-more';
        more.textContent=loading?'Загружаем чаты…':loadFailed?'Повторить загрузку':'Загрузить ещё чаты';more.disabled=loading;
        more.onclick=loadNextPage;list.append(more);
      }
    };
    async function loadNextPage(){
      if(loading||!cursor)return;loading=true;loadFailed=false;render();
      const query=new URLSearchParams({folder:sourceFolder,limit:50,cursor});
      try{
        const data=await api('dialogs/?'+query);
        if(accountID!==sourceAccount||!picker.isConnected)return;
        pickerDialogs=[...new Map([...pickerDialogs,...(data.results||[])].map(dialog=>[dialog.id,dialog])).values()];
        cursor=data.next_cursor||null;
      }catch(e){if(picker.isConnected){loadFailed=true;notify(e.message);}}
      finally{loading=false;render();}
    }
    search.oninput=render;
    render();
    queueMicrotask(()=>{if(picker.isConnected)search.focus();});
  }
  function selectedMentions(text) {
    const result=[];
    mentionChoices.filter(choice=>!choice.username).forEach(choice=>{let start=0,index;while((index=text.indexOf(choice.label,start))!==-1){result.push({peer_id:choice.peer_id,offset:index,length:choice.label.length});start=index+choice.label.length;}});
    return result.slice(0,50);
  }
  function updateMentions() {
    clearTimeout(mentionTimer);const generation=++mentionGeneration;
    const input=$('text'),prefix=input.value.slice(0,input.selectionStart),match=prefix.match(/(?:^|\s)@([^\s@]*)$/u);
    if(!match || !selected || selected.kind==='user'){hide('mentions');return;}
    const id=selected.id,term=match[1],position=input.selectionStart;
    mentionTimer=setTimeout(async()=>{
      try {const data=await api(`dialogs/${id}/participants/?`+new URLSearchParams({search:term}));if(generation!==mentionGeneration || selected?.id!==id)return;
        $('mentions').replaceChildren();
        data.results.slice(0,12).forEach(user=>{const button=document.createElement('button');button.type='button';button.textContent=user.name+(user.username?` · @${user.username}`:'');
          button.onclick=()=>{const label=user.username?`@${user.username}`:`@${user.name}`;input.value=input.value.slice(0,position-term.length-1)+label+' '+input.value.slice(position);if(!mentionChoices.some(c=>c.peer_id===user.peer_id))mentionChoices.push({...user,label});hide('mentions');input.focus();};$('mentions').append(button);});hide('mentions',!data.results.length);
      }catch(e){hide('mentions');if(e.code!=='busy')notify(e.message);}
    },350);
  }
  let lastTyping = 0;
  $('text').oninput = () => { updateMentions(); if(selected && $('text').value && Date.now()-lastTyping > 5000) { lastTyping = Date.now(); api(`dialogs/${selected.id}/typing/`, {}).catch(() => {}); } };
  $('text').onkeydown = event => { if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if(!$('send').disabled) $('compose').requestSubmit(); } };
  $('attachment').onchange = () => {
    const file = $('attachment').files[0];
    renderAttachmentPreview(file);
    if (file) notify('Прикреплён файл: ' + file.name);
  };
  $('text').addEventListener('paste', (event) => {
    const imageItem = Array.from(event.clipboardData?.items || []).find(item => item.kind === 'file' && item.type.startsWith('image/'));
    const image = imageItem?.getAsFile();
    if (!image) return;
    event.preventDefault();
    if (image.size > 20 * 1024 * 1024) { notify('Максимальный размер файла — 20 МБ.'); return; }
    const extension = image.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const file = image.name ? image : new File([image], `screenshot-${Date.now()}.${extension}`, {type: image.type, lastModified: Date.now()});
    setAttachmentFile(file);
  });
  // Coalesce sidebar/topic/pin snapshots without losing earlier events in a burst.
  let realtimeRefresh = null, typingTimeout = null, pendingRealtime = null, realtimeSync = null;
  function queueRealtimeRefresh(options = {}) {
    if (!pendingRealtime || pendingRealtime.epoch !== generation || pendingRealtime.history !== historyGeneration) {
      pendingRealtime = {epoch: generation, account: accountID, history: historyGeneration,
        peer: selected?.id, topics: false, pins: false, messages: false};
    }
    for (const key of ['topics', 'pins', 'messages']) pendingRealtime[key] ||= !!options[key];
    if (!document.hidden && !realtimeRefresh && !realtimeSync)
      realtimeRefresh = setTimeout(refreshRealtimeSnapshots, 400);
  }
  async function refreshRealtimeSnapshots() {
    realtimeRefresh = null;
    if (document.hidden || !pendingRealtime || realtimeSync) return;
    const update = pendingRealtime; pendingRealtime = null; realtimeSync = update;
    let retryDelay = 400;
    const valid = () => update.epoch === generation && update.account === accountID && state === 'connected';
    const sameChat = () => valid() && update.history === historyGeneration && update.peer === selected?.id;
    try {
      if (!valid()) return;
      await loadDialogs();
      if (sameChat() && update.topics && selected?.forum) await loadTopics(false, true);
      if (sameChat() && update.messages) await loadMessages();
      if (sameChat() && update.pins && selected) await loadPinnedMessages();
      if (valid() && $('folder').value === '0') await loadArchivePreview();
    } catch (error) {
      if (valid() && (['busy', 'rate_limited', 'unavailable', 'realtime_unavailable'].includes(error.code) || error.status >= 500)) {
        queueRealtimeRefresh(update);
        retryDelay = Math.max(1000, (error.retryAfter || 10) * 1000);
      }
      if (valid() && !['busy', 'context_changed'].includes(error.code)) notify(error.message);
    } finally {
      if (realtimeSync === update) realtimeSync = null;
      if (pendingRealtime && !document.hidden && !realtimeRefresh)
        realtimeRefresh = setTimeout(refreshRealtimeSnapshots, retryDelay);
    }
  }
  function recordLiveChange(change) {
    liveChanges.push({revision: ++liveVersion, ...change}); liveChanges = liveChanges.slice(-500);
  }
  const realtime = window.GrowyTelegramRealtime?.create({
    ticket: id => request(base + `accounts/${id}/ws-ticket/`, {method: 'POST', body: '{}'}),
    onState: value => {
      if (value === 'forbidden') {
        stop(); requestContext.invalidate(); clearInbox(); state = 'disconnected';
        hide('inbox'); hide('connect'); hide('disconnect');
        notify('Доступ к Telegram изменился. Откройте раздел заново.');
      }
    },
    onEvent: event => {
      if (event.account_id !== accountID || state !== 'connected') return;
      const samePeer = !!selected && event.peer_id === selected.id;
      if (event.kind === 'typing') {
        if (samePeer && !pinnedBrowserOpen && (!selected.forum || (event.topic_id || 1) === selectedTopic?.id)) {
          $('typing-status').textContent = 'Печатает…'; hide('typing-status', !event.active);
          clearTimeout(typingTimeout); typingTimeout = setTimeout(() => hide('typing-status'), 6000);
        }
        return;
      }
      if (event.kind === 'session_revoked') {
        requestContext.invalidate(); clearInbox(); state = 'disconnected'; showState(); return;
      }
      let refreshMessages = samePeer && (search || event.kind === 'message_changed');
      if (event.kind === 'resync') {
        resetLiveHistory(); messages = []; nextBefore = null; loadedOlder = false; renderedMessages = '';
        queueRealtimeRefresh({topics: !!selected?.forum, pins: !!selected, messages: !!selected}); return;
      }
      if (event.kind === 'message_deleted' && selected &&
          (samePeer || (event.peer_id == null && selected.kind !== 'channel')) && Array.isArray(event.message_ids)) {
        const ids = event.message_ids.filter(id => Number.isSafeInteger(id) && id > 0);
        recordLiveChange({ids}); messages = messages.filter(row => !ids.includes(row.id)); renderMessages();
      } else if (['message_new', 'message_edited'].includes(event.kind) && samePeer &&
          event.message && Number.isSafeInteger(event.message.id) && event.message.id > 0 && !search) {
        const row = event.message, index = messages.findIndex(message => message.id === row.id);
        if (!selected.forum || selectedTopic?.id === (row.topic_id || 1)) {
          recordLiveChange({kind: event.kind, row});
          if (index >= 0) messages[index] = row;
          else if (event.kind === 'message_new') messages.push(row);
          else refreshMessages = true;
          renderMessages();
          if (event.kind === 'message_new' && !row.outgoing && !document.hidden && !pinnedBrowserOpen &&
              $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 100)
            api(`dialogs/${selected.id}/read/`, {max_id: row.id, ...(selectedTopic ? {topic_id: selectedTopic.id} : {})}).catch(() => {});
        } else if (index >= 0) {
          recordLiveChange({ids: [row.id]}); messages.splice(index, 1); renderMessages(); refreshMessages = true;
        }
      }
      queueRealtimeRefresh({topics: samePeer && !!selected?.forum, messages: refreshMessages,
        pins: !!selected && ((samePeer || event.peer_id == null) &&
          (['message_changed', 'message_deleted', 'message_edited'].includes(event.kind) || event.message?.service))});
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state === 'connected')
      queueRealtimeRefresh({topics: !!selected?.forum, messages: !!selected, pins: !!selected});
  });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', event => { if (event.persisted) showState(); });
  function startPolling() {
    const gen = generation;
    async function tick() {
      if (gen !== generation) return;
      let delay = state === 'qr_required' ? 3000 : 5000;
      try {
        if (!document.hidden) {
          if (state === 'qr_required') { const data = await api('auth/qr/poll/', {}); if (gen !== generation) return; if(data.state !== 'qr_required') { await acceptTelegram(data); return; } showQR(data); }
          else if(state === 'connected' && !realtime?.isActive()) { if(selected?.forum && !selectedTopic) await loadTopics(false, true); else await loadMessages(); if(++ticks % 3 === 0) { await loadDialogs(); if ($('folder').value === '0' && ticks % 12 === 0) await loadArchivePreview().catch(() => {}); if(selected) await loadPinnedMessages(); } }
        }
      } catch(e) { delay = Math.max(delay, (e.retryAfter || 10)*1000); if(e.code !== 'busy') notify(e.message); }
      if(gen === generation) timer = setTimeout(tick,delay);
    }
    timer = setTimeout(tick,state === 'qr_required' ? 3000 : 5000);
  }
  // Optional embedding handoff: accept credentials only from the same-origin parent.
  window.addEventListener('message', event => {
    if(window.GrowyTelegramWorkspace || event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'growy:telegram-auth' || typeof event.data.access !== 'string') return;
    signedOut(); access = event.data.access; refresh = event.data.refresh || ''; loadStatus().catch(e => notify(e.message));
  });
  if (window.GrowyTelegramWorkspace) loadStatus().catch(e => notify(e.message));
  else if(window.parent !== window) window.parent.postMessage({type:'growy:telegram-ready'},location.origin);
})();
