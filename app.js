/* ============================================================
   QuizMaster Pro — supabase.js
   Full Supabase backend integration.

   SETUP:
   1. Create a project at https://supabase.com
   2. Run supabase_schema.sql in your SQL Editor
   3. Replace SUPABASE_URL and SUPABASE_ANON_KEY below
   ============================================================ */

// ── CONFIG — replace with your Supabase project values ──────
const SUPABASE_URL      = 'https://ycxpcmfabtispwarqfee.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljeHBjbWZhYnRpc3B3YXJxZmVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjk4MjcsImV4cCI6MjA5Njg0NTgyN30.6X6QWD73cWPIfILNWK7VwKHoPeeiA40XEBBCtIeD074';

// ── CLIENT ──────────────────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.sb = sb; // expose for pomodoro-race.js

// ── CURRENT SESSION ─────────────────────────────────────────
let currentUser    = null;  // auth.User
let currentProfile = null;  // profiles row

// ── TOAST HELPER ────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `qm-toast qm-toast--${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('qm-toast--show'));
  setTimeout(() => {
    el.classList.remove('qm-toast--show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// Inject toast styles (no extra CSS file needed)
(function injectToastCSS() {
  const s = document.createElement('style');
  s.textContent = `
    .qm-toast {
      position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%) translateY(4rem);
      background: var(--ink); color: #fff; padding: .6rem 1.25rem;
      border-radius: var(--radius-md); font-size: .85rem; font-family: var(--font-body);
      z-index: 9999; opacity: 0; transition: all .3s ease; white-space: nowrap;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    }
    .qm-toast--show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .qm-toast--success { background: var(--success); }
    .qm-toast--error   { background: var(--error); }
    .qm-toast--info    { background: var(--ink-soft); }
    .btn-loading { opacity: .6; pointer-events: none; }
    .spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,.4);
      border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; vertical-align:middle; margin-right:6px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .review-tag--skipped { background: #f0f4ff; color: #6b7280; }
  `;
  document.head.appendChild(s);
})();

function setLoading(btn, loading, label = '') {
  if (!btn) return;
  if (loading) {
    btn._origText = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>${label || btn._origText}`;
    btn.classList.add('btn-loading');
  } else {
    btn.textContent = btn._origText || label;
    btn.classList.remove('btn-loading');
  }
}

// ── AUTH ─────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  const form  = e.target;
  const email = form.email.value.trim();
  const pass  = form.password.value;
  const btn   = form.querySelector('[type=submit]');
  setLoading(btn, true, 'Logging in…');

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  setLoading(btn, false);

  if (error) { toast('Login failed: ' + error.message, 'error'); return; }
  await onSignedIn(data.user);
}

async function handleSignup(e) {
  e.preventDefault();
  const form   = e.target;
  const name   = form.name.value.trim();
  const rollno = (form.rollno?.value || '').trim();
  const email  = form.email.value.trim();
  const pass   = form.password.value;
  const btn    = form.querySelector('[type=submit]');

  if (pass.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
  setLoading(btn, true, 'Creating account…');

  const { data, error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { display_name: name, roll_no: rollno } }
  });
  setLoading(btn, false);

  if (error) { toast('Sign-up failed: ' + error.message, 'error'); return; }
  if (data.user) await onSignedIn(data.user);
  else toast('Check your email to confirm your account!', 'info');
}
async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  document.getElementById('app-shell').style.display = 'none';
  // Hide fixed-position elements that leak outside app-shell on logout
  ['.mobile-topbar', '.mobile-nav', '.global-search-bar', '.sidebar', '.sidebar-backdrop'].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => el.style.display = 'none');
  });
  const auth = document.getElementById('view-auth');
  auth.style.display = 'flex';
  auth.classList.add('active');
  toast('Logged out.', 'info');
}


async function onSignedIn(user) {
  currentUser = user;
  await loadProfile();
  document.getElementById('view-auth').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  // Restore fixed elements hidden on logout
  ['.mobile-topbar', '.mobile-nav', '.global-search-bar', '.sidebar', '.sidebar-backdrop'].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => el.style.display = '');
  });
  showView('dashboard');
  populateUI();
  await Promise.all([
    loadFolders(),
    loadInbox(),
    loadPins(),
  ]);
  loadFriends(); // non-blocking
}

async function loadProfile() {
  if (!currentUser) return;
  let { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error || !data) {
    const name   = currentUser.user_metadata?.display_name || 'User';
    const rollno = currentUser.user_metadata?.roll_no || '';
    const { data: newProfile } = await sb.from('profiles').insert({
      id: currentUser.id,
      display_name: name,
      roll_no: rollno
    }).select().single();
    data = newProfile;
  }
  currentProfile = data;
}

function populateUI() {
  if (!currentProfile) return;
  document.getElementById('user-name').textContent = currentProfile.display_name;
  document.getElementById('user-rollno').textContent = currentProfile.roll_no || 'QM-0000';

  // Profile view
  const pName = document.getElementById('profile-display-name');
const pRollInput = document.getElementById('profile-rollno-input');
if (pRollInput) pRollInput.value = currentProfile.roll_no || '';
   const pEmail = document.getElementById('profile-email');
  if (pName) pName.textContent = currentProfile.display_name;
  if (pRoll) pRoll.textContent = currentProfile.roll_no;
  if (pEmail) pEmail.textContent = currentUser?.email || '';

  const pAvatar = document.getElementById('profile-avatar');
  if (pAvatar) {
    const initials = (currentProfile.display_name || '?')
      .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
    pAvatar.textContent = initials || '?';
  }

  const pJoined = document.getElementById('profile-joined');
  if (pJoined && currentProfile.created_at) {
    pJoined.textContent = 'Member since ' + new Date(currentProfile.created_at)
      .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }

  // Theme — localStorage is the source of truth for this device (applied
  // instantly on page load via the <head> script + oldstatic.js, so the
  // UI never flashes). Only fall back to the value saved in Supabase if
  // this device had no local preference before this page load (e.g. first
  // login on a new device/browser).
  if (typeof _hadStoredThemePref !== 'undefined' && !_hadStoredThemePref) {
    if (currentProfile.theme === 'dark' && !darkMode) {
      darkMode = true;
      applyTheme();
    } else if (currentProfile.theme === 'light' && darkMode) {
      darkMode = false;
      applyTheme();
    }
  }

  // Profile public toggle — sync checked state; applyProfileVisibility
  // is defined in oldstatic.js and called automatically on change
  const toggle = document.getElementById('toggle-profile-public');
  if (toggle) {
    toggle.checked = currentProfile.is_public;
    // Call applyProfileVisibility if available (defined in oldstatic.js)
    if (typeof applyProfileVisibility === 'function') applyProfileVisibility();
  }

  const privateHint = document.getElementById('profile-private-hint');
  if (privateHint) privateHint.style.display = currentProfile.is_public ? 'none' : 'block';
}

// ── PROFILE SAVE ─────────────────────────────────────────────
async function saveProfile() {
  if (!currentUser || !currentProfile) return;
  const nameInput    = document.getElementById('profile-display-name');
  const rollInput    = document.getElementById('profile-rollno-input');
  const newName      = nameInput?.textContent?.trim() || currentProfile.display_name;
  const newRollNo    = rollInput?.value?.trim() || '';

  const { error } = await sb.from('profiles').update({
    display_name: newName,
    roll_no: newRollNo,
    is_public: document.getElementById('toggle-profile-public')?.checked ?? true,
    theme: darkMode ? 'dark' : 'light'
  }).eq('id', currentUser.id);

  if (error) { toast('Could not save profile: ' + error.message, 'error'); return; }
  currentProfile.display_name = newName;
  currentProfile.roll_no      = newRollNo;

  // Update sidebar display
  document.getElementById('user-rollno').textContent = newRollNo || 'QM-0000';
  document.getElementById('profile-rollno').textContent = newRollNo;

  toast('Profile saved!', 'success');
}

// ── THEME PERSISTENCE ────────────────────────────────────────
async function persistTheme() {
  if (!currentUser) return;
  await sb.from('profiles').update({ theme: darkMode ? 'dark' : 'light' }).eq('id', currentUser.id);
}

// ── FOLDERS ──────────────────────────────────────────────────
let foldersCache = [];  // array of folder rows
let groupsCache  = [];  // array of group rows

async function loadGroups() {
  if (!currentUser) return;
  const { data } = await sb.from('groups')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('sort_order', { ascending: true });
  groupsCache = data || [];
}

async function loadFolders() {
  if (!currentUser) return;
  await loadGroups();
  const { data, error } = await sb.from('folders')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('name', { ascending: true });
  if (error) { toast('Could not load folders', 'error'); return; }
  foldersCache = data || [];
  renderFolders();
}

function renderFolders() {
  const grid = document.getElementById('folder-grid');
  if (!grid) return;

  grid.querySelectorAll('.folder-card[data-folder-id], .folder-card--back, .folder-group-section').forEach(el => el.remove());

  const rootFolders = foldersCache.filter(f => !f.parent_id);

  if (groupsCache.length === 0) {
    rootFolders.forEach(folder => renderFolderCard(folder, grid, true));
  } else {
    // Render grouped folders
    groupsCache.forEach(group => {
      const inGroup = rootFolders.filter(f => f.group_id === group.id);
      if (!inGroup.length) return;

      const section = document.createElement('div');
      section.className = 'folder-group-section';
      section.dataset.groupId = group.id;
      section.innerHTML =
        '<div class="folder-group-header">' +
          '<h3 class="folder-group-title">' + escHtml(group.name) + '</h3>' +
          '<button class="btn btn--ghost btn--small btn-delete-group" data-group-id="' + group.id + '" title="Delete group">\uD83D\uDDD1\uFE0F</button>' +
        '</div>' +
        '<div class="folder-group-grid" data-group-grid="' + group.id + '"></div>';

      section.querySelector('.btn-delete-group').addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Delete group "' + group.name + '"? Folders will be ungrouped.')) return;
        await sb.from('groups').delete().eq('id', group.id);
        foldersCache.forEach(f => { if (f.group_id === group.id) f.group_id = null; });
        groupsCache = groupsCache.filter(g => g.id !== group.id);
        renderFolders();
        toast('Group deleted.', 'info');
      });

      const addCard = grid.querySelector('.folder-card--add');
      grid.insertBefore(section, addCard);

      const groupGrid = section.querySelector('[data-group-grid="' + group.id + '"]');
      inGroup.forEach(folder => renderFolderCard(folder, groupGrid, false));
    });

    // Ungrouped folders
    const ungrouped = rootFolders.filter(f => !f.group_id);
    if (ungrouped.length) {
      const section = document.createElement('div');
      section.className = 'folder-group-section';
      section.innerHTML =
        '<div class="folder-group-header">' +
          '<h3 class="folder-group-title" style="color:var(--text-muted,#888)">Ungrouped</h3>' +
        '</div>' +
        '<div class="folder-group-grid" id="ungrouped-grid"></div>';
      const addCard = grid.querySelector('.folder-card--add');
      grid.insertBefore(section, addCard);
      ungrouped.forEach(folder => renderFolderCard(folder, section.querySelector('#ungrouped-grid'), false));
    }
  }

  updateSaveFolderSelect();
  updateTargetFolderSelect();
}

function renderFolderCard(folder, container, insertBefore) {
  const hasChildren = foldersCache.some(f => f.parent_id === folder.id);
  const card = document.createElement('div');
  card.className = 'folder-card' + (folder.is_pinned ? ' folder-card--pinned' : '');
  card.dataset.folderId = folder.id;

  const groupOptions = groupsCache.map(g =>
    '<option value="' + g.id + '"' + (folder.group_id === g.id ? ' selected' : '') + '>' + escHtml(g.name) + '</option>'
  ).join('');

  card.innerHTML =
    '<div class="folder-card-top">' +
      '<button class="btn-pin ' + (folder.is_pinned ? 'active' : '') + '" data-item-type="folder" data-item-id="' + folder.id + '" data-item-name="' + escHtml(folder.name) + '" data-item-meta="Folder" title="' + (folder.is_pinned ? 'Unpin' : 'Pin') + ' folder">\uD83D\uDCCC</button>' +
      '<button class="btn-toggle-visibility" title="' + (folder.is_public ? 'Make Private' : 'Make Public') + '">' + (folder.is_public ? '\uD83D\uDD12 Private' : '\uD83C\uDF10 Public') + '</button>' +
    '</div>' +
    '<span class="folder-icon">' + (hasChildren ? '\uD83D\uDCC2' : '\uD83D\uDCC1') + '</span>' +
    '<h3>' + escHtml(folder.name) + '</h3>' +
    '<span class="folder-count" id="folder-count-' + folder.id + '">Loading\u2026</span>' +
    (groupsCache.length ?
      '<select class="folder-group-select" title="Move to group"><option value="">\u2014 No group \u2014</option>' + groupOptions + '</select>'
      : '') +
    '<div class="folder-card-actions">' +
      '<button class="btn btn--ghost btn--small btn-add-subfolder" data-folder-id="' + folder.id + '" title="Add subfolder">\uD83D\uDCC1+</button>' +
      '<button class="btn btn--ghost btn--small btn-rename-folder" data-folder-id="' + folder.id + '">\u270F\uFE0F</button>' +
      '<button class="btn btn--ghost btn--small btn-delete-folder" data-folder-id="' + folder.id + '">\uD83D\uDDD1\uFE0F</button>' +
    '</div>' +
    '<span class="visibility-badge ' + (folder.is_public ? 'visibility-badge--public' : '') + '" data-visibility-badge>' + (folder.is_public ? '\uD83C\uDF10 Public' : '\uD83D\uDD12 Private') + '</span>';

  card.addEventListener('click', e => {
    if (e.target.closest('.btn-pin, .btn-toggle-visibility, .btn-rename-folder, .btn-delete-folder, .btn-add-subfolder, .folder-group-select')) return;
    openFolder(folder.id, folder.name);
  });

  // Group select
  const sel = card.querySelector('.folder-group-select');
  if (sel) {
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const gid = e.target.value || null;
      await sb.from('folders').update({ group_id: gid }).eq('id', folder.id);
      folder.group_id = gid;
      renderFolders();
    });
  }

  card.querySelector('.btn-toggle-visibility').addEventListener('click', async e => {
    e.stopPropagation();
    const newVal = !folder.is_public;
    const { error } = await sb.from('folders').update({ is_public: newVal }).eq('id', folder.id);
    if (error) { toast('Could not update visibility: ' + error.message, 'error'); return; }
    folder.is_public = newVal;
    const badge = card.querySelector('[data-visibility-badge]');
    badge.textContent = folder.is_public ? '\uD83C\uDF10 Public' : '\uD83D\uDD12 Private';
    badge.className = 'visibility-badge' + (folder.is_public ? ' visibility-badge--public' : '');
    card.querySelector('.btn-toggle-visibility').textContent = folder.is_public ? '\uD83D\uDD12 Make Private' : '\uD83C\uDF10 Make Public';
    buildPublicLibrary();
  });

  card.querySelector('.btn-add-subfolder').addEventListener('click', async e => {
    e.stopPropagation();
    const subName = prompt('New subfolder name:');
    if (!subName || !subName.trim()) return;
    const { data: sub, error } = await sb.from('folders').insert({
      user_id: currentUser.id,
      name: subName.trim(),
      parent_id: folder.id
    }).select().single();
    if (error) { toast('Could not create subfolder: ' + error.message, 'error'); return; }
    foldersCache.unshift(sub);
    toast('Subfolder created!', 'success');
    renderFolders();
  });

  card.querySelector('.btn-rename-folder').addEventListener('click', async e => {
    e.stopPropagation();
    const newName = prompt('Rename folder:', folder.name);
    if (!newName || !newName.trim()) return;
    await sb.from('folders').update({ name: newName.trim() }).eq('id', folder.id);
    folder.name = newName.trim();
    card.querySelector('h3').textContent = newName.trim();
    toast('Folder renamed!', 'success');
  });

  card.querySelector('.btn-delete-folder').addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm('Delete folder "' + folder.name + '"? All subfolders and quizzes inside will also be deleted.')) return;
    await sb.from('folders').delete().eq('id', folder.id);
    foldersCache = foldersCache.filter(f => f.id !== folder.id && f.parent_id !== folder.id);
    card.remove();
    toast('Folder deleted.', 'info');
  });

  if (insertBefore) {
    const addCard = container.querySelector('.folder-card--add');
    container.insertBefore(card, addCard);
  } else {
    container.appendChild(card);
  }
  loadFolderCount(folder.id);
}

async function loadFolderCount(folderId) {
  const subCount = foldersCache.filter(f => f.parent_id === folderId).length;
  const { count } = await sb.from('quizzes')
    .select('*', { count: 'exact', head: true })
    .eq('folder_id', folderId);
  const el = document.getElementById('folder-count-' + folderId);
  if (el) {
    const parts = [];
    if (subCount) parts.push(subCount + ' subfolder' + (subCount > 1 ? 's' : ''));
    parts.push((count || 0) + ' quiz' + (count === 1 ? '' : 'zes'));
    el.textContent = parts.join(' \u00B7 ');
  }
}

async function createFolder(name, silent, parentId = null) {
  if (!currentUser) return null;
  const { data, error } = await sb.from('folders').insert({
    user_id: currentUser.id,
    name: name.trim(),
    parent_id: parentId || null
  }).select().single();
  if (error) { toast('Could not create folder: ' + error.message, 'error'); return null; }
  foldersCache.unshift(data);
  renderFolders();
  if (!silent) toast('Folder created!', 'success');
  return data;
}



// ── CURRENT OPEN FOLDER ──────────────────────────────────────
let activeFolderId   = null;
let activeFolderName = '';
let quizzesCache     = [];

// Folder navigation path stack: [{id, name}]
let folderPathStack = [];

function buildFolderPath(folderId) {
  // Build full path from foldersCache by walking parent_id chain
  const path = [];
  let current = foldersCache.find(f => f.id === folderId);
  while (current) {
    path.unshift({ id: current.id, name: current.name, parentId: current.parent_id });
    current = current.parent_id ? foldersCache.find(f => f.id === current.parent_id) : null;
  }
  return path;
}

function renderBreadcrumb(pathArr) {
  const nav = document.getElementById('folder-breadcrumb');
  if (!nav) return;
  nav.innerHTML = '';

  // Root crumb
  const rootSpan = document.createElement('span');
  rootSpan.className = 'breadcrumb-item breadcrumb-link';
  rootSpan.textContent = 'Root';
  rootSpan.addEventListener('click', () => {
    folderPathStack = [];
    showView('dashboard');
  });
  nav.appendChild(rootSpan);

  pathArr.forEach((crumb, idx) => {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.textContent = '/';
    nav.appendChild(sep);

    const span = document.createElement('span');
    if (idx === pathArr.length - 1) {
      span.className = 'breadcrumb-item breadcrumb-current';
      span.textContent = crumb.name;
    } else {
      span.className = 'breadcrumb-item breadcrumb-link';
      span.textContent = crumb.name;
      span.addEventListener('click', () => {
        openFolder(crumb.id, crumb.name, crumb.parentId);
      });
    }
    nav.appendChild(span);
  });
}

async function openFolder(folderId, folderName, parentFolderId) {
  activeFolderId = folderId;
  activeFolderName = folderName;

  // Update folder view header
  const titleEl = document.getElementById('folder-title') || document.getElementById('folder-view-name');
  if (titleEl) titleEl.textContent = folderName;

  // Back button — go to parent folder or dashboard
  const backBtn = document.querySelector('#view-folder .btn-back');
  if (backBtn) {
    if (parentFolderId) {
      const parentFolder = foldersCache.find(f => f.id === parentFolderId);
      backBtn.textContent = '<- ' + (parentFolder?.name || 'Back');
      backBtn.removeAttribute('data-back');
      backBtn.onclick = () => openFolder(parentFolderId, parentFolder?.name || 'Back', parentFolder?.parent_id ?? null);
    } else {
      backBtn.textContent = '<- Folders';
      backBtn.onclick = null;
      backBtn.setAttribute('data-back', 'dashboard');
    }
  }

  // Build and render breadcrumb path
  const pathArr = buildFolderPath(folderId);
  renderBreadcrumb(pathArr);

  showView('folder');
  renderSubfolders(folderId);
  await loadQuizzes(folderId);
}

function renderSubfolders(parentFolderId) {
  const list = document.getElementById('quiz-list');
  if (!list) return;

  list.querySelectorAll('.subfolder-section, .quizzes-section-label').forEach(c => c.remove());

  const subs = foldersCache.filter(f => f.parent_id === parentFolderId);

  if (subs.length) {
    const section = document.createElement('div');
    section.className = 'subfolder-section';

    const heading = document.createElement('h3');
    heading.className = 'folder-section-heading';
    heading.innerHTML = '<span class="folder-section-icon">📂</span> Subfolders';
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'subfolder-grid';

    subs.forEach(sub => {
      const card = document.createElement('article');
      card.className = 'subfolder-card-new';
      card.dataset.subId = sub.id;
      card.innerHTML =
        '<div class="subfolder-card-inner">' +
          '<div class="subfolder-card-icons">' +
            '<span class="subfolder-doc-icon">📄</span>' +
            '<span class="subfolder-folder-icon">📁</span>' +
          '</div>' +
          '<div class="subfolder-card-name">' + escHtml(sub.name) + '</div>' +
          '<div class="subfolder-card-count" id="sc-count-' + sub.id + '">Loading…</div>' +
          '<div class="subfolder-card-actions">' +
            '<button class="btn btn--ghost btn--small subfolder-btn-pin' + (pinnedItems?.has('folder-' + sub.id) ? ' active' : '') + '" data-sub-id="' + sub.id + '" title="' + (pinnedItems?.has('folder-' + sub.id) ? 'Unpin' : 'Pin') + '" style="' + (pinnedItems?.has('folder-' + sub.id) ? 'color:#f59e0b;font-weight:bold;' : 'opacity:0.5;') + '">📌</button>' +
            '<button class="btn btn--ghost btn--small subfolder-btn-rename" data-sub-id="' + sub.id + '" title="Rename">✏️</button>' +
            '<button class="btn btn--ghost btn--small subfolder-btn-delete" data-sub-id="' + sub.id + '" title="Delete">🗑️</button>' +
          '</div>' +
        '</div>';

      card.querySelector('.subfolder-btn-pin').addEventListener('click', e => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const isPinned = pinnedItems?.has('folder-' + sub.id);
        if (isPinned) {
          if (typeof window.unpinItem === 'function') window.unpinItem('folder', sub.id);
          btn.classList.remove('active');
          btn.style.color = '';
          btn.style.fontWeight = '';
          btn.style.opacity = '0.5';
          btn.title = 'Pin';
        } else {
          if (typeof window.pinItem === 'function') window.pinItem('folder', sub.id, sub.name, 'Subfolder');
          btn.classList.add('active');
          btn.style.color = '#f59e0b';
          btn.style.fontWeight = 'bold';
          btn.style.opacity = '1';
          btn.title = 'Unpin';
        }
      });

      card.querySelector('.subfolder-btn-rename').addEventListener('click', async e => {
        e.stopPropagation();
        const newName = prompt('Rename folder:', sub.name);
        if (!newName || !newName.trim()) return;
        const { error } = await sb.from('folders').update({ name: newName.trim() }).eq('id', sub.id);
        if (error) { toast('Could not rename: ' + error.message, 'error'); return; }
        sub.name = newName.trim();
        const nameEl = card.querySelector('.subfolder-card-name');
        if (nameEl) nameEl.textContent = newName.trim();
        const cached = foldersCache.find(f => f.id === sub.id);
        if (cached) cached.name = newName.trim();
        toast('Folder renamed!', 'success');
      });

      card.querySelector('.subfolder-btn-delete').addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Delete folder "' + sub.name + '"? All quizzes inside will also be deleted.')) return;
        const { error } = await sb.from('folders').delete().eq('id', sub.id);
        if (error) { toast('Could not delete: ' + error.message, 'error'); return; }
        foldersCache = foldersCache.filter(f => f.id !== sub.id && f.parent_id !== sub.id);
        card.remove();
        toast('Folder deleted.', 'info');
      });

      card.addEventListener('click', e => {
        if (e.target.closest('.subfolder-btn-rename, .subfolder-btn-delete, .subfolder-btn-pin')) return;
        openFolder(sub.id, sub.name, parentFolderId);
      });
      grid.appendChild(card);

      (async () => {
        const { count } = await sb.from('quizzes').select('id', { count: 'exact', head: true }).eq('folder_id', sub.id);
        const el = document.getElementById('sc-count-' + sub.id);
        if (el) el.textContent = (count || 0) + ' quiz(zes)';
      })();
    });

    section.appendChild(grid);
    list.insertBefore(section, list.firstChild);
  }

  const quizLabel = document.createElement('div');
  quizLabel.className = 'quizzes-section-label';
  quizLabel.innerHTML = '<span class="folder-section-icon">❓</span> Quizzes in this Folder';
  list.insertBefore(quizLabel, subs.length ? list.children[1] : list.firstChild);
}
async function loadQuizzes(folderId) {
  const { data, error } = await sb.from('quizzes')
    .select('id, title, is_public, is_pinned, created_at, questions')
    .eq('folder_id', folderId)
    .order('created_at', { ascending: false });
  if (error && !data?.length) return;
  quizzesCache = data || [];
  renderQuizzes();
}

function renderQuizzes() {
  const list = document.getElementById('quiz-list');
  if (!list) return;

  list.querySelectorAll('.quiz-slip[data-quiz-id]').forEach(s => s.remove());

  quizzesCache.forEach(quiz => {
    const qCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
    const slip = document.createElement('article');
    slip.className = 'quiz-slip' + (quiz.is_pinned ? ' quiz-slip--pinned' : '');
    slip.dataset.quizId = quiz.id;
    slip.innerHTML = `
      <div class="quiz-slip-top">
        <span class="quiz-slip-title">
          <h3>${escHtml(quiz.title)}</h3>
        </span>
        <div class="quiz-slip-controls">
          <button class="btn-pin ${quiz.is_pinned ? 'active' : ''}"
            data-item-type="quiz" data-item-id="${quiz.id}"
            data-item-name="${escHtml(quiz.title)}" data-item-meta="${qCount} Qs"
            title="${quiz.is_pinned ? 'Unpin' : 'Pin quiz'}">📌</button>
          <button class="btn-toggle-visibility" title="${quiz.is_public ? 'Make Private' : 'Make Public'}">
            ${quiz.is_public ? '🔒 Make Private' : '🌐 Make Public'}
          </button>
        </div>
      </div>
      <div class="quiz-slip-meta">
        <span>${qCount} Questions</span>
        <span>${new Date(quiz.created_at).toLocaleDateString('en-IN')}</span>
      </div>
      <span class="visibility-badge ${quiz.is_public ? 'visibility-badge--public' : ''}" data-visibility-badge>
        ${quiz.is_public ? '🌐 Public' : '🔒 Private'}
      </span>
      <div class="quiz-slip-actions">
        <button class="btn btn--primary btn--small btn-start-quiz-real" data-quiz-id="${quiz.id}">▶ Start Quiz</button>
        <button class="btn btn--ghost btn--small btn-flashcard-quiz-real" data-quiz-id="${quiz.id}">⬡ Flashcards</button>
        <button class="btn btn--ghost btn--small btn-pomodoro-quiz" data-quiz-id="${quiz.id}" title="Pomodoro">🍅</button>
        <button class="btn btn--ghost btn--small btn-share-quiz-real" data-quiz-id="${quiz.id}">↗ Share</button>
        <button class="btn btn--ghost btn--small btn-rename-quiz" data-quiz-id="${quiz.id}" title="Rename quiz">✏️</button>
        <button class="btn btn--ghost btn--small btn-delete-quiz" data-quiz-id="${quiz.id}">🗑️</button>
        <button class="btn btn--ghost btn--small btn-add-question" data-quiz-title="${escHtml(quiz.title)}" data-quiz-id="${quiz.id}">＋ Add Q</button>
      </div>
    `;

    // Visibility toggle
    slip.querySelector('.btn-toggle-visibility').addEventListener('click', async e => {
      e.stopPropagation();
      quiz.is_public = !quiz.is_public;
      const badge = slip.querySelector('[data-visibility-badge]');
      badge.textContent = quiz.is_public ? '🌐 Public' : '🔒 Private';
      badge.className = `visibility-badge ${quiz.is_public ? 'visibility-badge--public' : ''}`;
      slip.querySelector('.btn-toggle-visibility').textContent = quiz.is_public ? '🔒 Make Private' : '🌐 Make Public';
      await sb.from('quizzes').update({ is_public: quiz.is_public }).eq('id', quiz.id);
    });

    // Rename quiz
    slip.querySelector('.btn-rename-quiz').addEventListener('click', async e => {
      e.stopPropagation();
      const newName = prompt('Rename quiz:', quiz.title);
      if (!newName || !newName.trim()) return;
      const { error } = await sb.from('quizzes').update({ title: newName.trim() }).eq('id', quiz.id);
      if (error) { toast('Could not rename: ' + error.message, 'error'); return; }
      quiz.title = newName.trim();
      slip.querySelector('h3').textContent = newName.trim();
      const pinBtn = slip.querySelector('.btn-pin');
      if (pinBtn) pinBtn.dataset.itemName = newName.trim();
      toast('Quiz renamed!', 'success');
    });

    // Delete quiz
    slip.querySelector('.btn-delete-quiz').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Delete quiz "${quiz.title}"?`)) return;
      await sb.from('quizzes').delete().eq('id', quiz.id);
      quizzesCache = quizzesCache.filter(q => q.id !== quiz.id);
      slip.remove();
      if (activeFolderId) loadFolderCount(activeFolderId);
      toast('Quiz deleted.', 'info');
    });

    // Add Question (modal, stays in folder)
    slip.querySelector('.btn-add-question').addEventListener('click', e => {
      e.stopPropagation();
      addQuestionTargetQuizId = quiz.id;
      document.getElementById('add-question-quiz-title').textContent = quiz.title;
      document.getElementById('add-question-json').value = '';
      document.getElementById('add-question-position').value = '';
      document.getElementById('add-question-status').textContent = '';
      openModal('modal-add-question');
    });


    slip.querySelector('.btn-start-quiz-real').addEventListener('click', () => {
      activeQuizId = quiz.id;
      activeQuizTitle = quiz.title;
      activeQuizQuestions = Array.isArray(quiz.questions) ? quiz.questions : [];
      activeFullQuizQuestions = [];
      document.getElementById('setup-quiz-title').textContent = quiz.title;
      document.getElementById('setup-quiz-total').textContent = activeQuizQuestions.length;
      // Reset range selectors to cover the full quiz by default
      const rFrom = document.getElementById('range-from');
      const rTo   = document.getElementById('range-to');
      if (rFrom && rTo) {
        rFrom.value = 1;
        rTo.value = activeQuizQuestions.length;
        rFrom.dispatchEvent(new Event('change'));
      }
      openQuizSetup(null);
    });

    // Flashcards
    slip.querySelector('.btn-flashcard-quiz-real').addEventListener('click', () => {
      activeQuizId = quiz.id;
      activeQuizTitle = quiz.title;
      activeQuizQuestions = Array.isArray(quiz.questions) ? quiz.questions : [];
      renderFlashcards(activeQuizQuestions, quiz.title);
      showView('flashcards');
    });

    // 🍅 Pomodoro — launch directly with this quiz
    slip.querySelector('.btn-pomodoro-quiz').addEventListener('click', e => {
      e.stopPropagation();
      if (!quizzesCache.find(q => q.id === quiz.id)) quizzesCache.push(quiz);
      if (typeof startPomodoroSetup === 'function') startPomodoroSetup(quiz.id);
      else toast('Pomodoro not loaded yet — refresh the page', 'error');
    });

    // Share quiz
    slip.querySelector('.btn-share-quiz-real').addEventListener('click', () => {
      initShareSelection(qCount);
      currentShareQuizId = quiz.id;
      const pickerBlock = document.getElementById('share-quiz-picker-block');
      if (pickerBlock) pickerBlock.style.display = 'none';
      openModal('modal-share');
      setupShareModal(quiz);
    });

    list.appendChild(slip);
  });

  // Update select-existing-quiz dropdown in create view
  updateExistingQuizSelect();
}

function updateSaveFolderSelect() {
  const sel = document.getElementById('save-folder-select');
  if (!sel) return;
  sel.innerHTML = foldersCache.map(f => `<option value="${f.id}">${escHtml(f.name)}</option>`).join('');
}

function updateTargetFolderSelect() {
  const sel = document.getElementById('select-target-folder');
  if (!sel) return;
  const prev = sel.value;

  // Build indented folder names showing path
  function getFolderLabel(folder, depth) {
    return '\u00a0\u00a0'.repeat(depth) + (depth > 0 ? '\u2514 ' : '') + folder.name;
  }
  function buildOptions(parentId, depth) {
    return foldersCache
      .filter(f => (f.parent_id ?? null) === parentId)
      .map(f => `<option value="${f.id}">${escHtml(getFolderLabel(f, depth))}</option>` + buildOptions(f.id, depth + 1))
      .join('');
  }

  sel.innerHTML = buildOptions(null, 0) + '<option value="__new">\uff0b Create new folder\u2026</option>';

  if (prev && [...sel.options].some(o => o.value === prev)) {
    sel.value = prev;
  } else if (activeFolderId && [...sel.options].some(o => o.value === activeFolderId)) {
    sel.value = activeFolderId;
  }
}

function updateExistingQuizSelect() {
  const sel = document.getElementById('select-existing-quiz');
  if (!sel) return;
  const allQuizzes = quizzesCache;
  sel.innerHTML = '<option value="">— Create as new quiz —</option>' +
    allQuizzes.map(q => `<option value="${q.id}">${escHtml(q.title)}</option>`).join('');
}

// ── QUIZ SAVE (Create / Add Questions) ───────────────────────
async function saveQuiz() {
  const title      = document.getElementById('input-quiz-title').value.trim();
  const questions  = parseQuestionJSON();
  if (!title || !questions) return;

  const existingQuizId = document.getElementById('select-existing-quiz')?.value || '';
  const btn = document.getElementById('btn-save-quiz');
  setLoading(btn, true, 'Saving…');

  if (existingQuizId) {
    // Append to existing quiz
    const existing = quizzesCache.find(q => q.id === existingQuizId);
    const merged   = [...(existing?.questions || []), ...questions];
    const { error } = await sb.from('quizzes')
      .update({ questions: merged })
      .eq('id', existingQuizId);
    setLoading(btn, false);
    if (error) { toast('Could not update quiz: ' + error.message, 'error'); return; }
    if (existing) existing.questions = merged;
    renderQuizzes();
    toast(`Added ${questions.length} question(s) to "${existing?.title}"!`, 'success');
  } else {
    // Create new quiz — use the folder chosen in "Save to folder" dropdown
    const folderSel = document.getElementById('select-target-folder');
    let folderId = folderSel?.value || '';

    if (folderId === '__new' || !folderId) {
      const name = prompt('Enter new folder name:');
      if (!name || !name.trim()) {
        setLoading(btn, false);
        return;
      }
      const newFolder = await createFolder(name.trim());
      if (!newFolder) {
        setLoading(btn, false);
        toast('Could not create folder.', 'error');
        return;
      }
      folderId = newFolder.id;
    }

    const { data, error } = await sb.from('quizzes').insert({
      user_id: currentUser.id,
      folder_id: folderId,
      title,
      questions
    }).select().single();
    setLoading(btn, false);
    if (error) { toast('Could not create quiz: ' + error.message, 'error'); return; }
    quizzesCache.unshift(data);
    renderQuizzes();
    loadFolderCount(folderId);
    toast(`Quiz "${title}" created with ${questions.length} questions!`, 'success');
  }

  document.getElementById('input-quiz-title').value = '';
  document.getElementById('json-paste-area').value  = '';
  document.getElementById('import-status').textContent = '';
  showView('folder');
}

// ── FRIEND / PUBLIC PROFILE (view their public library) ─────────────────
document.getElementById('btn-close-friend-profile')?.addEventListener('click', () => closeModal('modal-friend-profile'));

// `friend` needs at least { id }. Other fields (display_name, roll_no,
// is_public, created_at) are fetched fresh so this works for friend cards,
// search results, and "preview my own profile" alike.
async function openFriendProfile(friend) {
  if (!friend?.id) return;

  const isSelf = friend.id === currentUser?.id;

  let profile = friend;
  // Always fetch a fresh copy so we have created_at + is_public,
  // even if the caller only passed { id, display_name, ... }.
  const { data: freshProfile } = await sb.from('profiles')
    .select('id, display_name, roll_no, is_public, created_at')
    .eq('id', friend.id)
    .maybeSingle();
  if (freshProfile) profile = freshProfile;

  const initials = (profile.display_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('friend-profile-avatar').textContent = initials;
  document.getElementById('friend-profile-name').textContent = profile.display_name || (isSelf ? 'You' : 'User');
  document.getElementById('friend-profile-rollno').textContent = profile.roll_no || '';

  const joinedEl = document.getElementById('friend-profile-joined');
  if (joinedEl) {
    joinedEl.textContent = profile.created_at
      ? 'Member since ' + new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
      : '';
  }

  const body = document.getElementById('friend-profile-body');
  const privateMsg = document.getElementById('friend-profile-private-msg');

  // RLS already prevents reading another user's private profile data
  // (folders/quizzes/likes all require is_public=true or own user_id), but
  // we also show a friendly message instead of an empty/broken-looking modal.
  // For self-preview, showing this too helps the user understand what
  // others see when their profile is set to private.
  const isPrivateToViewer = profile.is_public === false;

  if (isPrivateToViewer) {
    if (body) body.style.display = 'none';
    if (privateMsg) {
      privateMsg.textContent = isSelf
        ? '🔒 Your profile is private. This is what others see — toggle visibility in My Profile to share your library.'
        : '🔒 This profile is private.';
      privateMsg.style.display = 'block';
    }
    openModal('modal-friend-profile');
    return;
  }

  if (body) body.style.display = '';
  if (privateMsg) privateMsg.style.display = 'none';

  openModal('modal-friend-profile');
  await Promise.all([
    renderFriendPublicLibrary(profile, isSelf),
    renderFriendStats(profile),
    buildActivityCalendarReal(profile.id, 'friend-contribution-grid', 'friend-contribution-months')
  ]);
}

// ── STREAK CALCULATION ────────────────────────────────────────
// Given a map of { 'YYYY-MM-DD': count }, returns { current, best }.
// current = consecutive days ending today (or yesterday if not attempted today).
// best = longest ever consecutive-day run.
function calcStreak(countMap) {
  const activeDays = new Set(Object.keys(countMap).filter(d => countMap[d] > 0));
  if (activeDays.size === 0) return { current: 0, best: 0 };

  const toKey = d => d.toISOString().slice(0, 10);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Current streak — walk back from today
  let current = 0;
  const check = new Date(today);
  // Allow streak to still count if today hasn't been attempted yet (start from yesterday)
  if (!activeDays.has(toKey(check))) check.setDate(check.getDate() - 1);
  while (activeDays.has(toKey(check))) {
    current++;
    check.setDate(check.getDate() - 1);
  }

  // Best streak — sort all active dates and find longest run
  const sorted = [...activeDays].sort();
  let best = 0, run = 0, prev = null;
  sorted.forEach(key => {
    const d = new Date(key);
    if (prev) {
      const diff = (d - prev) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = d;
  });

  return { current, best };
}

async function renderFriendStats(friend) {
  const { data: attempts } = await sb.from('quiz_attempts')
    .select('score, total, attempted_at, time_taken').eq('user_id', friend.id);

  const totalEl  = document.getElementById('friend-stat-total-quizzes');
  const accEl    = document.getElementById('friend-stat-avg-accuracy');
  const streakEl = document.getElementById('friend-stat-streak');
  const bestEl   = document.getElementById('friend-stat-best-streak');

  if (!attempts || attempts.length === 0) {
    if (totalEl)  totalEl.textContent  = '0';
    if (accEl)    accEl.textContent    = '0%';
    if (streakEl) streakEl.textContent = '0';
    if (bestEl)   bestEl.textContent   = '0';
    return;
  }

  if (totalEl) totalEl.textContent = attempts.length;
  const avgPct = attempts.reduce((sum, a) => sum + (a.total > 0 ? (a.score / a.total) * 100 : 0), 0) / attempts.length;
  if (accEl) accEl.textContent = Math.round(avgPct) + '%';

  // Build date→count map for streak
  const countMap = {};
  attempts.forEach(a => {
    const d = (a.attempted_at || '').slice(0, 10);
    if (d) countMap[d] = (countMap[d] || 0) + 1;
  });
  const { current, best } = calcStreak(countMap);
  if (streakEl) streakEl.textContent = current + (current === 1 ? ' day' : ' days');
  if (bestEl)   bestEl.textContent   = best + (best === 1 ? ' day' : ' days');

  // Highlight streak card if active
  const streakCard = streakEl?.closest('.profile-stat-card');
  if (streakCard) streakCard.classList.toggle('profile-stat-card--streak-active', current > 0);
}

// ── MY PROFILE STATS ─────────────────────────────────────────
async function loadMyProfileStats() {
  if (!currentUser) return;
  const { data: attempts } = await sb.from('quiz_attempts')
    .select('score, total, attempted_at, time_taken')
    .eq('user_id', currentUser.id);

  if (!attempts || attempts.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  // Build date map for streak
  const countMap = {};
  let totalTime7d = 0;
  let todayCount = 0;
  attempts.forEach(a => {
    const d = (a.attempted_at || '').slice(0, 10);
    if (!d) return;
    countMap[d] = (countMap[d] || 0) + 1;
    if (d === today) todayCount++;
    if (d >= sevenDaysAgo) totalTime7d += (a.time_taken || 0);
  });

  const { current, best } = calcStreak(countMap);
  const avgPct = attempts.reduce((sum, a) => sum + (a.total > 0 ? (a.score / a.total) * 100 : 0), 0) / attempts.length;
  const totalMins7d = Math.round(totalTime7d / 60);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-quizzes-today', todayCount);
  set('stat-streak',        current + (current === 1 ? ' day' : ' days'));
  set('stat-best-streak',   best    + (best === 1    ? ' day' : ' days'));
  set('stat-quiz-time-week', totalMins7d + 'm');
  set('stat-avg-accuracy',   Math.round(avgPct) + '%');
  set('stat-total-quizzes',  attempts.length);

  // Highlight streak card if active
  const streakCard = document.getElementById('stat-streak')?.closest('.profile-stat-card');
  if (streakCard) streakCard.classList.toggle('profile-stat-card--streak-active', current > 0);
}

async function renderFriendPublicLibrary(friend, isSelf) {
  const grid  = document.getElementById('friend-public-library-grid');
  const empty = document.getElementById('friend-public-library-empty');
  if (!grid) return;
  grid.innerHTML = '<p style="color:var(--slate);padding:1rem">Loading…</p>';

  const [{ data: pubFolders }, { data: pubQuizzes }] = await Promise.all([
    sb.from('folders').select('id, name, user_id').eq('user_id', friend.id).eq('is_public', true),
    sb.from('quizzes').select('id, title, user_id, folder_id, questions').eq('user_id', friend.id).eq('is_public', true)
  ]);

  // Don't show quizzes that belong to a public folder (avoid duplicate "Add")
  const folderIds = new Set((pubFolders || []).map(f => f.id));
  const standaloneQuizzes = (pubQuizzes || []).filter(q => !folderIds.has(q.folder_id));

  const items = [
    ...(pubFolders || []).map(f => ({ id: f.id, type: 'folder', label: '📁 Folder', title: f.name, meta: '' })),
    ...standaloneQuizzes.map(q => ({ id: q.id, type: 'quiz', label: '📝 Quiz', title: q.title, meta: `${q.questions?.length || 0} Qs` }))
  ];

  grid.innerHTML = '';
  if (items.length === 0) { if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';

  // Like counts + which items the current user has already liked
  const itemIds = items.map(i => i.id);
  const [{ data: likes }, { data: myLikes }] = await Promise.all([
    sb.from('likes').select('item_id').in('item_id', itemIds),
    currentUser
      ? sb.from('likes').select('item_id').eq('user_id', currentUser.id).in('item_id', itemIds)
      : Promise.resolve({ data: [] })
  ]);
  const likeMap = {};
  (likes || []).forEach(l => { likeMap[l.item_id] = (likeMap[l.item_id] || 0) + 1; });
  const myLikedSet = new Set((myLikes || []).map(l => l.item_id));

  items.forEach(item => {
    const el = document.createElement('article');
    el.className = 'public-lib-card';
    const likeCount = likeMap[item.id] || 0;
    const isLiked = myLikedSet.has(item.id);
    el.innerHTML = `
      <div class="public-lib-card-top">
        <span class="public-lib-type">${item.label}</span>
        <span class="visibility-badge visibility-badge--public">🌐 Public</span>
      </div>
      <h4>${escHtml(item.title)}</h4>
      <span class="public-lib-owner">👤 ${isSelf ? 'You' : escHtml(friend.display_name)} · ${item.meta}</span>
      <div class="public-lib-actions">
        <button class="btn-like${isLiked ? ' liked' : ''}" data-id="${item.id}">❤ <span class="like-count">${likeCount}</span></button>
        ${isSelf ? '' : '<button class="btn btn--ghost btn--small btn-import-shared-item">📥 Add to My Library</button>'}
      </div>
    `;
    grid.appendChild(el);

    el.querySelector('.btn-like').addEventListener('click', async () => {
      if (!currentUser) return;
      const btn = el.querySelector('.btn-like');
      const liked = btn.classList.toggle('liked');
      const countEl = btn.querySelector('.like-count');
      if (liked) {
        await sb.from('likes').insert({ user_id: currentUser.id, item_type: item.type, item_id: item.id });
        countEl.textContent = parseInt(countEl.textContent) + 1;
      } else {
        await sb.from('likes').delete().eq('user_id', currentUser.id).eq('item_id', item.id);
        countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
      }
    });

    const importBtn = el.querySelector('.btn-import-shared-item');
    if (importBtn) {
      importBtn.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        setLoading(btn, true, 'Adding…');
        if (item.type === 'folder') {
          await importSharedChapter(item.id, item.title);
        } else {
          await importSharedQuiz(item.id, item.title, friend.display_name);
        }
        setLoading(btn, false);
      });
    }
  });
}

// Import a single shared quiz into the current user's library (own folder)
async function importSharedQuiz(quizId, quizTitle, fromName) {
  const { data: srcQuiz, error } = await sb.from('quizzes')
    .select('title, questions').eq('id', quizId).single();
  if (error || !srcQuiz) { toast('Could not load quiz: ' + (error?.message || ''), 'error'); return; }

  const folderName = `Shared by ${fromName || 'Friend'}`;
  let folder = foldersCache.find(f => f.user_id === currentUser.id && f.name === folderName);
  if (!folder) {
    folder = await createFolder(folderName, true /* silent */);
    if (!folder) { toast('Could not create folder.', 'error'); return; }
  }

  const { error: insErr } = await sb.from('quizzes').insert({
    user_id: currentUser.id,
    folder_id: folder.id,
    title: srcQuiz.title,
    questions: srcQuiz.questions,
    is_public: false
  });
  if (insErr) { toast('Could not add quiz: ' + insErr.message, 'error'); return; }

  loadFolderCount(folder.id);
  toast(`"${srcQuiz.title}" added to "${folder.name}"!`, 'success');
}


let addQuestionTargetQuizId = null;

document.getElementById('btn-cancel-add-question')?.addEventListener('click', () => closeModal('modal-add-question'));

document.getElementById('btn-import-add-question')?.addEventListener('click', async () => {
  if (!addQuestionTargetQuizId) return;
  const raw = document.getElementById('add-question-json').value.trim();
  const statusEl = document.getElementById('add-question-status');
  if (!raw) { statusEl.textContent = 'Paste JSON first.'; statusEl.className = 'import-status error'; return; }

  let parsed;
  try {
    parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('JSON must be an array.');
    parsed.forEach((q, i) => {
      if (!q.question || !Array.isArray(q.options) || typeof q.correctIndex !== 'number')
        throw new Error('Question ' + (i + 1) + ' missing required fields.');
    });
  } catch (err) {
    statusEl.textContent = '✗ ' + err.message;
    statusEl.className = 'import-status error';
    return;
  }

  const existing = quizzesCache.find(q => q.id === addQuestionTargetQuizId);
  if (!existing) { toast('Quiz not found.', 'error'); return; }

  // Assign unique ids that don't collide with existing question ids
  const existingIds = new Set((existing.questions || []).map(q => String(q.id)));
  let counter = (existing.questions || []).length + 1;
  parsed.forEach(q => {
    if (!q.id || existingIds.has(String(q.id))) {
      while (existingIds.has('q' + counter)) counter++;
      q.id = 'q' + counter;
      counter++;
    }
    existingIds.add(String(q.id));
  });

  const posRaw = document.getElementById('add-question-position').value.trim();
  const pos = posRaw ? Math.max(1, Math.min(parseInt(posRaw, 10), (existing.questions || []).length + 1)) : null;

  const list = [...(existing.questions || [])];
  if (pos) list.splice(pos - 1, 0, ...parsed);
  else list.push(...parsed);

  const btn = document.getElementById('btn-import-add-question');
  setLoading(btn, true, 'Importing…');
  const { error } = await sb.from('quizzes').update({ questions: list }).eq('id', addQuestionTargetQuizId);
  setLoading(btn, false);
  if (error) { toast('Could not update quiz: ' + error.message, 'error'); return; }

  existing.questions = list;
  renderQuizzes();
  toast(`Added ${parsed.length} question(s) to "${existing.title}"!`, 'success');

  document.getElementById('add-question-json').value = '';
  document.getElementById('add-question-position').value = '';
  statusEl.textContent = '';
  closeModal('modal-add-question');
});


let activeQuizId        = null;
let activeQuizTitle     = '';
let activeQuizQuestions = [];
let activeFullQuizQuestions = [];
let activeQuizSessionId = null; // shared/group quiz session for leaderboard
let currentShareQuizId  = null;

// ── QUIZ PLAYER INTEGRATION ────────────────────────────────────
// Overrides renderPlayer to use real questions
function renderPlayerReal() {
  const total = quizState.length || 1;
  const q = activeQuizQuestions[currentQ];

  document.getElementById('player-q-current').textContent = currentQ + 1;
  document.getElementById('player-q-total').textContent   = total;
  document.getElementById('question-tag').textContent     = 'Question ' + (currentQ + 1);
  document.getElementById('progress-fill').style.width   = (((currentQ + 1) / total) * 100) + '%';

  if (q) {
    document.getElementById('question-text').textContent = q.question || '';
    const optionEls = document.querySelectorAll('.option-item');
    const numOptions = Array.isArray(q.options) ? q.options.length : 0;
    optionEls.forEach((el, i) => {
      const label = el.querySelector('.option-label');
      const text  = el.querySelector('.option-text');
      const radio = el.querySelector('input[type="radio"]');
      if (i < numOptions) {
        el.style.display = '';
        if (label) label.textContent = String.fromCharCode(65 + i);
        if (text) text.textContent = q.options[i] || '';
        const isSelected = quizState[currentQ]?.optionIndex === i;
        el.classList.toggle('selected', isSelected);
        if (radio) radio.checked = isSelected;
      } else {
        el.style.display = 'none';
        el.classList.remove('selected');
        if (radio) radio.checked = false;
      }
    });
  }

  document.getElementById('btn-q-review').classList.toggle('active', quizState[currentQ]?.marked);
  document.getElementById('btn-prev-q').disabled = currentQ === 0;
  document.getElementById('btn-next-q').textContent = currentQ === total - 1 ? 'Finish ✓' : 'Next →';
}

// ── RESULT SAVE ───────────────────────────────────────────────
async function saveAttempt() {
  if (!currentUser || !activeQuizId) return;

  const answers = {};
  let correct = 0, incorrect = 0, skipped = 0;
  const total = quizState.length;

  quizState.forEach((s, i) => {
    answers[i] = s.optionIndex;
    const q = activeQuizQuestions[i];
    if (s.optionIndex === null || s.optionIndex === undefined) {
      skipped++;
    } else if (q && s.optionIndex === q.correctIndex) {
      correct++;
    } else {
      incorrect++;
    }
  });

  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Elapsed: total set time minus remaining (0 if no timer)
  const elapsed = timerMode !== 'none'
    ? ((parseInt(document.getElementById('timer-minutes')?.value || 0) * 60)
      + parseInt(document.getElementById('timer-seconds')?.value || 0))
      - timeRemaining
    : 0;

  const mm = String(Math.floor(Math.abs(elapsed) / 60)).padStart(2, '0');
  const ss = String(Math.abs(elapsed) % 60).padStart(2, '0');
  const timeStr = elapsed > 0 ? `${mm}:${ss}` : '\u2014';

  // ── Update result UI (matching index.html IDs exactly) ──
  document.getElementById('result-quiz-title').textContent = activeQuizTitle;
  document.getElementById('score-percent').textContent     = pct + '%';
  document.getElementById('stat-correct').textContent      = correct;
  document.getElementById('stat-incorrect').textContent    = incorrect;
  document.getElementById('stat-skipped').textContent      = skipped;
  document.getElementById('stat-time').textContent         = timeStr;
  document.getElementById('stat-rank').textContent         = '\u2014'; // updated after DB save

  // ── Build review list ──
  const reviewList = document.getElementById('review-list');
  if (reviewList) {
    reviewList.innerHTML = '';
    const labels = ['A','B','C','D','E'];
    quizState.forEach((s, i) => {
      const q = activeQuizQuestions[i];
      if (!q) return;
      const isSkipped = s.optionIndex === null || s.optionIndex === undefined;
      const isCorrect = !isSkipped && s.optionIndex === q.correctIndex;
      const cls = isCorrect ? 'review-item--correct' : isSkipped ? 'review-item--skipped' : 'review-item--incorrect';
      const yourLabel = isSkipped ? '\u2014' : (labels[s.optionIndex] || s.optionIndex);
      const yourText  = isSkipped ? 'Skipped' : escHtml(q.options?.[s.optionIndex] || '');
      const corrLabel = labels[q.correctIndex] || q.correctIndex;
      const corrText  = escHtml(q.options?.[q.correctIndex] || '');

      const item = document.createElement('article');
      item.className = `review-item ${cls}`;
      item.innerHTML = `
        <div class="review-q">
          <span class="review-num">${i + 1}.</span>
          <span>${escHtml(q.question || '')}</span>
        </div>
        <div class="review-answer">
          ${isSkipped
            ? `<span class="review-tag review-tag--skipped">Skipped</span>`
            : isCorrect
              ? `<span class="review-tag review-tag--correct">Your answer: ${yourLabel}. ${yourText} \u2713</span>`
              : `<span class="review-tag review-tag--incorrect">Your answer: ${yourLabel}. ${yourText} \u2717</span>
                 <span class="review-tag review-tag--correct" style="margin-left:.5rem">Correct: ${corrLabel}. ${corrText}</span>`
          }
        </div>
        ${q.explanation ? `<p class="review-explanation">${escHtml(q.explanation)}</p>` : ''}
      `;
      reviewList.appendChild(item);
    });
  }

  // ── Show/hide leaderboard button for group/shared sessions ──
  const lbBtn = document.getElementById('btn-result-leaderboard');
  if (lbBtn) lbBtn.style.display = activeQuizSessionId ? '' : 'none';

  // ── Save to DB then compute rank ──
  sb.from('quiz_attempts').insert({
    user_id:    currentUser.id,
    quiz_id:    activeQuizId,
    quiz_title: activeQuizTitle,
    session_id: activeQuizSessionId,
    score: correct, total, answers,
    time_taken: elapsed
  }).then(async ({ error }) => {
    if (error) { console.warn('Attempt save error:', error.message); return; }
    const { data: attempts } = await sb.from('quiz_attempts')
      .select('score, total')
      .eq('quiz_id', activeQuizId);
    if (attempts && attempts.length > 0) {
      const rank = attempts.filter(a => {
        const ap = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
        return ap > pct;
      }).length + 1;
      const rankEl = document.getElementById('stat-rank');
      if (rankEl) rankEl.textContent = '#' + rank;
    }
  });
}

document.getElementById('btn-result-leaderboard')?.addEventListener('click', async () => {
  if (!activeQuizSessionId) return;
  await renderSessionLeaderboard(activeQuizSessionId);
});

async function renderSessionLeaderboard(sessionId) {
  const list = document.getElementById('leaderboard-list');
  const nameEl = document.getElementById('leaderboard-quiz-name');
  if (!list) return;
  list.innerHTML = '<p class="hint">Loading...</p>';

  const { data: session } = await sb.from('quiz_sessions')
    .select('*').eq('id', sessionId).single();

  if (nameEl) nameEl.textContent = session?.title || activeQuizTitle || '';

  const memberIds = session?.member_ids || [currentUser.id];

  const [{ data: attempts }, { data: profilesData }] = await Promise.all([
    sb.from('quiz_attempts')
      .select('user_id, score, total, time_taken, attempted_at')
      .eq('session_id', sessionId)
      .order('attempted_at', { ascending: true }),
    sb.from('profiles').select('id, display_name, roll_no').in('id', memberIds)
  ]);

  const profileMap = new Map((profilesData || []).map(p => [p.id, p]));

  // Group attempts per user, in chronological order (1st, 2nd, 3rd...)
  const attemptsByUser = new Map();
  (attempts || []).forEach(a => {
    if (!attemptsByUser.has(a.user_id)) attemptsByUser.set(a.user_id, []);
    attemptsByUser.get(a.user_id).push(a);
  });

  const fmtTime = (t) => {
    t = t || 0;
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    return t > 0 ? `${mm}:${ss}` : '\u2014';
  };
  const fmtPct = (a) => a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;

  const rows = memberIds.map(uid => {
    const profile = profileMap.get(uid);
    const userAttempts = attemptsByUser.get(uid) || [];
    const firstAttempt = userAttempts[0] || null;
    const name = uid === currentUser.id ? 'You' : (profile?.display_name || 'Friend');
    const sub  = profile?.display_name || profile?.roll_no || '';
    const initials = (profile?.display_name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
    return {
      uid, name, sub, initials,
      pct: firstAttempt ? fmtPct(firstAttempt) : null,
      timeStr: firstAttempt ? fmtTime(firstAttempt.time_taken) : '\u2014',
      firstAttempt,
      attempts: userAttempts
    };
  });

  // Rank by FIRST attempt only (highest score, then lowest time)
  rows.sort((a, b) => {
    if (a.pct === null && b.pct === null) return 0;
    if (a.pct === null) return 1;
    if (b.pct === null) return -1;
    if (b.pct !== a.pct) return b.pct - a.pct;
    return (a.firstAttempt.time_taken || 0) - (b.firstAttempt.time_taken || 0);
  });

  const medals = ['🥇', '🥈', '🥉'];
  list.innerHTML = rows.map((r, i) => {
    const isMe = r.uid === currentUser.id;
    if (r.pct === null) {
      return `
        <div class="leaderboard-row leaderboard-row--pending${isMe ? ' leaderboard-row--me' : ''}">
          <div class="leaderboard-row-main">
            <span class="lb-rank lb-rank--pending">\u2014</span>
            <div class="friend-avatar friend-avatar--sm">${escHtml(r.initials)}</div>
            <div class="lb-info"><strong>${escHtml(r.name)}</strong><span>Not attempted yet</span></div>
            <div class="lb-score lb-score--pending">\u2014</div>
            <div class="lb-time">\u2014</div>
          </div>
        </div>`;
    }
    const rank = medals[i] || `#${i + 1}`;

    const extraAttempts = r.attempts.slice(1);
    const attemptsHtml = extraAttempts.length ? `
      <div class="lb-attempts">
        ${r.attempts.map((a, idx) => `
          <div class="lb-attempt-row${idx === 0 ? ' lb-attempt-row--first' : ''}">
            <span class="lb-attempt-label">${idx === 0 ? '1st attempt (counts for rank)' : ordinal(idx + 1) + ' attempt'}</span>
            <span class="lb-attempt-score">${fmtPct(a)}%</span>
            <span class="lb-attempt-time">${fmtTime(a.time_taken)}</span>
          </div>`).join('')}
      </div>` : '';

    return `
      <div class="leaderboard-row${isMe ? ' leaderboard-row--me' : ''}${extraAttempts.length ? ' leaderboard-row--has-attempts' : ''}">
        <div class="leaderboard-row-main">
          <span class="lb-rank">${rank}</span>
          <div class="friend-avatar friend-avatar--sm">${escHtml(r.initials)}</div>
          <div class="lb-info">
            <strong>${escHtml(r.name)}</strong>
            <span>${escHtml(r.sub)}${r.attempts.length > 1 ? ` · ${r.attempts.length} attempts` : ''}</span>
          </div>
          <div class="lb-score">${r.pct}%</div>
          <div class="lb-time">${r.timeStr}</div>
        </div>
        ${attemptsHtml}
      </div>`;
  }).join('');

  openModal('modal-leaderboard');
}

// 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", ...
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
async function loadHistory() {
  if (!currentUser) return;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb.from('quiz_attempts')
    .select('*')
    .eq('user_id', currentUser.id)
    .gte('attempted_at', since)
    .order('attempted_at', { ascending: false })
    .limit(10);
  if (error) return;
  renderHistory(data || []);
}

function renderHistory(attempts) {
  const list = document.getElementById('history-list');
  if (!list) return;

  // Remove dynamic entries
  list.querySelectorAll('.history-item[data-attempt-id]').forEach(i => i.remove());
  const empty = document.getElementById('history-empty');
  if (attempts.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  attempts.forEach(a => {
    const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
    const el = document.createElement('div');
    el.className = 'history-item';
    el.dataset.attemptId = a.id;
    el.innerHTML = `
      <div class="history-item-top">
        <strong>${escHtml(a.quiz_title)}</strong>
        <span class="history-score ${pct >= 70 ? 'score--good' : pct >= 40 ? 'score--ok' : 'score--low'}">
          ${a.score}/${a.total} (${pct}%)
        </span>
      </div>
      <div class="history-item-meta">
        <span>${new Date(a.attempted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        ${a.time_taken > 0 ? `<span>⏱ ${Math.floor(a.time_taken/60)}m ${a.time_taken%60}s</span>` : ''}
      </div>
    `;
    list.insertBefore(el, list.firstChild);
  });
}

// ── SHARED QUIZ SESSIONS (jab man ho tab start karein) ─────────
async function loadSharedSessions() {
  if (!currentUser) return;
  const { data, error } = await sb.from('quiz_sessions')
    .select('*')
    .or(`host_id.eq.${currentUser.id},member_ids.cs.{${currentUser.id}}`)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) { console.warn('loadSharedSessions error:', error.message); return; }
  renderSharedSessions(data || []);
}

async function renderSharedSessions(sessions) {
  const list  = document.getElementById('shared-sessions-list');
  const empty = document.getElementById('shared-sessions-empty');
  if (!list) return;
  list.innerHTML = '';

  if (!sessions.length) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  // Find which sessions the current user has already attempted
  const { data: myAttempts } = await sb.from('quiz_attempts')
    .select('session_id, score, total')
    .eq('user_id', currentUser.id)
    .in('session_id', sessions.map(s => s.id));
  const attemptedIds = new Set((myAttempts || []).map(a => a.session_id));

  sessions.forEach(s => {
    const qCount = Array.isArray(s.questions) ? s.questions.length : 0;
    const timeLabel = s.time_limit_seconds > 0
      ? `⏱ ${Math.floor(s.time_limit_seconds/60)}m ${s.time_limit_seconds%60}s`
      : '⏱ No time limit';
    const isHost = s.host_id === currentUser.id;
    const attempted = attemptedIds.has(s.id);

    const el = document.createElement('div');
    el.className = 'history-item';
    el.innerHTML = `
      <div class="history-item-top">
        <strong>${escHtml(s.title)}</strong>
        <span class="history-score ${attempted ? 'score--good' : 'score--ok'}">
          ${attempted ? '✅ Attempted' : '🕒 Pending'}
        </span>
      </div>
      <div class="history-item-meta">
        <span>${qCount} questions</span>
        <span>${timeLabel}</span>
        <span>${isHost ? 'Shared by you' : 'Shared by ' + escHtml(s.host_name || 'a friend')}</span>
      </div>
      <div class="result-actions" style="margin-top:0.5rem">
        <button class="btn btn--primary btn--small btn-session-start">${attempted ? '🔁 Attempt Again' : '▶ Start Quiz'}</button>
        <button class="btn btn--ghost btn--small btn-session-leaderboard">🏆 Leaderboard</button>
      </div>
    `;

    el.querySelector('.btn-session-start').addEventListener('click', () => {
      activeQuizId        = s.quiz_id;
      activeQuizTitle     = s.title;
      activeQuizQuestions = Array.isArray(s.questions) ? s.questions : [];
      activeFullQuizQuestions = [];
      activeQuizSessionId = s.id;
      document.getElementById('setup-quiz-title').textContent = s.title;
      document.getElementById('setup-quiz-total').textContent = activeQuizQuestions.length;
      applySessionTimer(s.time_limit_seconds || 0);
      const rFrom = document.getElementById('range-from');
      const rTo   = document.getElementById('range-to');
      if (rFrom && rTo) {
        rFrom.value = 1;
        rTo.value = activeQuizQuestions.length;
        rFrom.dispatchEvent(new Event('change'));
      }
      openQuizSetup(null, true);
    });

    el.querySelector('.btn-session-leaderboard').addEventListener('click', () => {
      renderSessionLeaderboard(s.id);
    });

    list.appendChild(el);
  });
}


// Bookmark any question object directly (used by flashcard buttons)
// Toggles the bookmark: returns true if now bookmarked, false if removed, null on error.
async function bookmarkQuestion(q) {
  if (!currentUser || !q) return null;
  if (!activeQuizId) { toast('Open this quiz from its folder to bookmark questions.', 'error'); return null; }

  const idx = activeQuizQuestions.indexOf(q);
  const questionIndex = idx >= 0 ? idx : 0;

  // Check if already bookmarked
  const { data: existing } = await sb.from('bookmarks')
    .select('id')
    .eq('user_id', currentUser.id)
    .eq('quiz_id', activeQuizId)
    .eq('question_index', questionIndex)
    .maybeSingle();

  if (existing) {
    const { error } = await sb.from('bookmarks').delete().eq('id', existing.id);
    if (error) { toast('Could not remove bookmark.', 'error'); return null; }
    toast('Bookmark removed.', 'info');
    return false;
  }

  const { error } = await sb.from('bookmarks').upsert({
    user_id: currentUser.id,
    quiz_id: activeQuizId,
    quiz_title: activeQuizTitle || '',
    question_index: questionIndex,
    question_text: q.question || '',
    options: Array.isArray(q.options) ? q.options : [],
    correct_index: typeof q.correctIndex === 'number' ? q.correctIndex : null,
    explanation: q.explanation || ''
  }, { onConflict: 'user_id,quiz_id,question_index' });

  if (!error) { toast('Question bookmarked!', 'success'); return true; }
  toast('Could not bookmark question.', 'error');
  return null;
}

// Returns a Set of "quizId:questionIndex" keys for the current user's bookmarks.
let bookmarksIndexCache = new Set();
async function refreshBookmarksIndex() {
  bookmarksIndexCache = new Set();
  if (!currentUser) return bookmarksIndexCache;
  const { data, error } = await sb.from('bookmarks')
    .select('quiz_id, question_index')
    .eq('user_id', currentUser.id);
  if (!error && data) {
    data.forEach(b => bookmarksIndexCache.add(`${b.quiz_id}:${b.question_index}`));
  }
  return bookmarksIndexCache;
}

async function bookmarkCurrentQuestion() {
  if (!currentUser || !activeQuizId) return;
  const q = activeQuizQuestions[currentQ];
  if (!q) return;

  const { error } = await sb.from('bookmarks').upsert({
    user_id: currentUser.id,
    quiz_id: activeQuizId,
    quiz_title: activeQuizTitle || '',
    question_index: currentQ,
    question_text: q.question || '',
    options: Array.isArray(q.options) ? q.options : [],
    correct_index: typeof q.correctIndex === 'number' ? q.correctIndex : null,
    explanation: q.explanation || ''
  }, { onConflict: 'user_id,quiz_id,question_index' });

  if (!error) toast('Question bookmarked!', 'success');
}

let bookmarksCache = [];
let bookmarksFilter = 'all'; // 'all' or a quiz_id

async function loadBookmarks() {
  if (!currentUser) return;
  const { data, error } = await sb.from('bookmarks')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) return;
  bookmarksCache = data || [];
  renderBookmarkFilters();
  renderBookmarks();
}

// Builds the "All" + per-quiz filter chips above the bookmark grid.
function renderBookmarkFilters() {
  const bar = document.getElementById('bookmark-filter-bar');
  if (!bar) return;

  // Unique quizzes among the bookmarks, in first-seen order
  const seen = new Map();
  bookmarksCache.forEach(b => {
    if (!seen.has(b.quiz_id)) seen.set(b.quiz_id, b.quiz_title || 'Untitled Quiz');
  });

  // Reset filter if it points to a quiz no longer present
  if (bookmarksFilter !== 'all' && !seen.has(bookmarksFilter)) bookmarksFilter = 'all';

  let html = `<button class="btn btn--small bookmark-filter-chip ${bookmarksFilter === 'all' ? 'active' : ''}" data-bookmark-filter="all">All (${bookmarksCache.length})</button>`;
  seen.forEach((title, quizId) => {
    const count = bookmarksCache.filter(b => b.quiz_id === quizId).length;
    html += `<button class="btn btn--small bookmark-filter-chip ${bookmarksFilter === quizId ? 'active' : ''}" data-bookmark-filter="${quizId}">${escHtml(title)} (${count})</button>`;
  });
  bar.innerHTML = html;

  bar.querySelectorAll('[data-bookmark-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      bookmarksFilter = btn.dataset.bookmarkFilter;
      renderBookmarkFilters();
      renderBookmarks();
    });
  });
}

function renderBookmarks() {
  const grid = document.getElementById('bookmark-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const bookmarks = bookmarksFilter === 'all'
    ? bookmarksCache
    : bookmarksCache.filter(b => b.quiz_id === bookmarksFilter);

  const empty = document.getElementById('bookmarks-empty');
  if (bookmarks.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  bookmarks.forEach((b, i) => {
    const card = document.createElement('div');
    card.className = 'flash-card flash-card--bookmarked';
    card.dataset.bookmarkId = b.id;

    const options = Array.isArray(b.options) ? b.options : [];
    const hasAnswer = typeof b.correct_index === 'number' && options[b.correct_index] !== undefined;
    const optionsList = options.map((opt, idx) => {
      const marker = String.fromCharCode(65 + idx);
      const isCorrect = idx === b.correct_index;
      return `<li class="${isCorrect ? 'correct-opt' : ''}">`
        + `<span class="option-marker">${marker}</span>${escHtml(opt)}</li>`;
    }).join('');

    card.innerHTML = `
      <div class="flash-card-inner">
        <div class="flash-card-face flash-card-front">
          <div class="flash-card-head">
            <span class="flash-num">${i + 1}</span>
            <div class="flash-actions">
              <button class="icon-btn btn-remove-bookmark" title="Remove bookmark">🗑️</button>
            </div>
          </div>
          <p class="flash-question">${escHtml(b.question_text)}</p>
          ${optionsList ? `<ul class="flash-card-options">${optionsList}</ul>` : ''}
          <p class="flash-hint">Click to ${hasAnswer ? 'reveal answer' : 'flip'}</p>
        </div>
        <div class="flash-card-face flash-card-back">
          <div class="flash-card-head">
            <span class="flash-num">${i + 1}</span>
          </div>
          ${hasAnswer
            ? `<p class="flash-answer-line">✓ ${escHtml(options[b.correct_index])}</p>`
            : `<p class="flash-answer-line">Bookmarked question</p>`}
          ${b.explanation ? `<p class="flash-explanation-line">${escHtml(b.explanation)}</p>` : ''}
          ${!hasAnswer ? `<p class="flash-explanation-line" style="opacity:0.6">Answer not stored — open the original quiz to review.</p>` : ''}
          <p class="flash-card-source">${escHtml(b.quiz_title || '')}</p>
        </div>
      </div>
    `;
    card.addEventListener('click', e => {
      if (e.target.closest('.icon-btn')) return;
      card.classList.toggle('flipped');
    });
    card.querySelector('.btn-remove-bookmark').addEventListener('click', async e => {
      e.stopPropagation();
      await sb.from('bookmarks').delete().eq('id', b.id);
      bookmarksCache = bookmarksCache.filter(x => x.id !== b.id);
      bookmarksIndexCache.delete(`${b.quiz_id}:${b.question_index}`);
      renderBookmarkFilters();
      renderBookmarks();
      toast('Bookmark removed.', 'info');
    });
    grid.appendChild(card);
  });
}

// ── NOTES ────────────────────────────────────────────────────
async function saveNote(body, tags) {
  if (!currentUser) return;
  const { data, error } = await sb.from('notes').insert({
    user_id: currentUser.id,
    body,
    tags
  }).select().single();
  if (error) { toast('Could not save note: ' + error.message, 'error'); return null; }
  return data;
}

async function loadNotes() {
  if (!currentUser) return;
  const { data, error } = await sb.from('notes')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) return;
  renderSavedNotes(data || []);
}

function renderSavedNotes(notes) {
  const list = document.getElementById('notes-list');
  if (!list) return;
  list.querySelectorAll('.note-card[data-note-id]').forEach(c => c.remove());
  const empty = document.getElementById('notes-empty');
  if (notes.length === 0) { if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';

  notes.forEach(note => {
    const card = document.createElement('article');
    card.className = 'note-card';
    card.dataset.noteId = note.id;
    const tagsHtml = (note.tags || []).map(t =>
      `<span class="note-tag-chip note-tag-chip--${t.type}">${t.type === 'folder' ? '📁' : '📝'} ${escHtml(t.label)}</span>`
    ).join('');
    card.innerHTML = `
      <div class="note-card-head">
        <div class="note-card-meta">
          <span class="note-card-date">${new Date(note.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        <div class="note-card-actions">
          <button class="icon-btn btn-delete-note" title="Delete note">🗑️</button>
        </div>
      </div>
      <p class="note-card-body">${escHtml(note.body)}</p>
      ${tagsHtml ? `<div class="note-card-tags">${tagsHtml}</div>` : ''}
    `;
    card.querySelector('.btn-delete-note').addEventListener('click', async () => {
      await sb.from('notes').delete().eq('id', note.id);
      card.remove();
      toast('Note deleted.', 'info');
    });
    list.appendChild(card);
  });
}

// ── FRIENDS ───────────────────────────────────────────────────
let friendsCache      = [];  // accepted friends (profiles)
let friendshipsCache  = [];  // all friendship rows involving current user (any status)

async function loadFriends() {
  if (!currentUser) return;

  // Get accepted friendships where user is either side
  const { data: sent     } = await sb.from('friendships').select('*, profiles!friendships_addressee_id_fkey(*)').eq('requester_id', currentUser.id).eq('status', 'accepted');
  const { data: received } = await sb.from('friendships').select('*, profiles!friendships_requester_id_fkey(*)').eq('addressee_id', currentUser.id).eq('status', 'accepted');
  const { data: pending  } = await sb.from('friendships').select('*, profiles!friendships_requester_id_fkey(*)').eq('addressee_id', currentUser.id).eq('status', 'pending');
  const { data: outgoing } = await sb.from('friendships').select('id, addressee_id, status').eq('requester_id', currentUser.id);
  const { data: incoming } = await sb.from('friendships').select('id, requester_id, status').eq('addressee_id', currentUser.id);

  const friends = [
    ...(sent || []).map(r => r.profiles),
    ...(received || []).map(r => r.profiles)
  ].filter(Boolean);

  friendsCache = friends;

  // Build a flat list of { userId, status } for quick lookups in search/add-friend buttons
  friendshipsCache = [
    ...(outgoing || []).map(r => ({ userId: r.addressee_id, status: r.status })),
    ...(incoming || []).map(r => ({ userId: r.requester_id, status: r.status }))
  ];

  renderFriends(friends, pending || []);
  updateFriendBadge(pending?.length || 0);
}

// Returns 'friend' | 'pending' | 'none' for a given user id
function getFriendStatus(userId) {
  const friend = friendsCache.find(f => f.id === userId);
  if (friend) return 'friend';
  const rel = friendshipsCache.find(r => r.userId === userId && r.status === 'pending');
  if (rel) return 'pending';
  return 'none';
}

function renderFriends(friends, pendingRequests) {
  const list = document.getElementById('friends-list');
  if (!list) return;
  list.querySelectorAll('.friend-card[data-friend-id], .friend-list-empty').forEach(c => c.remove());

  const friendsCount = document.getElementById('friends-count');
  if (friendsCount) friendsCount.textContent = friends.length;

  if (friends.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'friend-list-empty';
    empty.innerHTML = `
      <span class="friend-list-empty-icon">🤝</span>
      <h4>No friends yet</h4>
      <p>Search for classmates by name or roll number above to send a friend
        request and start sharing quizzes.</p>
    `;
    list.appendChild(empty);
  }

  friends.forEach(friend => {
    const initials = (friend.display_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const card = document.createElement('div');
    card.className = 'friend-card';
    card.dataset.friendId = friend.id;
    card.innerHTML = `
      <div class="friend-avatar">${escHtml(initials)}</div>
      <div class="friend-info">
        <strong>${escHtml(friend.display_name)}</strong>
        <span class="friend-rollno">${escHtml(friend.roll_no || '')}</span>
      </div>
      <div class="friend-actions">
        <button class="btn btn--ghost btn--small btn-challenge-friend" data-friend-id="${friend.id}" data-friend-name="${escHtml(friend.display_name)}">⚔️ Challenge</button>
        <button class="btn btn--ghost btn--small btn-remove-friend" data-friend-id="${friend.id}">Remove</button>
      </div>
      <span class="friend-card-chevron">›</span>
    `;
    card.addEventListener('click', e => {
      if (e.target.closest('.friend-actions')) return;
      openFriendProfile(friend);
    });
    card.querySelector('.btn-remove-friend').addEventListener('click', async () => {
      if (!confirm('Remove this friend?')) return;
      await sb.from('friendships').delete()
        .or(`and(requester_id.eq.${currentUser.id},addressee_id.eq.${friend.id}),and(requester_id.eq.${friend.id},addressee_id.eq.${currentUser.id})`);
      friendsCache = friendsCache.filter(f => f.id !== friend.id);
      card.remove();
      toast('Friend removed.', 'info');
    });
    card.querySelector('.btn-challenge-friend').addEventListener('click', async () => {
      const quizzes = await loadAllQuizzesForUser();
      if (!quizzes.length) {
        toast('Create a quiz first to send a challenge.', 'info');
        return;
      }

      const picker = document.getElementById('share-quiz-picker');
      const pickerBlock = document.getElementById('share-quiz-picker-block');
      picker.innerHTML = quizzes.map(q =>
        `<option value="${q.id}">${escHtml(q.title)}</option>`).join('');
      pickerBlock.style.display = '';

      const applyQuiz = (q) => {
        currentShareQuizId = q.id;
        const qCount = Array.isArray(q.questions) ? q.questions.length : 0;
        initShareSelection(qCount);
        setupShareModal(q);
      };

      picker.onchange = () => {
        const q = quizzes.find(qq => qq.id === picker.value);
        if (q) applyQuiz(q);
      };

      applyQuiz(quizzes[0]);
      picker.value = quizzes[0].id;

      openModal('modal-share');

      // Switch to "To Friends" tab
      const friendTabBtn = document.querySelector('.share-tabs .tab-btn[data-share-tab="friend"]');
      friendTabBtn?.click();

      // Pre-check this friend and enable "Send as Challenge"
      setTimeout(() => {
        const cb = document.querySelector(
          `#share-friend-pick-list input[data-friend-id="${friend.id}"]`);
        if (cb) cb.checked = true;
        const challengeCb = document.getElementById('share-as-challenge-friend');
        if (challengeCb) challengeCb.checked = true;
      }, 0);
    });
    list.appendChild(card);
  });

  // Pending requests section
  const pendingSection = document.getElementById('friend-requests-section');
  const pendingList    = document.getElementById('friend-requests-list');
  if (!pendingSection || !pendingList) return;

  const reqCount = document.getElementById('friend-req-count');
  if (reqCount) reqCount.textContent = pendingRequests.length;

  pendingList.innerHTML = '';
  if (pendingRequests.length === 0) {
    pendingSection.style.display = 'none';
  } else {
    pendingSection.style.display = 'block';
    pendingRequests.forEach(req => {
      const p = req.profiles;
      if (!p) return;
      const initials = (p.display_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const row = document.createElement('div');
      row.className = 'friend-request-row';
      row.innerHTML = `
        <div class="friend-info"><strong>${escHtml(p.display_name)}</strong><span>${escHtml(p.roll_no || '')}</span></div>
        <div class="friend-actions">
          <button class="btn btn--primary btn--small btn-accept-request" data-req-id="${req.id}">Accept</button>
          <button class="btn btn--ghost btn--small btn-decline-request" data-req-id="${req.id}">Decline</button>
        </div>
      `;
      row.querySelector('.btn-accept-request').addEventListener('click', async () => {
        const { error } = await sb.from('friendships').update({ status: 'accepted' }).eq('id', req.id);
        if (error) { toast('Could not accept request: ' + error.message, 'error'); return; }
        toast(`You and ${p.display_name} are now friends!`, 'success');
        loadFriends();
      });
      row.querySelector('.btn-decline-request').addEventListener('click', async () => {
        const { error } = await sb.from('friendships').update({ status: 'declined' }).eq('id', req.id);
        if (error) { toast('Could not decline request: ' + error.message, 'error'); return; }
        row.remove();
        loadFriends();
      });
      pendingList.appendChild(row);
    });
  }
}

function updateFriendBadge(count) {
  const badge = document.getElementById('friend-req-badge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
  const mobileBadge = document.getElementById('friend-req-badge-mobile');
  if (mobileBadge) {
    mobileBadge.textContent = count;
    mobileBadge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

async function searchUsers(query) {
  if (!query || query.length < 2) return [];
  const { data } = await sb.from('profiles')
    .select('id, display_name, roll_no')
    .or(`display_name.ilike.%${query}%,roll_no.ilike.%${query}%`)
    .neq('id', currentUser?.id)
    .limit(8);
  return data || [];
}

async function sendFriendRequest(toUserId) {
  const { error } = await sb.from('friendships').insert({
    requester_id: currentUser.id,
    addressee_id: toUserId
  });
  if (error) {
    if (error.message.includes('duplicate')) toast('Request already sent.', 'info');
    else toast('Could not send request: ' + error.message, 'error');
    return;
  }
  toast('Friend request sent!', 'success');
}

// Returns the label for a user's add-friend button based on current relationship status
function friendButtonLabel(userId) {
  const status = getFriendStatus(userId);
  if (status === 'friend')  return 'Already friends';
  if (status === 'pending') return 'Request sent';
  return 'Add Friend';
}

// Wires a button element to send a friend request, disabling it and updating
// its label appropriately. Call this after inserting the button into the DOM.
function wireAddFriendButton(btn, userId) {
  if (!btn) return;
  const status = getFriendStatus(userId);
  if (status !== 'none') {
    btn.textContent = status === 'friend' ? 'Already friends' : 'Request sent';
    btn.disabled = true;
    btn.classList.add('btn--disabled');
    return;
  }
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Sent ✓';
    btn.classList.add('btn--disabled');
    await sendFriendRequest(userId);
    friendshipsCache.push({ userId, status: 'pending' });
  });
}

async function sendChallenge(toUserId, toName, quizId, quizTitle, sessionId, timeLimitSeconds) {
  quizId = quizId || activeQuizId;
  quizTitle = quizTitle || activeQuizTitle;
  if (!quizId) { toast('Open a quiz first to send a challenge.', 'info'); return; }

  // Recipient needs to be able to read this quiz row; make it public.
  await sb.from('quizzes').update({ is_public: true }).eq('id', quizId);
  const cachedQuiz = quizzesCache.find(q => q.id === quizId);
  if (cachedQuiz) cachedQuiz.is_public = true;

  // Use the user's best attempt on this quiz as the challenge score
  let score = null;
  const { data: attempts } = await sb.from('quiz_attempts')
    .select('score, total')
    .eq('user_id', currentUser.id)
    .eq('quiz_id', quizId)
    .order('score', { ascending: false })
    .limit(1);
  if (attempts && attempts.length > 0) {
    score = attempts[0].score;
  } else if (quizId === activeQuizId) {
    // Fallback: no saved attempt yet, use current in-progress state
    score = quizState.filter(q => q.answered && activeQuizQuestions[quizState.indexOf(q)]
      && q.optionIndex === activeQuizQuestions[quizState.indexOf(q)].correctIndex).length;
  } else {
    score = 0;
  }

  await sb.from('inbox_messages').insert({
    to_user_id: toUserId,
    from_user_id: currentUser.id,
    type: 'challenge',
    title: `${currentProfile?.display_name || 'Someone'} challenged you on "${quizTitle}"`,
    body: { quiz_id: quizId, score, session_id: sessionId || null, time_limit_seconds: timeLimitSeconds || 0 }
  });
  toast(`Challenge sent to ${toName}!`, 'success');
}

// ── INBOX ─────────────────────────────────────────────────────
let inboxCache = [];

async function loadInbox() {
  if (!currentUser) return;

  // ── 24hr auto-expire: delete unread messages older than 24hr ──
  const expire24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  sb.from('inbox_messages')
    .delete()
    .eq('to_user_id', currentUser.id)
    .eq('is_read', false)
    .lt('created_at', expire24h)
    .then(({ error }) => { if (error) console.warn('Auto-expire error:', error.message); });

  const { data, error } = await sb.from('inbox_messages')
    .select('*, from_profile:profiles!inbox_messages_from_user_id_fkey(display_name, roll_no)')
    .eq('to_user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return;
  inboxCache = data || [];
  renderInbox(inboxCache);
  updateInboxBadge(inboxCache.filter(m => !m.is_read).length);

  // Load "Shared by Me" section
  loadSharedByMe();
}

function renderInbox(messages) {
  const list = document.getElementById('inbox-list');
  if (!list) return;
  list.querySelectorAll('.inbox-item[data-msg-id]').forEach(i => i.remove());
  const empty = document.getElementById('inbox-empty');

  if (messages.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  messages.forEach(msg => {
    const senderName = msg.from_profile?.display_name || 'Someone';
    const isChallenge = msg.type === 'challenge';
    const item = document.createElement('div');
    item.className = `inbox-item inbox-item--${msg.type} ${msg.is_read ? '' : 'inbox-item--unread'}`;
    item.dataset.msgId = msg.id;
    item.innerHTML = `
      <div class="inbox-item-top">
        <span class="inbox-sender"><strong>${escHtml(senderName)}</strong></span>
        <span class="inbox-time">${timeAgo(msg.created_at)}</span>
      </div>
      <p class="inbox-title">${escHtml(msg.title)}</p>
      ${isChallenge && msg.body?.score != null ? `<span class="score-highlight">${msg.body.score} pts</span>` : ''}
      <div class="inbox-actions">
        ${msg.body?.quiz_id ? `<button class="btn btn--primary btn--small btn-accept-quiz-inbox">▶ ${isChallenge ? 'Accept Challenge' : 'Start Quiz'}</button>` : ''}
${msg.body?.quiz_id && !isChallenge ? `<button class="btn btn--ghost btn--small btn-save-quiz-inbox">📥 Save to Library</button>` : ''}
        ${msg.type === 'chapter' && msg.body?.folder_id ? `<button class="btn btn--primary btn--small btn-accept-chapter-inbox">📥 Add to Library</button>` : ''}
        <button class="btn btn--ghost btn--small btn-inbox-dismiss">Dismiss</button>
      </div>
    `;

    // Mark read on click
    item.addEventListener('click', async () => {
      if (!msg.is_read) {
        msg.is_read = true;
        item.classList.remove('inbox-item--unread');
        await sb.from('inbox_messages').update({ is_read: true }).eq('id', msg.id);
        updateInboxBadge(inboxCache.filter(m => !m.is_read).length);
      }
    });

    item.querySelector('.btn-inbox-dismiss')?.addEventListener('click', async e => {
      e.stopPropagation();
      await sb.from('inbox_messages').delete().eq('id', msg.id);
      item.style.opacity = '0';
      item.style.transition = 'opacity .25s';
      setTimeout(() => item.remove(), 250);
      inboxCache = inboxCache.filter(m => m.id !== msg.id);
      updateInboxBadge(inboxCache.filter(m => !m.is_read).length);
    });

    item.querySelector('.btn-accept-quiz-inbox')?.addEventListener('click', async e => {
      e.stopPropagation();
      // Load the shared quiz
      if (msg.body?.quiz_id) {
        const { data: quiz } = await sb.from('quizzes').select('*').eq('id', msg.body.quiz_id).single();
        if (quiz) {
          activeQuizId        = quiz.id;
          activeQuizTitle     = quiz.title;
          activeQuizQuestions = quiz.questions || [];
          activeQuizSessionId = msg.body.session_id || null;
          document.getElementById('setup-quiz-title').textContent  = quiz.title;
          document.getElementById('setup-quiz-total').textContent = activeQuizQuestions.length;
          applySessionTimer(msg.body.time_limit_seconds || 0);
          const rFrom = document.getElementById('range-from');
          const rTo   = document.getElementById('range-to');
          if (rFrom && rTo) {
            rFrom.value = 1;
            rTo.value = activeQuizQuestions.length;
            rFrom.dispatchEvent(new Event('change'));
          }
          openQuizSetup(isChallenge ? { from: senderName, score: msg.body.score } : null, true);
        } else {
          toast('Quiz not found or was deleted.', 'error');
        }
      }
    });

    item.querySelector('.btn-save-quiz-inbox')?.addEventListener('click', async e => {
      e.stopPropagation();
      if (msg.body?.quiz_id) {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Saving…';
        await importSharedQuiz(msg.body.quiz_id, msg.title, senderName);
        btn.textContent = '✓ Saved';
      }
    });

    item.querySelector('.btn-accept-chapter-inbox')?.addEventListener('click', async e => {
      e.stopPropagation();
      if (msg.body?.folder_id) {
        const { data: folder } = await sb.from('folders').select('name').eq('id', msg.body.folder_id).single();
        await importSharedChapter(msg.body.folder_id, folder?.name);
      }
    });

    list.appendChild(item);
  });
}

// ── SHARED BY ME ─────────────────────────────
async function loadSharedByMe() {
  if (!currentUser) return;
  const list = document.getElementById('shared-by-me-list');
  if (!list) return;
  list.innerHTML = '<p class="hint" style="padding:0.5rem 0">Loading…</p>';

  const { data, error } = await sb.from('inbox_messages')
    .select('id, to_user_id, title, type, is_read, created_at, body, to_profile:profiles!inbox_messages_to_user_id_fkey(display_name)')
    .eq('from_user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data?.length) {
    list.innerHTML = '<p class="hint" style="padding:0.5rem 0;color:var(--slate)">Nothing shared yet.</p>';
    return;
  }

  const now = Date.now();
  const items = data.map(m => {
    const sentAt = new Date(m.created_at).getTime();
    const msLeft = (sentAt + 24 * 3600 * 1000) - now;
    const expired = msLeft <= 0;
    const hoursLeft = expired ? 0 : Math.ceil(msLeft / 3600000);
    return { ...m, expired, hoursLeft };
  });

  list.innerHTML = '';
  items.forEach(m => {
    const recipientName = m.to_profile?.display_name || 'Friend';
    const typeIcon = m.type === 'challenge' ? '⚔️' : m.type === 'chapter' ? '📁' : '📝';
    const statusBadge = m.is_read
      ? '<span class="shared-status shared-status--accepted">✓ Accepted</span>'
      : m.expired
        ? '<span class="shared-status shared-status--expired">Expired</span>'
        : `<span class="shared-status shared-status--pending">⏱ ${m.hoursLeft}h left</span>`;

    const row = document.createElement('div');
    row.className = 'shared-by-me-row' + (m.expired && !m.is_read ? ' shared-by-me-row--expired' : '');
    row.dataset.msgId = m.id;
    row.innerHTML = `
      <div class="shared-by-me-icon">${typeIcon}</div>
      <div class="shared-by-me-info">
        <div class="shared-by-me-title">${escHtml(m.title)}</div>
        <div class="shared-by-me-meta">→ ${escHtml(recipientName)} · ${timeAgo(m.created_at)}</div>
      </div>
      <div class="shared-by-me-right">
        ${statusBadge}
        <button class="btn btn--ghost btn--small shared-by-me-remove" title="Remove">🗑</button>
      </div>
    `;
    row.querySelector('.shared-by-me-remove').addEventListener('click', async e => {
      e.stopPropagation();
      await sb.from('inbox_messages').delete().eq('id', m.id);
      row.style.opacity = '0'; row.style.transition = 'opacity .2s';
      setTimeout(() => { row.remove(); if (!list.querySelector('.shared-by-me-row')) list.innerHTML = '<p class="hint" style="padding:0.5rem 0;color:var(--slate)">Nothing shared yet.</p>'; }, 220);
      toast('Removed.', 'info');
    });
    list.appendChild(row);
  });
}

// Wire refresh button
document.getElementById('btn-refresh-shared-by-me')?.addEventListener('click', loadSharedByMe);

function updateInboxBadge(count) {
  const badge = document.getElementById('inbox-badge');
  const mobileBadge = document.querySelector('.mobile-nav .nav-link[data-view="inbox"] .mobile-nav-badge');
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline-flex' : 'none'; }
  if (mobileBadge) { mobileBadge.textContent = count; mobileBadge.style.display = count > 0 ? 'inline-flex' : 'none'; }
}

async function importSharedChapter(folderId, folderName) {
  // Fetch the shared folder's quizzes
  const { data: srcQuizzes, error } = await sb.from('quizzes')
    .select('title, questions')
    .eq('folder_id', folderId);
  if (error) { toast('Could not load chapter: ' + error.message, 'error'); console.error(error); return; }
  console.log('importSharedChapter: found', srcQuizzes?.length, 'quizzes for folder', folderId);
  if (!srcQuizzes || srcQuizzes.length === 0) {
    toast('That chapter has no quizzes (or is not shared publicly yet).', 'error');
  }

  const { data: newFolder, error: fErr } = await sb.from('folders').insert({
    user_id: currentUser.id,
    name: (folderName || 'Shared Chapter') + ' (shared)',
    is_public: false
  }).select().single();
  if (fErr || !newFolder) { toast('Could not import chapter.', 'error'); return; }

  for (const quiz of (srcQuizzes || [])) {
    await sb.from('quizzes').insert({
      user_id: currentUser.id,
      folder_id: newFolder.id,
      title: quiz.title,
      questions: quiz.questions,
      is_public: false
    });
  }

  foldersCache.unshift(newFolder);
  if (typeof renderFolders === 'function') renderFolders();
  toast(`"${newFolder.name}" added to your library!`, 'success');
}

// ── SHARE CHAPTER MODAL (real data) ─────────────────────────────
function setupShareChapterModal() {
  const folder = foldersCache.find(f => f.id === activeFolderId);
  if (!folder) return;

  const nameEl  = document.getElementById('share-chapter-name');
  const countEl = document.getElementById('share-chapter-count');
  if (nameEl) nameEl.textContent = folder.name;
  if (countEl) {
    const qCount = quizzesCache.length;
    const totalQs = quizzesCache.reduce((sum, q) => sum + (Array.isArray(q.questions) ? q.questions.length : 0), 0);
    countEl.textContent = `${qCount} quizzes · ${totalQs} questions`;
  }

  // Link tab
  const linkInput = document.getElementById('share-chapter-link-input');
  if (linkInput) linkInput.value = location.origin + '?chapter=' + folder.id;

  // Friends tab
  const list  = document.getElementById('share-chapter-friend-list');
  const empty = document.getElementById('share-chapter-friend-empty');
  const sendBtn = document.getElementById('btn-send-chapter');
  if (list) {
    list.innerHTML = '';
    if (!friendsCache.length) {
      if (empty) empty.style.display = 'block';
      if (sendBtn) sendBtn.style.display = 'none';
    } else {
      if (empty) empty.style.display = 'none';
      if (sendBtn) sendBtn.style.display = '';
      friendsCache.forEach(friend => {
        const initials = (friend.display_name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
        const label = document.createElement('label');
        label.className = 'friend-pick-item';
        label.innerHTML = `
          <input type="checkbox" data-friend-id="${friend.id}" data-friend-name="${escHtml(friend.display_name)}">
          <div class="friend-avatar friend-avatar--sm">${escHtml(initials)}</div>
          <span>${escHtml(friend.display_name)}</span>
        `;
        list.appendChild(label);
      });
    }
  }
}

document.getElementById('btn-add-subfolder')?.addEventListener('click', async () => {
  const name = prompt('Subfolder name:');
  if (!name || !name.trim()) return;
  const { data, error } = await sb.from('folders').insert({
    user_id: currentUser.id,
    name: name.trim(),
    parent_id: activeFolderId
  }).select().single();
  if (error) { toast('Could not create subfolder: ' + error.message, 'error'); return; }
  foldersCache.unshift(data);
  renderSubfolders(activeFolderId);
  toast('Subfolder created!', 'success');
});

// Override oldstatic: pre-select current subfolder in create view
document.getElementById('btn-add-quiz-here')?.addEventListener('click', e => {
  e.stopImmediatePropagation();
  showView('create');
  updateTargetFolderSelect();
}, true);

document.getElementById('btn-share-chapter')?.addEventListener('click', () => {
  setupShareChapterModal();
  openModal('modal-share-chapter');
});

document.getElementById('btn-copy-chapter-link')?.addEventListener('click', async () => {
  const input = document.getElementById('share-chapter-link-input');
  if (!input) return;

  const folder = foldersCache.find(f => f.id === activeFolderId);
  if (folder && !folder.is_public) {
    await sb.from('folders').update({ is_public: true }).eq('id', folder.id);
    folder.is_public = true;
    toast('Chapter made public so others can open this link', 'info');
  }

  try {
    await navigator.clipboard.writeText(input.value);
  } catch (e) {}

  const btn = document.getElementById('btn-copy-chapter-link');
  btn.textContent = '✓ Copied!';
  setTimeout(() => btn.textContent = 'Copy', 2000);
});

document.getElementById('btn-send-chapter')?.addEventListener('click', async () => {
  const folder = foldersCache.find(f => f.id === activeFolderId);
  if (!folder) return;

  const checked = Array.from(document.querySelectorAll('#share-chapter-friend-list input[type="checkbox"]:checked'));
  if (!checked.length) { toast('Select at least one friend.', 'info'); return; }

  // Recipients need to be able to read this folder + its quizzes.
  const { error: fErr } = await sb.from('folders').update({ is_public: true }).eq('id', folder.id);
  if (fErr) { toast('Could not make folder public: ' + fErr.message, 'error'); console.error(fErr); return; }
  folder.is_public = true;
  const { error: qErr, count } = await sb.from('quizzes')
    .update({ is_public: true }, { count: 'exact' })
    .eq('folder_id', folder.id);
  if (qErr) { toast('Could not make quizzes public: ' + qErr.message, 'error'); console.error(qErr); return; }
  console.log('Marked quizzes public:', count);
  quizzesCache.forEach(q => { if (q.folder_id === folder.id) q.is_public = true; });

  for (const cb of checked) {
    await sb.from('inbox_messages').insert({
      to_user_id: cb.dataset.friendId,
      from_user_id: currentUser?.id,
      type: 'chapter',
      title: `${currentProfile?.display_name || 'Someone'} shared "${folder.name}" with you`,
      body: { folder_id: folder.id }
    });
  }

  toast('Chapter shared!', 'success');
  closeModal('modal-share-chapter');
});


// Share modal: time limit seg-control
document.querySelectorAll('[data-share-timer-mode]').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-share-timer-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.shareTimerMode;
    document.querySelectorAll('[data-share-timer-pane]').forEach(p => p.hidden = true);
    document.querySelectorAll('[data-share-timer-help]').forEach(p => p.hidden = true);
    if (mode === 'none') document.querySelector('[data-share-timer-help="none"]').hidden = false;
    else document.querySelector('[data-share-timer-pane="' + mode + '"]').hidden = false;
  }));

function getShareSelectedQuestions(quiz) {
  const all = Array.isArray(quiz.questions) ? quiz.questions : [];
  const mode = document.querySelector('#share-select-mode [data-share-select-mode].active')?.dataset.shareSelectMode || 'all';
  if (mode === 'range') {
    const from = parseInt(document.getElementById('share-range-from').value, 10) || 1;
    const to   = parseInt(document.getElementById('share-range-to').value, 10) || all.length;
    return all.slice(from - 1, to);
  }
  if (mode === 'random') {
    const count = Math.min(parseInt(document.getElementById('share-random-count').value, 10) || all.length, all.length);
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
  return all;
}

let allQuizzesCache = null;
async function loadAllQuizzesForUser() {
  if (allQuizzesCache) return allQuizzesCache;
  const { data, error } = await sb.from('quizzes')
    .select('id, title, questions, folder_id')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) { console.warn('loadAllQuizzesForUser error:', error.message); return []; }
  allQuizzesCache = data || [];
  return allQuizzesCache;
}

async function setupShareModal(quiz) {
  // Via Link tab
  const linkInput = document.getElementById('share-link-input');
  if (linkInput) linkInput.value = location.origin + '?quiz=' + currentShareQuizId;

  // To Friends tab
  const list  = document.getElementById('share-friend-pick-list');
  const empty = document.getElementById('share-friend-empty');
  const sendBtn = document.getElementById('btn-send-shared-quiz');
  if (list) {
    list.innerHTML = '';
    if (!friendsCache.length) {
      if (empty) empty.style.display = 'block';
      if (sendBtn) sendBtn.style.display = 'none';
    } else {
      if (empty) empty.style.display = 'none';
      if (sendBtn) sendBtn.style.display = '';
      friendsCache.forEach(friend => {
        const initials = (friend.display_name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
        const label = document.createElement('label');
        label.className = 'friend-pick-item';
        label.innerHTML = `
          <input type="checkbox" data-friend-id="${friend.id}" data-friend-name="${escHtml(friend.display_name)}">
          <div class="friend-avatar friend-avatar--sm">${escHtml(initials)}</div>
          <span>${escHtml(friend.display_name)}</span>
        `;
        list.appendChild(label);
      });
    }
  }
}

document.getElementById('btn-copy-link')?.addEventListener('click', async () => {
  const input = document.getElementById('share-link-input');
  if (!input) return;

  const quiz = quizzesCache.find(q => q.id === currentShareQuizId);
  if (quiz && !quiz.is_public) {
    await sb.from('quizzes').update({ is_public: true }).eq('id', quiz.id);
    quiz.is_public = true;
    toast('Quiz made public so others can open this link', 'info');
  }

  try {
    await navigator.clipboard.writeText(input.value);
  } catch (e) {}

  const btn = document.getElementById('btn-copy-link');
  const original = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = original, 2000);
});

document.getElementById('btn-send-shared-quiz')?.addEventListener('click', async () => {
  const quiz = quizzesCache.find(q => q.id === currentShareQuizId);
  if (!quiz) return;

  const checked = Array.from(document.querySelectorAll('#share-friend-pick-list input[type="checkbox"]:checked'));
  if (!checked.length) { toast('Select at least one friend.', 'info'); return; }

  const asChallenge = document.getElementById('share-as-challenge-friend')?.checked;
  const selectedQuestions = getShareSelectedQuestions(quiz);
  const sameAsFull = selectedQuestions.length === (quiz.questions || []).length;
  console.log('Share selection:', { mode: document.querySelector('#share-select-mode [data-share-select-mode].active')?.dataset.shareSelectMode, selectedCount: selectedQuestions.length, fullCount: (quiz.questions||[]).length, sameAsFull });

  let quizIdToSend = quiz.id;
  let quizTitleToSend = quiz.title;

  // If a subset was chosen, create a new quiz with that subset and share that instead
  if (!sameAsFull) {
    const { data: newQuiz, error } = await sb.from('quizzes').insert({
      user_id: currentUser.id,
      title: quiz.title + ' (shared subset)',
      questions: selectedQuestions,
      is_public: false
    }).select().single();
    if (error) {
      toast('Could not create subset quiz: ' + error.message, 'error');
      console.error('Subset quiz insert error:', error);
    }
    if (!error && newQuiz) {
      quizIdToSend = newQuiz.id;
      quizTitleToSend = newQuiz.title;
      quizzesCache.unshift(newQuiz);
    }
  }

  // Time limit chosen for everyone in this session
  const shareTimerMode = document.querySelector('#share-timer-mode [data-share-timer-mode].active')?.dataset.shareTimerMode || 'none';
  const timeLimitSeconds = shareTimerMode === 'total'
    ? (parseInt(document.getElementById('share-timer-minutes').value, 10) || 0) * 60
      + (parseInt(document.getElementById('share-timer-seconds').value, 10) || 0)
    : 0;

  // Create a shared quiz session so everyone gets the exact same questions + time,
  // and can later see each other on a shared leaderboard.
  const memberIds = checked.map(cb => cb.dataset.friendId);
  let sessionId = null;
  {
    const { data: session, error: sessErr } = await sb.from('quiz_sessions').insert({
      host_id: currentUser.id,
      host_name: currentProfile?.display_name || 'Someone',
      quiz_id: quizIdToSend,
      title: quizTitleToSend,
      questions: selectedQuestions.length ? selectedQuestions : (quiz.questions || []),
      time_limit_seconds: timeLimitSeconds,
      member_ids: [currentUser.id, ...memberIds]
    }).select().single();
    if (sessErr) {
      console.warn('quiz_sessions insert error:', sessErr.message);
    } else if (session) {
      sessionId = session.id;
    }
  }

  for (const cb of checked) {
    const toUserId = cb.dataset.friendId;
    const toName   = cb.dataset.friendName;
    if (asChallenge) {
      await sendChallenge(toUserId, toName, quizIdToSend, quizTitleToSend, sessionId, timeLimitSeconds);
    } else {
      await sendSharedQuiz(toUserId, toName, quizIdToSend, quizTitleToSend, sessionId, timeLimitSeconds);
    }
  }

  toast('Quiz shared!', 'success');
  closeModal('modal-share');

  // Switch the host to the exact same session (questions + time limit) so
  // they can start whenever they're ready, with identical settings, and
  // appear on the same shared leaderboard.
  activeQuizSessionId = sessionId;
  if (!sameAsFull) {
    activeQuizId        = quizIdToSend;
    activeQuizTitle     = quizTitleToSend;
    activeQuizQuestions = selectedQuestions;
    activeFullQuizQuestions = [];
    document.getElementById('setup-quiz-title').textContent = quizTitleToSend;
    document.getElementById('setup-quiz-total').textContent = activeQuizQuestions.length;
  }
  applySessionTimer(timeLimitSeconds);
  const rFrom = document.getElementById('range-from');
  const rTo   = document.getElementById('range-to');
  if (rFrom && rTo) {
    rFrom.value = 1;
    rTo.value = activeQuizQuestions.length;
    rFrom.dispatchEvent(new Event('change'));
  }
  openQuizSetup(null, true);
});

// Apply a session's time limit to the Quiz Setup timer controls
function applySessionTimer(timeLimitSeconds) {
  const mode = timeLimitSeconds > 0 ? 'total' : 'none';
  const btn = document.querySelector('[data-timer-mode="' + mode + '"]');
  if (btn) btn.click();
  if (timeLimitSeconds > 0) {
    const mins = Math.floor(timeLimitSeconds / 60);
    const secs = timeLimitSeconds % 60;
    const tm = document.getElementById('timer-minutes');
    const ts = document.getElementById('timer-seconds');
    if (tm) tm.value = mins;
    if (ts) ts.value = secs;
  }
}


async function sendSharedQuiz(toUserId, toUserName, quizId, quizTitle, sessionId, timeLimitSeconds) {
  await sb.from('inbox_messages').insert({
    to_user_id: toUserId,
    from_user_id: currentUser?.id,
    type: 'quiz',
    title: `${currentProfile?.display_name || 'Someone'} shared "${quizTitle}" with you`,
    body: { quiz_id: quizId, session_id: sessionId || null, time_limit_seconds: timeLimitSeconds || 0 }
  });
  toast(`Quiz sent to ${toUserName}!`, 'success');
}

// ── PINS ─────────────────────────────────────────────────────
async function loadPins() {
  if (!currentUser) return;
  const { data } = await sb.from('pins').select('*').eq('user_id', currentUser.id);
  if (!data) return;
  data.forEach(p => {
    pinnedItems.set(`${p.item_type}-${p.item_id}`, {
      type: p.item_type, id: p.item_id,
      name: p.item_name, meta: p.item_meta
    });
  });
  syncPinnedStrip();
}

async function savePinToDb(type, id, name, meta) {
  if (!currentUser) return;
  await sb.from('pins').upsert({
    user_id: currentUser.id,
    item_type: type, item_id: id,
    item_name: name, item_meta: meta
  }, { onConflict: 'user_id,item_type,item_id' });
}

async function removePinFromDb(type, id) {
  if (!currentUser) return;
  await sb.from('pins').delete()
    .eq('user_id', currentUser.id)
    .eq('item_type', type)
    .eq('item_id', id);
}

// ── FLASHCARDS (from real questions) ─────────────────────────
let flashFilter = 'all'; // 'all' or 'bookmarked'

async function renderFlashcards(questions, setName) {
  const grid = document.getElementById('flash-grid');
  if (!grid) return;
  grid.innerHTML = '';

  flashFilter = 'all';
  document.querySelectorAll('#flash-filter-bar [data-flash-filter]').forEach(b =>
    b.classList.toggle('active', b.dataset.flashFilter === 'all'));

  const nameEl = document.getElementById('flash-set-name');
  if (nameEl) nameEl.textContent = setName || '';

  if (!questions.length) {
    grid.innerHTML = '<p class="hint" style="padding:1rem">No questions found in this quiz.</p>';
    const countEl = document.getElementById('flash-total-count');
    if (countEl) countEl.textContent = 0;
    return;
  }

  await refreshBookmarksIndex();

  questions.forEach((q, i) => {
    const correctOpt = q.options?.[q.correctIndex] || 'N/A';
    const isBookmarked = activeQuizId ? bookmarksIndexCache.has(`${activeQuizId}:${i}`) : false;
    const card = document.createElement('div');
    card.className = 'flash-card';
    card.dataset.flashIdx = i;
    card.dataset.bookmarked = isBookmarked ? '1' : '0';
    if (isBookmarked) card.classList.add('flash-card--bookmarked');

    // Build options list for front face
    const optionsList = Array.isArray(q.options) ? q.options.map((opt, idx) => {
      const marker = String.fromCharCode(65 + idx); // A, B, C, D
      const isCorrect = idx === q.correctIndex;
      return `<li class="${isCorrect ? 'correct-opt' : ''}">`
        + `<span class="option-marker">${marker}</span>${escHtml(opt)}</li>`;
    }).join('') : '';

    card.innerHTML = `
      <div class="flash-card-inner">
        <div class="flash-card-face flash-card-front">
          <div class="flash-card-head">
            <span class="flash-num">${i + 1}</span>
            <div class="flash-actions">
              <button class="icon-btn" title="Edit question">✏️</button>
              <button class="icon-btn" title="Search online">🔍</button>
              <button class="icon-btn${isBookmarked ? ' bookmarked' : ''}" title="Bookmark">🔖</button>
            </div>
          </div>
          <p class="flash-question">${escHtml(q.question || '')}</p>
          ${optionsList ? `<ul class="flash-card-options">${optionsList}</ul>` : ''}
          <p class="flash-hint">Click to reveal answer</p>
        </div>
        <div class="flash-card-face flash-card-back">
          <div class="flash-card-head">
            <span class="flash-num">${i + 1}</span>
            <div class="flash-actions">
              <button class="icon-btn" title="Edit question">✏️</button>
              <button class="icon-btn" title="Search online">🔍</button>
              <button class="icon-btn${isBookmarked ? ' bookmarked' : ''}" title="Bookmark">🔖</button>
            </div>
          </div>
          <p class="flash-answer-line">✓ ${escHtml(correctOpt)}</p>
          ${q.explanation ? `<p class="flash-explanation-line">${escHtml(q.explanation)}</p>` : ''}
        </div>
      </div>
    `;

    // Flip on card click (not on button click)
    card.addEventListener('click', e => {
      if (e.target.closest('.icon-btn')) return;
      card.classList.toggle('flipped');
    });

    // Edit buttons (both front and back)
    card.querySelectorAll('.icon-btn[title="Edit question"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openFlashcardEditor(i, card);
      });
    });

    // Search buttons (both front and back)
    card.querySelectorAll('.icon-btn[title="Search online"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        window.open('https://www.google.com/search?q=' + encodeURIComponent(q.question || ''), '_blank');
      });
    });

    // Bookmark buttons (both front and back)
    card.querySelectorAll('.icon-btn[title="Bookmark"]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const result = await bookmarkQuestion(q);
        if (result === null) return; // error — no UI change
        card.querySelectorAll('.icon-btn[title="Bookmark"]').forEach(b => b.classList.toggle('bookmarked', result));
        card.classList.toggle('flash-card--bookmarked', result);
        card.dataset.bookmarked = result ? '1' : '0';
        if (activeQuizId) {
          const key = `${activeQuizId}:${i}`;
          if (result) bookmarksIndexCache.add(key); else bookmarksIndexCache.delete(key);
        }
        applyFlashFilter();
      });
    });

    grid.appendChild(card);
  });

  applyFlashFilter();
}

// ── FLASHCARD EDITOR ─────────────────────────────────────────
function openFlashcardEditor(questionIndex, cardEl) {
  const q = activeQuizQuestions[questionIndex];
  if (!q) return;

  document.getElementById('modal-flashcard-edit')?.remove();
  const m = document.createElement('div');
  m.className = 'modal active';
  m.id = 'modal-flashcard-edit';

  const numOptions = Array.isArray(q.options) ? q.options.length : 4;
  const optionsHTML = Array.from({ length: numOptions }, (_, i) => `
    <div class="fce-option-row">
      <label class="fce-option-label">
        <input type="radio" name="fce-correct" value="${i}" ${q.correctIndex === i ? 'checked' : ''}>
        <span class="fce-option-letter">${String.fromCharCode(65 + i)}</span>
      </label>
      <input type="text" class="input fce-option-input" data-opt-idx="${i}"
        value="${escHtml(q.options?.[i] || '')}" placeholder="Option ${String.fromCharCode(65 + i)}">
      <button class="icon-btn icon-btn--danger fce-remove-opt" title="Remove option" ${numOptions <= 2 ? 'disabled' : ''}>✕</button>
    </div>`).join('');

  m.innerHTML = `
    <div class="modal-card" style="max-width:520px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
        <h3 style="margin:0">✏️ Edit Question ${questionIndex + 1}</h3>
        <button class="btn btn--ghost btn--small" onclick="document.getElementById('modal-flashcard-edit')?.remove()">✕</button>
      </div>

      <label class="label">Question</label>
      <textarea id="fce-question" class="input" rows="3"
        style="width:100%;resize:vertical;margin-bottom:1rem">${escHtml(q.question || '')}</textarea>

      <label class="label">Options <small style="color:var(--slate)">(● = correct answer)</small></label>
      <div id="fce-options-list" style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.75rem">
        ${optionsHTML}
      </div>

      <button class="btn btn--ghost btn--small" id="fce-add-opt" style="margin-bottom:1rem">＋ Add Option</button>

      <label class="label">Explanation <small style="color:var(--slate)">(optional)</small></label>
      <textarea id="fce-explanation" class="input" rows="2"
        style="width:100%;resize:vertical;margin-bottom:1.25rem">${escHtml(q.explanation || '')}</textarea>

      <div class="fce-danger-zone">
        <button class="btn btn--ghost btn--small fce-delete-btn" id="fce-delete-q">🗑 Delete this question</button>
      </div>

      <div class="modal-actions" style="margin-top:1rem">
        <button class="btn btn--ghost" onclick="document.getElementById('modal-flashcard-edit')?.remove()">Cancel</button>
        <button class="btn btn--primary" id="fce-save-btn">Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(m);

  // ── Add option ──
  document.getElementById('fce-add-opt').addEventListener('click', () => {
    const list = document.getElementById('fce-options-list');
    const count = list.querySelectorAll('.fce-option-row').length;
    if (count >= 6) { toast('Max 6 options allowed', 'info'); return; }
    const idx = count;
    const row = document.createElement('div');
    row.className = 'fce-option-row';
    row.innerHTML = `
      <label class="fce-option-label">
        <input type="radio" name="fce-correct" value="${idx}">
        <span class="fce-option-letter">${String.fromCharCode(65 + idx)}</span>
      </label>
      <input type="text" class="input fce-option-input" data-opt-idx="${idx}" placeholder="Option ${String.fromCharCode(65 + idx)}">
      <button class="icon-btn icon-btn--danger fce-remove-opt" title="Remove option">✕</button>`;
    list.appendChild(row);
    _bindFceRemoveButtons();
    row.querySelector('input[type=text]').focus();
  });

  _bindFceRemoveButtons();

  // ── Delete question ──
  document.getElementById('fce-delete-q').addEventListener('click', async () => {
    if (!confirm(`Delete question ${questionIndex + 1}? This cannot be undone.`)) return;
    const btn = document.getElementById('fce-delete-q');
    btn.textContent = '⏳ Deleting…'; btn.disabled = true;
    activeQuizQuestions.splice(questionIndex, 1);
    const ok = await _saveQuizQuestions();
    if (ok) {
      m.remove();
      renderFlashcards(activeQuizQuestions, activeQuizTitle);
      toast('Question deleted.', 'success');
    } else {
      activeQuizQuestions.splice(questionIndex, 0, q); // revert
      btn.textContent = '🗑 Delete this question'; btn.disabled = false;
    }
  });

  // ── Save ──
  document.getElementById('fce-save-btn').addEventListener('click', async () => {
    const btn = document.getElementById('fce-save-btn');
    const questionText = document.getElementById('fce-question').value.trim();
    if (!questionText) { toast('Question cannot be empty', 'error'); return; }

    const optionInputs = [...document.querySelectorAll('#fce-options-list .fce-option-input')];
    const options = optionInputs.map(inp => inp.value.trim());
    if (options.some(o => !o)) { toast('All options must have text', 'error'); return; }
    if (options.length < 2)   { toast('At least 2 options required', 'error'); return; }

    const correctRadio = document.querySelector('input[name="fce-correct"]:checked');
    const correctIndex = correctRadio ? parseInt(correctRadio.value) : 0;
    const explanation  = document.getElementById('fce-explanation').value.trim();

    btn.textContent = '⏳ Saving…'; btn.disabled = true;

    // Update in memory
    activeQuizQuestions[questionIndex] = { ...q, question: questionText, options, correctIndex, explanation };

    const ok = await _saveQuizQuestions();
    if (ok) {
      m.remove();
      renderFlashcards(activeQuizQuestions, activeQuizTitle);
      toast('Question updated!', 'success');
    } else {
      activeQuizQuestions[questionIndex] = q; // revert
      btn.textContent = 'Save Changes'; btn.disabled = false;
    }
  });
}

function _bindFceRemoveButtons() {
  document.querySelectorAll('.fce-remove-opt').forEach(btn => {
    btn.onclick = () => {
      const list = document.getElementById('fce-options-list');
      const rows = list.querySelectorAll('.fce-option-row');
      if (rows.length <= 2) { toast('At least 2 options required', 'info'); return; }
      btn.closest('.fce-option-row').remove();
      // Re-index letters
      list.querySelectorAll('.fce-option-row').forEach((row, i) => {
        row.querySelector('.fce-option-letter').textContent = String.fromCharCode(65 + i);
        row.querySelector('input[type=radio]').value = i;
        row.querySelector('input[type=text]').dataset.optIdx = i;
        row.querySelector('input[type=text]').placeholder = `Option ${String.fromCharCode(65 + i)}`;
        const removeBtn = row.querySelector('.fce-remove-opt');
        if (removeBtn) removeBtn.disabled = list.querySelectorAll('.fce-option-row').length <= 2;
      });
    };
  });
}

// Save activeQuizQuestions to Supabase
async function _saveQuizQuestions() {
  if (!activeQuizId || !currentUser) { toast('Cannot save — no quiz selected', 'error'); return false; }
  const { error } = await sb.from('quizzes')
    .update({ questions: activeQuizQuestions })
    .eq('id', activeQuizId)
    .eq('user_id', currentUser.id);
  if (error) { toast('Save failed: ' + error.message, 'error'); return false; }
  // Update local cache
  const cached = quizzesCache.find(q => q.id === activeQuizId);
  if (cached) cached.questions = [...activeQuizQuestions];
  return true;
}
function applyFlashFilter() {
  const grid = document.getElementById('flash-grid');
  if (!grid) return;
  grid.querySelectorAll('.flash-card').forEach(card => {
    const show = flashFilter === 'all' || card.dataset.bookmarked === '1';
    card.classList.toggle('flash-card--hidden', !show);
  });
  updateFlashCount();
}

function updateFlashCount() {
  const countEl = document.getElementById('flash-total-count');
  if (!countEl) return;
  const grid = document.getElementById('flash-grid');
  const visible = grid ? grid.querySelectorAll('.flash-card:not(.flash-card--hidden)').length : 0;
  countEl.textContent = visible;
}

// Flashcards filter chips: All / Bookmarked
document.getElementById('flash-filter-bar')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-flash-filter]');
  if (!btn) return;
  flashFilter = btn.dataset.flashFilter;
  document.querySelectorAll('#flash-filter-bar [data-flash-filter]').forEach(b =>
    b.classList.toggle('active', b === btn));
  applyFlashFilter();
});

// ── BACKUP ────────────────────────────────────────────────────
async function exportBackup() {
  if (!currentUser) return;
  const [{ data: groups }, { data: folders }, { data: quizzes }, { data: attempts }, { data: notes }] = await Promise.all([
    sb.from('groups').select('*').eq('user_id', currentUser.id).order('sort_order', { ascending: true }),
    sb.from('folders').select('*').eq('user_id', currentUser.id),
    sb.from('quizzes').select('*').eq('user_id', currentUser.id),
    sb.from('quiz_attempts').select('*').eq('user_id', currentUser.id),
    sb.from('notes').select('*').eq('user_id', currentUser.id)
  ]);
  const backup = {
    groups,
    folders,
    quizzes,
    attempts,
    notes,
    exportedAt: new Date().toISOString(),
    version: 2
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `quizmaster-backup-${new Date().toISOString().slice(0, 10)}.json`
  });
  a.click();
  toast('Backup downloaded!', 'success');
}

async function importBackup(raw) {
  // Progress bar helpers
  const progWrap   = document.getElementById('restore-progress');
  const progLabel  = document.getElementById('restore-progress-label');
  const progPct    = document.getElementById('restore-progress-pct');
  const progBar    = document.getElementById('restore-progress-bar');
  const progDetail = document.getElementById('restore-progress-detail');
  const setProgress = (pct, label, detail = '') => {
    if (progWrap)   progWrap.style.display = 'block';
    if (progBar)    progBar.style.width = pct + '%';
    if (progPct)    progPct.textContent  = pct + '%';
    if (progLabel)  progLabel.textContent = label;
    if (progDetail) progDetail.textContent = detail;
  };
  const hideProgress = () => { if (progWrap) progWrap.style.display = 'none'; };

  try {
    const backup = JSON.parse(raw);
    if (!backup.quizzes) throw new Error('Invalid backup format — quizzes missing.');

    const groups  = backup.groups  || [];
    const folders = backup.folders || [];
    const quizzes = backup.quizzes || [];
    const total   = groups.length + folders.length + quizzes.length || 1;
    let done = 0;
    const tick = (label, detail) => {
      done++;
      setProgress(Math.round((done / total) * 100), label, detail);
    };

    // ── Step 1: Groups ───────────────────────────────────────────
    const groupIdMap = {};
    setProgress(0, 'Creating groups…');
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const { data: ng } = await sb.from('groups').insert({
        user_id:    currentUser.id,
        name:       g.name,
        sort_order: i
      }).select().single();
      if (ng) groupIdMap[g.id] = ng.id;
      tick('Creating groups…', g.name);
    }

    // ── Step 2: Root folders ─────────────────────────────────────
    const folderIdMap = {};
    const rootFolders = folders.filter(f => !f.parent_id);
    setProgress(Math.round((done / total) * 100), 'Creating folders…');
    for (const f of rootFolders) {
      const newGroupId = f.group_id ? groupIdMap[f.group_id] : null;
      const { data: nf } = await sb.from('folders').insert({
        user_id:   currentUser.id,
        name:      f.name,
        group_id:  newGroupId || null,
        is_pinned: f.is_pinned || false,
        is_public: false,
        parent_id: null
      }).select().single();
      if (nf) folderIdMap[f.id] = nf.id;
      tick('Creating folders…', f.name);
    }

    // ── Step 3: Subfolders (up to 4 levels deep) ─────────────────
    const subFolders = folders.filter(f => f.parent_id);
    for (let depth = 0; depth < 4; depth++) {
      for (const f of subFolders) {
        if (folderIdMap[f.id]) continue;
        const newParentId = folderIdMap[f.parent_id];
        if (!newParentId) continue;
        const { data: nf } = await sb.from('folders').insert({
          user_id:   currentUser.id,
          name:      f.name,
          parent_id: newParentId,
          is_pinned: f.is_pinned || false,
          is_public: false
        }).select().single();
        if (nf) folderIdMap[f.id] = nf.id;
        tick('Creating subfolders…', f.name);
      }
    }

    // ── Step 4: Quizzes ──────────────────────────────────────────
    let quizCount = 0;
    for (const q of quizzes) {
      const newFolderId = q.folder_id ? folderIdMap[q.folder_id] : null;
      if (q.folder_id && !newFolderId) { tick('Importing quizzes…', q.title + ' (skipped)'); continue; }
      const { error } = await sb.from('quizzes').insert({
        user_id:   currentUser.id,
        folder_id: newFolderId || null,
        title:     q.title,
        questions: q.questions,
        is_pinned: q.is_pinned || false,
        is_public: false
      });
      if (!error) quizCount++;
      tick('Importing quizzes…', q.title);
    }

    setProgress(100, 'Done!');
    const gCount = Object.keys(groupIdMap).length;
    const fCount = Object.keys(folderIdMap).length;
    toast(`Import done ✓  ${gCount} groups · ${fCount} folders · ${quizCount} quizzes added.`, 'success');
    await loadFolders();
    setTimeout(hideProgress, 3000);
  } catch (err) {
    hideProgress();
    toast('Import failed: ' + err.message, 'error');
  }
}

// ── PUBLIC LIBRARY (Supabase version) ─────────────────────────
async function buildPublicLibrary() {
  const grid  = document.getElementById('public-library-grid');
  const empty = document.getElementById('public-library-empty');
  if (!grid) return;
  grid.innerHTML = '<p style="color:var(--slate);padding:1rem">Loading…</p>';

  const [{ data: pubFolders }, { data: pubQuizzes }] = await Promise.all([
    sb.from('folders').select('id, name, user_id').eq('user_id', currentUser?.id).eq('is_public', true),
    sb.from('quizzes').select('id, title, user_id, questions').eq('user_id', currentUser?.id).eq('is_public', true)
  ]);

  const items = [
    ...(pubFolders || []).map(f => ({ id: f.id, type: '📁 Folder', title: f.name, meta: '' })),
    ...(pubQuizzes || []).map(q => ({ id: q.id, type: '📝 Quiz', title: q.title, meta: `${q.questions?.length || 0} Qs` }))
  ];

  grid.innerHTML = '';
  if (items.length === 0) { if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';

  // Get like counts
  const { data: likes } = await sb.from('likes').select('item_id').in('item_id', items.map(i => i.id));
  const likeMap = {};
  (likes || []).forEach(l => { likeMap[l.item_id] = (likeMap[l.item_id] || 0) + 1; });

  items.forEach(item => {
    const el = document.createElement('article');
    el.className = 'public-lib-card';
    const likeCount = likeMap[item.id] || 0;
    const itemKind = item.type.includes('Folder') ? 'folder' : 'quiz';
    el.innerHTML = `
      <div class="public-lib-card-top">
        <span class="public-lib-type">${item.type}</span>
        <span class="visibility-badge visibility-badge--public">🌐 Public</span>
      </div>
      <h4>${escHtml(item.title)}</h4>
      <span class="public-lib-owner">👤 You · ${item.meta}</span>
      <div class="public-lib-actions">
        <button class="btn-like" data-id="${item.id}">❤ <span class="like-count">${likeCount}</span></button>
        <button class="btn btn--ghost btn--small btn-remove-from-public">🔒 Remove</button>
      </div>
    `;
    grid.appendChild(el);

    el.querySelector('.btn-remove-from-public').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!confirm('Make this private again? Friends who haven\'t already added it to their own library will lose access to this shared link.')) return;
      setLoading(btn, true, 'Removing…');
      const { error } = await sb.from(itemKind === 'folder' ? 'folders' : 'quizzes')
        .update({ is_public: false }).eq('id', item.id);
      if (error) { toast('Could not update: ' + error.message, 'error'); setLoading(btn, false); return; }

      // Keep local caches in sync
      if (itemKind === 'folder') {
        const f = foldersCache.find(f => f.id === item.id);
        if (f) f.is_public = false;
      } else {
        const q = quizzesCache.find(q => q.id === item.id);
        if (q) q.is_public = false;
      }

      el.remove();
      if (!grid.querySelector('.public-lib-card')) {
        if (empty) empty.style.display = 'block';
      }
      toast('Removed from your Public Library.', 'success');
    });

    el.querySelector('.btn-like').addEventListener('click', async () => {
      const btn = el.querySelector('.btn-like');
      const liked = btn.classList.toggle('liked');
      const countEl = btn.querySelector('.like-count');
      if (liked) {
        await sb.from('likes').insert({ user_id: currentUser.id, item_type: item.type.includes('Folder') ? 'folder' : 'quiz', item_id: item.id });
        countEl.textContent = parseInt(countEl.textContent) + 1;
      } else {
        await sb.from('likes').delete().eq('user_id', currentUser.id).eq('item_id', item.id);
        countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
      }
    });
  });
}

// ── GLOBAL SEARCH (real users) ────────────────────────────────
async function renderGlobalSearchResults(query) {
  const q = query.trim();
  const el = document.getElementById('global-search-results');
  if (!el) return;

  if (q.length < 2) {
    el.innerHTML = '<div class="global-search-empty">Type at least 2 characters…</div>';
    return;
  }

  el.innerHTML = '<div class="global-search-empty">Searching…</div>';

  const [users, myFolders, myQuizzes] = await Promise.all([
    searchUsers(q),
    sb.from('folders').select('id,name').eq('user_id', currentUser?.id).ilike('name', `%${q}%`).limit(5),
    sb.from('quizzes').select('id,title').eq('user_id', currentUser?.id).ilike('title', `%${q}%`).limit(5)
  ]);

  el.innerHTML = '';
  const allUsers = users || [];
  const folders  = myFolders.data || [];
  const quizzes  = myQuizzes.data || [];

  if (!allUsers.length && !folders.length && !quizzes.length) {
    el.innerHTML = '<div class="global-search-empty">No matches found.</div>';
    return;
  }

  if (allUsers.length) {
    const label = document.createElement('div');
    label.className = 'global-search-group-label';
    label.textContent = 'Users';
    el.appendChild(label);
    allUsers.forEach(u => {
      const row = document.createElement('div');
      row.className = 'global-search-item';
      const initials = (u.display_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      row.innerHTML = `
        <div class="global-search-item-left">
          <div class="global-search-item-text"><strong>${escHtml(u.display_name)}</strong><span>${escHtml(u.roll_no || '')}</span></div>
        </div>
        <button class="btn btn--primary btn--small global-search-item-tag">${friendButtonLabel(u.id)}</button>
      `;
      row.querySelector('.global-search-item-left').addEventListener('click', () => openFriendProfile(u));
      wireAddFriendButton(row.querySelector('button'), u.id);
      el.appendChild(row);
    });
  }

  if (folders.length || quizzes.length) {
    const label = document.createElement('div');
    label.className = 'global-search-group-label';
    label.textContent = 'Your Folders & Quizzes';
    el.appendChild(label);
    [...folders.map(f => ({ ...f, kind: 'folder' })), ...quizzes.map(q => ({ ...q, kind: 'quiz' }))].forEach(item => {
      const row = document.createElement('div');
      row.className = 'global-search-item';
      row.innerHTML = `
        <div class="global-search-item-left">
          <div class="global-search-item-text">
            <strong>${escHtml(item.name || item.title)}</strong>
            <span>${item.kind === 'folder' ? '📁 Folder' : '📝 Quiz'}</span>
          </div>
        </div>
        <span class="global-search-item-tag">Open</span>
      `;
      row.addEventListener('click', () => {
        document.getElementById('global-search-input').value = '';
        el.innerHTML = '';
        if (item.kind === 'folder') {
          openFolder(item.id, item.name, item.parent_id || null);
        } else {
          const parentFolder = foldersCache.find(f => f.id === item.folder_id);
          if (parentFolder) openFolder(parentFolder.id, parentFolder.name, parentFolder.parent_id || null);
          else showView('folder');
        }
      });
      el.appendChild(row);
    });
  }
}

// ── ACTIVITY CALENDAR (real data) ────────────────────────────
async function buildActivityCalendarReal(userId, gridId, monthsId) {
  userId = userId || currentUser?.id;
  gridId = gridId || 'contribution-grid';
  monthsId = monthsId || 'contribution-months';
  if (!userId) { buildActivityCalendar(); return; }

  const { data } = await sb.from('quiz_attempts')
    .select('attempted_at')
    .eq('user_id', userId);

  if (!data || data.length === 0) { buildActivityCalendar(gridId, monthsId); return; }

  // Build date → count map
  const countMap = {};
  data.forEach(a => {
    const d = a.attempted_at.slice(0, 10);
    countMap[d] = (countMap[d] || 0) + 1;
  });

  const grid   = document.getElementById(gridId);
  const months = document.getElementById(monthsId);
  if (!grid) return;
  grid.innerHTML = '';
  months.innerHTML = '';

  const WEEKS = 14;
  const today = new Date();
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (6 - ((today.getDay() + 6) % 7)));
  const startDate = new Date(endOfWeek);
  startDate.setDate(endOfWeek.getDate() - WEEKS * 7 + 1);

  let lastMonth = -1;
  for (let col = 0; col < WEEKS; col++) {
    const colStart = new Date(startDate);
    colStart.setDate(startDate.getDate() + col * 7);
    const label = document.createElement('span');
    if (colStart.getMonth() !== lastMonth) {
      label.textContent = colStart.toLocaleDateString('en-IN', { month: 'short' });
      lastMonth = colStart.getMonth();
    }
    months.appendChild(label);

    for (let row = 0; row < 7; row++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + col * 7 + row);
      const cell = document.createElement('span');
      cell.className = 'contribution-cell';
      if (date > today) { cell.dataset.level = '0'; cell.style.visibility = 'hidden'; }
      else {
        const key = date.toISOString().slice(0, 10);
        const count = countMap[key] || 0;
        let level = 0;
        if (count >= 5) level = 4;
        else if (count >= 3) level = 3;
        else if (count >= 2) level = 2;
        else if (count >= 1) level = 1;
        cell.dataset.level = level;
        cell.title = `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} — ${count} quiz${count === 1 ? '' : 'zes'}`;
        if (count >= 3) cell.classList.add('contribution-cell--target');
      }
      grid.appendChild(cell);
    }
  }
}

// ── FRIEND SEARCH LIVE ────────────────────────────────────────
async function setupFriendSearch() {
  const input   = document.getElementById('friend-search-input');
  const results = document.getElementById('friend-search-results');
  if (!input || !results) return;

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 2) { results.innerHTML = ''; results.style.display = 'none'; return; }
    results.style.display = 'block';
    results.innerHTML = '<div style="padding:.5rem 1rem;color:var(--slate)">Searching…</div>';
    debounce = setTimeout(async () => {
      const users = await searchUsers(q);
      results.innerHTML = '';
      if (!users.length) { results.innerHTML = '<div style="padding:.5rem 1rem;color:var(--slate)">No users found.</div>'; return; }
      users.forEach(u => {
        const row = document.createElement('div');
        row.className = 'friend-search-result-row';
        row.style.cssText = 'display:flex;align-items:center;gap:.75rem;padding:.5rem 1rem;cursor:pointer;border-bottom:1px solid var(--line)';
        const initials = (u.display_name || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
        row.innerHTML = `
          <div><strong>${escHtml(u.display_name)}</strong><br><small>${escHtml(u.roll_no || '')}</small></div>
          <button class="btn btn--primary btn--small" style="margin-left:auto">${friendButtonLabel(u.id)}</button>
        `;
        wireAddFriendButton(row.querySelector('button'), u.id);
        results.appendChild(row);
      });
    }, 300);
  });

  input.addEventListener('blur', () => setTimeout(() => results.style.display = 'none', 200));
}

// ── UTILS ─────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// ── WIRE UP EXISTING STATIC HANDLERS ─────────────────────────
// These override / extend the static app.js handlers

// Auth forms
// (removeEventListener no-op removed — anonymous functions can't be unregistered)
document.getElementById('form-login').addEventListener('submit', handleLogin);
document.getElementById('form-signup').addEventListener('submit', handleSignup);
document.getElementById('btn-logout').addEventListener('click', handleLogout);

// Theme persistence
['btn-theme', 'btn-theme-mobile'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => setTimeout(persistTheme, 100));
});

// Profile public toggle persistence
document.getElementById('toggle-profile-public')?.addEventListener('change', () => {
  const checked = document.getElementById('toggle-profile-public').checked;
  sb.from('profiles').update({ is_public: checked }).eq('id', currentUser?.id);
  if (currentProfile) currentProfile.is_public = checked;
  const privateHint = document.getElementById('profile-private-hint');
  if (privateHint) privateHint.style.display = checked ? 'none' : 'block';
});

// Save quiz (override static handler)
document.getElementById('btn-save-quiz').addEventListener('click', e => {
  e.stopImmediatePropagation();
  saveQuiz();
}, true);

// Create group
['btn-create-group', 'btn-new-group'].forEach(id => document.getElementById(id)?.addEventListener('click', async () => {
  const name = prompt('Group name (e.g. GS, MATHS, ENGLISH):');
  if (!name || !name.trim()) return;
  const { data, error } = await sb.from('groups').insert({
    user_id: currentUser.id,
    name: name.trim(),
    sort_order: groupsCache.length
  }).select().single();
  if (error) { toast('Could not create group: ' + error.message, 'error'); return; }
  groupsCache.push(data);
  renderFolders();
  toast('Group "' + name.trim() + '" created!', 'success');
}));


// Create folder
document.getElementById('btn-create-folder').addEventListener('click', async e => {
  e.stopImmediatePropagation();
  const name = document.getElementById('new-folder-name').value.trim();
  if (!name) return;
  closeModal('modal-folder');
  document.getElementById('new-folder-name').value = '';
  await createFolder(name);
}, true);

// Export backup (override static)
document.getElementById('btn-export-all').addEventListener('click', e => {
  e.stopImmediatePropagation();
  exportBackup();
}, true);

// Restore backup (override static)
document.getElementById('btn-do-restore').addEventListener('click', async e => {
  e.stopImmediatePropagation();
  const raw = document.getElementById('restore-paste-area').value.trim();
  if (!raw) { toast('Paste or upload a backup JSON first.', 'error'); return; }
  await importBackup(raw);
}, true);

// Load data when views open
document.querySelectorAll('.nav-link[data-view], [data-view]').forEach(el => {
  el.addEventListener('click', () => {
    const view = el.dataset.view;
    if (view === 'history')   { loadHistory(); loadSharedSessions(); }
    if (view === 'bookmarks') loadBookmarks();
    if (view === 'notes')     loadNotes();
    if (view === 'friends')   loadFriends();
    if (view === 'inbox')     loadInbox();
    if (view === 'profile') {
      buildPublicLibrary();
      buildActivityCalendarReal();
      loadMyProfileStats();
    }
    // Pomodoro / Race views are static landing pages — no data load needed.
    // The actual Pomodoro flow is triggered from folder quiz slips.
  });
});

// Bookmark button in quiz player
document.getElementById('btn-q-bookmark')?.addEventListener('click', bookmarkCurrentQuestion);

// Override renderPlayer to use real questions from Supabase.
// oldstatic.js exposes renderPlayer on window; we replace it before the
// quiz begins so that buildQuizState → renderPlayer() calls our version.
const origBeginBtn = document.getElementById('btn-begin-quiz');
origBeginBtn?.addEventListener('click', () => {
  if (activeQuizQuestions.length > 0) {
    // Apply question-selection (range / random pick) and shuffle settings
    // from the Quiz Setup screen before building the quiz state.
    let pool = (activeFullQuizQuestions.length ? activeFullQuizQuestions : activeQuizQuestions).slice();
    activeFullQuizQuestions = pool.slice();

    const selectMode = document.querySelector('[data-select-mode].active')?.dataset.selectMode || 'range';
    if (selectMode === 'random') {
      const n = Math.min(parseInt(document.getElementById('random-count')?.value, 10) || pool.length, pool.length);
      pool = [...pool].sort(() => Math.random() - 0.5).slice(0, n);
    } else {
      const from = Math.max(1, parseInt(document.getElementById('range-from')?.value, 10) || 1);
      const to   = Math.min(pool.length, parseInt(document.getElementById('range-to')?.value, 10) || pool.length);
      pool = pool.slice(from - 1, to);
    }

    if (document.getElementById('toggle-shuffle-q')?.checked) {
      pool = [...pool].sort(() => Math.random() - 0.5);
    }
    if (document.getElementById('toggle-shuffle-opt')?.checked) {
      pool = pool.map(q => {
        if (!Array.isArray(q.options)) return q;
        const order = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
        return {
          ...q,
          options: order.map(i => q.options[i]),
          correctIndex: order.indexOf(q.correctIndex)
        };
      });
    }

    activeQuizQuestions = pool;
    document.getElementById('setup-quiz-total').textContent = activeQuizQuestions.length;

    window._origRenderPlayer = window.renderPlayer;
    window.renderPlayer = renderPlayerReal;
    // Patch goToQuestion to also use renderPlayerReal
    const origGTQ = window.goToQuestion;
    if (origGTQ) {
      window.goToQuestion = function(index) {
        if (index < 0 || index >= quizState.length) return;
        currentQ = index;
        renderPlayerReal();
      };
    }
  }
}, true);

// Result page — save attempt exactly once when quiz ends.
// Two paths lead to the result screen:
//  1. btn-next-q on the last question, when all questions are answered
//     (openEndQuizConfirm skips the modal and goes straight to result)
//  2. btn-confirm-end-quiz, when some questions were unanswered and the
//     user confirmed via the "Submit Quiz" modal
let _attemptSaved = false;

document.getElementById('btn-confirm-end-quiz')?.addEventListener('click', () => {
  // oldstatic.js already handles stopTimer() + showView('result') for this button.
  if (_attemptSaved) return;
  _attemptSaved = true;
  setTimeout(() => saveAttempt(), 50);
});
document.getElementById('btn-next-q')?.addEventListener('click', () => {
  // When Finish is clicked on the last question AND all questions are
  // answered, openEndQuizConfirm() jumps straight to the result view
  // without opening the confirm modal — save here in that case only.
  if (currentQ === (quizState.length - 1)) {
    const unanswered = quizState.filter(q => !q.answered).length;
    if (unanswered === 0 && !_attemptSaved) {
      _attemptSaved = true;
      setTimeout(saveAttempt, 100);
    }
  }
});

// Reset the save-guard whenever a new quiz attempt begins.
document.getElementById('btn-begin-quiz')?.addEventListener('click', () => {
  _attemptSaved = false;
}, true);

// Global search (override static)
const gsi = document.getElementById('global-search-input');
gsi?.addEventListener('input', () => renderGlobalSearchResults(gsi.value));
gsi?.addEventListener('focus', () => renderGlobalSearchResults(gsi.value));

// Profile save button (add if not present)
const profileView = document.getElementById('view-profile');

// Preview my own public profile (read-only)
document.getElementById('btn-preview-public-profile')?.addEventListener('click', () => {
  if (!currentUser) return;
  openFriendProfile({ id: currentUser.id });
});
if (profileView && !document.getElementById('btn-save-profile')) {
  const saveBtn = document.createElement('button');
  saveBtn.id = 'btn-save-profile';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = '💾 Save Profile';
  saveBtn.style.marginTop = '1rem';
  saveBtn.addEventListener('click', saveProfile);
  const profileCard = profileView.querySelector('.card');
  if (profileCard) profileCard.appendChild(saveBtn);
}

// Pin persistence: override pinItem / unpinItem
const origPinItem   = window.pinItem;
const origUnpinItem = window.unpinItem;
if (origPinItem) {
  window.pinItem = function(type, id, name, meta) {
    origPinItem(type, id, name, meta);
    savePinToDb(type, id, name, meta);
  };
}
if (origUnpinItem) {
  window.unpinItem = function(type, id) {
    origUnpinItem(type, id);
    removePinFromDb(type, id);
  };
}

// Setup friend search
setupFriendSearch();

// Bookmarks toolbar: reset filter to "All"
document.getElementById('btn-bookmark-quiz')?.addEventListener('click', () => {
  bookmarksFilter = 'all';
  renderBookmarkFilters();
  renderBookmarks();
});

// Bookmarks toolbar: flip all cards
document.getElementById('btn-bookmark-flash')?.addEventListener('click', () => {
  const cards = document.querySelectorAll('#bookmark-grid .flash-card');
  const anyUnflipped = [...cards].some(c => !c.classList.contains('flipped'));
  cards.forEach(c => c.classList.toggle('flipped', anyUnflipped));
});

// ── SESSION RESTORE ───────────────────────────────────────────
// Check for existing session on page load
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    await onSignedIn(session.user);
  }

  // Listen for auth changes (token refresh, signout on another tab)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !currentUser) {
      await onSignedIn(session.user);
    }
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
    }
  });
})();
// Flashcard back button
document.getElementById('btn-flash-back')?.addEventListener('click', () => {
  if (activeFolderId && activeFolderName) {
    openFolder(activeFolderId, activeFolderName);
  } else {
    showView('dashboard');
  }
});
// Flashcard shuffle options button
document.getElementById('btn-flash-shuffle-opts')?.addEventListener('click', () => {
  const grid = document.getElementById('flash-grid');
  if (!grid) return;
  grid.querySelectorAll('.flash-card').forEach(card => {
    const front = card.querySelector('.flash-card-options');
    if (!front) return;
    const items = [...front.querySelectorAll('li')];
    if (items.length < 2) return;
    // Find which li is the correct one before shuffle
    const correctLi = items.find(li => li.classList.contains('correct-opt'));
    // Fisher-Yates shuffle
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      front.insertBefore(items[j], items[i]);
      [items[i], items[j]] = [items[j], items[i]];
    }
    // Re-label A, B, C, D after shuffle
    [...front.querySelectorAll('li')].forEach((li, idx) => {
      const marker = li.querySelector('.option-marker');
      if (marker) marker.textContent = String.fromCharCode(65 + idx);
    });
  });
});



async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  document.getElementById('app-shell').style.visibility = 'hidden';
document.getElementById('app-shell').style.pointerEvents = 'none';
  // ADD THIS:
  const mobileNav = document.querySelector('.mobile-nav');
  if (mobileNav) mobileNav.style.display = 'none';
  const auth = document.getElementById('view-auth');
  auth.style.display = 'flex';
  auth.classList.add('active');
  toast('Logged out.', 'info');
}
