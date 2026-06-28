/* =============================================
   pomodoro.js — Pomodoro Learning Flow for QuizMaster Pro
   Compatible with QM Pro globals: sb, toast, escHtml, quizzesCache, foldersCache
   ============================================= */

// ── Settings & State ─────────────────────────
let pomodoroSettings = {
  questionsPerSection : 15,
  studyTimeMinutes    : 25,
  quizTimeMinutes     : 20,
  breakTimeMinutes    : 5,
  autoAdvance         : true,
  shuffleOptions      : true
};

let pomodoroState = {
  active: false, phase: '',
  currentSection: 0, sections: [], totalSections: 0,
  timerInterval: null, timeLeft: 0, isPaused: false,
  currentQuestions: [], quizResults: [], allIncorrect: []
};

let _pomoScore = 0, _pomoQIndex = 0, _pomoQuiz = [], _pomoIncorrect = [];

// ── Quiz Selector (QM Pro native) ────────────
async function startPomodoro() {
  let allQuizzes = typeof quizzesCache !== 'undefined' ? [...quizzesCache] : [];

  // If cache is empty, fetch all quizzes directly from Supabase using currentUser
  if (!allQuizzes.length && typeof sb !== 'undefined') {
    const uid = typeof currentUser !== 'undefined' ? currentUser?.id : null;
    if (!uid) { toast('Please log in first', 'error'); return; }
    toast('Loading your quizzes…', 'info');
    try {
      const { data, error } = await sb.from('quizzes')
        .select('id, title, folder_id, questions, is_public, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      if (error) throw error;
      allQuizzes = data || [];
    } catch(err) {
      toast('Could not load quizzes: ' + err.message, 'error');
      return;
    }
  }

  // Also fetch folders if not cached
  let allFolders = typeof foldersCache !== 'undefined' ? [...foldersCache] : [];
  if (!allFolders.length && typeof sb !== 'undefined') {
    const uid = typeof currentUser !== 'undefined' ? currentUser?.id : null;
    if (uid) {
      try {
        const { data } = await sb.from('folders')
          .select('id, name')
          .eq('user_id', uid)
          .order('name');
        allFolders = data || [];
      } catch(e) {}
    }
  }

  if (!allQuizzes.length) {
    toast('No quizzes found. Create some quizzes first!', 'error');
    return;
  }

  _showPomodoroQuizPicker(allQuizzes, allFolders);
}

function _showPomodoroQuizPicker(quizzes, folders) {
  document.getElementById('pomoPicker')?.remove();
  const m = document.createElement('div');
  m.id = 'pomoPicker';
  m.className = 'modal active';

  // Group by folder
  const folderMap = {};
  (folders || (typeof foldersCache !== 'undefined' ? foldersCache : [])).forEach(f => {
    folderMap[f.id] = f.name;
  });

  const byFolder = {};
  quizzes.forEach(q => {
    const fname = folderMap[q.folder_id] || 'Uncategorized';
    if (!byFolder[fname]) byFolder[fname] = [];
    byFolder[fname].push(q);
  });

  const optgroups = Object.entries(byFolder).map(([folder, qs]) =>
    `<optgroup label="${escHtml(folder)}">
      ${qs.map(q => `<option value="${q.id}">${escHtml(q.title)} (${q.questions?.length || 0} Qs)</option>`).join('')}
    </optgroup>`
  ).join('');

  m.innerHTML = `
    <div class="modal-card" style="max-width:420px">
      <h3>🍅 Select Quiz for Pomodoro</h3>
      <p style="color:var(--slate);font-size:0.85rem;margin-bottom:1rem">Choose a quiz to study in focused cycles</p>
      <select id="pomoQuizSelect" class="input" style="width:100%;margin-bottom:1.25rem;padding:0.6rem">
        ${optgroups}
      </select>
      <div class="modal-actions">
        <button class="btn btn--ghost" onclick="document.getElementById('pomoPicker')?.remove()">Cancel</button>
        <button class="btn btn--primary" onclick="startPomodoroSetup(document.getElementById('pomoQuizSelect').value)">Next →</button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
}

// ── Setup Modal ───────────────────────────────
function startPomodoroSetup(quizId) {
  document.getElementById('pomoPicker')?.remove();
  if (!quizId) { toast('Select a quiz first', 'error'); return; }

  const allQuizzes = typeof quizzesCache !== 'undefined' ? quizzesCache : [];
  const quiz = allQuizzes.find(q => q.id === quizId);
  if (!quiz || !quiz.questions?.length) { toast('Quiz has no questions', 'error'); return; }

  const total = quiz.questions.length;
  document.getElementById('pomoModal')?.remove();
  const m = document.createElement('div'); m.className = 'modal active'; m.id = 'pomoModal';
  m.innerHTML = `
    <div class="modal-card pomo-setup-dialog" style="max-width:520px">
      <div class="pomo-setup-header">
        <div>
          <div class="pomo-setup-title">🍅 Pomodoro Flow</div>
          <div class="pomo-setup-subtitle">Study → Quiz → Break, section by section</div>
        </div>
        <button class="btn btn--ghost btn--small" onclick="this.closest('.modal').remove()">✕</button>
      </div>
      <div class="pomo-stats-row">
        <div class="pomo-stat-chip">📚 <strong>${total}</strong> questions</div>
        <div class="pomo-stat-chip">📊 Sections: <strong id="estimatedSections">-</strong></div>
        <div class="pomo-stat-chip">⏱ <strong id="totalTimeEstimate">-</strong> total</div>
      </div>
      <div class="pomo-section-block">
        <div class="pomo-section-label">📌 Question Range</div>
        <div class="pomo-range-row">
          <div class="pomo-range-field"><label>From</label>
            <input type="number" id="pomoStart" value="1" min="1" max="${total}" oninput="pomoUpdateEst(${total})"></div>
          <div class="pomo-range-sep">—</div>
          <div class="pomo-range-field"><label>To</label>
            <input type="number" id="pomoEnd" value="${total}" min="1" max="${total}" oninput="pomoUpdateEst(${total})"></div>
          <div class="pomo-count-pill"><span id="pomoSelCount">${total}</span> selected</div>
        </div>
      </div>
      <div class="pomo-sliders-grid">
        <div class="pomo-slider-item">
          <div class="pomo-slider-label">📝 Questions / section</div>
          <div class="pomo-slider-row">
            <input type="range" id="pomoQPerSec" min="3" max="50" value="15" class="pomo-range" oninput="document.getElementById('qpsVal').textContent=this.value;pomoUpdateEst(${total})">
            <span class="pomo-slider-val" id="qpsVal">15</span>
          </div>
        </div>
        <div class="pomo-slider-item">
          <div class="pomo-slider-label">🎯 Study time (min)</div>
          <div class="pomo-slider-row">
            <input type="range" id="pomoStudy" min="3" max="60" value="25" class="pomo-range" oninput="document.getElementById('studyVal').textContent=this.value;pomoUpdateEst(${total})">
            <span class="pomo-slider-val" id="studyVal">25</span>
          </div>
        </div>
        <div class="pomo-slider-item">
          <div class="pomo-slider-label">✏️ Quiz time (min)</div>
          <div class="pomo-slider-row">
            <input type="range" id="pomoQuizT" min="3" max="60" value="20" class="pomo-range" oninput="document.getElementById('quizTVal').textContent=this.value;pomoUpdateEst(${total})">
            <span class="pomo-slider-val" id="quizTVal">20</span>
          </div>
        </div>
        <div class="pomo-slider-item">
          <div class="pomo-slider-label">☕ Break time (min)</div>
          <div class="pomo-slider-row">
            <input type="range" id="pomoBreakT" min="1" max="15" value="5" class="pomo-range" oninput="document.getElementById('breakTVal').textContent=this.value;pomoUpdateEst(${total})">
            <span class="pomo-slider-val" id="breakTVal">5</span>
          </div>
        </div>
      </div>
      <div class="pomo-toggles">
        <label class="pomo-toggle-label">
          <input type="checkbox" id="pomoAutoAdv" checked>
          <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
          Auto-advance to quiz when study timer ends
        </label>
        <label class="pomo-toggle-label" style="margin-top:0.55rem">
          <input type="checkbox" id="pomoShuffleOpts" checked>
          <span class="pomo-toggle-track"><span class="pomo-toggle-thumb"></span></span>
          Shuffle answer options on flashcards
        </label>
      </div>

      <!-- Race Mode toggle (injected by pomodoro-race.js) -->
      <div id="pomoRaceModeRow" style="display:none" class="pomo-race-toggle-row">
        <label class="pomo-toggle-label pomo-race-toggle-label">
          <input type="checkbox" id="pomoRaceMode">
          <span class="pomo-toggle-track pomo-race-track"><span class="pomo-toggle-thumb"></span></span>
          <span class="pomo-race-label-text">⚡ Race with Friend</span>
          <span class="pomo-race-label-sub">Invite a friend to compete on the same quiz</span>
        </label>
      </div>

      <div class="modal-actions" style="margin-top:1rem">
        <button class="btn btn--ghost" onclick="this.closest('.modal').remove()">Cancel</button>
        <button class="btn btn--primary" onclick="launchPomodoroFlow('${quizId}',${total})">🚀 Start</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  // Show race toggle (pomodoro-race.js sets this up)
  if (typeof initPomodoroRaceToggle === 'function') initPomodoroRaceToggle();
  pomoUpdateEst(total);
}

function pomoUpdateEst(total) {
  let s = Math.max(1, parseInt(document.getElementById('pomoStart')?.value)||1);
  let e = Math.min(total, parseInt(document.getElementById('pomoEnd')?.value)||total);
  if (e<s) e=s;
  const sel=e-s+1;
  const qps=Math.max(1,parseInt(document.getElementById('pomoQPerSec')?.value)||15);
  const sec=Math.ceil(sel/qps);
  const sm=parseInt(document.getElementById('pomoStudy')?.value)||25;
  const qm=parseInt(document.getElementById('pomoQuizT')?.value)||20;
  const bm=parseInt(document.getElementById('pomoBreakT')?.value)||5;
  const tm=sec*(sm+qm+bm);
  const sc=document.getElementById('pomoSelCount'); if(sc) sc.textContent=sel;
  const es=document.getElementById('estimatedSections'); if(es) es.textContent=sec;
  const te=document.getElementById('totalTimeEstimate'); if(te) te.textContent=tm+'m';
}

// ── Launch ────────────────────────────────────
function launchPomodoroFlow(quizId, total) {
  // If race mode is on, delegate to pomodoro-race.js
  if (document.getElementById('pomoRaceMode')?.checked) {
    if (typeof _launchRaceSetup === 'function') { _launchRaceSetup(quizId, total); return; }
  }

  const allQuizzes = typeof quizzesCache !== 'undefined' ? quizzesCache : [];
  const quiz = allQuizzes.find(q => q.id === quizId);
  if (!quiz) return;

  let s=Math.max(1,parseInt(document.getElementById('pomoStart')?.value)||1);
  let e=Math.min(total,parseInt(document.getElementById('pomoEnd')?.value)||total);
  if(e<s) e=s;

  pomodoroSettings.questionsPerSection = Math.max(1,parseInt(document.getElementById('pomoQPerSec')?.value)||15);
  pomodoroSettings.studyTimeMinutes    = Math.max(1,parseInt(document.getElementById('pomoStudy')?.value)||25);
  pomodoroSettings.quizTimeMinutes     = Math.max(1,parseInt(document.getElementById('pomoQuizT')?.value)||20);
  pomodoroSettings.breakTimeMinutes    = Math.max(1,parseInt(document.getElementById('pomoBreakT')?.value)||5);
  pomodoroSettings.autoAdvance         = document.getElementById('pomoAutoAdv')?.checked!==false;
  pomodoroSettings.shuffleOptions      = document.getElementById('pomoShuffleOpts')?.checked===true;

  const rawQs = quiz.questions.slice(s-1, e);
  if(!rawQs.length){ toast('No questions in that range','error'); return; }

  // Shuffle options within each question if enabled (default: ON)
  const _shuffleOpts = (arr) => arr.map(q => {
    if (!Array.isArray(q.options) || q.options.length < 2) return q;
    const correctText = q.options[q.correctIndex];
    const shuffled = [...q.options].sort(() => Math.random() - 0.5);
    return { ...q, options: shuffled, correctIndex: shuffled.indexOf(correctText) };
  });

  const qs = pomodoroSettings.shuffleOptions ? _shuffleOpts(rawQs) : rawQs;

  const sections=[];
  for(let i=0;i<qs.length;i+=pomodoroSettings.questionsPerSection)
    sections.push(qs.slice(i,i+pomodoroSettings.questionsPerSection));

  pomodoroState={active:true,phase:'study',currentSection:0,sections,totalSections:sections.length,
    timerInterval:null,timeLeft:0,isPaused:false,currentQuestions:[],quizResults:[],allIncorrect:[]};

  document.getElementById('pomoModal')?.remove();
  _buildPomodoroShell();
  enterPomodoroStudy();
}

// ── Shell ─────────────────────────────────────
function _buildPomodoroShell() {
  document.getElementById('pomodoroShell')?.remove();
  const shell=document.createElement('div'); shell.id='pomodoroShell'; shell.className='pomo-shell';
  shell.innerHTML=`
    <div class="pomo-topbar" id="pomoTopbar">
      <div class="pomo-topbar-left">
        <span class="pomo-phase-tag" id="pomoPhaseTag">📚 Study</span>
        <span class="pomo-section-info" id="pomoSectionInfo">Section 1/${pomodoroState.totalSections}</span>
      </div>
      <div class="pomo-timer-pill" id="pomoTimerPill">00:00</div>
      <div class="pomo-topbar-right">
        <button class="pomo-ctrl-btn" id="pomoPauseBtn" onclick="pomoTogglePause()">⏸</button>
        <button class="pomo-ctrl-btn" onclick="pomoSkip()" title="Skip">⏭</button>
        <button class="pomo-ctrl-btn pomo-ctrl-danger" onclick="pomoExit()" title="Exit">✕</button>
      </div>
    </div>
    <div class="pomo-progress-bar-wrap"><div class="pomo-progress-fill" id="pomoProgressFill" style="width:0%"></div></div>
    <div class="pomo-body" id="pomoBody"></div>`;
  document.body.appendChild(shell);
}

function _updateTopbar() {
  const phases={
    study:{tag:'📚 Study',c:'#4a6fa5'},quiz:{tag:'✏️ Quiz',c:'#8b5cf6'},
    break:{tag:'☕ Break',c:'#27ae60'},results:{tag:'📊 Results',c:'#f39c12'},finish:{tag:'🏆 Done',c:'#f39c12'}
  };
  const p=phases[pomodoroState.phase]||phases.study;
  const tag=document.getElementById('pomoPhaseTag'); if(tag){tag.textContent=p.tag;tag.style.background=p.c;}
  const inf=document.getElementById('pomoSectionInfo'); if(inf) inf.textContent=`Section ${pomodoroState.currentSection+1}/${pomodoroState.totalSections}`;
  const pill=document.getElementById('pomoTimerPill'); if(pill) pill.textContent=_pfmt(pomodoroState.timeLeft);
  const btn=document.getElementById('pomoPauseBtn'); if(btn) btn.textContent=pomodoroState.isPaused?'▶':'⏸';
  const pf=document.getElementById('pomoProgressFill'); if(pf) pf.style.width=`${(pomodoroState.currentSection/pomodoroState.totalSections)*100}%`;
}
function _pfmt(s){return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}

// ── Timer ─────────────────────────────────────
function _startPomTimer(secs, onDone) {
  _clearPomTimer(); pomodoroState.timeLeft=secs; _updateTopbar();
  pomodoroState.timerInterval=setInterval(()=>{
    if(pomodoroState.isPaused) return;
    pomodoroState.timeLeft--; _updateTopbar();
    const pill=document.getElementById('pomoTimerPill');
    if(pill) pill.classList.toggle('pomo-timer-warn',pomodoroState.timeLeft<=30);
    if(pomodoroState.timeLeft<=0){_clearPomTimer();onDone();}
  },1000);
}
function _clearPomTimer(){if(pomodoroState.timerInterval){clearInterval(pomodoroState.timerInterval);pomodoroState.timerInterval=null;}}

function pomoTogglePause(){
  pomodoroState.isPaused=!pomodoroState.isPaused; _updateTopbar();
  const body=document.getElementById('pomoBody'); if(!body) return;
  let ov=document.getElementById('pomoPauseOv');
  if(pomodoroState.isPaused){
    if(!ov){
      ov=document.createElement('div');
      ov.id='pomoPauseOv';
      ov.className='pomo-pause-overlay';
      ov.innerHTML=`
        <div class="pomo-pause-msg">
          <div class="pomo-pause-icon">⏸️</div>
          <div class="pomo-pause-title">Paused</div>
          <button class="btn btn--primary pomo-resume-btn" onclick="pomoTogglePause()">▶ Resume</button>
          <small class="pomo-pause-hint">or tap ▶ in the top bar</small>
        </div>`;
      body.appendChild(ov);
      // Tap anywhere on overlay to resume
      ov.addEventListener('click', e => {
        if (e.target.closest('.pomo-resume-btn')) return; // handled by button
        pomoTogglePause();
      });
    }
  } else {
    ov?.remove();
  }
}
function pomoSkip(){if(!confirm('Skip to next phase/section?')) return; _clearPomTimer(); _advanceSection();}
function pomoExit(){
  if(!confirm('Exit Pomodoro?')) return;
  _clearPomTimer(); pomodoroState.active=false;
  document.getElementById('pomodoroShell')?.remove();
  if(typeof showView==='function') showView('dashboard');
}

// ── Study Phase ───────────────────────────────
function _shuffleOptionsForCard(q) {
  if (!Array.isArray(q.options) || q.options.length < 2) return q;
  const correctText = q.options[q.correctIndex];
  // Build indexed array, shuffle it
  const indexed = q.options.map((opt, i) => ({ opt, i }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }
  const newOptions = indexed.map(x => x.opt);
  const newCorrectIndex = newOptions.indexOf(correctText);
  return { ...q, options: newOptions, correctIndex: newCorrectIndex };
}

function _buildFlashCard(q, displayNum, cardIdx) {
  const displayQ = pomodoroSettings.shuffleOptions ? _shuffleOptionsForCard(q) : q;
  const correctOpt = displayQ.options?.[displayQ.correctIndex] || 'N/A';
  const letters = ['A','B','C','D','E','F','G','H'];
  const optionsList = Array.isArray(displayQ.options) ? displayQ.options.map((opt, idx) => {
    const isCorrect = idx === displayQ.correctIndex;
    return `<li><span class="option-marker">${letters[idx]}</span>${escHtml(opt)}</li>`;
  }).join('') : '';

  return `
    <div class="flash-card" data-pomo-card="${cardIdx}">
      <div class="flash-card-inner">
        <div class="flash-card-face flash-card-front">
          <div class="flash-card-head">
            <span class="flash-num">${displayNum}</span>
            <div class="flash-actions">
              <button class="icon-btn pomo-edit-btn" title="Edit question" data-card-idx="${cardIdx}">✏️</button>
              <button class="icon-btn pomo-search-btn" title="Search online" data-q="${escHtml(q.question)}">🔍</button>
            </div>
          </div>
          <p class="flash-question">${escHtml(q.question || '')}</p>
          ${optionsList ? `<ul class="flash-card-options">${optionsList}</ul>` : ''}
          <p class="flash-hint">Tap to reveal answer</p>
        </div>
        <div class="flash-card-face flash-card-back">
          <div class="flash-card-head">
            <span class="flash-num">${displayNum}</span>
            <div class="flash-actions">
              <button class="icon-btn pomo-edit-btn" title="Edit question" data-card-idx="${cardIdx}">✏️</button>
            </div>
          </div>
          <p class="flash-answer-line">✓ ${escHtml(correctOpt)}</p>
          ${q.explanation ? `<p class="flash-explanation-line">${escHtml(q.explanation)}</p>` : ''}
          <p class="flash-hint">Tap to flip back</p>
        </div>
      </div>
    </div>`;
}

function enterPomodoroStudy() {
  pomodoroState.phase = 'study';
  pomodoroState.currentQuestions = [...pomodoroState.sections[pomodoroState.currentSection]];
  _updateTopbar();
  const body = document.getElementById('pomoBody'); if (!body) return;
  const offset = pomodoroState.currentSection * pomodoroSettings.questionsPerSection;

  const renderCards = () => pomodoroState.currentQuestions
    .map((q, i) => _buildFlashCard(q, offset + i + 1, i)).join('');

  const shuffleActive = pomodoroSettings.shuffleOptions;

  body.innerHTML = `
    <div class="pomo-study-wrap">
      <div class="pomo-study-toolbar">
        <span class="pomo-study-title">📚 Section ${pomodoroState.currentSection + 1} / ${pomodoroState.totalSections}</span>
        <span class="pomo-study-meta">${pomodoroState.currentQuestions.length} cards · ${pomodoroSettings.studyTimeMinutes} min</span>
        <button class="btn btn--ghost btn--small pomo-shuffle-btn ${shuffleActive ? 'pomo-shuffle-active' : ''}" id="pomoShuffleToggle" title="Shuffle answer options">
          🔀 Shuffle${shuffleActive ? ' On' : ''}
        </button>
        <button class="btn btn--primary btn--small" onclick="enterPomodoroQuiz()">✏️ Start Quiz Now</button>
      </div>
      <div class="flash-grid" id="pomoFlashGrid">${renderCards()}</div>
    </div>`;

  const _attachCardEvents = () => {
    body.querySelectorAll('.flash-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.icon-btn')) return;
        card.classList.toggle('flipped');
      });
    });
    body.querySelectorAll('.pomo-search-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        window.open('https://www.google.com/search?q=' + encodeURIComponent(btn.dataset.q || ''), '_blank');
      });
    });
    // Edit buttons
    body.querySelectorAll('.pomo-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const cardIdx = parseInt(btn.dataset.cardIdx);
        _openPomoEdit(cardIdx, renderCards, _attachCardEvents);
      });
    });
  };

  _attachCardEvents();

  // Shuffle toggle button
  document.getElementById('pomoShuffleToggle')?.addEventListener('click', () => {
    pomodoroSettings.shuffleOptions = !pomodoroSettings.shuffleOptions;
    const btn = document.getElementById('pomoShuffleToggle');
    const grid = document.getElementById('pomoFlashGrid');
    if (btn) {
      btn.textContent = `🔀 Shuffle${pomodoroSettings.shuffleOptions ? ' On' : ''}`;
      btn.classList.toggle('pomo-shuffle-active', pomodoroSettings.shuffleOptions);
    }
    if (grid) {
      grid.innerHTML = renderCards();
      _attachCardEvents();
    }
  });

  _startPomTimer(pomodoroSettings.studyTimeMinutes * 60, () => {
    if (pomodoroSettings.autoAdvance) enterPomodoroQuiz();
    else toast('Study time up! Start the quiz when ready.', 'info');
  });
}

// ── Quiz Phase ────────────────────────────────
function enterPomodoroQuiz(){
  _clearPomTimer(); pomodoroState.phase='quiz'; _updateTopbar();
  _pomoScore=0;_pomoQIndex=0;_pomoIncorrect=[];
  _pomoQuiz=[...pomodoroState.currentQuestions].sort(()=>Math.random()-0.5);
  const body=document.getElementById('pomoBody'); if(!body) return;
  body.innerHTML=`
    <div class="pomo-quiz-wrap">
      <div class="pomo-phase-heading">
        <span class="pomo-phase-icon">✏️</span>
        <div>
          <div class="pomo-phase-title">Quiz — Section ${pomodoroState.currentSection+1}</div>
          <div class="pomo-phase-sub">${_pomoQuiz.length} questions · ${pomodoroSettings.quizTimeMinutes} min</div>
        </div>
      </div>
      <div class="pomo-q-progress">
        <div class="pomo-q-bar"><div class="pomo-q-fill" id="pomoQFill" style="width:0%"></div></div>
        <span id="pomoQMeta">1/${_pomoQuiz.length}</span>
      </div>
      <div id="pomoQBody"></div>
    </div>`;
  _loadPomodoroQ();
  _startPomTimer(pomodoroSettings.quizTimeMinutes*60,()=>{
    while(_pomoQIndex<_pomoQuiz.length){_pomoIncorrect.push({..._pomoQuiz[_pomoQIndex],selectedAnswer:'(Time expired)'});_pomoQIndex++;}
    _showPomodoroResults();
  });
}

function _loadPomodoroQ(){
  const body=document.getElementById('pomoQBody'); if(!body) return;
  if(_pomoQIndex>=_pomoQuiz.length){_showPomodoroResults();return;}
  const q=_pomoQuiz[_pomoQIndex]; const letters=['A','B','C','D','E','F','G','H'];
  const fill=document.getElementById('pomoQFill'); if(fill) fill.style.width=`${(_pomoQIndex/_pomoQuiz.length)*100}%`;
  const meta=document.getElementById('pomoQMeta'); if(meta) meta.textContent=`${_pomoQIndex+1}/${_pomoQuiz.length}`;
  body.innerHTML=`
    <div class="pomo-question-card">
      <p class="pomo-question-text">${escHtml(q.question)}</p>
      <div class="pomo-options">
        ${q.options.map((o,j)=>`
          <button class="pomo-opt-btn" data-idx="${j}">
            <span class="pomo-opt-letter">${letters[j]}</span>
            <span class="pomo-opt-text">${escHtml(o)}</span>
          </button>`).join('')}
      </div>
    </div>`;
  body.querySelectorAll('.pomo-opt-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(btn.disabled) return;
      body.querySelectorAll('.pomo-opt-btn').forEach(b=>b.disabled=true);
      const chosen=parseInt(btn.dataset.idx);
      if(chosen===q.correctIndex){btn.classList.add('pomo-correct');_pomoScore++;}
      else{btn.classList.add('pomo-wrong');
        body.querySelector(`[data-idx="${q.correctIndex}"]`)?.classList.add('pomo-correct');
        _pomoIncorrect.push({...q,selectedAnswer:q.options[chosen]});}
      setTimeout(()=>{_pomoQIndex++;_loadPomodoroQ();},900);
    });
  });
}

function _showPomodoroResults(){
  _clearPomTimer(); pomodoroState.phase='results';
  const acc=Math.round((_pomoScore/_pomoQuiz.length)*100);
  pomodoroState.quizResults.push({section:pomodoroState.currentSection+1,score:_pomoScore,total:_pomoQuiz.length,accuracy:acc});
  pomodoroState.allIncorrect.push(..._pomoIncorrect); _updateTopbar();
  const body=document.getElementById('pomoBody'); if(!body) return;
  const grade=acc>=80?{icon:'🎉',cls:'pomo-grade-great',lbl:'Great!'}:acc>=60?{icon:'👍',cls:'pomo-grade-good',lbl:'Good'}:{icon:'📝',cls:'pomo-grade-review',lbl:'Review more'};
  const isLast=pomodoroState.currentSection>=pomodoroState.totalSections-1;
  body.innerHTML=`
    <div class="pomo-results-wrap">
      <div class="pomo-phase-heading">
        <span class="pomo-phase-icon">📊</span>
        <div><div class="pomo-phase-title">Section ${pomodoroState.currentSection+1} Results</div></div>
      </div>
      <div class="pomo-score-card ${grade.cls}">
        <div class="pomo-score-icon">${grade.icon}</div>
        <div class="pomo-score-big">${_pomoScore} / ${_pomoQuiz.length}</div>
        <div class="pomo-score-acc">${acc}% · ${grade.lbl}</div>
      </div>
      ${_pomoIncorrect.length?`
        <div class="pomo-incorrect-list">
          <div class="pomo-incorrect-title">📝 ${_pomoIncorrect.length} to review</div>
          ${_pomoIncorrect.slice(0,3).map(q=>`
            <div class="pomo-incorrect-item">
              <div class="pomo-inc-q">${escHtml(q.question.substring(0,90))}${q.question.length>90?'…':''}</div>
              <div class="pomo-inc-ans">✅ ${escHtml(q.options[q.correctIndex])}</div>
            </div>`).join('')}
          ${_pomoIncorrect.length>3?`<div style="color:var(--slate);font-size:0.8rem;padding:4px 0">+${_pomoIncorrect.length-3} more…</div>`:''}
        </div>`
      :`<div class="pomo-perfect"><div style="font-size:2.5rem">🎯</div><div>Perfect section!</div></div>`}
      <div class="pomo-results-actions">
        <button class="btn btn--ghost" onclick="enterPomodoroStudy()">🔄 Retry</button>
        <button class="btn btn--primary" onclick="${isLast?'finishPomodoro()':'enterPomodoroBreak()'}">${isLast?'🏆 Finish':'☕ Break →'}</button>
      </div>
    </div>`;
}

// ── Break ─────────────────────────────────────
function enterPomodoroBreak(){
  pomodoroState.phase='break'; _updateTopbar();
  const body=document.getElementById('pomoBody'); if(!body) return;
  body.innerHTML=`
    <div class="pomo-break-wrap">
      <div class="pomo-break-icon">☕</div>
      <h2 class="pomo-break-title">Break Time!</h2>
      <p class="pomo-break-sub">You've earned ${pomodoroSettings.breakTimeMinutes} minutes</p>
      <div class="pomo-break-tips">
        <div class="pomo-tip">🧘 Stretch your body</div>
        <div class="pomo-tip">💧 Drink some water</div>
        <div class="pomo-tip">👀 Look away from screen</div>
        <div class="pomo-tip">🌬️ Take deep breaths</div>
      </div>
      <div class="pomo-prev-results">
        ${pomodoroState.quizResults.map((r,i)=>`
          <div class="pomo-prev-item">
            <span>Sec ${i+1}</span>
            <div class="pomo-prev-bar">
              <div style="width:${r.accuracy}%;height:100%;border-radius:4px;background:${r.accuracy>=80?'var(--success)':r.accuracy>=60?'#f39c12':'var(--error)'}"></div>
            </div>
            <span>${r.score}/${r.total}</span>
          </div>`).join('')}
      </div>
      <div class="pomo-break-actions">
        <button class="btn btn--ghost btn--small" onclick="_advanceSection()">⏭ Skip Break</button>
      </div>
    </div>`;
  _startPomTimer(pomodoroSettings.breakTimeMinutes*60,()=>_advanceSection());
}

function _advanceSection(){
  _clearPomTimer();
  pomodoroState.currentSection++;
  if(pomodoroState.currentSection>=pomodoroState.totalSections){finishPomodoro();return;}
  enterPomodoroStudy();
}

// ── Finish ────────────────────────────────────
function finishPomodoro(){
  _clearPomTimer(); pomodoroState.active=false; pomodoroState.phase='finish'; _updateTopbar();
  const totalQ=pomodoroState.quizResults.reduce((s,r)=>s+r.total,0);
  const totalC=pomodoroState.quizResults.reduce((s,r)=>s+r.score,0);
  const overall=totalQ?Math.round(totalC/totalQ*100):0;
  const body=document.getElementById('pomoBody'); if(!body) return;
  body.innerHTML=`
    <div class="pomo-finish-wrap">
      <div class="pomo-finish-icon">🏆</div>
      <h2 class="pomo-finish-title">Learning Flow Complete!</h2>
      <p class="pomo-finish-sub">${totalQ} questions · ${pomodoroState.totalSections} sections</p>
      <div class="pomo-final-stats">
        <div class="pomo-final-stat"><div class="pomo-final-val">${overall}%</div><div class="pomo-final-lbl">Accuracy</div></div>
        <div class="pomo-final-stat"><div class="pomo-final-val">${totalC}/${totalQ}</div><div class="pomo-final-lbl">Correct</div></div>
        <div class="pomo-final-stat"><div class="pomo-final-val">${pomodoroState.totalSections}</div><div class="pomo-final-lbl">Sections</div></div>
      </div>
      <div class="pomo-breakdown">
        ${pomodoroState.quizResults.map((r,i)=>`
          <div class="pomo-breakdown-item ${r.accuracy>=80?'great':r.accuracy>=60?'good':'review'}">
            <span>Sec ${i+1}</span>
            <div class="pomo-breakdown-bar"><div style="width:${r.accuracy}%"></div></div>
            <span>${r.score}/${r.total}</span>
          </div>`).join('')}
      </div>
      <div class="pomo-finish-actions">
        <button class="btn btn--primary" onclick="document.getElementById('pomodoroShell')?.remove();showView('dashboard')">🏠 Home</button>
        <button class="btn btn--ghost" onclick="document.getElementById('pomodoroShell')?.remove();startPomodoro()">🔄 New Session</button>
      </div>
    </div>`;
}
// ── POMODORO FLASHCARD EDITOR ─────────────────
// Opens the same editor as app.js's openFlashcardEditor but
// syncs changes back into pomodoroState.currentQuestions and
// also updates activeQuizQuestions + saves to Supabase.
function _openPomoEdit(cardIdx, renderCards, attachEvents) {
  const q = pomodoroState.currentQuestions[cardIdx];
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
        <h3 style="margin:0">✏️ Edit Question</h3>
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
      <div class="modal-actions">
        <button class="btn btn--ghost" onclick="document.getElementById('modal-flashcard-edit')?.remove()">Cancel</button>
        <button class="btn btn--primary" id="fce-save-btn">Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(m);

  // Add option
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
    _bindPomoRemoveButtons();
    row.querySelector('input[type=text]').focus();
  });

  _bindPomoRemoveButtons();

  // Save
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

    const updated = { ...q, question: questionText, options, correctIndex, explanation };

    // Update pomodoroState.currentQuestions
    pomodoroState.currentQuestions[cardIdx] = updated;

    // Also update activeQuizQuestions in app.js (same question by reference match)
    if (typeof activeQuizQuestions !== 'undefined') {
      const aqIdx = activeQuizQuestions.findIndex(aq =>
        aq.question === q.question && JSON.stringify(aq.options) === JSON.stringify(q.options));
      if (aqIdx >= 0) activeQuizQuestions[aqIdx] = updated;
    }

    // Save to Supabase via app.js helper if available
    let saved = true;
    if (typeof _saveQuizQuestions === 'function') {
      saved = await _saveQuizQuestions();
    }

    if (saved) {
      m.remove();
      // Re-render flashcard grid
      const grid = document.getElementById('pomoFlashGrid');
      if (grid && renderCards && attachEvents) {
        grid.innerHTML = renderCards();
        attachEvents();
      }
      toast('Question updated!', 'success');
    } else {
      pomodoroState.currentQuestions[cardIdx] = q; // revert
      btn.textContent = 'Save Changes'; btn.disabled = false;
    }
  });
}

function _bindPomoRemoveButtons() {
  document.querySelectorAll('.fce-remove-opt').forEach(btn => {
    btn.onclick = () => {
      const list = document.getElementById('fce-options-list');
      const rows = list.querySelectorAll('.fce-option-row');
      if (rows.length <= 2) { toast('At least 2 options required', 'info'); return; }
      btn.closest('.fce-option-row').remove();
      list.querySelectorAll('.fce-option-row').forEach((row, i) => {
        row.querySelector('.fce-option-letter').textContent = String.fromCharCode(65 + i);
        row.querySelector('input[type=radio]').value = i;
        row.querySelector('input[type=text]').dataset.optIdx = i;
        row.querySelector('input[type=text]').placeholder = `Option ${String.fromCharCode(65 + i)}`;
        const rb = row.querySelector('.fce-remove-opt');
        if (rb) rb.disabled = list.querySelectorAll('.fce-option-row').length <= 2;
      });
    };
  });
}
