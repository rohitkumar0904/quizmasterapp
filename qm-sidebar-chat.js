/**
 * qm-sidebar-chat.js  —  WhatsApp-style Sidebar Chat v3
 */
(function () {
  'use strict';

  const css = `
    #qm-sc-btn {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.5rem 0.85rem; border-radius: var(--radius-sm);
      color: rgba(237,230,216,0.7); font-family: var(--font-body);
      font-weight: 600; font-size: 0.9rem; background: none;
      border: none; cursor: pointer; width: 100%; text-align: left;
      transition: all 0.15s ease; position: relative;
    }
    #qm-sc-btn:hover { background: rgba(255,255,255,0.06); color: #EDE6D8; }
    #qm-sc-btn .qm-sc-btn-icon { font-size: 1rem; width: 1.2rem; text-align: center; }
    #qm-sc-btn .qm-sc-btn-label { flex: 1; }
    #qm-sc-nav-badge {
      margin-left: auto; background: var(--error); color: #fff;
      font-size: 0.65rem; font-weight: 700; min-width: 18px; height: 18px;
      border-radius: 50%; display: none; align-items: center;
      justify-content: center; padding: 0 3px; font-family: var(--font-mono);
    }
    #qm-sc-nav-badge.show { display: flex; }

    #qm-sc-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(10,15,25,0.6); z-index: 9000;
    }
    #qm-sc-overlay.open { display: block; }

    #qm-sc-drawer {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: min(380px, 100vw); background: var(--paper);
      border-left: 1px solid var(--line); box-shadow: var(--shadow-modal);
      display: flex; flex-direction: column; z-index: 9001;
      transform: translateX(100%);
      transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
    }
    #qm-sc-drawer.open { transform: translateX(0); }

    #qm-sc-header {
      display: flex; align-items: center; gap: 0.6rem;
      padding: 1rem 1.1rem 0.85rem; border-bottom: 1px solid var(--line);
      background: var(--paper-raised); flex-shrink: 0;
    }
    #qm-sc-title {
      flex: 1; font-family: var(--font-display); font-weight: 700;
      font-size: 1rem; color: var(--ink); margin: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #qm-sc-back-btn {
      display: none; background: none; border: none; color: var(--slate);
      font-size: 0.85rem; font-weight: 600; cursor: pointer;
      padding: 0.2rem 0.5rem; border-radius: var(--radius-sm);
      transition: all 0.15s; font-family: var(--font-body); flex-shrink: 0;
    }
    #qm-sc-back-btn:hover { color: var(--ink); background: var(--paper); }
    #qm-sc-back-btn.visible { display: block; }
    #qm-sc-close-btn {
      background: none; border: none; color: var(--slate); font-size: 1.05rem;
      cursor: pointer; padding: 0.2rem 0.4rem; border-radius: var(--radius-sm);
      line-height: 1; transition: background 0.15s; flex-shrink: 0;
    }
    #qm-sc-close-btn:hover { background: var(--line); color: var(--ink); }

    #qm-sc-conv-list { flex: 1; overflow-y: auto; padding: 0.35rem 0; }

    .qm-sc-row {
      display: flex; align-items: center; gap: 0.85rem;
      padding: 0.8rem 1.1rem; cursor: pointer;
      transition: background 0.12s ease; border-bottom: 1px solid var(--line);
    }
    .qm-sc-row:last-child { border-bottom: none; }
    .qm-sc-row:hover { background: var(--paper-raised); }
    .qm-sc-row.active { background: var(--saffron-soft); border-left: 3px solid var(--saffron); }

    .qm-sc-avatar {
      width: 40px; height: 40px; border-radius: 50%;
      background: var(--ink); color: var(--saffron);
      font-family: var(--font-mono); font-weight: 700; font-size: 0.8rem;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .qm-sc-info { flex: 1; min-width: 0; }
    .qm-sc-name {
      font-size: 0.9rem; font-weight: 600; color: var(--ink);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      font-family: var(--font-body);
    }
    .qm-sc-preview {
      font-size: 0.78rem; color: var(--slate);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      margin-top: 2px; font-family: var(--font-body);
    }
    .qm-sc-preview.unread { color: var(--ink); font-weight: 600; }
    .qm-sc-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
    .qm-sc-time { font-size: 0.68rem; color: var(--slate); font-family: var(--font-mono); }
    .qm-sc-unread {
      background: var(--error); color: #fff; font-size: 0.65rem; font-weight: 700;
      min-width: 18px; height: 18px; border-radius: 50%; display: none;
      align-items: center; justify-content: center; padding: 0 3px; font-family: var(--font-mono);
    }
    .qm-sc-unread.show { display: flex; }

    .qm-sc-state {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 0.6rem; padding: 3rem 2rem;
      text-align: center; color: var(--slate); font-family: var(--font-body);
    }
    .qm-sc-state-icon { font-size: 2.2rem; }
    .qm-sc-state strong { font-family: var(--font-display); color: var(--ink-soft); font-size: 0.95rem; }
    .qm-sc-state p { font-size: 0.82rem; margin: 0; color: var(--slate); }

    #qm-sc-chat-wrap { display: none; flex: 1; flex-direction: column; overflow: hidden; }
    #qm-sc-chat-wrap.visible { display: flex; }

    [data-theme="dark"] .qm-sc-avatar { background: var(--ink-soft); }
    [data-theme="dark"] .qm-sc-row { border-bottom-color: var(--line); }
    [data-theme="dark"] .qm-sc-row:hover { background: var(--paper-raised); }
    [data-theme="dark"] .qm-sc-row.active { background: var(--saffron-soft); }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── STATE ── */
  let _convData     = {};
  let _convOrder    = [];
  let _convToFriend = {};
  let _globalCh     = null;
  let _loaded       = false;
  let _activeFriend = null;
  let _loading      = false;

  /* ── HTML ── */
  function injectHTML() {
    const nav = document.querySelector('.sidebar-nav');
    if (nav) {
      const btn = document.createElement('button');
      btn.id = 'qm-sc-btn';
      btn.innerHTML = `
        <span class="qm-sc-btn-icon">💬</span>
        <span class="qm-sc-btn-label">Messages</span>
        <span id="qm-sc-nav-badge"></span>`;
      btn.addEventListener('click', toggleDrawer);
      const friendsLink = nav.querySelector('[data-view="friends"]');
      friendsLink ? friendsLink.insertAdjacentElement('afterend', btn) : nav.prepend(btn);
    }

    document.body.insertAdjacentHTML('beforeend', `
      <div id="qm-sc-overlay"></div>
      <div id="qm-sc-drawer" role="dialog" aria-modal="true" aria-label="Messages">
        <div id="qm-sc-header">
          <button id="qm-sc-back-btn" title="Back">← Back</button>
          <h3 id="qm-sc-title">💬 Messages</h3>
          <button id="qm-sc-close-btn" title="Close">✕</button>
        </div>
        <div id="qm-sc-conv-list"></div>
        <div id="qm-sc-chat-wrap"></div>
      </div>`);

    document.getElementById('qm-sc-overlay').addEventListener('click', closeDrawer);
    document.getElementById('qm-sc-close-btn').addEventListener('click', closeDrawer);
    document.getElementById('qm-sc-back-btn').addEventListener('click', showList);
  }

  /* ── DRAWER ── */
  function toggleDrawer() {
    document.getElementById('qm-sc-drawer').classList.contains('open') ? closeDrawer() : openDrawer();
  }

  function openDrawer() {
    document.getElementById('qm-sc-overlay').classList.add('open');
    document.getElementById('qm-sc-drawer').classList.add('open');
    if (typeof closeSidebar === 'function') closeSidebar();

    if (_loaded) {
      showList();
    } else if (!_loading) {
      _showState('⏳', 'Loading…', '');
      loadConvList();
    }
  }

  function closeDrawer() {
    document.getElementById('qm-sc-overlay').classList.remove('open');
    document.getElementById('qm-sc-drawer').classList.remove('open');
    _restoreChatPanel();
    _activeFriend = null;
    window._chatActiveFriendId = null;
    if (typeof closeChat === 'function') closeChat();
  }

  function _showState(icon, title, msg) {
    const list = document.getElementById('qm-sc-conv-list');
    if (!list) return;
    list.innerHTML = `
      <div class="qm-sc-state">
        <span class="qm-sc-state-icon">${icon}</span>
        <strong>${title}</strong>
        ${msg ? `<p>${msg}</p>` : ''}
      </div>`;
  }

  /* ── VIEWS ── */
  function showList() {
    _restoreChatPanel();
    _activeFriend = null;
    window._chatActiveFriendId = null;
    if (typeof closeChat === 'function') closeChat();

    document.getElementById('qm-sc-conv-list').style.display = '';
    document.getElementById('qm-sc-chat-wrap').classList.remove('visible');
    document.getElementById('qm-sc-back-btn').classList.remove('visible');
    document.getElementById('qm-sc-title').textContent = '💬 Messages';
    renderConvList();
  }

  function showChat(friendId, friendName) {
    _activeFriend = friendId;
    window._chatActiveFriendId = friendId;

    if (_convData[friendId]) _convData[friendId].unread = 0;
    updateNavBadge();

    document.querySelectorAll('.qm-sc-row').forEach(r =>
      r.classList.toggle('active', r.dataset.friendId === friendId));

    document.getElementById('qm-sc-conv-list').style.display = 'none';
    document.getElementById('qm-sc-chat-wrap').classList.add('visible');
    document.getElementById('qm-sc-back-btn').classList.add('visible');
    document.getElementById('qm-sc-title').textContent = friendName;

    const chatWrap  = document.getElementById('qm-sc-chat-wrap');
    const chatPanel = document.getElementById('chat-panel');
    if (chatPanel && chatWrap) {
      chatPanel.style.cssText = 'position:static;width:100%;height:100%;flex:1;transform:none;box-shadow:none;border-left:none;';
      chatPanel.classList.add('chat-panel--open');
      chatWrap.appendChild(chatPanel);
      // Drawer already shows Back / friend name / ✕ in its own header —
      // hide the chat-panel's own duplicate title + close button so only
      // one header row shows (keep the 🗑️ clear-chat button visible).
      const cpTitle = chatPanel.querySelector('#chat-panel-title');
      const cpClose = chatPanel.querySelector('.chat-panel-close');
      if (cpTitle) cpTitle.style.display = 'none';
      if (cpClose) cpClose.style.display = 'none';
    }

    if (typeof window.openChat === 'function') window.openChat(friendId, friendName);
    _markSeen(friendId);
  }

  function _restoreChatPanel() {
    const chatPanel  = document.getElementById('chat-panel');
    const friendsSec = document.getElementById('view-friends');
    if (chatPanel && friendsSec && chatPanel.parentElement?.id === 'qm-sc-chat-wrap') {
      chatPanel.style.cssText = '';
      chatPanel.classList.remove('chat-panel--open');
      const cpTitle = chatPanel.querySelector('#chat-panel-title');
      const cpClose = chatPanel.querySelector('.chat-panel-close');
      if (cpTitle) cpTitle.style.display = '';
      if (cpClose) cpClose.style.display = '';
      friendsSec.appendChild(chatPanel);
    }
  }

  /* ── FRIENDS FETCH — 3 fallbacks ── */
  async function _getFriends() {
    // Fallback 1: window.friendsCache
    if (window.friendsCache?.length) {
      console.log('[qm-sc] friendsCache from window:', window.friendsCache.length);
      return window.friendsCache;
    }

    // Fallback 2: call loadFriends and wait
    if (typeof window.loadFriends === 'function') {
      console.log('[qm-sc] calling window.loadFriends...');
      try {
        await window.loadFriends();
        await new Promise(r => setTimeout(r, 500));
        if (window.friendsCache?.length) {
          console.log('[qm-sc] got friends after loadFriends:', window.friendsCache.length);
          return window.friendsCache;
        }
      } catch(e) { console.warn('[qm-sc] loadFriends error:', e); }
    }

    // Fallback 3: direct Supabase query
    if (!window.sb || !window.currentUser) {
      console.warn('[qm-sc] no sb or currentUser');
      return [];
    }
    console.log('[qm-sc] direct Supabase fetch...');
    try {
      const uid = window.currentUser.id;
      const [{ data: sent }, { data: received }] = await Promise.all([
        window.sb.from('friendships')
          .select('profiles!friendships_addressee_id_fkey(id, display_name, roll_no)')
          .eq('requester_id', uid).eq('status', 'accepted'),
        window.sb.from('friendships')
          .select('profiles!friendships_requester_id_fkey(id, display_name, roll_no)')
          .eq('addressee_id', uid).eq('status', 'accepted'),
      ]);
      const friends = [
        ...(sent  || []).map(r => r.profiles),
        ...(received || []).map(r => r.profiles),
      ].filter(Boolean);
      console.log('[qm-sc] direct fetch result:', friends.length, 'friends');
      window.friendsCache = friends;
      return friends;
    } catch(e) {
      console.warn('[qm-sc] direct fetch error:', e);
      return [];
    }
  }

  /* ── LOAD ── */
  async function loadConvList() {
    if (_loading) return;
    _loading = true;

    const user = window.currentUser;
    if (!user) {
      console.warn('[qm-sc] no currentUser');
      _loading = false;
      _showState('🔒', 'Login karo pehle', '');
      return;
    }

    console.log('[qm-sc] loadConvList start');
    const friends = await _getFriends();
    console.log('[qm-sc] friends count:', friends.length);

    // Init skeleton for every friend
    friends.forEach(f => {
      if (!f?.id) return;
      const initials = (f.display_name || 'U')
        .split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      if (!_convData[f.id]) {
        _convData[f.id] = { name: f.display_name || 'Friend', initials, lastMsg: '', lastTime: null, unread: 0 };
      } else {
        _convData[f.id].name     = f.display_name || _convData[f.id].name;
        _convData[f.id].initials = initials;
      }
    });

    // Fetch conversations + unread in parallel
    await Promise.all([
      _fetchConversations(user, friends),
      _fetchUnread(user),
    ]);

    _sortOrder(friends);
    _loaded  = true;
    _loading = false;

    console.log('[qm-sc] convOrder:', _convOrder.length);

    // Only render if drawer is open and list pane is visible
    const drawer = document.getElementById('qm-sc-drawer');
    const listEl = document.getElementById('qm-sc-conv-list');
    if (drawer?.classList.contains('open') && listEl?.style.display !== 'none') {
      renderConvList();
    }

    _subscribeGlobal(user);
  }

  async function _fetchConversations(user, friends) {
    if (!friends.length || !window.sb) return;
    const { data: convs, error } = await window.sb
      .from('conversations')
      .select('id, user1_id, user2_id')
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

    if (error) { console.warn('[qm-sc] convs error:', error.message); return; }
    if (!convs?.length) return;

    _convToFriend = {};
    convs.forEach(c => {
      const fid = c.user1_id === user.id ? c.user2_id : c.user1_id;
      _convToFriend[c.id] = fid;
    });

    const { data: msgs } = await window.sb
      .from('messages')
      .select('conversation_id, content, created_at, sender_id')
      .in('conversation_id', convs.map(c => c.id))
      .order('created_at', { ascending: false })
      .limit(convs.length * 5);

    const seen = new Set();
    (msgs || []).forEach(m => {
      if (seen.has(m.conversation_id)) return;
      seen.add(m.conversation_id);
      const fid = _convToFriend[m.conversation_id];
      if (!fid || !_convData[fid]) return;
      _convData[fid].lastMsg  = (m.sender_id === user.id ? 'You: ' : '') + m.content;
      _convData[fid].lastTime = m.created_at;
    });
  }

  async function _fetchUnread(user) {
    if (!window.sb) return;
    const convIds = Object.keys(_convToFriend);
    if (!convIds.length) return;
    const { data } = await window.sb
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', convIds)
      .eq('seen', false)
      .neq('sender_id', user.id);

    Object.keys(_convData).forEach(fid => { _convData[fid].unread = 0; });
    (data || []).forEach(m => {
      const fid = _convToFriend[m.conversation_id];
      if (fid && _convData[fid]) _convData[fid].unread++;
    });
  }

  async function _markSeen(friendId) {
    if (!window.sb || !window.currentUser) return;
    const convId = Object.keys(_convToFriend).find(k => _convToFriend[k] === friendId);
    if (!convId) return;
    await window.sb.from('messages').update({ seen: true })
      .eq('conversation_id', convId).eq('seen', false)
      .neq('sender_id', window.currentUser.id);
  }

  function _sortOrder(friends) {
    _convOrder = friends.filter(f => f?.id).map(f => f.id).sort((a, b) => {
      const ta = _convData[a]?.lastTime || '';
      const tb = _convData[b]?.lastTime || '';
      return tb.localeCompare(ta);
    });
  }

  /* ── RENDER ── */
  function renderConvList() {
    const list = document.getElementById('qm-sc-conv-list');
    if (!list) return;
    list.innerHTML = '';

    if (!_convOrder.length) {
      _showState('💬', 'Koi friend nahi', 'Friends page se add karo aur chat shuru karo!');
      return;
    }

    _convOrder.forEach(fid => {
      const d = _convData[fid];
      if (!d) return;
      const row = document.createElement('div');
      row.className = 'qm-sc-row';
      row.dataset.friendId = fid;
      const preview   = d.lastMsg ? (d.lastMsg.length > 42 ? d.lastMsg.slice(0,42) + '…' : d.lastMsg) : 'Tap karke chat shuru karo';
      const hasUnread = (d.unread || 0) > 0;
      row.innerHTML = `
        <div class="qm-sc-avatar">${_esc(d.initials)}</div>
        <div class="qm-sc-info">
          <div class="qm-sc-name">${_esc(d.name)}</div>
          <div class="qm-sc-preview ${hasUnread ? 'unread' : ''}">${_esc(preview)}</div>
        </div>
        <div class="qm-sc-meta">
          <span class="qm-sc-time">${d.lastTime ? _fmtTime(d.lastTime) : ''}</span>
          <span class="qm-sc-unread ${hasUnread ? 'show' : ''}">${hasUnread ? (d.unread > 99 ? '99+' : d.unread) : ''}</span>
        </div>`;
      row.addEventListener('click', () => showChat(fid, d.name));
      list.appendChild(row);
    });

    updateNavBadge();
  }

  /* ── REALTIME ── */
  function _subscribeGlobal(user) {
    if (_globalCh) { window.sb?.removeChannel(_globalCh); _globalCh = null; }
    if (!window.sb) return;

    _globalCh = window.sb.channel('qm-sc-global-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new;
        if (!msg || msg.sender_id === user.id) return;

        const fid = _convToFriend[msg.conversation_id];
        if (!fid) { _loaded = false; _loading = false; loadConvList(); return; }
        if (!_convData[fid]) return;

        _convData[fid].lastMsg  = msg.content;
        _convData[fid].lastTime = msg.created_at;

        const drawerOpen = document.getElementById('qm-sc-drawer')?.classList.contains('open');
        if (drawerOpen && _activeFriend === fid) {
          window.sb.from('messages').update({ seen: true }).eq('id', msg.id);
        } else {
          _convData[fid].unread = (_convData[fid].unread || 0) + 1;
        }

        _convOrder = [fid, ..._convOrder.filter(id => id !== fid)];

        const listEl = document.getElementById('qm-sc-conv-list');
        if (drawerOpen && !_activeFriend && listEl?.style.display !== 'none') renderConvList();
        else updateNavBadge();
      })
      .subscribe();
  }

  /* ── BADGE ── */
  function updateNavBadge() {
    const total = Object.values(_convData).reduce((s, d) => s + (d.unread || 0), 0);
    const badge = document.getElementById('qm-sc-nav-badge');
    if (!badge) return;
    badge.textContent = total > 99 ? '99+' : total;
    badge.classList.toggle('show', total > 0);
  }

  /* ── UTILS ── */
  function _fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso), now = new Date();
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (diff === 1) return 'Kal';
    if (diff < 7)  return d.toLocaleDateString('en-IN', { weekday: 'short' });
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── BOOT ── */
  function boot() {
    injectHTML();

    if (!window.sb) {
      console.warn('[qm-sc] no sb client found');
      return;
    }

    // onAuthStateChange — fires on login, logout, AND existing session restore (INITIAL_SESSION)
    window.sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (!session?.user) return;

        // Sync currentUser so rest of the app stays consistent
        if (!window.currentUser) window.currentUser = session.user;

        if (!_loaded && !_loading) {
          console.log('[qm-sc] auth ready (' + event + '), loading convs...');
          await loadConvList();
        }
      }

      if (event === 'SIGNED_OUT') {
        _convData     = {};
        _convOrder    = [];
        _convToFriend = {};
        _loaded       = false;
        _loading      = false;
        _activeFriend = null;
        window._chatActiveFriendId = null;
        if (_globalCh) { window.sb.removeChannel(_globalCh); _globalCh = null; }
        updateNavBadge();
      }
    });

    // Hook into renderFriends so new friends appear instantly
    const _origRF = window.renderFriends;
    if (typeof _origRF === 'function') {
      window.renderFriends = function (...args) {
        _origRF(...args);
        const friends = window.friendsCache || [];
        let changed = false;
        friends.forEach(f => {
          if (!f?.id || _convData[f.id]) return;
          const initials = (f.display_name || 'U').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0,2).toUpperCase();
          _convData[f.id] = { name: f.display_name, initials, lastMsg: '', lastTime: null, unread: 0 };
          changed = true;
        });
        if (changed) {
          _sortOrder(friends);
          const drawer = document.getElementById('qm-sc-drawer');
          const listEl = document.getElementById('qm-sc-conv-list');
          if (drawer?.classList.contains('open') && listEl?.style.display !== 'none') renderConvList();
        }
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 150));
  } else {
    setTimeout(boot, 150);
  }
})();
