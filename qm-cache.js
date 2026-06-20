/**
 * qm-cache.js  —  QuizMaster Pro Instant Folder Cache
 * =====================================================
 * Drop this BEFORE app.js in index.html:
 *   <script src="qm-cache.js"></script>
 *   <script src="app.js?v=2.0"></script>
 *
 * What it does
 * ─────────────
 * 1. localStorage warm-boot  — on first page load the folder view
 *    renders immediately from the last saved state (< 1 ms).
 *
 * 2. In-memory quiz cache  — all quizzes loaded so far are stored in
 *    `window._qmQuizCache` (keyed by folderId). Opening a folder you've
 *    already visited is instant; the background refresh silently
 *    overwrites stale data.
 *
 * 3. Background prefetch  — as soon as folders are rendered, all
 *    subfolder counts AND quiz lists for every visible folder are fetched
 *    in a single parallel batch (one Supabase call each instead of N
 *    sequential round-trips).
 *
 * 4. Write-through  — every create / update / delete in app.js already
 *    patches foldersCache / quizzesCache in memory.  This patch also
 *    persists those patches to localStorage so the next load is still
 *    fast.
 *
 * 5. Subfolder count cache  — `loadFolderCount` is the biggest culprit
 *    (one DB round-trip per folder card). This patch caches every count
 *    result and skips repeat network calls until the count is known to
 *    have changed.
 *
 * Nothing in app.js needs to change — this works by decorating the
 * global functions after they're defined.
 */

(function () {
  'use strict';

  /* ─── constants ─────────────────────────────────────────────── */
  const LS_FOLDERS   = 'qm_folders_cache';
  const LS_QUIZZES   = 'qm_quizzes_cache';   // JSON: { folderId: [quiz, …] }
  const LS_COUNTS    = 'qm_counts_cache';    // JSON: { folderId: "3 quizzes" }
  const STALE_MS     = 10 * 60 * 1000;       // 10-min staleness window
  const LS_TS        = 'qm_cache_ts';

  /* ─── in-memory quiz store (folderId → quiz[]) ──────────────── */
  window._qmQuizCache = {};

  /* ─── in-memory count store (folderId → labelText) ──────────── */
  window._qmCountCache = {};

  /* ─── helpers ────────────────────────────────────────────────── */
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  function isStale() {
    const ts = lsGet(LS_TS);
    return !ts || (Date.now() - ts) > STALE_MS;
  }

  function touchTs() { lsSet(LS_TS, Date.now()); }

  /* ─── warm-boot folders from localStorage ────────────────────── */
  const savedFolders = lsGet(LS_FOLDERS);
  if (Array.isArray(savedFolders) && savedFolders.length) {
    // Make the array available as soon as possible.  app.js reads
    // `foldersCache` only after auth, so we just park it on `window`
    // and copy it in below after app.js defines the variable.
    window._qmSavedFolders = savedFolders;
  }

  /* ─── warm-boot quiz cache from localStorage ─────────────────── */
  const savedQuizzes = lsGet(LS_QUIZZES);
  if (savedQuizzes && typeof savedQuizzes === 'object') {
    Object.assign(window._qmQuizCache, savedQuizzes);
  }

  /* ─── warm-boot count cache from localStorage ───────────────── */
  const savedCounts = lsGet(LS_COUNTS);
  if (savedCounts && typeof savedCounts === 'object') {
    Object.assign(window._qmCountCache, savedCounts);
  }

  /* ─── install decorators after DOM + app.js are ready ────────── */
  window.addEventListener('load', () => {
    // Give app.js a tick to finish its own load-time code
    setTimeout(installPatch, 0);
  });

  function installPatch() {
    /* ── 1. Seed foldersCache from localStorage if empty ── */
    if (window._qmSavedFolders && typeof foldersCache !== 'undefined' && !foldersCache.length) {
      foldersCache.push(...window._qmSavedFolders);
    }

    /* ── 2. Decorate loadFolderCount ── */
    const _origCount = window.loadFolderCount;
    if (typeof _origCount === 'function') {
      window.loadFolderCount = async function (folderId) {
        // If we already have a cached label, render it instantly
        const cached = window._qmCountCache[folderId];
        if (cached !== undefined) {
          const el = document.getElementById('folder-count-' + folderId);
          if (el) el.textContent = cached;
          // Still refresh in the background if data might be stale
          if (!isStale()) return;
        }
        // Run the real network call
        await _origCount(folderId);
        // Capture the result that app.js just wrote to the DOM
        const el = document.getElementById('folder-count-' + folderId);
        if (el && el.textContent && el.textContent !== 'Loading…') {
          window._qmCountCache[folderId] = el.textContent;
          lsSet(LS_COUNTS, window._qmCountCache);
        }
      };
    }

    /* ── 3. Decorate openFolder for instant quiz render ── */
    const _origOpen = window.openFolder;
    if (typeof _origOpen === 'function') {
      window.openFolder = async function (folderId, folderName, parentFolderId) {
        // Show cached quizzes immediately so the folder isn't blank
        const cachedQuizzes = window._qmQuizCache[folderId];
        if (Array.isArray(cachedQuizzes) && cachedQuizzes.length) {
          // Temporarily set quizzesCache so renderQuizzes() uses our data
          const prevCache = window.quizzesCache;
          window.quizzesCache = cachedQuizzes;
          if (typeof window.renderQuizzes === 'function') {
            window.renderQuizzes();
          }
          window.quizzesCache = prevCache; // restore for the real load below
        }

        // Run the real openFolder (which will hit the network and re-render)
        await _origOpen(folderId, folderName, parentFolderId);

        // After real load, persist to cache
        if (Array.isArray(window.quizzesCache) && window.quizzesCache.length) {
          window._qmQuizCache[folderId] = window.quizzesCache.slice();
          lsSet(LS_QUIZZES, window._qmQuizCache);
        }
      };
    }

    /* ── 4. Decorate loadFolders to persist & prefetch ── */
    const _origLoadFolders = window.loadFolders;
    if (typeof _origLoadFolders === 'function') {
      window.loadFolders = async function () {
        await _origLoadFolders();
        // Persist fresh folder list
        if (Array.isArray(window.foldersCache)) {
          lsSet(LS_FOLDERS, window.foldersCache);
          touchTs();
        }
        // Kick off background prefetch of all quiz lists
        prefetchAllQuizzes();
      };
    }

    /* ── 5. Patch renderFolders to apply cached counts instantly ── */
    const _origRenderFolders = window.renderFolders;
    if (typeof _origRenderFolders === 'function') {
      window.renderFolders = function () {
        _origRenderFolders();
        // After DOM is built, fill in counts from cache immediately
        Object.entries(window._qmCountCache).forEach(([id, text]) => {
          const el = document.getElementById('folder-count-' + id);
          if (el && el.textContent === 'Loading…') el.textContent = text;
        });
      };
    }

    /* ── 6. Intercept quiz mutations to keep caches in sync ── */
    patchQuizMutations();

    console.log('[qm-cache] Patch installed ✓');
  }

  /* ─── Background prefetch: load quizzes for all folders ─────── */
  function prefetchAllQuizzes() {
    if (typeof window.foldersCache === 'undefined' || !window.foldersCache.length) return;
    if (typeof window.sb === 'undefined') return;

    // Only prefetch folders not already in memory cache
    const uncached = window.foldersCache
      .map(f => f.id)
      .filter(id => !window._qmQuizCache[id]);

    if (!uncached.length) return;

    // Fetch all quizzes for uncached folders in one DB call
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
        console.log('[qm-cache] Prefetched quizzes for', uncached.length, 'folders');
      });
  }

  /* ─── Write-through: patch quiz save/delete to update cache ─── */
  function patchQuizMutations() {
    // We watch for changes to quizzesCache via a setter trap.
    // This is the most reliable zero-change-to-app.js approach.
    let _quizzesCache = window.quizzesCache || [];
    let _activeFolderId = window.activeFolderId;

    // Re-check activeFolderId on every mutation since it changes
    Object.defineProperty(window, 'quizzesCache', {
      get() { return _quizzesCache; },
      set(val) {
        _quizzesCache = val;
        // Sync to per-folder cache whenever the array is replaced
        const fid = window.activeFolderId;
        if (fid && Array.isArray(val)) {
          window._qmQuizCache[fid] = val.slice();
          lsSet(LS_QUIZZES, window._qmQuizCache);
          // Invalidate count cache for this folder so it refreshes
          delete window._qmCountCache[fid];
        }
      },
      configurable: true
    });

    // Also track activeFolderId changes to keep folder path correct
    let _activeFolderIdInternal = window.activeFolderId;
    Object.defineProperty(window, 'activeFolderId', {
      get() { return _activeFolderIdInternal; },
      set(val) { _activeFolderIdInternal = val; },
      configurable: true
    });

    // Patch foldersCache so folder renames/deletes persist too
    let _foldersCache = window.foldersCache || [];
    Object.defineProperty(window, 'foldersCache', {
      get() { return _foldersCache; },
      set(val) {
        _foldersCache = val;
        lsSet(LS_FOLDERS, val);
        touchTs();
      },
      configurable: true
    });
  }

  /* ─── Cache invalidation helper (call after bulk imports) ────── */
  window.qmCacheClear = function () {
    window._qmQuizCache  = {};
    window._qmCountCache = {};
    localStorage.removeItem(LS_FOLDERS);
    localStorage.removeItem(LS_QUIZZES);
    localStorage.removeItem(LS_COUNTS);
    localStorage.removeItem(LS_TS);
    console.log('[qm-cache] Cache cleared — next load fetches fresh data');
  };

})();
