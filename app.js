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
  const form = e.target;
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const pass  = form.password.value;
  const btn   = form.querySelector('[type=submit]');

  if (pass.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
  setLoading(btn, true, 'Creating account…');

  const { data, error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { display_name: name } }
  });
  setLoading(btn, false);

  if (error) { toast('Sign-up failed: ' + error.message, 'error'); return; }

  // Create profile row
if (data.user) {
  await onSignedIn(data.user);
}
  else {
    toast('Check your email to confirm your account!', 'info');
  }
}

async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  document.getElementById('app-shell').style.display = 'none';
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
    // Create if missing (edge case)
    const name = currentUser.user_metadata?.display_name || 'User';
    const { data: newProfile } = await sb.from('profiles').insert({
      id: currentUser.id,
      display_name: name,
      roll_no: ''
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
  const pRoll = document.getElementById('profile-rollno');
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

  // Theme — sync with value saved in Supabase (covers cross-device login).
  // The <head> inline script + oldstatic.js already applied the locally
  // cached theme on page load to avoid a flash; here we just reconcile
  // with the server value if it differs.
  let _localThemeSet = false;
  try { _localThemeSet = localStorage.getItem('qm-theme') !== null; } catch (e) {}
  if (!_localThemeSet) {
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
  const nameInput = document.getElementById('profile-display-name');
  const newName = nameInput?.textContent?.trim() || currentProfile.display_name;

  const { error } = await sb.from('profiles').update({
    display_name: newName,
    is_public: document.getElementById('toggle-profile-public')?.checked ?? true,
    theme: darkMode ? 'dark' : 'light'
  }).eq('id', currentUser.id);

  if (error) { toast('Could not save profile: ' + error.message, 'error'); return; }
  currentProfile.display_name = newName;
  toast('Profile saved!', 'success');
}

// ── THEME PERSISTENCE ────────────────────────────────────────
async function persistTheme() {
  if (!currentUser) return;
  await sb.from('profiles').update({ theme: darkMode ? 'dark' : 'light' }).eq('id', currentUser.id);
}

// ── FOLDERS ──────────────────────────────────────────────────
let foldersCache = [];  // array of folder rows

async function loadFolders() {
  if (!currentUser) return;
  const { data, error } = await sb.from('folders')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) { toast('Could not load folders', 'error'); return; }
  foldersCache = data || [];
  renderFolders();
}

function renderFolders() {
  const grid = document.getElementById('folder-grid');
  if (!grid) return;

  // Remove dynamically added folder cards
  grid.querySelectorAll('.folder-card[data-folder-id]').forEach(c => c.remove());

  foldersCache.forEach(folder => {
    const card = document.createElement('div');
    card.className = 'folder-card' + (folder.is_pinned ? ' folder-card--pinned' : '');
    card.dataset.folderId = folder.id;
    card.innerHTML = `
      <div class="folder-card-top">
        <button class="btn-pin ${folder.is_pinned ? 'active' : ''}" 
          data-item-type="folder" data-item-id="${folder.id}"
          data-item-name="${escHtml(folder.name)}" data-item-meta="Folder"
          title="${folder.is_pinned ? 'Unpin folder' : 'Pin folder'}">📌</button>
        <button class="btn-toggle-visibility" title="${folder.is_public ? 'Make Private' : 'Make Public'}">
          ${folder.is_public ? '🔒 Make Private' : '🌐 Make Public'}
        </button>
      </div>
      <span class="folder-icon">📁</span>
      <h3>${escHtml(folder.name)}</h3>
      <span class="folder-count" id="folder-count-${folder.id}">Loading…</span>
      <div class="folder-card-actions">
        <button class="btn btn--ghost btn--small btn-rename-folder" data-folder-id="${folder.id}">✏️ Rename</button>
        <button class="btn btn--ghost btn--small btn-delete-folder" data-folder-id="${folder.id}">🗑️</button>
      </div>
      <span class="visibility-badge ${folder.is_public ? 'visibility-badge--public' : ''}" data-visibility-badge>
        ${folder.is_public ? '🌐 Public' : '🔒 Private'}
      </span>
    `;

    // Click to open folder
    card.addEventListener('click', e => {
      if (e.target.closest('.btn-pin, .btn-toggle-visibility, .btn-rename-folder, .btn-delete-folder')) return;
      openFolder(folder.id, folder.name);
    });

    // Visibility toggle
    card.querySelector('.btn-toggle-visibility').addEventListener('click', async e => {
      e.stopPropagation();
      folder.is_public = !folder.is_public;
      const badge = card.querySelector('[data-visibility-badge]');
      badge.textContent = folder.is_public ? '🌐 Public' : '🔒 Private';
      badge.className = `visibility-badge ${folder.is_public ? 'visibility-badge--public' : ''}`;
      card.querySelector('.btn-toggle-visibility').textContent = folder.is_public ? '🔒 Make Private' : '🌐 Make Public';
      await sb.from('folders').update({ is_public: folder.is_public }).eq('id', folder.id);
      buildPublicLibrary();
    });

    // Rename
    card.querySelector('.btn-rename-folder').addEventListener('click', async e => {
      e.stopPropagation();
      const newName = prompt('Rename folder:', folder.name);
      if (!newName || !newName.trim()) return;
      await sb.from('folders').update({ name: newName.trim() }).eq('id', folder.id);
      folder.name = newName.trim();
      card.querySelector('h3').textContent = newName.trim();
      toast('Folder renamed!', 'success');
    });

    // Delete
    card.querySelector('.btn-delete-folder').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Delete folder "${folder.name}"? All quizzes inside will also be deleted.`)) return;
      await sb.from('folders').delete().eq('id', folder.id);
      foldersCache = foldersCache.filter(f => f.id !== folder.id);
      card.remove();
      toast('Folder deleted.', 'info');
    });

    // Insert before the "Add" card
    const addCard = grid.querySelector('.folder-card--add');
    grid.insertBefore(card, addCard);

    // Load quiz count
    loadFolderCount(folder.id);
  });

  // Update save-to-folder select
  updateSaveFolderSelect();
  updateTargetFolderSelect();
}

async function loadFolderCount(folderId) {
  const { count } = await sb.from('quizzes')
    .select('*', { count: 'exact', head: true })
    .eq('folder_id', folderId);
  const el = document.getElementById('folder-count-' + folderId);
  if (el) el.textContent = (count || 0) + ' quiz' + (count === 1 ? '' : 'zes');
}

async function createFolder(name) {
  if (!currentUser) return null;
  const { data, error } = await sb.from('folders').insert({
    user_id: currentUser.id,
    name: name.trim()
  }).select().single();
  if (error) { toast('Could not create folder: ' + error.message, 'error'); return null; }
  foldersCache.unshift(data);
  renderFolders();
  toast('Folder created!', 'success');
  return data;
}

// ── CURRENT OPEN FOLDER ──────────────────────────────────────
let activeFolderId   = null;
let activeFolderName = '';
let quizzesCache     = [];

async function openFolder(folderId, folderName) {
  activeFolderId = folderId;
  activeFolderName = folderName;

  // Update folder view header
  const h = document.getElementById('folder-view-name');
  if (h) h.textContent = folderName;

  showView('folder');
  await loadQuizzes(folderId);
}

async function loadQuizzes(folderId) {
  const { data, error } = await sb.from('quizzes')
    .select('id, title, is_public, is_pinned, created_at, questions')
    .eq('folder_id', folderId)
    .order('created_at', { ascending: false });
  if (error) { toast('Could not load quizzes', 'error'); return; }
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
        <button class="btn btn--ghost btn--small btn-share-quiz-real" data-quiz-id="${quiz.id}">↗ Share</button>
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

    // Start quiz
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

    // Share quiz
    slip.querySelector('.btn-share-quiz-real').addEventListener('click', () => {
      initShareSelection(qCount);
      currentShareQuizId = quiz.id;
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
  sel.innerHTML = foldersCache.map(f => `<option value="${f.id}">${escHtml(f.name)}</option>`).join('')
    + '<option value="__new">＋ Create new folder…</option>';
  // Restore previous selection if it still exists, else default to active folder or first
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

// ── ACTIVE QUIZ STATE ─────────────────────────────────────────
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
      if (i < numOptions) {
        el.style.display = '';
        if (label) label.textContent = String.fromCharCode(65 + i);
        if (text) text.textContent = q.options[i] || '';
        el.classList.toggle('selected', quizState[currentQ]?.optionIndex === i);
      } else {
        el.style.display = 'none';
        el.classList.remove('selected');
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

  // Best (highest score, then lowest time) attempt per user
  const bestByUser = new Map();
  (attempts || []).forEach(a => {
    const prev = bestByUser.get(a.user_id);
    if (!prev || a.score > prev.score || (a.score === prev.score && a.time_taken < prev.time_taken)) {
      bestByUser.set(a.user_id, a);
    }
  });

  const rows = memberIds.map(uid => {
    const profile = profileMap.get(uid);
    const attempt = bestByUser.get(uid);
    const name = uid === currentUser.id ? 'You' : (profile?.display_name || 'Friend');
    const sub  = profile?.display_name || profile?.roll_no || '';
    const initials = (profile?.display_name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
    let pct = null, timeStr = '\u2014';
    if (attempt) {
      pct = attempt.total > 0 ? Math.round((attempt.score / attempt.total) * 100) : 0;
      const t = attempt.time_taken || 0;
      const mm = String(Math.floor(t / 60)).padStart(2, '0');
      const ss = String(t % 60).padStart(2, '0');
      timeStr = t > 0 ? `${mm}:${ss}` : '\u2014';
    }
    return { uid, name, sub, initials, pct, timeStr, attempt };
  });

  rows.sort((a, b) => {
    if (a.pct === null && b.pct === null) return 0;
    if (a.pct === null) return 1;
    if (b.pct === null) return -1;
    if (b.pct !== a.pct) return b.pct - a.pct;
    return (a.attempt.time_taken || 0) - (b.attempt.time_taken || 0);
  });

  const medals = ['🥇', '🥈', '🥉'];
  list.innerHTML = rows.map((r, i) => {
    const isMe = r.uid === currentUser.id;
    if (r.pct === null) {
      return `
        <div class="leaderboard-row leaderboard-row--pending${isMe ? ' leaderboard-row--me' : ''}">
          <span class="lb-rank lb-rank--pending">\u2014</span>
          <div class="friend-avatar friend-avatar--sm">${escHtml(r.initials)}</div>
          <div class="lb-info"><strong>${escHtml(r.name)}</strong><span>Not attempted yet</span></div>
          <div class="lb-score lb-score--pending">\u2014</div>
          <div class="lb-time">\u2014</div>
        </div>`;
    }
    const rank = medals[i] || `#${i + 1}`;
    return `
      <div class="leaderboard-row${isMe ? ' leaderboard-row--me' : ''}">
        <span class="lb-rank">${rank}</span>
        <div class="friend-avatar friend-avatar--sm">${escHtml(r.initials)}</div>
        <div class="lb-info"><strong>${escHtml(r.name)}</strong><span>${escHtml(r.sub)}</span></div>
        <div class="lb-score">${r.pct}%</div>
        <div class="lb-time">${r.timeStr}</div>
      </div>`;
  }).join('');

  openModal('modal-leaderboard');
}
async function loadHistory() {
  if (!currentUser) return;
  const { data, error } = await sb.from('quiz_attempts')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('attempted_at', { ascending: false })
    .limit(50);
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
  list.querySelectorAll('.friend-card[data-friend-id]').forEach(c => c.remove());

  const friendsCount = document.getElementById('friends-count');
  if (friendsCount) friendsCount.textContent = friends.length;

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
    `;
    card.querySelector('.btn-remove-friend').addEventListener('click', async () => {
      if (!confirm('Remove this friend?')) return;
      await sb.from('friendships').delete()
        .or(`and(requester_id.eq.${currentUser.id},addressee_id.eq.${friend.id}),and(requester_id.eq.${friend.id},addressee_id.eq.${currentUser.id})`);
      friendsCache = friendsCache.filter(f => f.id !== friend.id);
      card.remove();
      toast('Friend removed.', 'info');
    });
    card.querySelector('.btn-challenge-friend').addEventListener('click', () => {
      sendChallenge(friend.id, friend.display_name);
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
        <div class="friend-avatar friend-avatar--sm">${escHtml(initials)}</div>
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
  const { data, error } = await sb.from('inbox_messages')
    .select('*, from_profile:profiles!inbox_messages_from_user_id_fkey(display_name, roll_no)')
    .eq('to_user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return;
  inboxCache = data || [];
  renderInbox(inboxCache);
  updateInboxBadge(inboxCache.filter(m => !m.is_read).length);
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
  if (error) { toast('Could not load chapter: ' + error.message, 'error'); return; }

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
  await sb.from('folders').update({ is_public: true }).eq('id', folder.id);
  folder.is_public = true;
  await sb.from('quizzes').update({ is_public: true }).eq('folder_id', folder.id);
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
      is_public: true
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
  // Recipient needs to be able to read this quiz row; make it public.
  await sb.from('quizzes').update({ is_public: true }).eq('id', quizId);
  const cachedQuiz = quizzesCache.find(q => q.id === quizId);
  if (cachedQuiz) cachedQuiz.is_public = true;

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

// Show/hide flashcards based on the active filter ('all' or 'bookmarked')
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
  const [{ data: folders }, { data: quizzes }, { data: attempts }, { data: notes }] = await Promise.all([
    sb.from('folders').select('*').eq('user_id', currentUser.id),
    sb.from('quizzes').select('*').eq('user_id', currentUser.id),
    sb.from('quiz_attempts').select('*').eq('user_id', currentUser.id),
    sb.from('notes').select('*').eq('user_id', currentUser.id)
  ]);
  const backup = { folders, quizzes, attempts, notes, exportedAt: new Date().toISOString(), version: 1 };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `quizmaster-backup-${new Date().toISOString().slice(0, 10)}.json`
  });
  a.click();
  toast('Backup downloaded!', 'success');
}

async function importBackup(raw) {
  try {
    const backup = JSON.parse(raw);
    if (!backup.folders || !backup.quizzes) throw new Error('Invalid backup format.');

    // Re-insert folders
    for (const folder of backup.folders) {
      const { data: newFolder } = await sb.from('folders').insert({
        user_id: currentUser.id,
        name: folder.name,
        is_public: false
      }).select().single();
      if (!newFolder) continue;

      // Re-insert quizzes in this folder
      const folderQuizzes = backup.quizzes.filter(q => q.folder_id === folder.id);
      for (const quiz of folderQuizzes) {
        await sb.from('quizzes').insert({
          user_id: currentUser.id,
          folder_id: newFolder.id,
          title: quiz.title,
          questions: quiz.questions,
          is_public: false
        });
      }
    }

    toast(`Backup restored: ${backup.folders.length} folders, ${backup.quizzes.length} quizzes.`, 'success');
    await loadFolders();
  } catch (err) {
    toast('Restore failed: ' + err.message, 'error');
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
    el.innerHTML = `
      <div class="public-lib-card-top">
        <span class="public-lib-type">${item.type}</span>
        <span class="visibility-badge visibility-badge--public">🌐 Public</span>
      </div>
      <h4>${escHtml(item.title)}</h4>
      <span class="public-lib-owner">👤 You · ${item.meta}</span>
      <div class="public-lib-actions">
        <button class="btn-like" data-id="${item.id}">❤ <span class="like-count">${likeCount}</span></button>
      </div>
    `;
    grid.appendChild(el);

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
          <div class="friend-avatar friend-avatar--sm">${escHtml(initials)}</div>
          <div class="global-search-item-text"><strong>${escHtml(u.display_name)}</strong><span>${escHtml(u.roll_no || '')}</span></div>
        </div>
        <button class="btn btn--primary btn--small global-search-item-tag">${friendButtonLabel(u.id)}</button>
      `;
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
        showView(item.kind === 'folder' ? 'dashboard' : 'folder');
      });
      el.appendChild(row);
    });
  }
}

// ── ACTIVITY CALENDAR (real data) ────────────────────────────
async function buildActivityCalendarReal() {
  if (!currentUser) { buildActivityCalendar(); return; }

  const { data } = await sb.from('quiz_attempts')
    .select('attempted_at')
    .eq('user_id', currentUser.id);

  if (!data || data.length === 0) { buildActivityCalendar(); return; }

  // Build date → count map
  const countMap = {};
  data.forEach(a => {
    const d = a.attempted_at.slice(0, 10);
    countMap[d] = (countMap[d] || 0) + 1;
  });

  const grid   = document.getElementById('contribution-grid');
  const months = document.getElementById('contribution-months');
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
          <div class="friend-avatar friend-avatar--sm">${escHtml(initials)}</div>
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
    }
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