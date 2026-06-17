/* =============================================
   pomodoro-race.js — Multiplayer Pomodoro Race
   QM Pro compatible (uses sb, toast, escHtml)
   ============================================= */

const RACE_POLL_MS = 5000;

const raceState = {
  active: false, roomCode: '', playerId: '', playerName: 'You',
  isHost: false, pollInterval: null, startTime: null, opponents: [],
  totalCorrect: 0, totalAnswered: 0, _hudTimer: null
};

function _racePlayerId() {
  let id = sessionStorage.getItem('racePlayerId');
  if (!id) { id = 'p_' + Math.random().toString(36).slice(2,10); sessionStorage.setItem('racePlayerId', id); }
  return id;
}
function _genRoomCode() {
  return Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6).padEnd(6,'X');
}
function _getDefaultName() {
  return sessionStorage.getItem('racePlayerName') || (typeof currentProfile !== 'undefined' && currentProfile?.display_name) || 'Racer';
}

// ── Expose race toggle to pomodoro.js ─────────
function initPomodoroRaceToggle() {
  const row = document.getElementById('pomoRaceModeRow');
  if (row) row.style.display = '';
}

// ── Launch Race Setup ─────────────────────────
async function _launchRaceSetup(quizId, total) {
  let allQuizzes = typeof quizzesCache !== 'undefined' ? [...quizzesCache] : [];
  if (!allQuizzes.length && typeof sb !== 'undefined') {
    const uid = typeof currentUser !== 'undefined' ? currentUser?.id : null;
    if (uid) {
      try {
        const { data } = await sb.from('quizzes')
          .select('id, title, folder_id, questions, is_public')
          .eq('user_id', uid);
        allQuizzes = data || [];
      } catch(e) {}
    }
  }

  const quiz = allQuizzes.find(q => q.id === quizId);
  if (!quiz) { toast('Quiz not found', 'error'); return; }

  let s = Math.max(1, parseInt(document.getElementById('pomoStart')?.value)||1);
  let e = Math.min(total, parseInt(document.getElementById('pomoEnd')?.value)||total);
  if (e < s) e = s;

  pomodoroSettings.questionsPerSection = Math.max(1, parseInt(document.getElementById('pomoQPerSec')?.value)||15);
  pomodoroSettings.studyTimeMinutes    = Math.max(1, parseInt(document.getElementById('pomoStudy')?.value)||25);
  pomodoroSettings.quizTimeMinutes     = Math.max(1, parseInt(document.getElementById('pomoQuizT')?.value)||20);
  pomodoroSettings.breakTimeMinutes    = Math.max(1, parseInt(document.getElementById('pomoBreakT')?.value)||5);
  pomodoroSettings.autoAdvance         = document.getElementById('pomoAutoAdv')?.checked !== false;
  pomodoroSettings.shuffleOptions      = document.getElementById('pomoShuffleOpts')?.checked === true;

  const qs = quiz.questions.slice(s-1, e);
  if (!qs.length) { toast('No questions in that range', 'error'); return; }

  const sections = [];
  for (let i = 0; i < qs.length; i += pomodoroSettings.questionsPerSection)
    sections.push(qs.slice(i, i + pomodoroSettings.questionsPerSection));

  document.getElementById('pomoModal')?.remove();
  window._raceSections  = sections;
  window._raceQuizId    = quizId;
  window._raceQuizTitle = quiz.title || '';

  // Make quiz public so friend can access it
  if (!quiz.is_public) {
    try {
      await sb.from('quizzes').update({ is_public: true }).eq('id', quizId);
      quiz.is_public = true;
      const cached = (typeof quizzesCache !== 'undefined' ? quizzesCache : []).find(q=>q.id===quizId);
      if (cached) cached.is_public = true;
    } catch(e) {}
  }

  _showRaceSetupModal(quizId, sections, quiz.title);
}

function _showRaceSetupModal(quizId, sections, quizTitle) {
  document.getElementById('raceSetupModal')?.remove();
  const totalQs = sections.reduce((a,s)=>a+s.length,0);
  const m = document.createElement('div'); m.className = 'modal active'; m.id = 'raceSetupModal';
  m.innerHTML = `
    <div class="modal-card race-setup-card">
      <div class="race-setup-header">
        <div class="race-setup-icon">⚡</div>
        <div>
          <div class="race-setup-title">Pomodoro Race</div>
          <div class="race-setup-sub">${escHtml(quizTitle||'Quiz')} · ${sections.length} sections · ${totalQs} questions</div>
        </div>
        <button class="btn btn--ghost btn--small" onclick="this.closest('.modal').remove()">✕</button>
      </div>

      <div class="race-quiz-badge">
        <span>📚</span>
        <div>
          <div class="race-quiz-badge-title">${escHtml(quizTitle||'Quiz')}</div>
          <div class="race-quiz-badge-sub">This quiz has been made public so your friend can join</div>
        </div>
      </div>

      <div class="race-mode-tabs">
        <button class="race-tab active" id="tabCreate" onclick="raceSwitchTab('create')">🏠 Create Room</button>
        <button class="race-tab" id="tabJoin"   onclick="raceSwitchTab('join')">🔗 Join Room</button>
      </div>

      <div id="raceTabCreate" class="race-tab-pane">
        <div class="race-info-row" style="margin-bottom:0.75rem">
          <span class="race-info-icon">👤</span>
          <div style="flex:1">
            <div class="race-info-label">Your name in the race</div>
            <input type="text" id="raceHostName" class="race-name-input" placeholder="Enter your name" maxlength="20" value="${escHtml(_getDefaultName())}">
          </div>
        </div>
        <div class="race-share-hint">
          <span>💡</span>
          <span>After creating the room, share the <strong>6-letter code</strong> with your friend. They join using <strong>"Join Room"</strong> tab — they'll get the same quiz automatically.</span>
        </div>
        <button class="btn btn--primary" style="width:100%;margin-top:0.75rem" onclick="raceCreateRoom()">🚀 Create Room</button>
      </div>

      <div id="raceTabJoin" class="race-tab-pane" style="display:none">
        <div class="race-share-hint" style="margin-bottom:0.75rem">
          <span>💡</span>
          <span>Ask your friend for the room code. You'll automatically get the same quiz they selected.</span>
        </div>
        <div class="race-info-row" style="margin-bottom:0.65rem">
          <span class="race-info-icon">👤</span>
          <div style="flex:1">
            <div class="race-info-label">Your name</div>
            <input type="text" id="raceJoinName" class="race-name-input" placeholder="Enter your name" maxlength="20" value="${escHtml(_getDefaultName())}">
          </div>
        </div>
        <div class="race-info-row" style="margin-bottom:0.75rem">
          <span class="race-info-icon">🔑</span>
          <div style="flex:1">
            <div class="race-info-label">Room code (from your friend)</div>
            <input type="text" id="raceJoinCode" class="race-code-input" placeholder="e.g. ABC123" maxlength="6" oninput="this.value=this.value.toUpperCase()">
          </div>
        </div>
        <button class="btn btn--primary" style="width:100%" onclick="raceJoinRoom()">🔗 Join Race</button>
      </div>

      <div class="race-info-pills" style="margin-top:1rem">
        <span class="race-pill">⏱ ${pomodoroSettings.studyTimeMinutes}m study</span>
        <span class="race-pill">✏️ ${pomodoroSettings.quizTimeMinutes}m quiz</span>
        <span class="race-pill">☕ ${pomodoroSettings.breakTimeMinutes}m break</span>
      </div>
    </div>`;
  document.body.appendChild(m);
}

// ── Direct Join (from Race landing page) ──────
async function raceDirectJoin() {
  const code = (document.getElementById('directJoinCode')?.value.trim()||'').toUpperCase();
  if (code.length < 4) { toast('Enter a valid room code', 'error'); return; }

  const name = (typeof currentProfile !== 'undefined' && currentProfile?.display_name) ||
               sessionStorage.getItem('racePlayerName') || 'Racer';

  const btn = document.querySelector('#view-pomodoro-race .btn--primary:last-of-type');
  if (btn) { btn.textContent = '⏳ Joining…'; btn.disabled = true; }

  const playerId = _racePlayerId();

  try {
    const { data: room, error } = await sb.from('pomo_races').select('*').eq('room_code', code).single();
    if (error || !room) throw new Error('Room not found. Check the code and try again.');
    if (new Date(room.expires_at) < new Date()) throw new Error('This room has expired.');

    const { data: existing } = await sb.from('pomo_race_progress').select('player_id').eq('room_code', code);
    const alreadyIn = (existing||[]).find(p => p.player_id === playerId);
    if (!alreadyIn && (existing||[]).length >= 2) throw new Error('Room is full (2 players max).');

    // Upsert friend's progress row
    await sb.from('pomo_race_progress').upsert({
      room_code: code, player_id: playerId, player_name: name,
      phase: 'waiting', current_section: 0, total_sections: room.total_sections,
      updated_at: new Date().toISOString()
    }, { onConflict: 'room_code,player_id' });

    // Load quiz data from room
    window._raceSections  = room.sections;
    window._raceQuizTitle = room.quiz_title;
    window._raceQuizId    = room.quiz_id;
    Object.assign(pomodoroSettings, room.settings);
    Object.assign(raceState, {
      roomCode: code, playerId, playerName: name,
      isHost: false, active: true,
      totalCorrect: 0, totalAnswered: 0, startTime: null
    });

    if (btn) { btn.textContent = 'Join →'; btn.disabled = false; }
    _showRaceWaitingRoom(code, name, room.sections);

  } catch(err) {
    toast(err.message || 'Could not join', 'error');
    if (btn) { btn.textContent = 'Join →'; btn.disabled = false; }
  }
}

function raceSwitchTab(tab) {
  document.getElementById('raceTabCreate').style.display = tab==='create' ? '' : 'none';
  document.getElementById('raceTabJoin').style.display   = tab==='join'   ? '' : 'none';
  document.getElementById('tabCreate').classList.toggle('active', tab==='create');
  document.getElementById('tabJoin').classList.toggle('active',   tab==='join');
}

// ── Create Room ───────────────────────────────
async function raceCreateRoom() {
  const name = (document.getElementById('raceHostName')?.value.trim()||'Host').slice(0,20);
  sessionStorage.setItem('racePlayerName', name);
  const btn = document.querySelector('#raceTabCreate .btn--primary');
  if (btn) { btn.textContent='⏳ Creating…'; btn.disabled=true; }

  const roomCode = _genRoomCode();
  const playerId = _racePlayerId();
  const sections = window._raceSections || [];

  try {
    const { error: r1 } = await sb.from('pomo_races').insert({
      room_code: roomCode, quiz_id: window._raceQuizId||'',
      quiz_title: window._raceQuizTitle||'',
      settings: pomodoroSettings, sections,
      total_sections: sections.length, created_by: name
    });
    if (r1) throw r1;

    const { error: r2 } = await sb.from('pomo_race_progress').insert({
      room_code: roomCode, player_id: playerId, player_name: name,
      phase: 'waiting', current_section: 0, total_sections: sections.length
    });
    if (r2) throw r2;

    document.getElementById('raceSetupModal')?.remove();
    Object.assign(raceState, { roomCode, playerId, playerName: name, isHost: true,
      active: true, totalCorrect: 0, totalAnswered: 0, startTime: null });
    _showRaceWaitingRoom(roomCode, name, sections);

  } catch(err) {
    toast('Could not create room: ' + (err.message||err), 'error');
    if (btn) { btn.textContent='🚀 Create Room'; btn.disabled=false; }
  }
}

// ── Join Room ─────────────────────────────────
async function raceJoinRoom() {
  const name = (document.getElementById('raceJoinName')?.value.trim()||'Racer').slice(0,20);
  const code = (document.getElementById('raceJoinCode')?.value.trim()||'').toUpperCase();
  if (code.length < 4) { toast('Enter a valid room code', 'error'); return; }
  sessionStorage.setItem('racePlayerName', name);
  const btn = document.querySelector('#raceTabJoin .btn--primary');
  if (btn) { btn.textContent='⏳ Joining…'; btn.disabled=true; }
  const playerId = _racePlayerId();

  try {
    const { data: room, error } = await sb.from('pomo_races').select('*').eq('room_code',code).single();
    if (error||!room) throw new Error('Room not found. Check the code.');
    if (new Date(room.expires_at) < new Date()) throw new Error('This room has expired.');

    const { data: existing } = await sb.from('pomo_race_progress').select('player_id').eq('room_code',code);
    const alreadyIn = (existing||[]).find(p=>p.player_id===playerId);
    if (!alreadyIn && (existing||[]).length>=2) throw new Error('Room is full (2 players max).');

    await sb.from('pomo_race_progress').upsert({
      room_code: code, player_id: playerId, player_name: name,
      phase: 'waiting', current_section: 0, total_sections: room.total_sections,
      updated_at: new Date().toISOString()
    }, { onConflict: 'room_code,player_id' });

    document.getElementById('raceSetupModal')?.remove();
    window._raceSections  = room.sections;
    window._raceQuizTitle = room.quiz_title;
    Object.assign(pomodoroSettings, room.settings);
    Object.assign(raceState, { roomCode: code, playerId, playerName: name, isHost: false,
      active: true, totalCorrect: 0, totalAnswered: 0, startTime: null });
    _showRaceWaitingRoom(code, name, room.sections, room);

  } catch(err) {
    toast(err.message||'Join failed', 'error');
    if (btn) { btn.textContent='🔗 Join Race'; btn.disabled=false; }
  }
}

// ── Waiting Room ──────────────────────────────
function _showRaceWaitingRoom(roomCode, myName, sections) {
  document.getElementById('raceWaitingModal')?.remove();
  const m = document.createElement('div'); m.className='modal active'; m.id='raceWaitingModal';
  m.innerHTML = `
    <div class="modal-card race-waiting-card">
      <div class="race-waiting-header">
        <div class="race-waiting-icon">⚡</div>
        <div class="race-waiting-title">Waiting for opponent…</div>
      </div>
      <div class="race-room-code-block">
        <div class="race-room-label">Share this code with your friend</div>
        <div class="race-room-code">${roomCode}</div>
        <button class="race-copy-btn" onclick="raceCopyCode('${roomCode}')">📋 Copy Code</button>
      </div>
      <div class="race-players-list" id="racePlayersList">
        <div class="race-player-slot race-player-slot--me">
          <span class="race-player-avatar">${myName[0].toUpperCase()}</span>
          <span class="race-player-name">${escHtml(myName)} <span class="race-you-tag">You</span></span>
          <span class="race-player-status race-status-ready">✓ Ready</span>
        </div>
        <div class="race-player-slot race-player-slot--waiting" id="opponentSlot">
          <span class="race-player-avatar race-avatar-ghost">?</span>
          <span class="race-player-name race-name-ghost">Waiting for player…</span>
          <span class="race-player-status">⏳</span>
        </div>
      </div>
      <div class="race-info-pills">
        <span class="race-pill">📚 ${sections.length} sections</span>
        <span class="race-pill">⏱ ${pomodoroSettings.studyTimeMinutes}m study</span>
        <span class="race-pill">✏️ ${pomodoroSettings.quizTimeMinutes}m quiz</span>
      </div>
      <p class="race-start-hint" id="raceStartHint">Race starts automatically when both players join</p>
      <button class="btn btn--ghost" onclick="raceCancelWaiting()">Cancel</button>
    </div>`;
  document.body.appendChild(m);
  _pollForOpponent(roomCode, sections);
}

function raceCopyCode(code) {
  navigator.clipboard?.writeText(code)
    .then(()=>toast('Code copied! Share with your friend','success'))
    .catch(()=>toast('Code: '+code,'info'));
}
function raceCancelWaiting() {
  _raceStopPoll(); raceState.active=false;
  document.getElementById('raceWaitingModal')?.remove();
}

async function _pollForOpponent(roomCode, sections) {
  _raceStopPoll();
  raceState.pollInterval = setInterval(async()=>{
    try {
      const {data} = await sb.from('pomo_race_progress').select('*').eq('room_code',roomCode);
      if (!data) return;
      const opp = data.find(p=>p.player_id!==raceState.playerId);
      if (opp) {
        const slot=document.getElementById('opponentSlot');
        if (slot) {
          slot.className='race-player-slot race-player-slot--opponent';
          slot.innerHTML=`
            <span class="race-player-avatar" style="background:var(--race-opp)">${opp.player_name[0].toUpperCase()}</span>
            <span class="race-player-name">${escHtml(opp.player_name)}</span>
            <span class="race-player-status race-status-ready">✓ Ready</span>`;
        }
        const hint=document.getElementById('raceStartHint');
        if (hint) hint.textContent='🚀 Starting in 3 seconds…';
        _raceStopPoll();
        setTimeout(()=>_raceBegin(roomCode,sections),3000);
      }
    } catch(e){}
  }, RACE_POLL_MS);
}

// ── Begin Race ────────────────────────────────
function _raceBegin(roomCode, sections) {
  document.getElementById('raceWaitingModal')?.remove();
  pomodoroState = {
    active:true, phase:'study', currentSection:0, sections,
    totalSections:sections.length, timerInterval:null, timeLeft:0,
    isPaused:false, currentQuestions:[], quizResults:[], allIncorrect:[]
  };
  raceState.startTime = Date.now();
  raceState._lastCountedResultIdx = 0;
  _buildPomodoroShell();
  _buildRaceHUD();
  _patchPomodoroForRace();
  enterPomodoroStudy();
  _raceSync('study', 0);
  _startLivePoll();
}

// ── HUD ───────────────────────────────────────
function _buildRaceHUD() {
  document.getElementById('raceHUD')?.remove();
  const hud=document.createElement('div'); hud.id='raceHUD'; hud.className='race-hud';
  hud.innerHTML=`
    <div class="race-hud-header">
      <span class="race-hud-title" id="raceHUDTitle">⚡ Race</span>
      <div class="race-hud-header-btns">
        <button class="race-hud-tab-btn active" id="raceTabProgress" onclick="raceShowTab('progress')" title="Progress">📊</button>
        <button class="race-hud-tab-btn" id="raceTabChat" onclick="raceShowTab('chat')" title="Chat">💬<span class="race-chat-badge" id="raceChatBadge" style="display:none">0</span></button>
        <button class="race-hud-collapse" onclick="raceToggleHUD()" id="raceHUDToggleIcon" title="Collapse">▾</button>
      </div>
    </div>

    <div class="race-hud-body" id="raceHUDBody">

      <!-- Progress Tab -->
      <div id="raceHUDProgress" class="race-hud-tab-pane">
        <div class="race-hud-row race-hud-row--me">
          <div class="race-hud-avatar">${raceState.playerName[0].toUpperCase()}</div>
          <div class="race-hud-info">
            <div class="race-hud-name">${escHtml(raceState.playerName)} <span class="race-you-tag">You</span></div>
            <div class="race-hud-phase" id="raceHUDPhaseMe">📚 Study</div>
          </div>
          <div class="race-hud-stats">
            <div class="race-hud-stat" id="raceHUDSectionMe">1/${pomodoroState.totalSections}</div>
            <div class="race-hud-acc"  id="raceHUDAccMe">—</div>
          </div>
        </div>
        <div class="race-hud-divider">
          <div class="race-hud-vs">VS</div>
          <div class="race-hud-progress-wrap">
            <div class="race-hud-track"><div class="race-hud-bar-me"  id="raceBarMe"  style="width:0%"></div></div>
            <div class="race-hud-track"><div class="race-hud-bar-opp" id="raceBarOpp" style="width:0%"></div></div>
          </div>
        </div>
        <div class="race-hud-row race-hud-row--opp">
          <div class="race-hud-avatar race-hud-avatar--opp" id="raceHUDAvatarOpp">?</div>
          <div class="race-hud-info">
            <div class="race-hud-name" id="raceHUDOppName">Opponent</div>
            <div class="race-hud-phase" id="raceHUDPhaseOpp">⏳ Connecting…</div>
          </div>
          <div class="race-hud-stats">
            <div class="race-hud-stat" id="raceHUDSectionOpp">—</div>
            <div class="race-hud-acc"  id="raceHUDAccOpp">—</div>
          </div>
        </div>

        <!-- Reactions -->
        <div class="race-reactions">
          ${['🔥','💪','😅','👍','🎯','😂'].map(e=>`<button class="race-reaction-btn" onclick="raceSendReaction('${e}')">${e}</button>`).join('')}
        </div>

        <div class="race-hud-time" id="raceHUDTime">⏱ 00:00</div>
      </div>

      <!-- Chat Tab -->
      <div id="raceHUDChat" class="race-hud-tab-pane" style="display:none">
        <div class="race-chat-messages" id="raceChatMessages"></div>
        <div class="race-chat-input-row">
          <input type="text" id="raceChatInput" class="race-chat-input"
            placeholder="Message…" maxlength="80"
            onkeydown="if(event.key==='Enter')raceSendMsg()">
          <button class="race-chat-send" onclick="raceSendMsg()">↑</button>
        </div>
      </div>

    </div>

    <!-- Floating reaction overlay (outside body so not clipped) -->
    <div id="raceReactionOverlay" class="race-reaction-overlay"></div>
  `;
  document.body.appendChild(hud);

  // Elapsed timer
  raceState._hudTimer = setInterval(()=>{
    if (!raceState.startTime) return;
    const s=Math.floor((Date.now()-raceState.startTime)/1000);
    const mm=String(Math.floor(s/60)).padStart(2,'0');
    const ss=String(s%60).padStart(2,'0');
    const el=document.getElementById('raceHUDTime');
    if (el) el.textContent=`⏱ ${mm}:${ss}`;
  },1000);

  // Chat poll (every 4s)
  raceState._chatLastSeen = new Date().toISOString();
  raceState._chatPoll = setInterval(_raceFetchChat, 4000);
}

function raceToggleHUD() {
  const body=document.getElementById('raceHUDBody');
  const icon=document.getElementById('raceHUDToggleIcon');
  if (!body) return;
  const collapsed=body.style.display==='none';
  body.style.display=collapsed?'':'none';
  if (icon) icon.textContent=collapsed?'▾':'▸';
}

function raceShowTab(tab) {
  document.getElementById('raceHUDProgress').style.display = tab==='progress' ? '' : 'none';
  document.getElementById('raceHUDChat').style.display     = tab==='chat'     ? '' : 'none';
  document.getElementById('raceTabProgress').classList.toggle('active', tab==='progress');
  document.getElementById('raceTabChat').classList.toggle('active', tab==='chat');
  if (tab==='chat') {
    // Clear unread badge
    const badge=document.getElementById('raceChatBadge');
    if (badge) { badge.style.display='none'; badge.textContent='0'; }
    raceState._chatUnread = 0;
    // Scroll to bottom
    const msgs=document.getElementById('raceChatMessages');
    if (msgs) msgs.scrollTop=msgs.scrollHeight;
  }
}

// ── Chat & Reactions ──────────────────────────
raceState._chatUnread = 0;
raceState._chatLastSeen = new Date().toISOString();

async function raceSendMsg() {
  const input=document.getElementById('raceChatInput');
  const text=(input?.value||'').trim();
  if (!text||!raceState.roomCode) return;
  input.value='';
  try {
    await sb.from('pomo_race_chat').insert({
      room_code:raceState.roomCode, player_id:raceState.playerId,
      player_name:raceState.playerName, type:'msg', content:text
    });
    _appendChatMsg({ player_id:raceState.playerId, player_name:raceState.playerName, type:'msg', content:text, created_at:new Date().toISOString() }, true);
  } catch(e) { toast('Could not send message','error'); }
}

async function raceSendReaction(emoji) {
  if (!raceState.roomCode) return;
  // Show floating animation on own screen immediately
  _showFloatingReaction(emoji, true);
  try {
    await sb.from('pomo_race_chat').insert({
      room_code:raceState.roomCode, player_id:raceState.playerId,
      player_name:raceState.playerName, type:'reaction', content:emoji
    });
  } catch(e){}
}

async function _raceFetchChat() {
  if (!raceState.active||!raceState.roomCode) return;
  try {
    const { data } = await sb.from('pomo_race_chat')
      .select('*')
      .eq('room_code', raceState.roomCode)
      .gt('created_at', raceState._chatLastSeen)
      .order('created_at', { ascending: true });
    if (!data?.length) return;
    raceState._chatLastSeen = data[data.length-1].created_at;

    data.forEach(m => {
      const isMe = m.player_id === raceState.playerId;
      if (isMe) return; // already shown locally
      if (m.type === 'reaction') {
        _showFloatingReaction(m.content, false);
      } else {
        _appendChatMsg(m, false);
        // Badge if chat tab not active
        const chatPane = document.getElementById('raceHUDChat');
        if (chatPane?.style.display === 'none') {
          raceState._chatUnread = (raceState._chatUnread || 0) + 1;
          const badge = document.getElementById('raceChatBadge');
          if (badge) { badge.style.display='inline-flex'; badge.textContent=raceState._chatUnread; }
        }
      }
    });
  } catch(e){}
}

function _appendChatMsg(m, isMe) {
  const msgs=document.getElementById('raceChatMessages');
  if (!msgs) return;
  const div=document.createElement('div');
  div.className='race-chat-msg' + (isMe?' race-chat-msg--me':'');
  div.innerHTML=isMe
    ? `<span class="race-chat-bubble">${escHtml(m.content)}</span>`
    : `<span class="race-chat-sender">${escHtml(m.player_name)}</span><span class="race-chat-bubble">${escHtml(m.content)}</span>`;
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
}

function _showFloatingReaction(emoji, isMe) {
  const overlay=document.getElementById('raceReactionOverlay');
  if (!overlay) return;
  const el=document.createElement('div');
  el.className='race-floating-reaction' + (isMe?'':' race-floating-reaction--opp');
  el.textContent=emoji;
  overlay.appendChild(el);
  // Animate up then remove
  el.style.cssText=`left:${isMe?'20%':'60%'};animation:raceReactionFloat 1.8s ease-out forwards`;
  setTimeout(()=>el.remove(), 1900);
}

// ── Sync & Poll ───────────────────────────────
async function _raceSync(phase, sectionIdx) {
  if (!raceState.active||!raceState.roomCode) return;
  const elapsed=raceState.startTime?Math.floor((Date.now()-raceState.startTime)/1000):0;
  const acc=raceState.totalAnswered>0?Math.round((raceState.totalCorrect/raceState.totalAnswered)*100):0;
  try {
    await sb.from('pomo_race_progress').upsert({
      room_code:raceState.roomCode, player_id:raceState.playerId,
      player_name:raceState.playerName, phase,
      current_section:sectionIdx, total_sections:pomodoroState.totalSections,
      accuracy:acc, correct:raceState.totalCorrect,
      total_answered:raceState.totalAnswered,
      time_elapsed:elapsed, updated_at:new Date().toISOString()
    },{ onConflict:'room_code,player_id' });
  } catch(e){}
}

function _startLivePoll() {
  _raceStopPoll();
  raceState.pollInterval=setInterval(_raceFetchOpponents, RACE_POLL_MS);
}

async function _raceFetchOpponents() {
  if (!raceState.active) return;
  try {
    const {data}=await sb.from('pomo_race_progress').select('*').eq('room_code',raceState.roomCode);
    if (!data) return;
    raceState.opponents=data.filter(p=>p.player_id!==raceState.playerId);
    _updateRaceHUD();
    const me=data.find(p=>p.player_id===raceState.playerId);
    // Show finale when: both done, OR current player is done and opponent has been seen (has a row)
    if (data.length>=2 && data.every(p=>p.phase==='done')) {
      _showRaceFinale(data);
    } else if (me?.phase==='done' && raceState.opponents.length>0) {
      // I'm done but opponent isn't yet — keep polling until they finish
      if (!raceState.pollInterval) {
        raceState.pollInterval=setInterval(_raceFetchOpponents, RACE_POLL_MS);
      }
    }
  } catch(e){}
}

const _phaseLabels={waiting:'⏳ Waiting',study:'📚 Study',quiz:'✏️ Quiz',break:'☕ Break',results:'📊 Results',done:'🏁 Done'};

function _updateRaceHUD() {
  const opp=raceState.opponents[0];
  const mySection=pomodoroState.currentSection??0;
  const myTotal=pomodoroState.totalSections??1;
  const myAcc=raceState.totalAnswered>0?Math.round((raceState.totalCorrect/raceState.totalAnswered)*100):null;
  const myProg=((mySection+((['done','finish','results'].includes(pomodoroState.phase)&&mySection>=myTotal-1)?1:0))/myTotal)*100;

  _hSet('raceHUDPhaseMe', _phaseLabels[pomodoroState.phase]||'📚 Study');
  _hSet('raceHUDSectionMe', `${mySection+1}/${myTotal}`);
  _hSet('raceHUDAccMe', myAcc!==null?myAcc+'%':'—');
  _hBar('raceBarMe', myProg);

  if (!opp) return;
  const oppProg=((opp.current_section+(opp.phase==='done'?1:0))/(opp.total_sections||1))*100;
  _hSet('raceHUDAvatarOpp', opp.player_name[0].toUpperCase());
  _hSet('raceHUDOppName',   escHtml(opp.player_name));
  _hSet('raceHUDPhaseOpp',  _phaseLabels[opp.phase]||opp.phase);
  _hSet('raceHUDSectionOpp',`${opp.current_section+1}/${opp.total_sections||1}`);
  _hSet('raceHUDAccOpp',    opp.total_answered>0?opp.accuracy+'%':'—');
  _hBar('raceBarOpp', oppProg);

  const title=document.getElementById('raceHUDTitle');
  if (title) {
    if (myProg>oppProg)      title.textContent='⚡ Race — 🟢 Ahead!';
    else if (myProg<oppProg) title.textContent='⚡ Race — 🔴 Behind!';
    else                     title.textContent='⚡ Race — 🟡 Tied!';
  }
}

function _hSet(id,val){ const e=document.getElementById(id); if(e) e.textContent=val; }
function _hBar(id,pct){ const e=document.getElementById(id); if(e) e.style.width=Math.min(100,pct)+'%'; }

// ── Patch Pomodoro Phases ─────────────────────
function _patchPomodoroForRace() {
  const _oS=window.enterPomodoroStudy,   _oQ=window.enterPomodoroQuiz,
        _oB=window.enterPomodoroBreak,   _oR=window._showPomodoroResults,
        _oF=window.finishPomodoro,       _oE=window.pomoExit;

  window.enterPomodoroStudy=function(){
    _oS.call(this); _raceSync('study',pomodoroState.currentSection);
  };
  window.enterPomodoroQuiz=function(){
    _oQ.call(this); _raceSync('quiz',pomodoroState.currentSection);
  };
  window.enterPomodoroBreak=function(){
    _oB.call(this); _raceSync('break',pomodoroState.currentSection);
  };
  window._showPomodoroResults=function(){
    _oR.call(this);
    // Use the most-recently-pushed result (just added by _oR above)
    // Track how many results we've already counted to avoid double-counting on retry
    if (!raceState._lastCountedResultIdx) raceState._lastCountedResultIdx = 0;
    const newResults = pomodoroState.quizResults.slice(raceState._lastCountedResultIdx);
    newResults.forEach(r => { raceState.totalCorrect+=r.score; raceState.totalAnswered+=r.total; });
    raceState._lastCountedResultIdx = pomodoroState.quizResults.length;
    _raceSync('results',pomodoroState.currentSection);
    _updateRaceHUD();
  };
  window.finishPomodoro=function(){
    _raceSync('done',pomodoroState.totalSections-1);
    _oF.call(this);
    _raceStopPoll();
    // Stop HUD elapsed timer and chat poll — they should not keep running after session ends
    if(raceState._hudTimer){clearInterval(raceState._hudTimer);raceState._hudTimer=null;}
    if(raceState._chatPoll){clearInterval(raceState._chatPoll);raceState._chatPoll=null;}
    // Keep raceState.active=true temporarily so _raceFetchOpponents doesn't bail early
    // It will be set to false inside _raceCleanup once the finale is shown
    raceState.active=true;
    setTimeout(_raceFetchOpponents,1500);
  };
  window.pomoExit=function(){
    _raceSync('done',pomodoroState.currentSection);
    _raceCleanup();
    _oE.call(this);
  };
}

// ── Finale ────────────────────────────────────
function _showRaceFinale(allPlayers) {
  if (document.getElementById('raceFinaleModal')) return;
  _raceCleanup(false);
  const me=allPlayers.find(p=>p.player_id===raceState.playerId);
  const opp=allPlayers.find(p=>p.player_id!==raceState.playerId);
  if (!me||!opp) return;
  const myAcc=me.total_answered>0?parseFloat(me.accuracy):0;
  const oppAcc=opp.total_answered>0?parseFloat(opp.accuracy):0;
  const iWon=myAcc>oppAcc||(myAcc===oppAcc&&(me.time_elapsed||9999)<=(opp.time_elapsed||9999));
  const draw=myAcc===oppAcc&&me.time_elapsed===opp.time_elapsed;
  const outcome=draw?'🤝 Draw!':iWon?'🏆 You Win!':'😤 Opponent Wins!';

  // Save result to Supabase history
  const result = draw ? 'tie' : iWon ? 'win' : 'lose';
  if (typeof saveRaceHistory === 'function') {
    saveRaceHistory({
      roomCode:     raceState.roomCode,
      result,
      myScore:      me.correct,
      oppScore:     opp.correct,
      totalQ:       me.total_answered,
      durationSecs: me.time_elapsed || 0,
      opponentName: opp.player_name,
    });
  }
  const outcomeClass=draw?'race-draw':iWon?'race-win':'race-lose';
  const fmtT=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const m=document.createElement('div'); m.className='modal active'; m.id='raceFinaleModal';
  m.innerHTML=`
    <div class="modal-card race-finale-card ${outcomeClass}">
      <div class="race-finale-outcome">${outcome}</div>
      <div class="race-finale-sub">${pomodoroState.totalSections} sections · Race complete</div>
      <div class="race-finale-comparison">
        <div class="race-finale-col ${iWon?'race-col-winner':''}">
          <div class="race-finale-avatar">${(me.player_name[0]||'?').toUpperCase()}</div>
          <div class="race-finale-name">${escHtml(me.player_name)} <span class="race-you-tag">You</span></div>
          <div class="race-finale-big-acc">${myAcc}%</div>
          <div class="race-finale-stat-row">✅ ${me.correct}/${me.total_answered}</div>
          <div class="race-finale-stat-row">⏱ ${fmtT(me.time_elapsed||0)}</div>
          ${iWon&&!draw?'<div class="race-finale-crown">👑</div>':''}
        </div>
        <div class="race-finale-vs">VS</div>
        <div class="race-finale-col ${!iWon&&!draw?'race-col-winner':''}">
          <div class="race-finale-avatar race-finale-avatar--opp">${(opp.player_name[0]||'?').toUpperCase()}</div>
          <div class="race-finale-name">${escHtml(opp.player_name)}</div>
          <div class="race-finale-big-acc">${oppAcc}%</div>
          <div class="race-finale-stat-row">✅ ${opp.correct}/${opp.total_answered}</div>
          <div class="race-finale-stat-row">⏱ ${fmtT(opp.time_elapsed||0)}</div>
          ${!iWon&&!draw?'<div class="race-finale-crown">👑</div>':''}
        </div>
      </div>
      <div class="race-finale-actions">
        <button class="btn btn--primary" onclick="document.getElementById('raceFinaleModal')?.remove();document.getElementById('raceHUD')?.remove();document.getElementById('pomodoroShell')?.remove();showView('dashboard')">🏠 Home</button>
        <button class="btn btn--ghost" onclick="document.getElementById('raceFinaleModal')?.remove();document.getElementById('raceHUD')?.remove();startPomodoro()">🔄 New Race</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

// ── Cleanup ───────────────────────────────────
function _raceStopPoll(){ if(raceState.pollInterval){clearInterval(raceState.pollInterval);raceState.pollInterval=null;} }
function _raceCleanup(removeHUD=true){
  _raceStopPoll();
  if(raceState._hudTimer){clearInterval(raceState._hudTimer);raceState._hudTimer=null;}
  if(raceState._chatPoll){clearInterval(raceState._chatPoll);raceState._chatPoll=null;}
  raceState.active=false;
  if(removeHUD) document.getElementById('raceHUD')?.remove();
}

/* ── Race CSS (injected) ── */
(function(){
  if(document.getElementById('raceStyles')) return;
  const s=document.createElement('style'); s.id='raceStyles';
  s.textContent=`
:root { --race-me:#F5A832; --race-opp:#7C6FD4; --race-win:#27ae60; --race-lose:#e74c3c; }
.race-setup-card { max-width:400px; }
.race-setup-header { display:flex;align-items:center;gap:0.85rem;margin-bottom:1.25rem; }
.race-setup-icon { font-size:2rem; }
.race-setup-title { font-size:1.1rem;font-weight:700; }
.race-setup-sub { font-size:0.8rem;color:var(--slate); }
.race-mode-tabs { display:flex;gap:0.4rem;background:var(--paper);border-radius:8px;padding:4px;margin-bottom:1.1rem;border:1px solid var(--line); }
.race-tab { flex:1;padding:0.45rem;border:none;border-radius:6px;background:transparent;color:var(--slate);font-weight:600;cursor:pointer;transition:all 0.15s;font-size:0.85rem; }
.race-tab.active { background:var(--saffron);color:#0f0f0f; }
.race-info-row { display:flex;align-items:flex-start;gap:0.65rem; }
.race-info-icon { font-size:1.2rem;margin-top:0.2rem; }
.race-info-label { font-size:0.72rem;color:var(--slate);margin-bottom:0.25rem; }
.race-name-input { width:100%;padding:0.4rem 0.65rem;border-radius:7px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:0.88rem; }
.race-code-input { width:100%;padding:0.4rem 0.65rem;border-radius:7px;border:2px solid var(--saffron);background:var(--saffron-soft);color:var(--ink);font-size:1rem;font-weight:700;letter-spacing:0.15em;font-family:monospace; }
.race-create-hint { font-size:0.78rem;color:var(--slate);margin-bottom:0.75rem;line-height:1.5; }
.race-quiz-badge {
  display:flex;align-items:flex-start;gap:0.65rem;
  background:var(--saffron-soft);border:1px solid var(--saffron);
  border-radius:9px;padding:0.75rem 0.9rem;margin-bottom:1rem;font-size:1.2rem;
}
.race-quiz-badge-title { font-weight:700;font-size:0.9rem;margin-bottom:0.15rem; }
.race-quiz-badge-sub   { font-size:0.72rem;color:var(--slate);line-height:1.4; }
.race-share-hint {
  display:flex;align-items:flex-start;gap:0.5rem;
  background:var(--paper);border:1px solid var(--line);
  border-radius:8px;padding:0.65rem 0.8rem;
  font-size:0.78rem;color:var(--slate);line-height:1.5;
}
.race-info-pills { display:flex;flex-wrap:wrap;gap:0.35rem; }
.race-pill { font-size:0.7rem;padding:0.2rem 0.55rem;border-radius:20px;background:var(--paper);border:1px solid var(--line);color:var(--slate); }
.race-you-tag { font-size:0.6rem;background:var(--saffron);color:#0f0f0f;padding:1px 5px;border-radius:4px;font-weight:700;margin-left:3px;vertical-align:middle; }
/* Waiting */
.race-waiting-card { max-width:380px;text-align:center; }
.race-waiting-header { display:flex;align-items:center;justify-content:center;gap:0.65rem;margin-bottom:1.25rem; }
.race-waiting-icon { font-size:1.8rem; }
.race-waiting-title { font-size:1.1rem;font-weight:700; }
.race-room-code-block { background:var(--saffron-soft);border:1px dashed var(--saffron);border-radius:12px;padding:1rem;margin-bottom:1.25rem; }
.race-room-label { font-size:0.72rem;color:var(--slate);margin-bottom:0.4rem; }
.race-room-code { font-size:2rem;font-weight:900;letter-spacing:0.2em;color:var(--saffron);font-family:monospace; }
.race-copy-btn { margin-top:0.5rem;background:none;border:1px solid var(--line);border-radius:6px;color:var(--slate);padding:0.3rem 0.8rem;cursor:pointer;font-size:0.78rem; }
.race-players-list { display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.1rem; }
.race-player-slot { display:flex;align-items:center;gap:0.65rem;padding:0.6rem 0.85rem;border-radius:9px;border:1px solid var(--line); }
.race-player-slot--me { border-color:var(--saffron);background:var(--saffron-soft); }
.race-player-slot--waiting { opacity:0.5; }
.race-player-avatar { width:32px;height:32px;border-radius:50%;background:var(--saffron);color:#0f0f0f;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.82rem;flex-shrink:0; }
.race-avatar-ghost { background:var(--line);color:var(--slate); }
.race-player-name { flex:1;font-weight:600;font-size:0.88rem;text-align:left; }
.race-name-ghost { color:var(--slate); }
.race-player-status { font-size:0.78rem; }
.race-status-ready { color:var(--success); }
.race-start-hint { font-size:0.78rem;color:var(--slate);margin-bottom:0.85rem; }
/* HUD */
.race-hud { position:fixed;bottom:1.25rem;right:1.25rem;z-index:9999;width:290px;background:var(--paper-raised);border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.3);overflow:hidden;font-size:0.82rem; }
.race-hud-title { font-weight:700;font-size:0.78rem;color:var(--saffron); }
.race-hud-body { padding:0.7rem;display:flex;flex-direction:column;gap:0.6rem; }
.race-hud-row { display:flex;align-items:center;gap:0.55rem;padding:0.5rem 0.6rem;border-radius:8px;border:1px solid var(--line); }
.race-hud-row--me  { border-color:rgba(245,168,50,0.4);background:var(--saffron-soft); }
.race-hud-row--opp { border-color:rgba(124,111,212,0.3);background:rgba(124,111,212,0.05); }
.race-hud-avatar { width:26px;height:26px;border-radius:50%;background:var(--saffron);color:#0f0f0f;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.72rem;flex-shrink:0; }
.race-hud-avatar--opp { background:var(--race-opp);color:#fff; }
.race-hud-info { flex:1;min-width:0; }
.race-hud-name { font-weight:700;font-size:0.76rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.race-hud-phase { font-size:0.68rem;color:var(--slate);margin-top:1px; }
.race-hud-stats { display:flex;flex-direction:column;align-items:flex-end;gap:1px;flex-shrink:0; }
.race-hud-stat { font-family:monospace;font-size:0.68rem;color:var(--slate); }
.race-hud-acc  { font-family:monospace;font-size:0.76rem;font-weight:700;color:var(--saffron); }
.race-hud-divider { display:flex;align-items:center;gap:0.45rem; }
.race-hud-vs { font-size:0.62rem;font-weight:800;color:var(--slate);flex-shrink:0; }
.race-hud-progress-wrap { flex:1;display:flex;flex-direction:column;gap:3px; }
.race-hud-track { width:100%;height:5px;background:var(--line);border-radius:3px;overflow:hidden;position:relative; }
.race-hud-bar-me,.race-hud-bar-opp { position:absolute;top:0;left:0;height:100%;border-radius:3px;transition:width 0.6s ease; }
.race-hud-bar-me  { background:var(--saffron); }
.race-hud-bar-opp { background:var(--race-opp); }
.race-hud-time { text-align:center;font-family:monospace;font-size:0.7rem;color:var(--slate); }
/* Finale */
.race-finale-card { max-width:400px;text-align:center; }
.race-finale-outcome { font-size:1.7rem;font-weight:900;margin-bottom:0.2rem; }
.race-win  .race-finale-outcome { color:var(--race-win); }
.race-lose .race-finale-outcome { color:var(--race-lose); }
.race-draw .race-finale-outcome { color:var(--saffron); }
.race-finale-sub { font-size:0.8rem;color:var(--slate);margin-bottom:1.25rem; }
.race-finale-comparison { display:flex;align-items:center;gap:0.65rem;margin-bottom:1.25rem; }
.race-finale-col { flex:1;background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:0.9rem 0.65rem;display:flex;flex-direction:column;align-items:center;gap:0.3rem; }
.race-col-winner { border-color:var(--saffron);background:var(--saffron-soft); }
.race-finale-avatar { width:40px;height:40px;border-radius:50%;background:var(--saffron);color:#0f0f0f;display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:900; }
.race-finale-avatar--opp { background:var(--race-opp);color:#fff; }
.race-finale-name    { font-weight:700;font-size:0.8rem; }
.race-finale-big-acc { font-size:1.5rem;font-weight:900;font-family:monospace;color:var(--saffron); }
.race-finale-stat-row { font-size:0.72rem;color:var(--slate); }
.race-finale-crown { font-size:1.3rem;margin-top:0.2rem; }
.race-finale-vs { font-size:0.78rem;font-weight:800;color:var(--slate);flex-shrink:0; }
.race-finale-actions { display:flex;gap:0.65rem;justify-content:center; }
/* Toggle in setup */
.pomo-race-toggle-row { padding:0.65rem 0.85rem;border:1px solid var(--saffron);border-radius:9px;background:var(--saffron-soft);margin-bottom:0.75rem; }
.pomo-race-toggle-label { display:flex;align-items:center;gap:0.65rem;cursor:pointer;flex-wrap:wrap; }
.pomo-race-label-text { font-weight:700;font-size:0.9rem; }
.pomo-race-label-sub { font-size:0.72rem;color:var(--slate);width:100%;margin-left:calc(36px + 0.65rem);margin-top:-0.15rem; }

/* HUD tabs */
.race-hud-header { display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.65rem;background:var(--saffron-soft);border-bottom:1px solid var(--line); }
.race-hud-header-btns { display:flex;align-items:center;gap:0.3rem; }
.race-hud-tab-btn { background:none;border:1px solid transparent;border-radius:6px;padding:0.2rem 0.4rem;cursor:pointer;font-size:0.85rem;color:var(--slate);position:relative;transition:all 0.12s; }
.race-hud-tab-btn.active { background:var(--saffron);color:#0f0f0f;border-color:var(--saffron); }
.race-hud-collapse { background:none;border:none;cursor:pointer;font-size:0.72rem;color:var(--slate);padding:0.2rem 0.3rem; }
.race-hud-tab-pane { display:flex;flex-direction:column;gap:0.45rem; }
.race-chat-badge {
  position:absolute;top:-4px;right:-4px;background:var(--error);color:#fff;
  font-size:0.55rem;font-weight:800;width:14px;height:14px;border-radius:50%;
  display:inline-flex;align-items:center;justify-content:center;
}

/* Reactions */
.race-reactions { display:flex;gap:0.3rem;justify-content:center;flex-wrap:wrap;padding:0.3rem 0; }
.race-reaction-btn { background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:0.25rem 0.4rem;cursor:pointer;font-size:1rem;transition:transform 0.1s; }
.race-reaction-btn:hover { transform:scale(1.25); }
.race-reaction-btn:active { transform:scale(0.9); }

/* Chat */
.race-chat-messages { height:110px;overflow-y:auto;display:flex;flex-direction:column;gap:0.35rem;padding:0.35rem 0; }
.race-chat-msg { display:flex;flex-direction:column;gap:0.1rem; }
.race-chat-msg--me { align-items:flex-end; }
.race-chat-sender { font-size:0.6rem;color:var(--slate);margin-left:0.25rem; }
.race-chat-bubble {
  display:inline-block;max-width:85%;font-size:0.78rem;line-height:1.4;
  padding:0.3rem 0.55rem;border-radius:10px;
  background:var(--paper);border:1px solid var(--line);
}
.race-chat-msg--me .race-chat-bubble { background:var(--saffron);color:#0f0f0f;border-color:var(--saffron); }
.race-chat-input-row { display:flex;gap:0.4rem;padding-top:0.35rem;border-top:1px solid var(--line); }
.race-chat-input { flex:1;padding:0.35rem 0.55rem;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);font-size:0.8rem; }
.race-chat-input:focus { outline:none;border-color:var(--saffron); }
.race-chat-send { background:var(--saffron);color:#0f0f0f;border:none;border-radius:8px;padding:0.35rem 0.6rem;cursor:pointer;font-weight:800;font-size:0.9rem; }

/* Floating reaction overlay */
.race-reaction-overlay { position:fixed;inset:0;pointer-events:none;z-index:10000;overflow:hidden; }
.race-floating-reaction {
  position:absolute;bottom:20%;font-size:2.2rem;
  animation:raceReactionFloat 1.8s ease-out forwards;
  pointer-events:none;
}
@keyframes raceReactionFloat {
  0%   { transform:translateY(0) scale(0.5); opacity:0; }
  15%  { transform:translateY(-10px) scale(1.3); opacity:1; }
  80%  { transform:translateY(-120px) scale(1); opacity:1; }
  100% { transform:translateY(-160px) scale(0.8); opacity:0; }
}

@media(max-width:480px){
  .race-hud { width:calc(100vw - 2rem);right:1rem;bottom:5rem; }
  .race-finale-comparison { flex-direction:column; }
}
  `;
  document.head.appendChild(s);
})();
