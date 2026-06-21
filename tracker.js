/* =============================================
   tracker.js — SSC Daily Tracker
   Supabase backend, embedded in index.html
   Tables needed:
     tracker_tasks  (id, user_id, name, cat, sec, dur, days, sort_order, created_at)
     tracker_days   (id, user_id, date_key, task_id, done, created_at)
     tracker_notes  (id, user_id, date_key, cat, text, created_at)
   All rows have user_id = auth.uid(), RLS enabled.
============================================= */

/* ── SQL to run in Supabase SQL Editor ────────────────────────
create table if not exists tracker_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  name text not null,
  cat text not null default 'english',
  sec text not null default 'subah',
  dur text not null default '30 min',
  days text not null default 'daily',
  sort_order int not null default 0,
  created_at timestamptz default now()
);
alter table tracker_tasks enable row level security;
create policy "own tasks" on tracker_tasks for all using (auth.uid() = user_id);

create table if not exists tracker_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date_key text not null,
  task_id uuid references tracker_tasks(id) on delete cascade,
  done boolean not null default false,
  created_at timestamptz default now(),
  unique(user_id, date_key, task_id)
);
alter table tracker_days enable row level security;
create policy "own days" on tracker_days for all using (auth.uid() = user_id);

create table if not exists tracker_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date_key text not null,
  cat text not null default 'english',
  text text not null,
  created_at timestamptz default now()
);
alter table tracker_notes enable row level security;
create policy "own notes" on tracker_notes for all using (auth.uid() = user_id);
──────────────────────────────────────────────── */

(function () {
  'use strict';

  /* ── Default tasks (seed on first load) ─────────────────── */
  const DEFAULT_TASKS = [

    /* ════════════════ 🌅 MORNING ════════════════ */

    // English
    {name:'Vocabulary — 7 New Words With Examples & Sentences',  cat:'english',   sec:'subah',   dur:'25 min', days:'daily'},
    {name:'Idioms & Phrases — 3 New + Previous Recall',          cat:'english',   sec:'subah',   dur:'15 min', days:'daily'},
    {name:'Grammar — New Concept / Rule (Error Spotting Focus)',  cat:'english',   sec:'subah',   dur:'20 min', days:'daily'},

    // GS — History (rotate daily)
    {name:'Modern History — New Chapter Reading',                 cat:'gs',        sec:'subah',   dur:'40 min', days:'mon,thu'},
    {name:'Medieval History — New Chapter Reading',               cat:'gs',        sec:'subah',   dur:'40 min', days:'tue,fri'},
    {name:'Ancient History — New Chapter Reading',                cat:'gs',        sec:'subah',   dur:'40 min', days:'wed,sat'},

    // GS — Other subjects (rotate)
    {name:'Geography — New Chapter Reading',                      cat:'gs',        sec:'subah',   dur:'40 min', days:'mon,thu'},
    {name:'Polity — New Chapter Reading',                         cat:'gs',        sec:'subah',   dur:'40 min', days:'tue,fri'},
    {name:'Economy — New Chapter Reading',                        cat:'gs',        sec:'subah',   dur:'40 min', days:'wed,sat'},
    {name:'Science — Biology New Chapter',                        cat:'gs',        sec:'subah',   dur:'30 min', days:'mon,wed,fri'},
    {name:'Science — Chemistry New Chapter',                      cat:'gs',        sec:'subah',   dur:'30 min', days:'tue,sat'},
    {name:'Science — Physics New Chapter',                        cat:'gs',        sec:'subah',   dur:'30 min', days:'thu'},
    {name:'Static GK — New Topics (Awards, Books, Schemes)',      cat:'gs',        sec:'subah',   dur:'20 min', days:'daily'},

    // Maths Morning
    {name:'Maths — Formula Revision (All Chapters)',              cat:'maths',     sec:'subah',   dur:'20 min', days:'daily'},
    {name:'Maths — Chapter Practice (Algebra / SI-CI / Profit)',  cat:'maths',     sec:'subah',   dur:'40 min', days:'mon,wed,fri'},
    {name:'Maths — Chapter Practice (Geometry / Mensuration)',    cat:'maths',     sec:'subah',   dur:'40 min', days:'tue,thu,sat'},

    // Reasoning Morning
    {name:'Reasoning — Chapter Practice (Series / Analogy)',      cat:'reasoning', sec:'subah',   dur:'30 min', days:'mon,wed,fri'},
    {name:'Reasoning — Chapter Practice (Puzzle / Seating)',      cat:'reasoning', sec:'subah',   dur:'30 min', days:'tue,thu,sat'},

    /* ════════════════ ☀️ AFTERNOON ════════════════ */

    // Sectional Mocks
    {name:'Maths Sectional Mock — 25 Questions (Timed)',          cat:'maths',     sec:'dopahar', dur:'30 min', days:'mon,wed,fri'},
    {name:'Reasoning Sectional Mock — 25 Questions (Timed)',      cat:'reasoning', sec:'dopahar', dur:'20 min', days:'tue,thu,sat'},
    {name:'English Sectional Mock — 25 Questions (Timed)',        cat:'english',   sec:'dopahar', dur:'20 min', days:'mon,wed,fri'},
    {name:'GS Sectional Mock — 25 Questions (Timed)',             cat:'gs',        sec:'dopahar', dur:'20 min', days:'tue,thu,sat'},

    // Mock Analysis
    {name:'Mock Analysis — Wrong Qs, Silly Mistakes, Time Audit', cat:'analysis',  sec:'dopahar', dur:'60 min', days:'daily'},

    // GS Revision Afternoon
    {name:'Modern History — PYQ Practice (20 Qs)',                cat:'gs',        sec:'dopahar', dur:'20 min', days:'mon,thu'},
    {name:'Medieval History — PYQ Practice (20 Qs)',              cat:'gs',        sec:'dopahar', dur:'20 min', days:'tue,fri'},
    {name:'Ancient History — PYQ Practice (20 Qs)',               cat:'gs',        sec:'dopahar', dur:'20 min', days:'wed,sat'},
    {name:'Geography — PYQ Practice (20 Qs)',                     cat:'gs',        sec:'dopahar', dur:'20 min', days:'mon,thu'},
    {name:'Polity — PYQ Practice (20 Qs)',                        cat:'gs',        sec:'dopahar', dur:'20 min', days:'tue,fri'},
    {name:'Economy — PYQ Practice (20 Qs)',                       cat:'gs',        sec:'dopahar', dur:'20 min', days:'wed,sat'},

    /* ════════════════ 🌆 EVENING ════════════════ */

    // Complete Mock Test (alternate days)
    {name:'Full Mock Test — All 4 Sections (100 Qs, 60 min)',     cat:'analysis',  sec:'shaam',   dur:'60 min', days:'tue,thu,sat'},

    // Revision
    {name:'Vocabulary Evening Recall — 7 Words from Morning',     cat:'english',   sec:'shaam',   dur:'15 min', days:'daily'},
    {name:'Idioms Revision — Last 7 Days',                        cat:'english',   sec:'shaam',   dur:'10 min', days:'daily'},
    {name:'Grammar Practice — 15 Error Spotting / Fill Blanks',   cat:'english',   sec:'shaam',   dur:'20 min', days:'daily'},

    // GS Revision Evening
    {name:'Science — Biology Revision + 15 Qs',                   cat:'gs',        sec:'shaam',   dur:'25 min', days:'mon,wed,fri'},
    {name:'Science — Chemistry Revision + 15 Qs',                 cat:'gs',        sec:'shaam',   dur:'25 min', days:'tue,sat'},
    {name:'Science — Physics Revision + 15 Qs',                   cat:'gs',        sec:'shaam',   dur:'25 min', days:'thu'},
    {name:'Static GK Revision — Previous Topics Quick Recall',    cat:'gs',        sec:'shaam',   dur:'20 min', days:'daily'},

    // Maths Evening
    {name:'Maths — Geometry 10 Qs Daily Practice',                cat:'maths',     sec:'shaam',   dur:'20 min', days:'daily'},
    {name:'Maths — Number System / Simplification 10 Qs',         cat:'maths',     sec:'shaam',   dur:'20 min', days:'daily'},

    // Reasoning Evening
    {name:'Reasoning — Syllogism / Blood Relation 10 Qs',         cat:'reasoning', sec:'shaam',   dur:'15 min', days:'mon,wed,fri'},
    {name:'Reasoning — Coding-Decoding / Direction 10 Qs',        cat:'reasoning', sec:'shaam',   dur:'15 min', days:'tue,thu,sat'},

    /* ════════════════ 🌙 NIGHT ════════════════ */

    // Night Revision
    {name:'Modern History — Chapter Revision Notes',              cat:'gs',        sec:'raat',    dur:'20 min', days:'mon,thu'},
    {name:'Medieval History — Chapter Revision Notes',            cat:'gs',        sec:'raat',    dur:'20 min', days:'tue,fri'},
    {name:'Ancient History — Chapter Revision Notes',             cat:'gs',        sec:'raat',    dur:'20 min', days:'wed,sat'},
    {name:'Polity — Chapter Revision Notes',                      cat:'gs',        sec:'raat',    dur:'20 min', days:'mon,thu'},
    {name:'Economy — Chapter Revision Notes',                     cat:'gs',        sec:'raat',    dur:'20 min', days:'tue,fri'},
    {name:'Geography — Chapter Revision Notes',                   cat:'gs',        sec:'raat',    dur:'20 min', days:'wed,sat'},

    // English Night
    {name:'English — Reading Comprehension Practice (1 Passage)', cat:'english',   sec:'raat',    dur:'20 min', days:'daily'},
    {name:'Final Vocabulary Recall — All 7 Words + Meanings',     cat:'english',   sec:'raat',    dur:'10 min', days:'daily'},

    // Maths Night
    {name:'Maths — Weak Chapter Targeted Practice',               cat:'maths',     sec:'raat',    dur:'30 min', days:'mon,wed,fri'},
    {name:'Maths — Formula Sheet Update & Revision',              cat:'maths',     sec:'raat',    dur:'15 min', days:'tue,thu,sat'},

    // Reasoning Night
    {name:'Reasoning — Weak Topic Targeted Practice',             cat:'reasoning', sec:'raat',    dur:'25 min', days:'mon,wed,fri'},
    {name:'Reasoning — Previous Year Qs Practice',                cat:'reasoning', sec:'raat',    dur:'25 min', days:'tue,thu,sat'},

    // Day Wrap
    {name:'Full Mock Analysis (if taken today) — Error Log',      cat:'analysis',  sec:'raat',    dur:'30 min', days:'tue,thu,sat'},
    {name:'Tomorrow Plan — Tasks Review + Priority Set',          cat:'analysis',  sec:'raat',    dur:'10 min', days:'daily'},
  ];

  const SECTIONS = [
    {key:'subah',   label:'🌅 Morning'},
    {key:'dopahar', label:'☀️ Afternoon'},
    {key:'shaam',   label:'🌆 Evening'},
    {key:'raat',    label:'🌙 Night'},
  ];
  const WDAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const WKEYS  = ['sun','mon','tue','wed','thu','fri','sat'];

  /* ── State ───────────────────────────────────────────────── */
  let trkTasks   = [];   // tracker_tasks rows
  let trkDays    = {};   // { date_key: { task_id: true/false } }
  let trkNotes   = [];   // tracker_notes rows
  let trkCurrent = todayKey();
  let trkBarRange= 30;
  let trkNoteFilter = 'all';
  let trkUserId  = null;
  let trkLoaded  = false;

  /* ── Helpers ─────────────────────────────────────────────── */
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function addDays(key, delta) {
    const [y,m,d] = key.split('-').map(Number);
    const dt = new Date(y, m-1, d+delta);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }
  function fmtDate(k) {
    const d = new Date(k+'T00:00:00');
    return `${WDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}${k===todayKey()?' (Today)':''}`;
  }
  function dayOfWeek(k) { return WKEYS[new Date(k+'T00:00:00').getDay()]; }

  function taskVisibleOn(task, key) {
    const days = task.days;
    if (days === 'daily') return true;
    const dow = dayOfWeek(key);
    return days.split(',').map(s=>s.trim()).includes(dow);
  }

  function setSyncStatus(msg, type='') {
    const el = document.getElementById('trk-sync-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'trk-sync-status' + (type ? ' '+type : '');
  }

  /* ── Supabase ops ────────────────────────────────────────── */
  async function trkLoad() {
    if (!window.sb) { setSyncStatus('Supabase not ready','err'); return; }
    const { data: { user } } = await window.sb.auth.getUser();
    if (!user) { setSyncStatus('Login karein tracker use karne ke liye','err'); return; }
    trkUserId = user.id;

    setSyncStatus('Loading…');

    // Load tasks
    const { data: tasks, error: te } = await window.sb
      .from('tracker_tasks').select('*').eq('user_id', trkUserId).order('sort_order');
    if (te) { setSyncStatus('Tasks load failed: '+te.message,'err'); return; }
    trkTasks = tasks || [];

    // If no tasks, seed defaults
    if (trkTasks.length === 0) {
      setSyncStatus('Setting up default tasks…');
      const inserts = DEFAULT_TASKS.map((t, i) => ({
        user_id: trkUserId, name: t.name, cat: t.cat, sec: t.sec,
        dur: t.dur, days: t.days, sort_order: i
      }));
      const { data: seeded, error: se } = await window.sb
        .from('tracker_tasks').insert(inserts).select();
      if (se) { setSyncStatus('Seed failed: '+se.message,'err'); return; }
      trkTasks = seeded || [];
    }

    // Load day records (last 1 year)
    const fromKey = addDays(todayKey(), -365);
    const { data: dayRows, error: de } = await window.sb
      .from('tracker_days').select('*')
      .eq('user_id', trkUserId)
      .gte('date_key', fromKey);
    if (de) { setSyncStatus('Days load failed: '+de.message,'err'); return; }
    trkDays = {};
    (dayRows || []).forEach(r => {
      if (!trkDays[r.date_key]) trkDays[r.date_key] = {};
      trkDays[r.date_key][r.task_id] = r.done;
    });

    // Load notes
    const { data: notes, error: ne } = await window.sb
      .from('tracker_notes').select('*')
      .eq('user_id', trkUserId).order('created_at', {ascending:false});
    if (ne) { setSyncStatus('Notes load failed: '+ne.message,'err'); return; }
    trkNotes = notes || [];

    trkLoaded = true;
    setSyncStatus('Synced ✓', 'ok');
    renderTrkToday();
    renderTrkAnalytics();
    renderTrkNotes();
    renderTrkManage();
  }

  async function trkToggleTask(taskId) {
    if (!trkUserId) return;
    const key = trkCurrent;
    const prev = (trkDays[key] && trkDays[key][taskId]) || false;
    const next = !prev;
    if (!trkDays[key]) trkDays[key] = {};
    trkDays[key][taskId] = next;
    renderTrkToday();

    const { error } = await window.sb.from('tracker_days').upsert({
      user_id: trkUserId, date_key: key, task_id: taskId, done: next
    }, { onConflict: 'user_id,date_key,task_id' });
    if (error) {
      trkDays[key][taskId] = prev;
      setSyncStatus('Toggle failed','err');
      renderTrkToday();
    } else {
      setSyncStatus('Synced ✓','ok');
    }
  }

  async function trkAddTask() {
    const name = document.getElementById('trkNewName')?.value.trim();
    const dur  = (document.getElementById('trkNewDur')?.value.trim() || '30') + ' min';
    const cat  = document.getElementById('trkNewCat')?.value || 'english';
    const sec  = document.getElementById('trkNewSec')?.value || 'subah';
    if (!name) return;

    const chks = document.querySelectorAll('#trkDayChks input[type="checkbox"]:checked');
    const vals = Array.from(chks).map(c => c.value);
    const days = vals.includes('daily') ? 'daily' : (vals.join(',') || 'daily');

    const { data, error } = await window.sb.from('tracker_tasks').insert({
      user_id: trkUserId, name, cat, sec, dur, days,
      sort_order: trkTasks.length
    }).select().single();
    if (error) { setSyncStatus('Add failed: '+error.message,'err'); return; }
    trkTasks.push(data);
    document.getElementById('trkNewName').value = '';
    document.getElementById('trkNewDur').value = '';
    document.querySelectorAll('#trkDayChks input').forEach(c => c.checked = false);
    setSyncStatus('Task added ✓','ok');
    renderTrkToday(); renderTrkManage();
  }
  window.trkAddTask = trkAddTask;

  async function trkDeleteTask(id) {
    if (!confirm('Delete this task?')) return;
    const { error } = await window.sb.from('tracker_tasks').delete().eq('id', id);
    if (error) { setSyncStatus('Delete failed','err'); return; }
    trkTasks = trkTasks.filter(t => t.id !== id);
    setSyncStatus('Deleted ✓','ok');
    renderTrkToday(); renderTrkManage();
  }

  async function trkSaveNote() {
    const text = document.getElementById('trkNoteText')?.value.trim();
    const cat  = document.getElementById('trkNoteCat')?.value || 'english';
    if (!text) return;
    const { data, error } = await window.sb.from('tracker_notes').insert({
      user_id: trkUserId, date_key: todayKey(), cat, text
    }).select().single();
    if (error) { setSyncStatus('Note save failed','err'); return; }
    trkNotes.unshift(data);
    document.getElementById('trkNoteText').value = '';
    setSyncStatus('Note saved ✓','ok');
    renderTrkNotes();
  }
  window.trkSaveNote = trkSaveNote;

  async function trkDeleteNote(id) {
    const { error } = await window.sb.from('tracker_notes').delete().eq('id', id);
    if (error) { setSyncStatus('Delete failed','err'); return; }
    trkNotes = trkNotes.filter(n => n.id !== id);
    setSyncStatus('Deleted ✓','ok');
    renderTrkNotes();
  }

  async function trkResetAll() {
    if (!confirm('Sab data delete ho jaayega. Sure ho?')) return;
    await window.sb.from('tracker_notes').delete().eq('user_id', trkUserId);
    await window.sb.from('tracker_days').delete().eq('user_id', trkUserId);
    await window.sb.from('tracker_tasks').delete().eq('user_id', trkUserId);
    trkTasks=[]; trkDays={}; trkNotes=[];
    setSyncStatus('Reset done','ok');
    renderTrkToday(); renderTrkManage(); renderTrkNotes(); renderTrkAnalytics();
    // re-seed
    await trkLoad();
  }
  window.trkResetAll = trkResetAll;

  async function trkSyncNow() {
    trkLoaded = false;
    setSyncStatus('Syncing…');
    await trkLoad();
  }
  window.trkSyncNow = trkSyncNow;

  /* ── Score helpers ───────────────────────────────────────── */
  function calcScore(key) {
    const d = trkDays[key] || {};
    return trkTasks.filter(t => taskVisibleOn(t, key) && d[t.id]).length;
  }
  function calcMax(key) {
    return trkTasks.filter(t => taskVisibleOn(t, key)).length;
  }
  function calcStreak() {
    let s = 0, k = todayKey();
    for (let i = 0; i < 365; i++) {
      if (calcScore(k) > 0) { s++; k = addDays(k, -1); }
      else break;
    }
    return s;
  }

  /* ── Render: Today ───────────────────────────────────────── */
  function renderTrkToday() {
    const score = calcScore(trkCurrent);
    const max   = calcMax(trkCurrent);
    const pct   = max ? Math.round(score/max*100) : 0;

    document.getElementById('trkTodayScore').textContent  = score;
    document.getElementById('trkScoreTotal').textContent  = max;
    document.getElementById('trkProgressFill').style.width = pct+'%';
    document.getElementById('trkProgressPct').textContent  = pct+'% complete';
    document.getElementById('trkStreakBadge').textContent  = '🔥 '+calcStreak()+' day streak';
    document.getElementById('trkDateDisplay').textContent  = fmtDate(trkCurrent);
    document.getElementById('trkPrevBtn').disabled = false;
    document.getElementById('trkNextBtn').disabled = trkCurrent >= todayKey();

    const grid = document.getElementById('trkTasksGrid');
    grid.innerHTML = '';
    const dayData = trkDays[trkCurrent] || {};

    SECTIONS.forEach(sec => {
      const visible = trkTasks.filter(t => t.sec === sec.key && taskVisibleOn(t, trkCurrent));
      if (!visible.length) return;
      const done = visible.filter(t => dayData[t.id]).length;

      const lbl = document.createElement('div');
      lbl.className = 'section-label';
      lbl.innerHTML = `${sec.label} <span class="section-count">${done}/${visible.length}</span>`;
      grid.appendChild(lbl);

      visible.forEach(task => {
        const isDone = !!dayData[task.id];
        const row = document.createElement('div');
        row.className = 'task-row' + (isDone ? ' done' : '');
        row.innerHTML = `
          <div class="task-check">${isDone ? '✓' : ''}</div>
          <div class="cat-dot cat-${task.cat}"></div>
          <div class="task-info">
            <div class="task-name">${task.name}</div>
            <div class="task-meta">${task.dur} · ${task.cat}</div>
          </div>
        `;
        row.addEventListener('click', () => trkToggleTask(task.id));
        grid.appendChild(row);
      });
    });

    if (!trkTasks.length) {
      grid.innerHTML = '<div style="text-align:center;color:var(--trk-muted);padding:2rem;font-size:0.84rem;">Loading tasks…</div>';
    }
  }

  /* ── Render: Analytics ───────────────────────────────────── */
  function renderTrkAnalytics() {
    // Stat cards
    const today = todayKey();
    const score = calcScore(today);
    const max   = calcMax(today);
    const streak= calcStreak();
    let totalDone = 0;
    Object.keys(trkDays).forEach(k => {
      Object.values(trkDays[k]).forEach(v => { if(v) totalDone++; });
    });

    const row = document.getElementById('trkStatRow');
    if (row) row.innerHTML = `
      <div class="stat-card"><div class="stat-val">${score}/${max}</div><div class="stat-lbl">Today</div></div>
      <div class="stat-card"><div class="stat-val">${streak}</div><div class="stat-lbl">Streak</div></div>
      <div class="stat-card"><div class="stat-val">${totalDone}</div><div class="stat-lbl">Total Done</div></div>
    `;

    // Calendar
    renderTrkCalendar();
    renderTrkBarChart();
  }

  function renderTrkCalendar() {
    const grid = document.getElementById('trkCalGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const today = todayKey();
    const end   = new Date(today+'T00:00:00');
    const start = new Date(end); start.setDate(start.getDate() - 363);
    // Align to Sunday
    while (start.getDay() !== 0) start.setDate(start.getDate()-1);

    let col = null;
    let cur = new Date(start);
    while (cur <= end) {
      if (cur.getDay() === 0) { col = document.createElement('div'); col.className='cal-col'; grid.appendChild(col); }
      const k = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
      const s = calcScore(k), m = calcMax(k);
      const level = !m ? 0 : s===0 ? 0 : s<m*0.25 ? 1 : s<m*0.5 ? 2 : s<m*0.75 ? 3 : 4;
      const colors = ['var(--trk-g0)','var(--trk-g1)','var(--trk-g2)','var(--trk-g3)','var(--trk-g4)'];
      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      cell.style.background = colors[level];
      if (level > 0) cell.style.border = 'none';
      cell.title = `${k}: ${s}/${m}`;
      col.appendChild(cell);
      cur.setDate(cur.getDate()+1);
    }
  }

  function renderTrkBarChart() {
    const chart = document.getElementById('trkBarChart');
    if (!chart) return;
    chart.innerHTML = '';
    const today = todayKey();
    const days  = trkBarRange || 365;
    const keys  = [];
    for (let i = days-1; i >= 0; i--) keys.push(addDays(today, -i));
    const scores = keys.map(k => calcScore(k));
    const maxS   = Math.max(...scores, 1);
    scores.forEach((s, i) => {
      const bar = document.createElement('div');
      bar.className = 'bar-col';
      bar.style.height = Math.max(4, Math.round(s/maxS*70))+'px';
      bar.title = keys[i]+': '+s;
      chart.appendChild(bar);
    });
  }
  window.trkSetBarRange = function(r) {
    trkBarRange = r;
    ['30','90','All'].forEach(x => {
      const btn = document.getElementById('trkBarBtn'+x);
      if (btn) btn.classList.toggle('active', (x==='All'?0:+x)===r);
    });
    renderTrkBarChart();
  };

  /* ── Render: Notes ───────────────────────────────────────── */
  function renderTrkNotes() {
    const list = document.getElementById('trkNotesList');
    if (!list) return;
    const filtered = trkNoteFilter === 'all' ? trkNotes : trkNotes.filter(n => n.cat === trkNoteFilter);
    const catColors = {english:'var(--trk-english)',gs:'var(--trk-gs)',maths:'var(--trk-maths)',
      reasoning:'var(--trk-reasoning)',analysis:'var(--trk-analysis)'};
    list.innerHTML = filtered.length ? filtered.map(n => `
      <div class="note-item">
        <div class="note-item-head">
          <span class="note-item-date">${n.date_key}</span>
          <span class="note-item-cat" style="background:${catColors[n.cat]}22;color:${catColors[n.cat]}">${n.cat}</span>
          <button class="note-del-btn" onclick="trkDelNote('${n.id}')">✕</button>
        </div>
        <div class="note-item-text">${n.text}</div>
      </div>
    `).join('') : '<div style="text-align:center;color:var(--trk-muted);padding:1.5rem;font-size:0.84rem;">Koi note nahi</div>';
  }
  window.trkDelNote = async (id) => { await trkDeleteNote(id); };

  /* ── Render: Manage ──────────────────────────────────────── */
  function renderTrkManage() {
    const list = document.getElementById('trkManageList');
    if (!list) return;
    if (!trkTasks.length) { list.innerHTML = '<div style="color:var(--trk-muted);font-size:0.84rem;">No tasks yet.</div>'; return; }

    let html = '';
    SECTIONS.forEach(sec => {
      const tasks = trkTasks.filter(t => t.sec === sec.key);
      if (!tasks.length) return;
      html += `<div class="section-label">${sec.label} <span class="section-count">${tasks.length}</span></div>`;
      html += tasks.map(t => `
        <div class="manage-task-row" id="mrow-${t.id}">
          <div class="cat-dot cat-${t.cat}" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:2px"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name}</div>
            <div style="font-size:0.68rem;color:var(--trk-muted);font-family:'JetBrains Mono',monospace;">${t.dur} · ${t.cat} · ${t.days}</div>
          </div>
          <button class="manage-edit-btn" onclick="trkEditTask('${t.id}')">✎ Edit</button>
          <button class="manage-del-btn" onclick="trkDelTask('${t.id}')">✕</button>
        </div>
      `).join('');
    });
    list.innerHTML = html;
  }
  window.trkDelTask  = async (id) => { await trkDeleteTask(id); };

  window.trkEditTask = function(id) {
    const t = trkTasks.find(x => x.id === id);
    if (!t) return;
    const row = document.getElementById('mrow-'+id);
    if (!row) return;

    const CAT_OPTS = ['english','gs','maths','reasoning','analysis'];
    const SEC_OPTS = [{k:'subah',l:'🌅 Morning'},{k:'dopahar',l:'☀️ Afternoon'},{k:'shaam',l:'🌆 Evening'},{k:'raat',l:'🌙 Night'}];
    const WDAY_OPTS = ['mon','tue','wed','thu','fri','sat','sun'];

    const curDays = t.days === 'daily' ? [] : t.days.split(',').map(s=>s.trim());
    const isDaily = t.days === 'daily';

    row.innerHTML = `
      <div style="width:100%;display:flex;flex-direction:column;gap:8px;padding:4px 0;">
        <input class="trk-input" id="edit-name-${id}" value="${t.name}" placeholder="Task name">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input class="trk-input" id="edit-dur-${id}" type="number" min="1" value="${parseInt(t.dur)||30}" placeholder="Minutes" style="width:90px;flex:none">
          <span style="color:var(--trk-muted);font-size:0.78rem;align-self:center;">min</span>
          <select class="trk-select" id="edit-cat-${id}" style="flex:1">
            ${CAT_OPTS.map(c=>`<option value="${c}" ${t.cat===c?'selected':''}>${c}</option>`).join('')}
          </select>
          <select class="trk-select" id="edit-sec-${id}" style="flex:1">
            ${SEC_OPTS.map(s=>`<option value="${s.k}" ${t.sec===s.k?'selected':''}>${s.l}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
          <label class="day-chk" style="${isDaily?'border-color:var(--trk-accent2);color:var(--trk-accent2)':''}">
            <input type="checkbox" id="edit-daily-${id}" value="daily" ${isDaily?'checked':''}> Daily
          </label>
          ${WDAY_OPTS.map(d=>`
            <label class="day-chk" style="${!isDaily&&curDays.includes(d)?'border-color:var(--trk-accent);color:var(--trk-accent)':''}">
              <input type="checkbox" class="edit-day-${id}" value="${d}" ${!isDaily&&curDays.includes(d)?'checked':''}> ${d.charAt(0).toUpperCase()+d.slice(1)}
            </label>`).join('')}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="add-submit" style="flex:1" onclick="trkSaveEdit('${id}')">💾 Save</button>
          <button class="manage-del-btn" style="padding:8px 14px" onclick="renderTrkManage()">Cancel</button>
        </div>
      </div>`;

    // Daily toggle logic
    document.getElementById('edit-daily-'+id).addEventListener('change', function() {
      document.querySelectorAll('.edit-day-'+id).forEach(c => { c.checked=false; c.closest('label').style.cssText=''; });
      this.closest('label').style.cssText = this.checked ? 'border-color:var(--trk-accent2);color:var(--trk-accent2)' : '';
    });
    document.querySelectorAll('.edit-day-'+id).forEach(c => {
      c.addEventListener('change', function() {
        const dl = document.getElementById('edit-daily-'+id);
        if(this.checked && dl.checked) { dl.checked=false; dl.closest('label').style.cssText=''; }
      });
    });
  };

  window.trkSaveEdit = async function(id) {
    const name = document.getElementById('edit-name-'+id)?.value.trim();
    const dur  = document.getElementById('edit-dur-'+id)?.value || '30';
    const cat  = document.getElementById('edit-cat-'+id)?.value || 'english';
    const sec  = document.getElementById('edit-sec-'+id)?.value || 'subah';
    if (!name) return;

    const isDaily = document.getElementById('edit-daily-'+id)?.checked;
    const dayChks = document.querySelectorAll('.edit-day-'+id+':checked');
    const days = isDaily ? 'daily' : (Array.from(dayChks).map(c=>c.value).join(',') || 'daily');

    const { error } = await window.sb.from('tracker_tasks').update({
      name, cat, sec, dur: dur+' min', days
    }).eq('id', id);

    if (error) { setSyncStatus('Save failed: '+error.message,'err'); return; }
    const idx = trkTasks.findIndex(t=>t.id===id);
    if (idx>-1) trkTasks[idx] = {...trkTasks[idx], name, cat, sec, dur: dur+' min', days};
    setSyncStatus('Saved ✓','ok');
    renderTrkManage();
    renderTrkToday();
  };

  /* ── Tab switching ───────────────────────────────────────── */
  function initTrkTabs() {
    document.querySelectorAll('.trk-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.trk-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.trk-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById('trk-tab-'+btn.dataset.trktab);
        if (panel) panel.classList.add('active');
        // Refresh on tab open
        if (btn.dataset.trktab === 'analytics') renderTrkAnalytics();
        if (btn.dataset.trktab === 'notes')     renderTrkNotes();
        if (btn.dataset.trktab === 'manage')    renderTrkManage();
      });
    });

    // Notes filter
    document.querySelectorAll('.notes-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.notes-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        trkNoteFilter = btn.dataset.trkfilter || 'all';
        renderTrkNotes();
      });
    });

    // Date nav
    document.getElementById('trkPrevBtn')?.addEventListener('click', () => {
      trkCurrent = addDays(trkCurrent, -1); renderTrkToday();
    });
    document.getElementById('trkNextBtn')?.addEventListener('click', () => {
      const nk = addDays(trkCurrent, 1);
      if (nk <= todayKey()) { trkCurrent = nk; renderTrkToday(); }
    });
    document.getElementById('trkTodayBtn')?.addEventListener('click', () => {
      trkCurrent = todayKey(); renderTrkToday();
    });

    // Daily checkbox toggle
    document.getElementById('trkChkDaily')?.addEventListener('change', function() {
      if (this.checked) {
        document.querySelectorAll('#trkDayChks input:not(#trkChkDaily)').forEach(c => c.checked = false);
      }
    });
    document.querySelectorAll('#trkDayChks input:not(#trkChkDaily)').forEach(c => {
      c.addEventListener('change', function() {
        if (this.checked) document.getElementById('trkChkDaily').checked = false;
      });
    });
  }

  /* ── Boot: load when tracker view opened ────────────────── */
  function initTracker() {
    initTrkTabs();

    // Load data when tracker view becomes active (via sidebar click)
    const observer = new MutationObserver(() => {
      const view = document.getElementById('view-tracker');
      if (view && view.classList.contains('active') && !trkLoaded) {
        trkLoad();
      }
    });
    const viewTracker = document.getElementById('view-tracker');
    if (viewTracker) {
      observer.observe(viewTracker, { attributes: true, attributeFilter: ['class'] });
    }

    // Also load if already active on init
    if (viewTracker?.classList.contains('active')) trkLoad();
  }

  // Init after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTracker);
  } else {
    initTracker();
  }

})();
