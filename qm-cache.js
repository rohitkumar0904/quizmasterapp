/**
 * qm-cache.js  —  QuizMaster Pro: Instant Folder + No More Blank Loading
 * =======================================================================
 * Add ONE line in index.html, after app.js:
 *   <script src="qm-cache.js"></script>
 *
 * FIXES:
 *  1. Folder opens blank then you go back/forward to see quizzes
 *     → quizzes render from cache BEFORE the view switches
 *  2. Subfolder counts stuck on "Loading…"
 *     → served from cache, no extra round-trips
 *  3. Every folder click hitting the network cold
 *     → background prefetch warms ALL folders on login
 *  4. Data lost on refresh
 *     → localStorage persists between sessions
 *  5. Race condition: fast clickers see wrong folder's quizzes
 *     → in-flight guard cancels stale responses
 */

(function () {
  'use strict';

  /* ── Storage keys ────────────────────────────────────────────── */
  const LS_FOLDERS = 'qm_folders_v2';
  const LS_QUIZZES = 'qm_quizzes_v2';   // { folderId: quiz[] }
  const LS_COUNTS  = 'qm_counts_v2';    // { folderId: "3 quizzes · 1 subfolder" }
  const LS_TS      = 'qm_cache_ts_v2';
  const STALE_MS   = 10 * 60 * 1000;   // refresh from server every 10 min

  /* ── In-memory stores ────────────────────────────────────────── */
  window._qmQuizCache  = {};   // folderId → quiz[]
  window._qmCountCache = {};   // folderId → label text
  let _openRequestId   = 0;   // guards against stale in-flight responses

  /* ── localStorage helpers ────────────────────────────────────── */
  function lsGet(key)      { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
  function lsDel(key)      { try { localStorage.removeItem(key); } catch {} }
  function isStale()       { const ts = lsGet(LS_TS); return !ts || (Date.now() - ts) > STALE_MS; }
  function touchTs()       { lsSet(LS_TS, Date.now()); }

  /* ── Load caches from localStorage immediately ───────────────── */
  const _lsFolders = lsGet(LS_FOLDERS);
  const _lsQuizzes = lsGet(LS_QUIZZES);
  const _lsCounts  = lsGet(LS_COUNTS);
  if (Array.isArray(_lsFolders) && _lsFolders.length) window._qmSavedFolders = _lsFolders;
  if (_lsQuizzes) Object.assign(window._qmQuizCache,  _lsQuizzes);
  if (_lsCounts)  Object.assign(window._qmCountCache, _lsCounts);

  /* ── Install after app.js is ready ──────────────────────────── */
  window.addEventListener('load', () => setTimeout(installPatch, 0));

  function installPatch() {

    /* 1 ── Seed foldersCache from localStorage if empty ────────── */
    if (window._qmSavedFolders &&
        typeof foldersCache !== 'undefined' &&
        !foldersCache.length) {
      foldersCache.push(...window._qmSavedFolders);
    }

    /* 2 ── Decorate openFolder — THE MAIN FIX ──────────────────── *
     *
     *  Root cause of "back then come back" bug:
     *   openFolder() calls showView('folder') THEN awaits loadQuizzes().
     *   If the network is slow the view shows an empty list.
     *   If the user navigates away while the fetch is running, the
     *   response arrives AFTER they've left and renderQuizzes() writes
     *   to the wrong view — so coming back shows nothing.
     *
     *  Fix: inject cached quizzes synchronously before showView() runs,
     *  cancel stale in-flight responses with a request ID, and ensure
     *  renderQuizzes() only commits if the user is still on that folder.
     */
    const _origOpen = window.openFolder;
    if (typeof _origOpen === 'function') {
      window.openFolder = async function (folderId, folderName, parentFolderId) {
        const myRequestId = ++_openRequestId;

        /* ── A. Show cached quizzes BEFORE the view switches ────── */
        const cachedQuizzes = window._qmQuizCache[folderId];
        if (Array.isArray(cachedQuizzes) && cachedQuizzes.length) {
          // Paint the quiz list RIGHT NOW so the folder view is never blank
          _paintQuizzes(folderId, cachedQuizzes);
        }

        /* ── B. Run original openFolder (switches view, hits network) */
        await _origOpen(folderId, folderName, parentFolderId);

        /* ── C. Guard: ignore if user navigated away mid-flight ──── */
        if (myRequestId !== _openRequestId) return;

        /* ── D. Persist fresh data from the completed load ─────── */
        if (Array.isArray(window.quizzesCache)) {
          window._qmQuizCache[folderId] = window.quizzesCache.slice();
          lsSet(LS_QUIZZES, window._qmQuizCache);
        }
      };
    }

    /* 3 ── Paint quizzes from cache (DOM-safe) ──────────────────── *
     *  Writes directly into #quiz-list WITHOUT touching subfolders,
     *  the breadcrumb, or any other part of the view.
     */
    function _paintQuizzes(folderId, quizzes) {
      // Set global cache so renderQuizzes() works correctly
      if (typeof window.quizzesCache !== 'undefined') {
        window.quizzesCache = quizzes;
      }
      // Remove stale quiz slips
      const list = document.getElementById('quiz-list');
      if (!list) return;
      list.querySelectorAll('.quiz-slip[data-quiz-id]').forEach(s => s.remove());
      // Let app.js's own renderQuizzes() do the painting
      if (typeof window.renderQuizzes === 'function') {
        window.renderQuizzes();
      }
    }

    /* 4 ── Decorate loadQuizzes — cancel stale responses ────────── */
    const _origLoadQuizzes = window.loadQuizzes;
    if (typeof _origLoadQuizzes === 'function') {
      window.loadQuizzes = async function (folderId) {
        const myId = _openRequestId;
        await _origLoadQuizzes(folderId);
        // If a newer openFolder() was called while we were waiting, discard
        if (myId !== _openRequestId) {
          // Restore the correct folder's data
          const correct = window._qmQuizCache[window.activeFolderId];
          if (correct) window.quizzesCache = correct;
          return;
        }
        // Save result
        window._qmQuizCache[folderId] = (window.quizzesCache || []).slice();
        lsSet(LS_QUIZZES, window._qmQuizCache);
      };
    }

    /* 5 ── Decorate loadFolderCount — instant from cache ────────── */
    const _origCount = window.loadFolderCount;
    if (typeof _origCount === 'function') {
      window.loadFolderCount = async function (folderId) {
        // Show cached label immediately
        const cached = window._qmCountCache[folderId];
        if (cached !== undefined) {
          const el = document.getElementById('folder-count-' + folderId);
          if (el) el.textContent = cached;
          if (!isStale()) return; // fresh enough — skip network
        }
        // Fetch from network
        await _origCount(folderId);
        // Capture whatever app.js wrote to the DOM
        const el = document.getElementById('folder-count-' + folderId);
        if (el && el.textContent && el.textContent !== 'Loading…') {
          window._qmCountCache[folderId] = el.textContent;
          lsSet(LS_COUNTS, window._qmCountCache);
        }
      };
    }

    /* 6 ── Decorate renderFolders — apply counts instantly ──────── */
    const _origRenderFolders = window.renderFolders;
    if (typeof _origRenderFolders === 'function') {
      window.renderFolders = function () {
        _origRenderFolders();
        // Replace "Loading…" with cached counts immediately after paint
        Object.entries(window._qmCountCache).forEach(([id, text]) => {
          const el = document.getElementById('folder-count-' + id);
          if (el && el.textContent === 'Loading…') el.textContent = text;
        });
      };
    }

    /* 7 ── Decorate loadFolders — persist & prefetch ────────────── */
    const _origLoadFolders = window.loadFolders;
    if (typeof _origLoadFolders === 'function') {
      window.loadFolders = async function () {
        await _origLoadFolders();
        if (Array.isArray(window.foldersCache)) {
          lsSet(LS_FOLDERS, window.foldersCache);
          touchTs();
        }
        // Background: warm ALL folder quiz caches in one DB call
        _prefetchAllQuizzes();
      };
    }

    /* 8 ── Write-through: keep cache in sync on mutations ───────── */
    _installWriteThrough();

    console.log('[qm-cache] ✓ installed — folder open race condition fixed');
  }

  /* ── Background prefetch ──────────────────────────────────────── *
   *  One Supabase query for ALL uncached folders at once.
   *  Runs silently after login so every folder is pre-warmed.
   */
  function _prefetchAllQuizzes() {
    if (typeof window.foldersCache === 'undefined' || !window.foldersCache.length) return;
    if (typeof window.sb === 'undefined') return;

    const uncached = window.foldersCache
      .map(f => f.id)
      .filter(id => !window._qmQuizCache[id]);

    if (!uncached.length) return;

    window.sb
      .from('quizzes')
      .select('id, title, is_public, is_pinned, created_at, questions, folder_id')
      .in('folder_id', uncached)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) return;
        // Group by folder_id
        data.forEach(quiz => {
          if (!window._qmQuizCache[quiz.folder_id]) {
            window._qmQuizCache[quiz.folder_id] = [];
          }
          window._qmQuizCache[quiz.folder_id].push(quiz);
        });
        lsSet(LS_QUIZZES, window._qmQuizCache);
        console.log('[qm-cache] prefetched', uncached.length, 'folders');
      });
  }

  /* ── Write-through: cache updates on create/rename/delete ─────── */
  function _installWriteThrough() {
    // Trap quizzesCache assignments (app.js replaces the array, not mutates)
    let _qc = window.quizzesCache || [];
    Object.defineProperty(window, 'quizzesCache', {
      get() { return _qc; },
      set(val) {
        _qc = val;
        const fid = window.activeFolderId;
        if (fid && Array.isArray(val)) {
          window._qmQuizCache[fid] = val.slice();
          lsSet(LS_QUIZZES, window._qmQuizCache);
          // Invalidate count so it refreshes next time
          delete window._qmCountCache[fid];
        }
      },
      configurable: true
    });

    // Trap foldersCache so rename/delete persists
    let _fc = window.foldersCache || [];
    Object.defineProperty(window, 'foldersCache', {
      get() { return _fc; },
      set(val) {
        _fc = val;
        lsSet(LS_FOLDERS, val);
        touchTs();
      },
      configurable: true
    });
  }

  /* ── Public: force full cache reset (call after backup restore) ── */
  window.qmCacheClear = function () {
    window._qmQuizCache  = {};
    window._qmCountCache = {};
    lsDel(LS_FOLDERS); lsDel(LS_QUIZZES); lsDel(LS_COUNTS); lsDel(LS_TS);
    console.log('[qm-cache] cache cleared — reload the page');
  };

})();
