/* =========================================================
   QuizMaster Pro — app.js  (clean single-file rewrite)
   ========================================================= */

// ── UTILS ──────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

// ── SIDEBAR (mobile overlay) ───────────────────────────────
const sidebar   = document.getElementById('sidebar');
const backdrop  = document.getElementById('sidebar-backdrop');

function openSidebar()  {
  sidebar.classList.add('open');
  backdrop.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('active');
  document.body.style.overflow = '';
}

document.getElementById('btn-hamburger').addEventListener('click', openSidebar);
document.getElementById('btn-sidebar-close').addEventListener('click', closeSidebar);
backdrop.addEventListener('click', closeSidebar);

// ── ROUTER ─────────────────────────────────────────────────
const ALL_VIEWS = ['dashboard','folder','create','quiz-setup','quiz-player',
  'result','flashcards','history','friends','backup','inbox','bookmarks','profile','notes'];

function showView(name) {
  ALL_VIEWS.forEach(id => {
    const el = document.getElementById('view-' + id);
    if (el) el.classList.toggle('active', id === name);
  });
  document.querySelectorAll('.nav-link[data-view]').forEach(a =>
    a.classList.toggle('active', a.dataset.view === name)
  );
  closeSidebar();
}

document.querySelectorAll('.nav-link[data-view]').forEach(a => {
  a.addEventListener('click', e => { e.preventDefault(); showView(a.dataset.view); });
});

document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.back));
});

document.getElementById('user-badge-link').addEventListener('click', () => showView('profile'));

// ── AUTH ───────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-tabs .tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.auth-form').forEach(f =>
    f.classList.toggle('active', f.id === 'form-' + tab));
}
document.querySelectorAll('.auth-tabs .tab-btn').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
document.querySelectorAll('[data-switch]').forEach(a =>
  a.addEventListener('click', e => { e.preventDefault(); switchTab(a.dataset.switch); }));

// enterApp() — called by app.js after successful Supabase auth
function enterApp() {
  document.getElementById('view-auth').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  showView('dashboard');
}
window.enterApp = enterApp; // expose for app.js to call after auth



// ── DARK / LIGHT MODE ──────────────────────────────────────
let darkMode = false;
try { darkMode = localStorage.getItem('qm-theme') === 'dark'; } catch (e) {}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : '');
  document.getElementById('btn-theme').textContent       = darkMode ? '☀️ Light' : '🌙 Dark';
  document.getElementById('btn-theme-mobile').textContent = darkMode ? '☀️' : '🌙';
  try { localStorage.setItem('qm-theme', darkMode ? 'dark' : 'light'); } catch (e) {}
}
applyTheme(); // sync button labels with the theme applied in <head> on initial load

document.getElementById('btn-theme').addEventListener('click',        () => { darkMode = !darkMode; applyTheme(); });
document.getElementById('btn-theme-mobile').addEventListener('click', () => { darkMode = !darkMode; applyTheme(); });

// ── FOLDER NAVIGATION ──────────────────────────────────────
document.querySelectorAll('.folder-card:not(.folder-card--add)').forEach(card =>
  card.addEventListener('click', e => {
    if (e.target.closest('.btn-pin, .btn-toggle-visibility, .visibility-badge')) return;
    showView('folder');
  }));

document.getElementById('btn-new-folder').addEventListener('click',    () => openModal('modal-folder'));
document.querySelector('.folder-card--add').addEventListener('click',   () => openModal('modal-folder'));
document.getElementById('btn-cancel-folder').addEventListener('click',  () => closeModal('modal-folder'));
document.getElementById('btn-create-folder').addEventListener('click', () => {
  const name = document.getElementById('new-folder-name').value.trim();
  if (!name) return;
  closeModal('modal-folder');
  document.getElementById('new-folder-name').value = '';
});
document.getElementById('btn-add-quiz-here').addEventListener('click', () => showView('create'));

// ── ADD QUESTION TO EXISTING QUIZ (from quiz-slip) ──────────
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn-add-question');
  if (!btn) return;

  const title = btn.dataset.quizTitle;
  showView('create');

  // Pre-select the quiz in "Add to Existing Quiz?" dropdown
  const select = document.getElementById('select-existing-quiz');
  if (select) {
    const quizId = btn.dataset.quizId;
    if (quizId && Array.from(select.options).some(o => o.value === quizId)) {
      select.value = quizId;
    } else {
      const opt = Array.from(select.options).find(o => o.textContent.trim() === title);
      if (opt) select.value = opt.value;
    }
  }

  // Pre-fill title field to match (kept for "create as new" fallback)
  const titleInput = document.getElementById('input-quiz-title');
  if (titleInput) titleInput.value = title;

  // Focus the JSON paste area for the new question(s)
  document.getElementById('json-paste-area')?.focus();
});

// ── SHARE QUIZ MODAL ───────────────────────────────────────
function getQuizTotalFromSlip(btn) {
  const slip = btn.closest('.quiz-slip');
  const metaText = slip?.querySelector('.quiz-slip-meta span')?.textContent || '';
  const n = parseInt(metaText, 10);
  return isNaN(n) ? 25 : n;
}

function initShareSelection(total) {
  document.getElementById('share-quiz-total').textContent = total;
  document.getElementById('share-all-count').textContent = total;

  const from = document.getElementById('share-range-from');
  const to   = document.getElementById('share-range-to');
  from.max = total; to.max = total;
  from.value = 1;
  to.value = Math.min(30, total);
  updateShareRangeCount(total);

  const randomCount = document.getElementById('share-random-count');
  randomCount.max = total;
  randomCount.value = Math.min(30, total);

  // reset to "Full Quiz" tab
  document.querySelectorAll('#share-select-mode [data-share-select-mode]').forEach(b => b.classList.remove('active'));
  document.querySelector('#share-select-mode [data-share-select-mode="all"]').classList.add('active');
  document.querySelectorAll('[data-share-select-pane]').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-share-select-pane="all"]').classList.add('active');
}

function updateShareRangeCount(total) {
  const from = document.getElementById('share-range-from');
  const to   = document.getElementById('share-range-to');
  let f = Math.min(Math.max(1, parseInt(from.value)||1), total);
  let t = Math.min(Math.max(f, parseInt(to.value)||total), total);
  from.value = f; to.value = t;
  document.getElementById('share-range-count').textContent = t - f + 1;
}

document.querySelectorAll('#share-range-from, #share-range-to').forEach(inp =>
  inp.addEventListener('change', () => {
    const total = parseInt(document.getElementById('share-quiz-total').textContent, 10) || 25;
    updateShareRangeCount(total);
  }));

document.querySelectorAll('#share-select-mode [data-share-select-mode]').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('#share-select-mode [data-share-select-mode]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('[data-share-select-pane]').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector('[data-share-select-pane="' + btn.dataset.shareSelectMode + '"]')?.classList.add('active');
  }));

document.querySelectorAll('.btn-share-quiz').forEach(btn =>
  btn.addEventListener('click', () => {
    initShareSelection(getQuizTotalFromSlip(btn));
    openModal('modal-share');
  }));
document.getElementById('btn-close-share').addEventListener('click', () => closeModal('modal-share'));

// share modal tabs
document.querySelectorAll('.share-tabs .tab-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    btn.closest('.share-tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.share-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector('.share-pane[data-share-pane="' + btn.dataset.shareTab + '"]')?.classList.add('active');
  }));

document.getElementById('btn-copy-link').addEventListener('click', () => {
  const v = document.getElementById('share-link-input').value;
  navigator.clipboard.writeText(v).catch(() => {});
});

// ── SHARE CHAPTER MODAL ────────────────────────────────────
// btn-share-chapter wired in app.js with real data
document.getElementById('btn-close-share-chapter').addEventListener('click', () => closeModal('modal-share-chapter'));

document.querySelectorAll('[data-share-chapter-tab]').forEach(btn =>
  btn.addEventListener('click', () => {
    btn.closest('.share-tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('[data-chapter-pane]').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector('[data-chapter-pane="' + btn.dataset.shareChapterTab + '"]')?.classList.add('active');
  }));

// btn-copy-chapter-link wired in app.js with real data

// ── LEADERBOARD MODAL ──────────────────────────────────────
document.querySelectorAll('.btn-leaderboard').forEach(btn =>
  btn.addEventListener('click', () => openModal('modal-leaderboard')));
document.getElementById('btn-close-leaderboard').addEventListener('click', () => closeModal('modal-leaderboard'));

// ── STUDY GROUP MODAL ──────────────────────────────────────
document.getElementById('btn-new-group').addEventListener('click',    () => openModal('modal-group'));
document.getElementById('btn-cancel-group').addEventListener('click', () => closeModal('modal-group'));
document.getElementById('btn-create-group').addEventListener('click', () => {
  const name = document.getElementById('new-group-name').value.trim();
  if (!name) return;
  closeModal('modal-group');
  document.getElementById('new-group-name').value = '';
});
document.querySelectorAll('.btn-share-to-friend, .btn-share-to-group').forEach(btn =>
  btn.addEventListener('click', () => { initShareSelection(getQuizTotalFromSlip(btn)); openModal('modal-share'); }));

// ── SAVE/IMPORT CHAPTER TO FOLDER MODAL (inbox) ────────────
function openSaveToFolder() {
  document.getElementById('save-modal-title').textContent = 'Import Chapter to My Library';
  document.getElementById('save-modal-desc').textContent =
    'All quizzes in this chapter will be added as notes to the folder you choose — just like importing a shared chapter.';
  openModal('modal-save-to-folder');
}

document.querySelectorAll('.btn-save-chapter-to-folder').forEach(btn =>
  btn.addEventListener('click', () => openSaveToFolder()));
document.getElementById('btn-cancel-save-folder').addEventListener('click', () => closeModal('modal-save-to-folder'));
document.getElementById('btn-confirm-save-folder').addEventListener('click', () => closeModal('modal-save-to-folder'));

document.querySelectorAll('[name="save-folder"]').forEach(radio =>
  radio.addEventListener('change', () => {
    document.getElementById('save-new-folder-name').style.display =
      radio.value === 'new' ? 'block' : 'none';
    document.getElementById('save-folder-select').style.display =
      radio.value === 'new' ? 'none' : '';
  }));

// ── INBOX ──────────────────────────────────────────────────
document.querySelectorAll('[data-inbox-filter]').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-inbox-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.inboxFilter;
    document.querySelectorAll('.inbox-item').forEach(item =>
      item.style.display = (f === 'all' || item.classList.contains('inbox-item--' + f)) ? '' : 'none');
  }));

document.querySelectorAll('.btn-inbox-dismiss').forEach(btn =>
  btn.addEventListener('click', () => {
    const item = btn.closest('.inbox-item');
    item.style.cssText = 'opacity:0; transition:opacity 0.25s ease';
    setTimeout(() => {
      item.remove();
      if (!document.querySelector('.inbox-item'))
        document.getElementById('inbox-empty').style.display = 'block';
      const badge = document.getElementById('inbox-badge');
      if (badge) badge.textContent = Math.max(0, parseInt(badge.textContent || '0') - 1);
    }, 250);
  }));

// ── OPEN QUIZ SETUP (unified for Start Quiz / Accept Challenge) ─────
function openQuizSetup(challengeInfo, lockSelection) {
  const note = document.getElementById('setup-challenge-note');
  if (challengeInfo) {
    document.getElementById('setup-challenge-from').textContent = challengeInfo.from;
    document.getElementById('setup-challenge-score').textContent = challengeInfo.score;
    note.style.display = 'block';
  } else {
    note.style.display = 'none';
  }

  const qsBlock = document.getElementById('question-selection-block');
  const timerBlock = document.getElementById('timer-setup-block');
  if (lockSelection) {
    // Shared/challenge quiz: force full subset, no range/random re-selection
    const rFrom = document.getElementById('range-from');
    const rTo   = document.getElementById('range-to');
    const rCount = document.getElementById('range-count');
    if (rFrom && rTo) {
      rFrom.value = 1;
      rTo.value = activeQuizQuestions.length;
      rFrom.dispatchEvent(new Event('change'));
      rTo.dispatchEvent(new Event('change'));
    }
    if (rCount) rCount.textContent = activeQuizQuestions.length;
    if (qsBlock) qsBlock.style.display = 'none';
    if (timerBlock) timerBlock.style.display = 'none';
  } else {
    if (qsBlock) qsBlock.style.display = '';
    if (timerBlock) timerBlock.style.display = '';
  }

  showView('quiz-setup');
}

document.querySelectorAll('.btn-accept-quiz').forEach(btn =>
  btn.addEventListener('click', () => {
    const item = btn.closest('.inbox-item');
    const isChallenge = item?.classList.contains('inbox-item--challenge');
    if (isChallenge) {
      const from = item.querySelector('.inbox-sender strong')?.textContent || 'A friend';
      const scoreMatch = item.querySelector('.score-highlight')?.textContent || '';
      openQuizSetup({ from, score: scoreMatch });
    } else {
      openQuizSetup(null);
    }
  }));

// ── CREATE / IMPORT JSON ───────────────────────────────────
document.querySelectorAll('.import-tabs .tab-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    btn.closest('.card').querySelectorAll('.import-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.closest('.card').querySelectorAll('.import-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.closest('.card').querySelector('.import-pane[data-import-pane="' + btn.dataset.importTab + '"]')?.classList.add('active');
  }));

document.getElementById('json-file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('file-name-display').textContent = file.name;
  const fr = new FileReader();
  fr.onload = ev => document.getElementById('json-paste-area').value = ev.target.result;
  fr.readAsText(file);
});

function parseQuestionJSON() {
  const raw = document.getElementById('json-paste-area').value.trim();
  const statusEl = document.getElementById('import-status');
  if (!raw) { statusEl.textContent = 'Paste or upload JSON first.'; statusEl.className = 'import-status error'; return null; }
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('JSON must be an array.');
    data.forEach((q, i) => {
      if (!q.question || !Array.isArray(q.options) || typeof q.correctIndex !== 'number')
        throw new Error('Question ' + (i+1) + ' missing required fields.');
      if (!q.id) q.id = 'q' + (i+1);
    });
    statusEl.textContent = '✓ ' + data.length + ' questions parsed.';
    statusEl.className = 'import-status success';
    return data;
  } catch(err) {
    statusEl.textContent = '✗ ' + err.message;
    statusEl.className = 'import-status error';
    return null;
  }
}

document.getElementById('btn-preview-json').addEventListener('click', parseQuestionJSON);
document.getElementById('btn-save-quiz').addEventListener('click', () => {
  const title = document.getElementById('input-quiz-title').value.trim();
  const questions = parseQuestionJSON();
  if (!title || !questions) return;

  const existingQuiz = document.getElementById('select-existing-quiz')?.value || '';
  const insertIndexRaw = document.getElementById('insert-index')?.value;
  const insertIndex = parseInt(insertIndexRaw, 10);

  if (existingQuiz) {
    // Adding question(s) to an existing quiz at a given position (1-based) or appended
    const pos = (!isNaN(insertIndex) && insertIndex > 0) ? insertIndex : 'end';
    console.log(`Adding ${questions.length} question(s) to "${existingQuiz}" at position: ${pos}`);
  } else {
    console.log(`Creating new quiz "${title}" with ${questions.length} question(s)`);
  }

  showView('folder');
});

// ── AI PROMPT COPY ─────────────────────────────────────────
document.getElementById('btn-copy-prompt').addEventListener('click', () => {
  const text = document.getElementById('ai-prompt-text').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy-prompt');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  });
});

// ── BACKUP ─────────────────────────────────────────────────
document.querySelectorAll('[data-backup-tab]').forEach(btn =>
  btn.addEventListener('click', () => {
    btn.closest('.card').querySelectorAll('[data-backup-tab]').forEach(b => b.classList.remove('active'));
    btn.closest('.card').querySelectorAll('[data-backup-pane]').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector('[data-backup-pane="' + btn.dataset.backupTab + '"]')?.classList.add('active');
  }));

document.getElementById('restore-file-input').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const fr = new FileReader();
  fr.onload = ev => document.getElementById('restore-paste-area').value = ev.target.result;
  fr.readAsText(file);
});

document.getElementById('btn-export-all').addEventListener('click', () => {
  // Real export data will be injected by app.js (fetch from Supabase before downloading)
  console.warn('btn-export-all: wire up real data export in app.js');
});

document.getElementById('btn-do-restore').addEventListener('click', () => {
  const raw = document.getElementById('restore-paste-area').value.trim();
  if (!raw) return alert('Paste or upload a backup JSON first.');
  try { JSON.parse(raw); alert('✓ Valid JSON. (Restore wiring comes with backend.)'); }
  catch { alert('✗ Invalid JSON — check your backup file.'); }
});

// ── QUIZ SETUP ─────────────────────────────────────────────
let timerMode = 'none';
let timerInterval = null;
let timeRemaining = 0;

document.querySelectorAll('[data-select-mode]').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-select-mode]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('[data-select-pane]').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector('[data-select-pane="' + btn.dataset.selectMode + '"]')?.classList.add('active');
  }));

document.querySelectorAll('[data-timer-mode]').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-timer-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    timerMode = btn.dataset.timerMode;
    document.querySelectorAll('[data-timer-pane]').forEach(p => p.hidden = true);
    document.querySelectorAll('[data-timer-help]').forEach(p => p.hidden = true);
    if (timerMode === 'none') document.querySelector('[data-timer-help="none"]').hidden = false;
    else document.querySelector('[data-timer-pane="' + timerMode + '"]').hidden = false;
  }));

document.querySelectorAll('[data-timer-help]').forEach(el => { if (el.dataset.timerHelp !== 'none') el.hidden = true; });

const rangeFrom = document.getElementById('range-from');
const rangeTo   = document.getElementById('range-to');
const rangeCount = document.getElementById('range-count');

function updateRangeCount() {
  const max  = parseInt(document.getElementById('setup-quiz-total').textContent, 10) || 1;
  let from   = Math.min(Math.max(1, parseInt(rangeFrom.value)||1), max);
  let to     = Math.min(Math.max(from, parseInt(rangeTo.value)||max), max);
  rangeFrom.value = from; rangeTo.value = to;
  rangeCount.textContent = to - from + 1;
}
[rangeFrom, rangeTo].forEach(inp => inp.addEventListener('change', updateRangeCount));
updateRangeCount();

document.querySelectorAll('.preset-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const max = parseInt(document.getElementById('setup-quiz-total').textContent,10)||1;
    const p = btn.dataset.preset;
    if (p==='all')      { rangeFrom.value=1; rangeTo.value=max; }
    if (p==='first10')  { rangeFrom.value=1; rangeTo.value=Math.min(10,max); }
    if (p==='last10')   { rangeFrom.value=Math.max(1,max-9); rangeTo.value=max; }
    if (p==='random10') { rangeFrom.value=1; rangeTo.value=Math.min(10,max); document.getElementById('toggle-shuffle-q').checked=true; }
    updateRangeCount();
  }));

document.querySelectorAll('.btn-start-quiz').forEach(btn =>
  btn.addEventListener('click', () => openQuizSetup(null)));

document.querySelectorAll('.btn-flashcard-quiz').forEach(btn =>
  btn.addEventListener('click', () => showView('flashcards')));

// ── QUIZ STATE (in-memory, per-question status for navigator) ──────
let quizState = [];     // [{ answered: bool, marked: bool, optionIndex: number|null }]
let currentQ  = 0;

function buildQuizState() {
  const total = parseInt(document.getElementById('setup-quiz-total').textContent, 10) || 25;
  quizState = Array.from({ length: total }, () => ({ answered: false, marked: false, optionIndex: null }));
  currentQ = 0;
}

document.getElementById('btn-begin-quiz').addEventListener('click', () => {
  buildQuizState();
  showView('quiz-player');
  startTimer();
  renderPlayer();
});

function renderPlayer() {
  // If app.js has installed a real-data renderer, delegate to it.
  if (window.renderPlayer !== renderPlayer && typeof window.renderPlayer === 'function') {
    window.renderPlayer();
    return;
  }
  const total = quizState.length || 1;
  document.getElementById('player-q-current').textContent = currentQ + 1;
  document.getElementById('player-q-total').textContent = total;
  document.getElementById('question-tag').textContent = 'Question ' + (currentQ + 1);
  document.getElementById('progress-fill').style.width = (((currentQ + 1) / total) * 100) + '%';

  // restore selected option + review state for this question (demo: single shared question card)
  const state = quizState[currentQ];
  document.querySelectorAll('.option-item').forEach((o, i) => {
    o.classList.toggle('selected', state.optionIndex === i);
  });
  document.getElementById('btn-q-review').classList.toggle('active', state.marked);

  // prev/next button availability
  document.getElementById('btn-prev-q').disabled = currentQ === 0;
  document.getElementById('btn-next-q').textContent = (currentQ === total - 1) ? 'Finish ✓' : 'Next →';
}
window.renderPlayer = renderPlayer; // expose so app.js can override with real questions

window.goToQuestion = goToQuestion;
function goToQuestion(index) {
  if (window.goToQuestion !== goToQuestion && typeof window.goToQuestion === 'function') {
    window.goToQuestion(index);
    return;
  }
  if (index < 0 || index >= quizState.length) return;
  currentQ = index;
  renderPlayer();
}

document.getElementById('btn-prev-q').addEventListener('click', () => goToQuestion(currentQ - 1));
document.getElementById('btn-next-q').addEventListener('click', () => {
  if (currentQ === quizState.length - 1) {
    openEndQuizConfirm();
  } else {
    goToQuestion(currentQ + 1);
  }
});

function startTimer() {
  const box = document.getElementById('player-timer');
  if (timerMode === 'none') { box.style.display = 'none'; return; }
  timeRemaining = (parseInt(document.getElementById('timer-minutes').value)||0)*60
                + (parseInt(document.getElementById('timer-seconds').value)||0);
  box.style.display = 'flex';
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();
    if (timeRemaining <= 10) box.classList.add('timer-low');
    if (timeRemaining <= 0) { stopTimer(); showView('result'); }
  }, 1000);
}
function stopTimer()  { clearInterval(timerInterval); document.getElementById('player-timer').classList.remove('timer-low'); }
function updateTimerDisplay() {
  const m = Math.floor(timeRemaining/60), s = timeRemaining%60;
  document.getElementById('timer-display').textContent = String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

// ── QUESTION NAVIGATOR MODAL ────────────────────────────────
function renderNavigator() {
  const grid = document.getElementById('nav-grid');
  grid.innerHTML = '';
  let answeredCount = 0, markedCount = 0;
  quizState.forEach((q, i) => {
    if (q.answered) answeredCount++;
    if (q.marked) markedCount++;
    const btn = document.createElement('button');
    btn.className = 'nav-grid-btn';
    if (q.answered) btn.classList.add('nav-grid-btn--answered');
    if (q.marked)   btn.classList.add('nav-grid-btn--review');
    if (i === currentQ) btn.classList.add('nav-grid-btn--current');
    btn.textContent = i + 1;
    btn.title = 'Question ' + (i + 1) + (q.marked ? ' · Marked for review' : '') + (q.answered ? ' · Answered' : ' · Not answered');
    btn.addEventListener('click', () => {
      goToQuestion(i);
      closeModal('modal-navigator');
    });
    grid.appendChild(btn);
  });
  const total = quizState.length;
  document.getElementById('nav-summary').innerHTML =
    '<span><strong>' + answeredCount + '</strong> / ' + total + ' Answered</span>' +
    '<span><strong>' + (total - answeredCount) + '</strong> Not Answered</span>' +
    '<span><strong>' + markedCount + '</strong> Marked for Review</span>';
}

document.getElementById('btn-open-navigator').addEventListener('click', () => {
  renderNavigator();
  openModal('modal-navigator');
});
document.getElementById('btn-close-navigator').addEventListener('click', () => closeModal('modal-navigator'));

// ── END QUIZ CONFIRM ─────────────────────────────────────────
function openEndQuizConfirm() {
  const unanswered = quizState.filter(q => !q.answered).length;
  if (unanswered === 0) {
    stopTimer();
    showView('result');
    return;
  }
  document.getElementById('end-quiz-unanswered-count').textContent = unanswered;
  openModal('modal-end-quiz');
}

document.getElementById('btn-end-quiz').addEventListener('click', openEndQuizConfirm);
document.getElementById('btn-cancel-end-quiz').addEventListener('click', () => closeModal('modal-end-quiz'));
document.getElementById('btn-confirm-end-quiz').addEventListener('click', () => {
  closeModal('modal-end-quiz');
  stopTimer();
  showView('result');
});

// ── QUIZ PLAYER ────────────────────────────────────────────
document.querySelectorAll('.option-item').forEach((item, i) =>
  item.addEventListener('click', () => {
    document.querySelectorAll('.option-item').forEach(o => o.classList.remove('selected'));
    item.classList.add('selected');
    if (quizState[currentQ]) {
      quizState[currentQ].answered = true;
      quizState[currentQ].optionIndex = i;
    }
  }));

document.getElementById('btn-q-review').addEventListener('click', e => {
  if (!quizState[currentQ]) return;
  quizState[currentQ].marked = !quizState[currentQ].marked;
  e.currentTarget.classList.toggle('active', quizState[currentQ].marked);
});

document.getElementById('btn-q-search').addEventListener('click', () =>
  window.open('https://www.google.com/search?q='+encodeURIComponent(document.getElementById('question-text').textContent),'_blank'));
document.getElementById('btn-q-bookmark').addEventListener('click', e => e.currentTarget.classList.toggle('bookmarked'));
document.getElementById('btn-q-edit').addEventListener('click', () => {});
document.getElementById('btn-q-delete').addEventListener('click', () => {});

// ── RESULT ─────────────────────────────────────────────────
document.getElementById('btn-result-done').addEventListener('click', () => showView('folder'));
document.getElementById('btn-result-flashcards').addEventListener('click', () => showView('flashcards'));

// ── FLASHCARDS ─────────────────────────────────────────────
document.querySelectorAll('#flash-grid .flash-card, #bookmark-grid .flash-card').forEach(card => {
  card.addEventListener('click', e => {
    if (e.target.closest('.icon-btn')) return;
    card.classList.toggle('flipped');
  });
  const q = card.querySelector('.flash-question')?.textContent || '';
  card.querySelectorAll('.flash-actions').forEach(actions => {
    const btns = actions.querySelectorAll('.icon-btn');
    btns[0]?.addEventListener('click', e => { e.stopPropagation(); window.open('https://www.google.com/search?q='+encodeURIComponent(q),'_blank'); });
    btns[1]?.addEventListener('click', e => {
      e.stopPropagation();
      const on = btns[1].classList.toggle('bookmarked');
      card.querySelectorAll('.flash-actions .icon-btn:nth-child(2)').forEach(b => b.classList.toggle('bookmarked', on));
    });
    btns[2]?.addEventListener('click', e => e.stopPropagation());
    btns[3]?.addEventListener('click', e => e.stopPropagation());
  });
});

document.getElementById('btn-flash-flip-all').addEventListener('click', () => {
  const cards = document.querySelectorAll('#flash-grid .flash-card');
  const anyUnflipped = [...cards].some(c => !c.classList.contains('flipped'));
  cards.forEach(c => c.classList.toggle('flipped', anyUnflipped));
});

document.getElementById('btn-flash-shuffle').addEventListener('click', () => {
  const grid = document.getElementById('flash-grid');
  const cards = [...grid.children];
  cards.forEach(c => c.classList.remove('flipped'));
  for (let i = cards.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [cards[i],cards[j]] = [cards[j],cards[i]];
  }
  cards.forEach(c => grid.appendChild(c));
});

// ── FRIEND SEARCH DROPDOWN ─────────────────────────────────
const friendInput   = document.getElementById('friend-search-input');
const friendResults = document.getElementById('friend-search-results');
friendInput.addEventListener('focus', () => friendResults.style.display = 'block');
friendInput.addEventListener('blur',  () => setTimeout(() => friendResults.style.display = '', 200));
// ── PROFILE: PUBLIC / PRIVATE TOGGLE ────────────────────────
const profileToggle = document.getElementById('toggle-profile-public');
function applyProfileVisibility() {
  const isPublic = profileToggle.checked;
  document.getElementById('profile-visibility-label').textContent = isPublic ? 'Public Profile' : 'Private Profile';
  document.getElementById('profile-visibility-desc').textContent = isPublic
    ? 'Friends can see your activity & stats'
    : 'Your activity & stats are hidden from everyone';
  document.getElementById('profile-private-note').style.display = isPublic ? 'none' : 'block';

  const libSection = document.getElementById('public-library-section');
  if (libSection) libSection.style.display = isPublic ? '' : 'none';
}
profileToggle.addEventListener('change', applyProfileVisibility);
applyProfileVisibility();

// ── PROFILE: ACTIVITY CALENDAR (GitHub-style heatmap) ──────
function buildActivityCalendar(gridId, monthsId) {
  const grid   = document.getElementById(gridId || 'contribution-grid');
  const months = document.getElementById(monthsId || 'contribution-months');
  if (!grid) return;
  grid.innerHTML = '';
  months.innerHTML = '';

  const WEEKS = 14;
  const today = new Date();

  // find most recent Sunday (end of current week column), then go back WEEKS*7 days
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (6 - ((today.getDay() + 6) % 7))); // upcoming/current Sunday (week ends Sun, Mon-start)
  const totalDays = WEEKS * 7;
  const startDate = new Date(endOfWeek);
  startDate.setDate(endOfWeek.getDate() - totalDays + 1);

  let lastMonth = -1;

  for (let col = 0; col < WEEKS; col++) {
    const colStartDate = new Date(startDate);
    colStartDate.setDate(startDate.getDate() + col * 7);

    // month label: show if this column's first day starts a new month
    const label = document.createElement('span');
    if (colStartDate.getMonth() !== lastMonth) {
      label.textContent = colStartDate.toLocaleDateString('en-IN', { month: 'short' });
      lastMonth = colStartDate.getMonth();
    }
    months.appendChild(label);

    for (let row = 0; row < 7; row++) {
      const dayIndex = col * 7 + row;
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + dayIndex);

      const cell = document.createElement('span');
      cell.className = 'contribution-cell';

      if (date > today) {
        cell.dataset.level = '0';
        cell.style.visibility = 'hidden';
      } else {
        // Real data will be populated by app.js via Supabase
        cell.dataset.level = '0';
        cell.dataset.date = date.toISOString().slice(0, 10);
        cell.title = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      }

      grid.appendChild(cell);
    }
  }
}

// build once now, and rebuild whenever profile view opens
buildActivityCalendar();
document.querySelectorAll('.nav-link[data-view="profile"], #user-badge-link').forEach(el =>
  el.addEventListener('click', buildActivityCalendar));

// ── FOLDER / QUIZ VISIBILITY TOGGLE (Public Library) ────────
document.querySelectorAll('.btn-toggle-visibility').forEach(btn =>
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const card  = btn.closest('.folder-card, .quiz-slip');
    const badge = card.querySelector('[data-visibility-badge]');
    const isPublic = badge.classList.toggle('visibility-badge--public');
    badge.textContent = isPublic ? '🌐 Public' : '🔒 Private';
    btn.textContent   = isPublic ? '🔒 Make Private' : '🌐 Make Public';
  }));

// ── PUBLIC LIBRARY (build from items marked Public) ─────────
let likeCounts = {}; // id -> count, in-memory demo

function buildPublicLibrary() {
  const grid  = document.getElementById('public-library-grid');
  const empty = document.getElementById('public-library-empty');
  if (!grid) return;
  grid.innerHTML = '';

  const items = [];

  // Folders marked public
  document.querySelectorAll('.folder-card:not(.folder-card--add)').forEach((card, i) => {
    const badge = card.querySelector('[data-visibility-badge]');
    if (badge && badge.classList.contains('visibility-badge--public')) {
      items.push({
        id: 'folder-' + i,
        type: '📁 Folder',
        title: card.querySelector('h3')?.textContent.trim() || 'Folder',
        meta: card.querySelector('.folder-count')?.textContent.trim() || ''
      });
    }
  });

  // Quizzes marked public
  document.querySelectorAll('.quiz-slip').forEach((card, i) => {
    const badge = card.querySelector('[data-visibility-badge]');
    if (badge && badge.classList.contains('visibility-badge--public')) {
      items.push({
        id: 'quiz-' + i,
        type: '📝 Quiz',
        title: card.querySelector('h3')?.textContent.trim() || 'Quiz',
        meta: card.querySelector('.quiz-slip-meta span')?.textContent.trim() || ''
      });
    }
  });

  if (items.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  items.forEach(item => {
    if (!(item.id in likeCounts)) likeCounts[item.id] = 0;

    const el = document.createElement('article');
    el.className = 'public-lib-card';
    el.innerHTML =
      '<div class="public-lib-card-top">' +
        '<span class="public-lib-type">' + item.type + '</span>' +
        '<span class="visibility-badge visibility-badge--public">🌐 Public</span>' +
      '</div>' +
      '<h4>' + item.title + '</h4>' +
      '<span class="public-lib-owner">👤 You · ' + item.meta + '</span>' +
      '<div class="public-lib-actions">' +
        '<button class="btn-like" data-id="' + item.id + '">❤ <span class="like-count">' + likeCounts[item.id] + '</span></button>' +
        '<button class="btn btn--primary btn--small btn-import-public" data-id="' + item.id + '">⬇ Import</button>' +
      '</div>';
    grid.appendChild(el);
  });

  // wire like buttons
  grid.querySelectorAll('.btn-like').forEach(btn =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const liked = btn.classList.toggle('liked');
      likeCounts[id] += liked ? 1 : -1;
      btn.querySelector('.like-count').textContent = likeCounts[id];
    }));

  // wire import buttons → reuse save-to-folder modal
  grid.querySelectorAll('.btn-import-public').forEach(btn =>
    btn.addEventListener('click', () => {
      document.getElementById('save-modal-title').textContent = 'Import to My Library';
      document.getElementById('save-modal-desc').textContent =
        'This will add a copy to one of your folders. The original stays with the owner.';
      openModal('modal-save-to-folder');
    }));
}

// rebuild whenever a visibility toggle changes, or profile opens
document.querySelectorAll('.btn-toggle-visibility').forEach(btn =>
  btn.addEventListener('click', () => setTimeout(buildPublicLibrary, 0)));
document.querySelectorAll('.nav-link[data-view="profile"], #user-badge-link').forEach(el =>
  el.addEventListener('click', buildPublicLibrary));

buildPublicLibrary();

// ── GLOBAL SEARCH (users, folders, quizzes) ─────────────────
const globalSearchInput   = document.getElementById('global-search-input');
const globalSearchResults = document.getElementById('global-search-results');

const SEARCH_USERS = [];

const SEARCH_PUBLIC_ITEMS = [];

function getMyFoldersForSearch() {
  return [...document.querySelectorAll('.folder-card:not(.folder-card--add)')].map(card => ({
    type: '📁 Folder',
    title: card.querySelector('h3')?.textContent.trim() || 'Folder',
    owner: 'You',
    meta: card.querySelector('.folder-count')?.textContent.trim() || ''
  }));
}

function getMyQuizzesForSearch() {
  return [...document.querySelectorAll('.quiz-slip')].map(card => ({
    type: '📝 Quiz',
    title: card.querySelector('h3')?.textContent.trim() || 'Quiz',
    owner: 'You',
    meta: card.querySelector('.quiz-slip-meta span')?.textContent.trim() || ''
  }));
}

function renderGlobalSearchResults(query) {
  const q = query.trim().toLowerCase();
  globalSearchResults.innerHTML = '';

  if (!q) {
    globalSearchResults.innerHTML = '<div class="global-search-empty">Type a name, @username, roll no., or quiz/folder title…</div>';
    return;
  }

  const userMatches = SEARCH_USERS.filter(u =>
    u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q) || u.rollno.toLowerCase().includes(q));

  const itemMatches = [...getMyFoldersForSearch(), ...getMyQuizzesForSearch(), ...SEARCH_PUBLIC_ITEMS]
    .filter(it => it.title.toLowerCase().includes(q));

  if (userMatches.length === 0 && itemMatches.length === 0) {
    globalSearchResults.innerHTML = '<div class="global-search-empty">No matches found.</div>';
    return;
  }

  if (userMatches.length) {
    const label = document.createElement('div');
    label.className = 'global-search-group-label';
    label.textContent = 'Users';
    globalSearchResults.appendChild(label);

    userMatches.forEach(u => {
      const row = document.createElement('div');
      row.className = 'global-search-item';
      row.innerHTML =
        '<div class="global-search-item-left">' +
          '<div class="friend-avatar friend-avatar--sm">' + u.avatar + '</div>' +
          '<div class="global-search-item-text"><strong>' + u.name + '</strong><span>' + u.handle + ' · ' + u.rollno + '</span></div>' +
        '</div>' +
        '<span class="global-search-item-tag">View Profile</span>';
      row.addEventListener('click', () => {
        globalSearchInput.value = '';
        globalSearchInput.blur();
        showView('friends');
      });
      globalSearchResults.appendChild(row);
    });
  }

  if (itemMatches.length) {
    const label = document.createElement('div');
    label.className = 'global-search-group-label';
    label.textContent = 'Folders & Quizzes';
    globalSearchResults.appendChild(label);

    itemMatches.forEach(it => {
      const row = document.createElement('div');
      row.className = 'global-search-item';
      row.innerHTML =
        '<div class="global-search-item-left">' +
          '<div class="global-search-item-text"><strong>' + it.title + '</strong><span>' + it.type + ' · ' + it.owner + ' · ' + it.meta + '</span></div>' +
        '</div>' +
        '<span class="global-search-item-tag">' + (it.owner === 'You' ? 'Open' : 'View') + '</span>';
      row.addEventListener('click', () => {
        globalSearchInput.value = '';
        globalSearchInput.blur();
        if (it.owner === 'You') {
          showView(it.type.includes('Folder') ? 'dashboard' : 'folder');
        } else {
          showView('profile'); // demo: jump to profile/public-library context
        }
      });
      globalSearchResults.appendChild(row);
    });
  }
}

globalSearchInput.addEventListener('input', () => renderGlobalSearchResults(globalSearchInput.value));
globalSearchInput.addEventListener('focus', () => renderGlobalSearchResults(globalSearchInput.value));
// ── PIN FEATURE ────────────────────────────────────────────
// ── PIN FEATURE — Quick Access Strip ───────────────────────
const pinnedItems = new Map(); // key: "type-id" → {type, id, name, meta}

function syncPinnedStrip() {
  const strip = document.getElementById('pinned-strip');
  const wrap  = document.getElementById('pinned-strip-wrap');
  const emptyEl = document.getElementById('pin-strip-empty');
  if (!strip || !wrap) return;

  // Remove existing chips (keep empty state node)
  strip.querySelectorAll('.pin-chip').forEach(c => c.remove());

  if (pinnedItems.size === 0) {
    wrap.classList.remove('has-pins');
    return;
  }
  wrap.classList.add('has-pins');

  pinnedItems.forEach((item, key) => {
    const chip = document.createElement('div');
    chip.className = `pin-chip pin-chip--${item.type}`;
    chip.dataset.key = key;
    chip.setAttribute('role', 'button');
    chip.tabIndex = 0;
    chip.innerHTML = `
      <span class="pin-chip-icon">${item.type === 'folder' ? '📁' : '📝'}</span>
      <div class="pin-chip-info">
        <span class="pin-chip-name">${item.name}</span>
        <span class="pin-chip-meta">${item.meta}</span>
      </div>
      <span class="pin-chip-remove" role="button" tabindex="0" aria-label="Unpin">✕</span>
    `;
    // Click chip body → navigate
    chip.addEventListener('click', e => {
      if (e.target.closest('.pin-chip-remove')) return;
      showView(item.type === 'folder' ? 'folder' : 'folder');
    });
    // Remove chip
    chip.querySelector('.pin-chip-remove').addEventListener('click', e => {
      e.stopPropagation();
      unpinItem(item.type, item.id);
    });
    strip.insertBefore(chip, emptyEl);
  });
}

function pinItem(type, id, name, meta) {
  const key = `${type}-${id}`;
  pinnedItems.set(key, { type, id, name, meta });
  syncPinnedStrip();
}

function unpinItem(type, id) {
  const key = `${type}-${id}`;
  pinnedItems.delete(key);
  syncPinnedStrip();
  // Update the source btn-pin button's visual state
  const srcBtn = document.querySelector(`.btn-pin[data-item-type="${type}"][data-item-id="${id}"]`);
  if (srcBtn) {
    srcBtn.classList.remove('active');
    srcBtn.title = `Pin ${type}`;
  }
}

// Init: SSC CGL is already shown as pinned in the sample UI
// Demo pin disabled; real pins load from Supabase in app.js.

// Delegate pin button clicks — works anywhere in the document
document.addEventListener('click', e => {
  const pinBtn = e.target.closest('.btn-pin');
  if (!pinBtn) return;
  e.stopPropagation();

  const type   = pinBtn.dataset.itemType;
  const id     = pinBtn.dataset.itemId;
  const name   = pinBtn.dataset.itemName;
  const meta   = pinBtn.dataset.itemMeta;
  if (!type || !id) return;

  const isPinned = pinBtn.classList.toggle('active');
  pinBtn.title = isPinned ? `Unpin ${type}` : `Pin ${type}`;

  if (isPinned) {
    pinItem(type, id, name, meta);
    // Visual accent on quiz slip
    const slip = pinBtn.closest('.quiz-slip');
    if (slip) slip.classList.add('quiz-slip--pinned');
  } else {
    unpinItem(type, id);
    const slip = pinBtn.closest('.quiz-slip');
    if (slip) slip.classList.remove('quiz-slip--pinned');
  }
});

// ── DAILY NOTES ────────────────────────────────────────────
// Set today's date in composer
(function setTodayDate() {
  const el = document.getElementById('note-today-date');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
})();

// Tag picker logic
let currentTagType = null; // 'folder' | 'quiz'
const noteTags = []; // { type, id, label }

function renderComposerTags() {
  const row = document.getElementById('note-tag-row');
  if (!row) return;
  row.innerHTML = noteTags.map(t =>
    `<span class="note-tag-chip note-tag-chip--${t.type}" data-tag-remove="${t.id}">
      ${t.type === 'folder' ? '📁' : '📝'} ${t.label} <span style="cursor:pointer;margin-left:3px;">✕</span>
    </span>`
  ).join('');
  row.querySelectorAll('[data-tag-remove]').forEach(chip => {
    chip.addEventListener('click', () => {
      const idx = noteTags.findIndex(t => String(t.id) === chip.dataset.tagRemove);
      if (idx !== -1) noteTags.splice(idx, 1);
      renderComposerTags();
    });
  });
}

function openTagPicker(type) {
  currentTagType = type;
  const picker = document.getElementById('note-tag-picker');
  const label = document.getElementById('note-tag-picker-label');
  const list = document.getElementById('note-tag-picker-list');
  if (!picker) return;
  label.textContent = type === 'folder' ? 'Select a Folder to tag' : 'Select a Quiz to tag';
  // Show/hide options based on type
  list.querySelectorAll('.note-tag-option').forEach(opt => {
    opt.style.display = opt.dataset.tagType === type ? 'flex' : 'none';
    opt.classList.toggle('selected', noteTags.some(t => String(t.id) === opt.dataset.tagId && t.type === type));
  });
  picker.style.display = 'block';
}

document.getElementById('btn-tag-folder')?.addEventListener('click', () => openTagPicker('folder'));
document.getElementById('btn-tag-quiz')?.addEventListener('click', () => openTagPicker('quiz'));
document.getElementById('btn-close-tag-picker')?.addEventListener('click', () => {
  document.getElementById('note-tag-picker').style.display = 'none';
});

document.getElementById('note-tag-picker-list')?.addEventListener('click', e => {
  const opt = e.target.closest('.note-tag-option');
  if (!opt) return;
  const id = opt.dataset.tagId;
  const type = opt.dataset.tagType;
  const label = opt.textContent.trim().replace(/[\r\n]+/g, ' ').split(/\s{2,}/)[0].trim();
  const existing = noteTags.findIndex(t => String(t.id) === id && t.type === type);
  if (existing !== -1) {
    noteTags.splice(existing, 1);
  } else {
    noteTags.push({ id, type, label });
  }
  renderComposerTags();
  document.getElementById('note-tag-picker').style.display = 'none';
});

// Save note
document.getElementById('btn-save-note')?.addEventListener('click', () => {
  const textarea = document.getElementById('note-textarea');
  const body = textarea?.value.trim();
  if (!body) { textarea?.focus(); return; }

  const list = document.getElementById('notes-list');
  const empty = document.getElementById('notes-empty');
  if (empty) empty.style.display = 'none';

  const tagsHtml = noteTags.map(t =>
    `<span class="note-tag-chip note-tag-chip--${t.type}">${t.type === 'folder' ? '📁' : '📝'} ${t.label}</span>`
  ).join('');

  const card = document.createElement('article');
  card.className = 'note-card note-card--today';
  card.innerHTML = `
    <div class="note-card-head">
      <div class="note-card-meta">
        <span class="note-card-day">Today</span>
        <span class="note-card-date">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>
      <div class="note-card-actions">
        <button class="icon-btn" title="Edit note">✏️</button>
        <button class="icon-btn btn-delete-note" title="Delete note">🗑️</button>
      </div>
    </div>
    <p class="note-card-body">${body.replace(/</g,'&lt;')}</p>
    ${tagsHtml ? `<div class="note-card-tags">${tagsHtml}</div>` : ''}
  `;
  card.querySelector('.btn-delete-note')?.addEventListener('click', () => card.remove());
  list.insertBefore(card, list.firstChild);

  // Reset composer
  textarea.value = '';
  noteTags.length = 0;
  renderComposerTags();
});

// Delete existing sample notes
document.querySelectorAll('.btn-delete-note, .note-card-actions .icon-btn:last-child').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.note-card')?.remove());
});

// New note button scrolls to composer
document.getElementById('btn-new-note')?.addEventListener('click', () => {
  document.getElementById('note-composer')?.scrollIntoView({ behavior: 'smooth' });
  document.getElementById('note-textarea')?.focus();
});
