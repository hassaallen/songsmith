// Songsmith — liquid-glass mobile-first client logic.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = {
    loginView: $('login-view'), appView: $('app-view'),
    loginForm: $('login-form'), loginUser: $('login-username'),
    loginPass: $('login-password'), loginError: $('login-error'),

    draftTitle: $('draft-title'), saveStatus: $('save-status'),
    menuBtn: $('menu-btn'), menuDropdown: $('menu-dropdown'),
    newDraftBtn: $('new-draft-btn'), logoutBtn: $('logout-btn'),

    chipRow: $('chip-row'),
    modePill: $('mode-pill'), modeMenu: $('mode-menu'),
    shuffleBtn: $('shuffle-btn'), sourceList: $('source-list'), sourceNotice: $('source-notice'),
    addTextBtn: $('add-text-btn'), filterBtn: $('filter-btn'),

    filterModal: $('filter-modal'), filterList: $('filter-list'),
    filterAll: $('filter-all'), filterNone: $('filter-none'),
    filterApply: $('filter-apply'), filterCancel: $('filter-cancel'),

    textModal: $('text-modal'), textTitle: $('text-title'), textAuthor: $('text-author'),
    textBody: $('text-body'), textSave: $('text-save'), textCancel: $('text-cancel'), textError: $('text-error'),

    scratchpad: $('scratchpad'), followStrip: $('follow-strip'), followChips: $('follow-chips'),

    syllableGutter: $('syllable-gutter'), syllGutterInner: $('syllable-gutter-inner'),
    syllToggle: $('syll-toggle'), rhymeToggle: $('rhyme-toggle'),

    toolsPanel: $('tools-panel'),
    sheetBackdrop: $('sheet-backdrop'), wordSheet: $('word-sheet'),
    sheetHandle: $('sheet-handle'), sheetContent: $('sheet-content'),

    editFab: $('edit-fab'),

    tabbar: $('tabbar'),
    viewWrite: $('view-write'), viewForge: $('view-forge'), viewTray: $('view-tray'), viewSongs: $('view-songs'),
    draftsList: $('drafts-list'), songsNewBtn: $('songs-new-btn'),

    trayList: $('tray-list'), trayBadge: $('tray-badge'),

    forgeWordsPill: $('forge-words-pill'), forgeNotice: $('forge-notice'),
    forgeLineEls: [$('forge-line-0'), $('forge-line-1'), $('forge-line-2')],
    forgeBench: $('forge-bench'), benchPills: $('bench-pills'),
    benchClearBtn: $('bench-clear-btn'), benchTosongBtn: $('bench-tosong-btn'), benchKeepBtn: $('bench-keep-btn'),
    forgeLineCards: null, // filled in after el is built (querySelectorAll)
    forgeRerollBtn: $('forge-reroll-btn'), forgeDealBtn: $('forge-deal-btn'),
    forgePopover: $('forge-popover'),
  };
  el.forgeLineCards = [...document.querySelectorAll('.forge-line-card')];

  const TOOLS_HINT = '<p class="muted tools-hint">Select a word for rhymes &amp; synonyms.</p>';
  const MODE_LABELS = { library: 'All voices', poetry_random: 'Poems', my_texts: 'My texts' };
  const STOPWORDS = new Set([
    'a', 'an', 'and', 'or', 'but', 'nor', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as', 'is',
    'am', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', "it's", 'this', 'that', 'these', 'those',
    'there', 'here', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
    'his', 'our', 'their', 'mine', 'yours', 'do', 'does', 'did', 'done', 'have', 'has', 'had', 'having', 'will',
    'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'not', 'no', 'yes', 'so', 'if', 'then',
    'than', 'when', 'what', 'who', 'whom', 'whose', 'which', 'how', 'where', 'why', 'oh', 'ah', 'eh', 'la',
    'de', 'le', 'du', 'des', 'les', 'el', 'il', 'en', 'un', 'une', 'aux', 'au', 'etc', 'et',
  ]);

  let currentDraftId = null;
  let dirty = false;
  let saveTimer = null;
  let followTimer = null;
  let currentMode = 'library';
  let selectedSources = [];   // empty = all sources
  let libManifest = null;
  let authorTypeMap = null;

  // Browse vs edit mode. Everyone starts in browse: pointer media queries lie on
  // S Pen devices (Samsung phones/tablets report a fine pointer), which locked
  // touch users into edit mode. Desktop users tap the FAB once to type.
  let editMode = false;

  // ---------- Syllable gutter / rhyme colour state ----------
  let syllablesOn = readBool('songsmith.syllables', true);
  let rhymesOn = readBool('songsmith.rhymes', true);
  let gutterTimer = null;
  let rhymeTimer = null;
  const rhymeCache = new Map(); // normalised end word -> array of lowercase rhyme words (from Datamuse)
  const RHYME_CACHE_KEY = 'songsmith.rhymecache';
  const RHYME_CACHE_CAP = 200;

  function readBool(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? def : v === '1';
    } catch (_) { return def; }
  }
  function writeBool(key, val) {
    try { localStorage.setItem(key, val ? '1' : '0'); } catch (_) {}
  }

  // ---------- Auth ----------
  async function init() {
    try {
      const r = await API.me();
      if (r.authenticated) return startApp();
    } catch (_) {}
    show(el.loginView);
  }

  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.loginError.classList.add('hidden');
    try {
      await API.login(el.loginUser.value.trim(), el.loginPass.value);
      // Verify the session cookie actually stuck (it silently won't over plain
      // http or with cookies blocked) before declaring victory.
      const check = await API.me();
      if (!check.authenticated) {
        throw new Error('Signed in, but the session was not kept. Check you are on https:// and cookies are allowed.');
      }
      startApp();
    } catch (err) {
      el.loginError.textContent = err.message;
      el.loginError.classList.remove('hidden');
    }
  });

  el.logoutBtn.addEventListener('click', async () => {
    await API.logout().catch(() => {});
    location.reload();
  });

  function show(view) {
    el.loginView.classList.add('hidden');
    el.appView.classList.add('hidden');
    view.classList.remove('hidden');
  }

  async function startApp() {
    show(el.appView);
    await loadDraftsList();
    await loadSources();
    loadTray(); // populate the tab badge count; view render happens on first tab visit
  }

  // ---------- Header "⋯" menu ----------
  el.menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.menuDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!el.menuDropdown.classList.contains('hidden') && !el.menuDropdown.contains(e.target) && e.target !== el.menuBtn) {
      el.menuDropdown.classList.add('hidden');
    }
  });
  el.newDraftBtn.addEventListener('click', () => {
    el.menuDropdown.classList.add('hidden');
    startNewDraft();
  });
  function startNewDraft() {
    if (!dirty || confirm('Start a new song? Unsaved changes will be saved first.')) {
      flushSave().then(() => { newDraft(); showView('write'); });
    }
  }
  el.songsNewBtn.addEventListener('click', startNewDraft);

  // ---------- Bottom tab bar / views ----------
  el.tabbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) showView(btn.dataset.view);
  });

  function showView(name) {
    [el.viewWrite, el.viewForge, el.viewTray, el.viewSongs].forEach((v) => v.classList.add('hidden'));
    el.tabbar.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    if (name === 'write') el.viewWrite.classList.remove('hidden');
    else if (name === 'forge') { el.viewForge.classList.remove('hidden'); ensureForgeReady(); }
    else if (name === 'tray') { el.viewTray.classList.remove('hidden'); loadTray().then(renderTrayList); }
    else if (name === 'songs') { el.viewSongs.classList.remove('hidden'); renderDraftsList(); }
  }

  // ---------- Drafts ----------
  let draftsCache = [];
  async function loadDraftsList() {
    const { drafts } = await API.listDrafts();
    draftsCache = drafts;
    if (drafts.length) {
      await openDraft(drafts[0].id);
    } else {
      newDraft();
    }
  }

  function renderDraftsList() {
    el.draftsList.innerHTML = '';
    if (!draftsCache.length) {
      el.draftsList.innerHTML = '<p class="muted" style="padding:10px">No songs yet — tap + New song to start one.</p>';
      return;
    }
    draftsCache.forEach((d) => {
      const c = document.createElement('div');
      c.className = 'draft-card';
      const when = d.updated_at ? formatDate(d.updated_at) : '';
      c.innerHTML = `<span class="draft-card-title">${escapeHtml(d.title || 'Untitled')}</span>` +
                    `<span class="draft-card-date">${escapeHtml(when)}</span>`;
      c.addEventListener('click', async () => { await openDraft(d.id); showView('write'); });
      el.draftsList.appendChild(c);
    });
  }

  function formatDate(s) {
    const d = new Date(s.replace(' ', 'T'));
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
           ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  async function openDraft(id) {
    const { draft } = await API.getDraft(id);
    currentDraftId = draft.id;
    el.draftTitle.value = draft.title || '';
    // textContent (not innerText): keeps \n as literal characters in text nodes,
    // which the syllable/rhyme line detection depends on. pre-wrap renders them.
    el.scratchpad.textContent = draft.body || '';
    hideWordTools();
    applyEditMode();
    markSaved();
    updateFollowStrip();
    recomputeGutter();
    scheduleRhymes();
  }

  function newDraft() {
    currentDraftId = null;
    el.draftTitle.value = '';
    el.scratchpad.textContent = '';
    hideWordTools();
    applyEditMode();
    markSaved();
    updateFollowStrip();
    recomputeGutter();
    scheduleRhymes();
  }

  function setSaveStatus(text, tone) {
    el.saveStatus.textContent = text;
    el.saveStatus.title = text;
    el.saveStatus.classList.remove('amber', 'green', 'red');
    if (tone) el.saveStatus.classList.add(tone);
  }

  function markDirty() {
    dirty = true;
    setSaveStatus('editing…', 'amber');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 1200);
  }
  function markSaved() { dirty = false; setSaveStatus('saved', 'green'); }

  async function flushSave() {
    if (!dirty && currentDraftId) return;
    const payload = { title: el.draftTitle.value.trim() || 'Untitled', body: el.scratchpad.innerText };
    setSaveStatus('saving…', 'amber');
    try {
      if (currentDraftId) {
        await API.updateDraft(currentDraftId, payload);
      } else {
        const r = await API.createDraft(payload);
        currentDraftId = r.id;
      }
      await refreshDraftsCache();
      markSaved();
    } catch (err) {
      setSaveStatus('save failed', 'red');
    }
  }

  async function refreshDraftsCache() {
    const { drafts } = await API.listDrafts();
    draftsCache = drafts;
    if (!el.viewSongs.classList.contains('hidden')) renderDraftsList();
  }

  el.draftTitle.addEventListener('input', markDirty);

  // ---------- Tray ----------
  let trayCache = [];

  async function loadTray() {
    try {
      const { items } = await API.trayList();
      trayCache = items;
    } catch (_) { /* keep whatever was cached before; badge/list just won't update */ }
    updateTrayBadge();
  }

  function updateTrayBadge() {
    const n = trayCache.length;
    el.trayBadge.textContent = n > 99 ? '99+' : String(n);
    el.trayBadge.classList.toggle('hidden', n === 0);
  }

  // Records a successful, non-duplicate keep in the local cache so the badge
  // count and any open Tray view reflect it without a round-trip re-fetch.
  function rememberKept(id, text, source) {
    trayCache.unshift({ id, text, source: source || null, created_at: new Date().toISOString() });
    updateTrayBadge();
  }

  function keepFragment(text, source, onKept) {
    return API.trayAdd(text, source || null).then((r) => {
      if (!r.duplicate) rememberKept(r.id, text, source);
      if (onKept) onKept(r);
    });
  }

  function renderTrayList() {
    el.trayList.innerHTML = '';
    if (!trayCache.length) {
      el.trayList.innerHTML = '<p class="tray-empty muted">Nothing kept yet — tap ♡ on a phrase or word to keep it here.</p>';
      return;
    }
    trayCache.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'tray-card';
      card.innerHTML =
        `<div class="tray-card-body">` +
          `<div class="tray-card-text">${escapeHtml(item.text)}</div>` +
          `<div class="tray-card-source muted">${escapeHtml(item.source || '')}</div>` +
        `</div>` +
        `<div class="tray-card-actions">` +
          `<button type="button" class="tray-insert-btn" data-insert>→ Song</button>` +
          `<button type="button" class="tray-delete-btn" data-delete title="Remove" aria-label="Remove">✕</button>` +
        `</div>`;
      card.querySelector('[data-insert]').addEventListener('click', () => {
        insertFragment(item.text);
        showView('write');
      });
      card.querySelector('[data-delete]').addEventListener('click', () => removeTrayItem(item.id, card));
      el.trayList.appendChild(card);
    });
  }

  function removeTrayItem(id, cardEl) {
    // Optimistic removal — no confirm dialog, no undo. A brief inline notice
    // stands in for a toast; the DOM update happens immediately either way.
    cardEl.remove();
    trayCache = trayCache.filter((it) => it.id !== id);
    updateTrayBadge();
    if (!trayCache.length) {
      renderTrayList();
    } else {
      const notice = document.createElement('div');
      notice.className = 'tray-removed-notice';
      notice.textContent = 'Removed';
      el.trayList.prepend(notice);
      setTimeout(() => notice.remove(), 1500);
    }
    API.trayDelete(id).catch(() => { /* best-effort; item is already gone visually */ });
  }

  // ---------- Source mode pill / menu ----------
  el.modePill.addEventListener('click', (e) => {
    e.stopPropagation();
    el.modeMenu.classList.toggle('hidden');
  });
  el.modeMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    currentMode = btn.dataset.mode;
    updateModePill();
    el.modeMenu.classList.add('hidden');
    loadSources();
  });
  document.addEventListener('click', (e) => {
    if (!el.modeMenu.classList.contains('hidden') && !el.modeMenu.contains(e.target) && e.target !== el.modePill) {
      el.modeMenu.classList.add('hidden');
    }
  });
  function updateModePill() {
    let label = MODE_LABELS[currentMode] || currentMode;
    if (currentMode === 'library' && selectedSources.length) label += ' ✱';
    el.modePill.textContent = label;
    el.chipRow.querySelectorAll('.pill[data-mode]').forEach((p) => p.classList.toggle('active', p === el.modePill));
  }

  el.shuffleBtn.addEventListener('click', loadSources);

  // Import-your-own-text modal
  el.addTextBtn.addEventListener('click', () => {
    el.textTitle.value = ''; el.textAuthor.value = ''; el.textBody.value = '';
    el.textError.classList.add('hidden');
    el.textModal.classList.remove('hidden');
    el.textTitle.focus();
  });
  el.textCancel.addEventListener('click', () => el.textModal.classList.add('hidden'));
  el.textModal.addEventListener('click', (e) => { if (e.target === el.textModal) el.textModal.classList.add('hidden'); });
  el.textSave.addEventListener('click', async () => {
    const body = el.textBody.value.trim();
    if (!body) { el.textError.textContent = 'Paste some text first.'; el.textError.classList.remove('hidden'); return; }
    el.textSave.disabled = true; el.textSave.textContent = 'Saving…';
    try {
      await API.createText({
        title: el.textTitle.value.trim() || 'Untitled text',
        author: el.textAuthor.value.trim(),
        body,
      });
      el.textModal.classList.add('hidden');
      currentMode = 'my_texts';
      updateModePill();
      await loadSources();
    } catch (err) {
      el.textError.textContent = err.message; el.textError.classList.remove('hidden');
    } finally {
      el.textSave.disabled = false; el.textSave.textContent = 'Save text';
    }
  });

  // Source filter (which voices feed the Library blend)
  el.filterBtn.addEventListener('click', openFilter);
  el.filterCancel.addEventListener('click', () => el.filterModal.classList.add('hidden'));
  el.filterModal.addEventListener('click', (e) => { if (e.target === el.filterModal) el.filterModal.classList.add('hidden'); });
  el.filterAll.addEventListener('click', () => setAllChecks(true));
  el.filterNone.addEventListener('click', () => setAllChecks(false));
  el.filterApply.addEventListener('click', () => {
    const boxes = [...el.filterList.querySelectorAll('input')];
    const checked = boxes.filter((c) => c.checked).map((c) => c.value);
    // all-or-none selected => everything (empty filter)
    selectedSources = (checked.length === 0 || checked.length === boxes.length) ? [] : checked;
    el.filterModal.classList.add('hidden');
    currentMode = 'library';
    updateModePill();
    loadSources();
  });

  async function ensureManifest() {
    if (libManifest) return libManifest;
    try { libManifest = (await API.libraryManifest()).sources; }
    catch (_) { libManifest = []; }
    authorTypeMap = {};
    libManifest.forEach((s) => { authorTypeMap[s.author] = s.type; });
    return libManifest;
  }

  async function openFilter() {
    await ensureManifest();
    const groups = {};
    libManifest.forEach((s) => { (groups[s.type] = groups[s.type] || []).push(s); });
    const order = ['lyric', 'poem', 'prose', 'play', 'letters'];
    const labels = { lyric: 'Lyrics', poem: 'Poems', prose: 'Prose', play: 'Plays', letters: 'Letters' };
    let html = '';
    order.filter((t) => groups[t]).forEach((t) => {
      html += `<div class="filter-group-label">${labels[t] || t}</div>`;
      groups[t].sort((a, b) => a.author.localeCompare(b.author)).forEach((s) => {
        const on = selectedSources.length === 0 || selectedSources.includes(s.slug);
        html += `<label class="filter-row"><input type="checkbox" value="${s.slug}" ${on ? 'checked' : ''}/> ` +
                `<span>${escapeHtml(s.author)} <span class="muted">(${s.count})</span></span></label>`;
      });
    });
    el.filterList.innerHTML = html || '<p class="muted">No sources installed.</p>';
    el.filterModal.classList.remove('hidden');
  }
  function setAllChecks(v) {
    el.filterList.querySelectorAll('input').forEach((c) => { c.checked = v; });
  }

  // ---------- Source strip ----------
  async function loadSources() {
    hideSourceNotice();
    el.sourceList.innerHTML = '<p class="source-loading muted">Loading…</p>';
    try {
      if (currentMode === 'my_texts') await loadMyTextLines();
      else if (currentMode === 'poetry_random') await loadPoetryLines();
      else await loadLibraryLines();
    } catch (err) {
      if (currentMode === 'poetry_random') {
        try {
          await loadLibraryLines();
          showSourceNotice('Poems source is unavailable right now — showing your Library instead.');
          return;
        } catch (_) { /* fall through to failure state below */ }
      }
      showSourceFailure();
    }
  }

  function showSourceNotice(text) {
    el.sourceNotice.innerHTML = `<span>${escapeHtml(text)}</span><button type="button" aria-label="Dismiss">×</button>`;
    el.sourceNotice.classList.remove('hidden');
    el.sourceNotice.querySelector('button').addEventListener('click', hideSourceNotice);
  }
  function hideSourceNotice() {
    el.sourceNotice.classList.add('hidden');
    el.sourceNotice.innerHTML = '';
  }

  function showSourceFailure() {
    el.sourceList.innerHTML = '<p class="source-empty">Couldn’t load sources.</p>' +
      '<button type="button" class="pill source-retry">Retry</button>';
    const retryBtn = el.sourceList.querySelector('.source-retry');
    if (retryBtn) retryBtn.addEventListener('click', loadSources);
  }

  async function loadLibraryLines() {
    await ensureManifest();
    const { fragments } = await API.libraryRandom(40, selectedSources);
    renderSourceLines(fragments.map((f) => ({ text: f.text, meta: f.author, type: authorTypeMap[f.author] })));
  }

  async function loadPoetryLines() {
    // Pull many poems but take only 1-2 lines from each, so the list spans
    // lots of different poets instead of flooding with one repeated name.
    const poems = await API.poetryRandom(25);
    const lines = [];
    poems.forEach((p) => {
      const good = (p.lines || []).map((l) => l.trim()).filter((l) => l.length > 8);
      shuffle(good).slice(0, 2).forEach((t) => lines.push({ text: t, meta: `${p.author} — ${p.title}`, type: 'poem' }));
    });
    renderSourceLines(shuffle(lines).slice(0, 40));
  }

  async function loadMyTextLines() {
    const { texts } = await API.listTexts();
    if (!texts.length) {
      el.sourceList.innerHTML = '<p class="source-empty">No texts imported yet. Tap <strong>+ Text</strong> above to paste in lyrics, a poem, a chapter — anything — and cut it up.</p>';
      return;
    }
    // pull a random text's body and cut into lines/sentences
    const pick = texts[Math.floor(Math.random() * texts.length)];
    const { text } = await API.getText(pick.id);
    const fragments = (text.body || '')
      .split(/[\n.;:!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 6);
    renderSourceLines(shuffle(fragments).slice(0, 40).map((t) => ({ text: t, meta: `${text.title}`, type: null })));
  }

  function renderSourceLines(items) {
    el.sourceList.innerHTML = '';
    if (!items.length) {
      el.sourceList.innerHTML = '<p class="source-empty">Nothing found — try shuffle.</p>';
      return;
    }
    items.forEach((it) => {
      const d = document.createElement('div');
      d.className = 'source-card';
      d.draggable = true;
      const badge = it.type ? `<span class="type-badge type-${it.type}">${escapeHtml(it.type)}</span>` : '';
      d.innerHTML = `<button type="button" class="src-keep-btn" data-keep aria-label="Keep in Tray">♡</button>` +
                    `<div class="src-row"><span class="src-text">${escapeHtml(it.text)}</span></div>` +
                    `<div class="src-row"><span class="src-meta">${escapeHtml(it.meta || '')}</span>${badge}</div>`;
      d.addEventListener('click', () => insertFragment(it.text));
      d.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', it.text));
      const keepBtn = d.querySelector('[data-keep]');
      keepBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // corner tap keeps the fragment; must not also insert it
        if (keepBtn.disabled) return;
        keepBtn.disabled = true;
        keepFragment(it.text, it.meta, () => {
          keepBtn.classList.add('kept');
          keepBtn.textContent = '♥';
        }).catch(() => { keepBtn.disabled = false; });
      });
      el.sourceList.appendChild(d);
    });
  }

  // ---------- Browse / Edit mode ----------
  // Browse mode keeps the scratchpad non-editable so a plain tap never opens the
  // soft keyboard or triggers Android's native text-selection handles/menu. Word
  // tools are reached by tapping a word (handled in the Scratchpad section below).
  function applyEditMode() {
    if (editMode) {
      el.scratchpad.setAttribute('contenteditable', 'true');
      el.scratchpad.classList.remove('browse');
      el.editFab.textContent = '✓';
      el.editFab.title = 'Done editing';
    } else {
      el.scratchpad.setAttribute('contenteditable', 'false');
      el.scratchpad.classList.add('browse');
      el.editFab.textContent = '✎';
      el.editFab.title = 'Edit lyrics';
      // Follow strip is caret-driven; meaningless without a caret.
      el.followChips.innerHTML = '';
      el.followStrip.classList.add('hidden');
    }
  }

  function placeCaretAtEnd(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function enterEditMode() {
    hideWordTools(); // unwraps any .word-hit highlight and closes the sheet
    unwrapRhymeMarks(); // rhyme decorations must never sit in the DOM while editable
    editMode = true;
    applyEditMode();
    el.scratchpad.focus();
    placeCaretAtEnd(el.scratchpad);
  }

  function exitEditMode() {
    flushSave();
    el.scratchpad.blur();
    editMode = false;
    applyEditMode();
    scheduleRhymes();
  }

  el.editFab.addEventListener('click', () => {
    if (editMode) exitEditMode(); else enterEditMode();
  });

  // ---------- Scratchpad: insertion, selection, follow strip ----------
  el.scratchpad.addEventListener('input', () => { markDirty(); scheduleFollow(); scheduleGutter(); });
  // Enter must produce a literal \n text node — the browser's default (<div>/<br>
  // blocks) is invisible to the line-based syllable/rhyme detection.
  el.scratchpad.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insertTextAtCaret('\n');
    }
  });
  el.scratchpad.addEventListener('keyup', onCaretActivity);
  el.scratchpad.addEventListener('mouseup', onCaretActivity);
  el.scratchpad.addEventListener('click', onScratchpadTap);
  // Gutter numbers live in content coordinates; sync them to the pad's scroll
  // position with a cheap transform instead of recomputing on every scroll tick.
  el.scratchpad.addEventListener('scroll', () => {
    if (el.syllGutterInner) el.syllGutterInner.style.transform = `translateY(${-el.scratchpad.scrollTop}px)`;
  });
  window.addEventListener('resize', scheduleGutter);
  el.scratchpad.addEventListener('dragover', (e) => e.preventDefault());
  el.scratchpad.addEventListener('drop', (e) => {
    e.preventDefault();
    const t = e.dataTransfer.getData('text/plain');
    if (t) insertFragment(t);
  });
  // keep contenteditable plain-text on paste
  el.scratchpad.addEventListener('paste', (e) => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text');
    insertTextAtCaret(t);
  });

  function insertFragment(text) {
    const pad = el.scratchpad;
    if (!editMode) {
      // Browse mode: there is no caret (contenteditable is off), so always append.
      const isEmpty = pad.textContent.length === 0;
      const last = pad.textContent[pad.textContent.length - 1];
      const prefix = (isEmpty || last === '\n') ? '' : '\n';
      pad.appendChild(document.createTextNode(prefix + text + '\n'));
      markDirty();
      scheduleGutter();
      scheduleRhymes();
      return;
    }
    const isEmpty = pad.textContent.length === 0;
    let prefix = '';
    if (!isEmpty) {
      const sel = window.getSelection();
      const hasCaret = sel.rangeCount > 0 && pad.contains(sel.anchorNode);
      const before = hasCaret ? charBeforeCaret() : pad.textContent[pad.textContent.length - 1];
      prefix = (before == null || before === '\n') ? '' : '\n';
    }
    insertTextAtCaret(prefix + text + '\n');
  }

  function charBeforeCaret() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const node = sel.anchorNode;
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) {
      const offset = sel.anchorOffset;
      if (offset > 0) return node.textContent[offset - 1];
      let prev = node.previousSibling;
      while (prev) {
        if (prev.nodeType === Node.TEXT_NODE) return prev.textContent.length ? prev.textContent[prev.textContent.length - 1] : null;
        prev = prev.previousSibling;
      }
      return null;
    }
    if (node === el.scratchpad) {
      const offset = sel.anchorOffset;
      if (offset === 0) return null;
      const prevChild = node.childNodes[offset - 1];
      if (prevChild && prevChild.nodeType === Node.TEXT_NODE) {
        const t = prevChild.textContent;
        return t.length ? t[t.length - 1] : null;
      }
      return null;
    }
    return null;
  }

  function insertTextAtCaret(text) {
    el.scratchpad.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount) {
      el.scratchpad.textContent += text;
    } else {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    markDirty();
    scheduleFollow();
    scheduleGutter();
    scheduleRhymes();
  }

  function onCaretActivity() {
    if (!editMode) return; // browse mode uses tap-to-inspect (onScratchpadTap) instead
    // Selection-driven word tools stay opt-in to fine-pointer (mouse) devices only,
    // so touch users editing never accidentally trigger native selection UI.
    if (window.matchMedia('(pointer: fine)').matches) {
      const sel = window.getSelection();
      const word = (sel.toString() || '').trim();
      if (word && /^[A-Za-z'’-]+$/.test(word)) {
        showWordTools(word);
      } else {
        hideWordTools();
      }
    }
    scheduleFollow();
  }

  // ---------- Browse-mode tap-to-inspect ----------
  function unwrapWordHit() {
    el.scratchpad.querySelectorAll('span.word-hit').forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
  }

  function caretPosFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      return r ? { node: r.startContainer, offset: r.startOffset } : null;
    }
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      return p ? { node: p.offsetNode, offset: p.offset } : null;
    }
    return null;
  }

  function expandToWord(node, offset) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.textContent;
    const isWordChar = (c) => !!c && /[A-Za-z'’-]/.test(c);
    if (offset < 0 || offset > text.length) return null;
    let start = offset, end = offset;
    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;
    if (start === end) return null; // tap landed between/outside words
    return { node, start, end, word: text.slice(start, end) };
  }

  function onScratchpadTap(e) {
    if (editMode) return; // editing: taps just move the caret, handled natively
    unwrapWordHit();
    const pos = caretPosFromPoint(e.clientX, e.clientY);
    const found = pos && expandToWord(pos.node, pos.offset);
    if (!found) { hideWordTools(); return; }

    const range = document.createRange();
    range.setStart(found.node, found.start);
    range.setEnd(found.node, found.end);
    const span = document.createElement('span');
    span.className = 'word-hit';
    range.surroundContents(span);

    const hlRange = document.createRange();
    hlRange.selectNodeContents(span);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(hlRange);

    showWordTools(found.word);
  }

  function scheduleFollow() {
    clearTimeout(followTimer);
    followTimer = setTimeout(updateFollowStrip, 400);
  }

  let followRequestId = 0;
  async function updateFollowStrip() {
    if (!editMode) { el.followChips.innerHTML = ''; el.followStrip.classList.add('hidden'); return; }
    const prev = wordBeforeCaret();
    if (!prev || prev.length < 3 || STOPWORDS.has(prev.toLowerCase())) {
      el.followChips.innerHTML = ''; el.followStrip.classList.add('hidden'); return;
    }
    const requestId = ++followRequestId;
    try {
      const words = await API.datamuse({ rel_bga: prev, max: 10 });
      if (requestId !== followRequestId) return; // a newer request superseded this one
      const seen = new Set();
      const quality = words.filter((w) => {
        const word = (w.word || '').toLowerCase();
        if (!/^[a-z][a-z'-]*$/i.test(w.word || '')) return false;
        if (word.length < 2) return false;
        if (STOPWORDS.has(word)) return false;
        if (w.score !== undefined && w.score <= 100) return false;
        if (seen.has(word)) return false;
        seen.add(word);
        return true;
      });
      el.followChips.innerHTML = '';
      if (quality.length < 2) { el.followStrip.classList.add('hidden'); return; }
      const top = quality.slice(0, 10);
      el.followStrip.classList.remove('hidden');
      top.forEach((w) => {
        const c = document.createElement('button');
        c.className = 'chip';
        c.type = 'button';
        c.textContent = w.word;
        c.addEventListener('click', () => insertTextAtCaret((needsLeadingSpace() ? ' ' : '') + w.word));
        el.followChips.appendChild(c);
      });
    } catch (_) {
      if (requestId !== followRequestId) return;
      el.followStrip.classList.add('hidden'); /* silent — ambient feature */
    }
  }

  function wordBeforeCaret() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const upto = node.textContent.slice(0, sel.anchorOffset);
    const m = upto.match(/([A-Za-z'’-]+)\s*$/);
    return m ? m[1] : null;
  }
  function needsLeadingSpace() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return true;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;
    const ch = node.textContent.slice(sel.anchorOffset - 1, sel.anchorOffset);
    return ch && !/\s/.test(ch);
  }

  // ---------- Word tools (rhymes / synonyms / related / definition) ----------
  // Rendered into two places at once: the persistent desktop panel (#tools-panel)
  // and the mobile bottom sheet (#sheet-content). CSS decides which is visible.
  let savedRange = null;
  let keptWords = new Set(); // placeholder-only visual state, not persisted

  function toolRoots() { return [el.toolsPanel, el.sheetContent]; }

  async function showWordTools(word) {
    const sel = window.getSelection();
    if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();

    const html = renderToolsShell(word);
    toolRoots().forEach((root) => { root.innerHTML = html; });
    openSheet();
    wireToolsButtons(word);
    fillToolsData(word);
    scrollWordIntoUpperView();
  }

  // On phones the sheet covers the lower half of the screen; bring the tapped
  // word's line up to the top of the lyric pane so line and tools coexist.
  function scrollWordIntoUpperView() {
    if (!savedRange || !window.matchMedia('(max-width: 899px)').matches) return;
    const r = savedRange.getBoundingClientRect();
    const padR = el.scratchpad.getBoundingClientRect();
    const target = el.scratchpad.scrollTop + (r.top - padR.top) - 12;
    el.scratchpad.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }

  function renderToolsShell(word) {
    const kept = keptWords.has(word.toLowerCase());
    return `
      <div class="sheet-head">
        <div class="sheet-word-row">
          <span class="sheet-word">${escapeHtml(word)}</span>
          <span class="sheet-syll muted" data-syll></span>
        </div>
        <button type="button" class="btn-keep${kept ? ' active' : ''}" data-keep>${kept ? '♥ Kept' : '♡ Keep'}</button>
      </div>
      <div class="tools-block"><div class="tools-label">Rhymes</div><div class="tools-words" data-rhy>…</div></div>
      <div class="tools-block"><div class="tools-label">Near rhymes</div><div class="tools-words" data-nry>…</div></div>
      <div class="tools-block"><div class="tools-label">Synonyms</div><div class="tools-words" data-syn>…</div></div>
      <div class="tools-block"><div class="tools-label">Related</div><div class="tools-words" data-trg>…</div></div>
      <div class="tools-block"><div class="tools-label">Definition</div><div class="def" data-def>…</div></div>`;
  }

  function wireToolsButtons(word) {
    toolRoots().forEach((root) => {
      const btn = root.querySelector('[data-keep]');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const key = word.toLowerCase();
        const wasKept = keptWords.has(key);
        if (wasKept) {
          // Toggling off is visual-only — the word was already saved to the
          // Tray on the way in; un-tapping here doesn't delete it (that's
          // done from the Tray view itself).
          keptWords.delete(key);
        } else {
          keptWords.add(key);
          keepFragment(word, 'word tools').catch(() => {});
        }
        const kept = keptWords.has(key);
        toolRoots().forEach((r) => {
          const b = r.querySelector('[data-keep]');
          if (b) { b.classList.toggle('active', kept); b.textContent = kept ? '♥ Kept' : '♡ Keep'; }
        });
      });
    });
  }

  async function fillToolsData(word) {
    const fill = (sel, words) => {
      toolRoots().forEach((root) => {
        const box = root.querySelector(sel);
        if (!box) return;
        box.innerHTML = '';
        if (!words.length) { box.innerHTML = '<span class="muted">—</span>'; return; }
        words.slice(0, 12).forEach((w) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'chip'; b.textContent = w.word;
          b.addEventListener('click', () => replaceSelection(w.word));
          box.appendChild(b);
        });
      });
    };
    try {
      const [rhy, nry, syn, trg] = await Promise.all([
        API.datamuse({ rel_rhy: word, max: 12 }),
        API.datamuse({ rel_nry: word, max: 12 }),
        API.datamuse({ ml: word, max: 12 }),
        API.datamuse({ rel_trg: word, max: 12 }),
      ]);
      fill('[data-rhy]', rhy); fill('[data-nry]', nry);
      fill('[data-syn]', syn); fill('[data-trg]', trg);
      const syllCount = countSyllables(word);
      toolRoots().forEach((root) => {
        const sb = root.querySelector('[data-syll]');
        if (sb) sb.textContent = `${syllCount} syllable${syllCount === 1 ? '' : 's'}`;
      });
    } catch (_) {}
    try {
      const dict = await API.dictionary(word);
      const def = dict?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      const pos = dict?.[0]?.meanings?.[0]?.partOfSpeech;
      toolRoots().forEach((root) => {
        const box = root.querySelector('[data-def]');
        if (box) box.innerHTML = def ? `<em>${escapeHtml(pos || '')}</em> ${escapeHtml(def)}` : '<span class="muted">no definition</span>';
      });
    } catch (_) {
      toolRoots().forEach((root) => {
        const box = root.querySelector('[data-def]');
        if (box) box.innerHTML = '<span class="muted">no definition</span>';
      });
    }
  }

  function replaceSelection(replacement) {
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(replacement);
    range.insertNode(node);
    range.setStartAfter(node); range.collapse(true);
    sel.removeAllRanges(); sel.addRange(range);
    savedRange = range.cloneRange();
    hideWordTools();
    markDirty();
    scheduleGutter();
    scheduleRhymes();
  }

  // ---------- Word-tools bottom sheet mechanics (mobile) ----------
  function openSheet() {
    el.wordSheet.classList.add('open');
    el.sheetBackdrop.classList.add('open');
  }
  function closeSheet() {
    el.wordSheet.classList.remove('open');
    el.sheetBackdrop.classList.remove('open');
  }
  function hideWordTools() {
    unwrapWordHit();
    closeSheet();
    el.toolsPanel.innerHTML = TOOLS_HINT;
  }
  el.sheetBackdrop.addEventListener('click', hideWordTools);
  el.sheetHandle.addEventListener('click', hideWordTools);
  document.addEventListener('mousedown', (e) => {
    if (!el.wordSheet.classList.contains('open')) return;
    if (el.wordSheet.contains(e.target) || el.scratchpad.contains(e.target)) return;
    hideWordTools();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideWordTools();
  });

  // ---------- Syllable gutter & rhyme toggles (topbar pills) ----------
  el.syllToggle.addEventListener('click', () => {
    syllablesOn = !syllablesOn;
    writeBool('songsmith.syllables', syllablesOn);
    updateToggleUI();
    if (syllablesOn) recomputeGutter(); else clearGutter();
  });
  el.rhymeToggle.addEventListener('click', () => {
    rhymesOn = !rhymesOn;
    writeBool('songsmith.rhymes', rhymesOn);
    updateToggleUI();
    if (rhymesOn) scheduleRhymes(); else unwrapRhymeMarks();
  });
  function updateToggleUI() {
    el.syllToggle.classList.toggle('toggle-off', !syllablesOn);
    el.rhymeToggle.classList.toggle('toggle-off', !rhymesOn);
    el.syllableGutter.classList.toggle('hidden', !syllablesOn);
  }
  function clearGutter() { el.syllGutterInner.innerHTML = ''; }

  // ---------- Shared DOM text-node walking (gutter + rhyme grouping) ----------
  // The scratchpad's logical text is whatever is walked, in order, across every
  // text node — including ones sitting inside .word-hit / .rhyme-mark spans —
  // so this always matches the plain-text model the app saves (innerText).
  function buildTextNodeIndex() {
    const walker = document.createTreeWalker(el.scratchpad, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }
  function flattenText(nodes) { return nodes.map((n) => n.textContent).join(''); }
  function locateOffset(nodes, targetOffset) {
    let acc = 0;
    for (const n of nodes) {
      const len = n.textContent.length;
      if (targetOffset <= acc + len) return { node: n, offset: targetOffset - acc };
      acc += len;
    }
    if (nodes.length) { const last = nodes[nodes.length - 1]; return { node: last, offset: last.textContent.length }; }
    return null;
  }
  function rangeForSpan(nodes, start, end) {
    const s = locateOffset(nodes, start);
    const e = locateOffset(nodes, end);
    if (!s || !e) return null;
    const range = document.createRange();
    range.setStart(s.node, s.offset);
    range.setEnd(e.node, e.offset);
    return range;
  }

  // ---------- Feature A: syllable gutter ----------
  function scheduleGutter() {
    if (!syllablesOn) return;
    clearTimeout(gutterTimer);
    gutterTimer = setTimeout(recomputeGutter, 300);
  }
  function recomputeGutter() {
    if (!syllablesOn) return;
    const nodes = buildTextNodeIndex();
    const fullText = flattenText(nodes);
    if (!fullText.length) { clearGutter(); return; }
    const padRect = el.scratchpad.getBoundingClientRect();
    const scrollTop = el.scratchpad.scrollTop;
    const lines = fullText.split('\n');
    let html = '';
    let idx = 0;
    lines.forEach((line) => {
      if (line.trim().length) {
        const words = line.match(/[A-Za-z'’-]+/g) || [];
        const syll = words.reduce((sum, w) => sum + countSyllables(w), 0);
        const loc = locateOffset(nodes, idx);
        if (loc) {
          const range = document.createRange();
          range.setStart(loc.node, loc.offset);
          range.collapse(true);
          const rects = range.getClientRects();
          const rect = rects.length ? rects[0] : range.getBoundingClientRect();
          if (rect && (rect.width || rect.height || rect.top)) {
            const y = rect.top - padRect.top + scrollTop;
            html += `<span class="syll-num" style="top:${y}px">${syll}</span>`;
          }
        }
      }
      idx += line.length + 1; // account for the '\n' separator
    });
    el.syllGutterInner.innerHTML = html;
    // keep the just-rendered numbers aligned with the current scroll position
    el.syllGutterInner.style.transform = `translateY(${-scrollTop}px)`;
  }

  // ---------- Feature B: end-rhyme colour grouping (browse mode only) ----------
  function unwrapRhymeMarks() {
    el.scratchpad.querySelectorAll('span.rhyme-mark').forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
  }

  function getLineEndWords() {
    const nodes = buildTextNodeIndex();
    const fullText = flattenText(nodes);
    const lines = fullText.split('\n');
    const endWords = [];
    let idx = 0;
    lines.forEach((line) => {
      const matches = [...line.matchAll(/[A-Za-z'’-]+/g)];
      if (matches.length) {
        const last = matches[matches.length - 1];
        endWords.push({ word: last[0], start: idx + last.index, end: idx + last.index + last[0].length });
      }
      idx += line.length + 1;
    });
    return endWords;
  }

  function normalizeWord(w) { return (w || '').toLowerCase().replace(/[^a-z]/g, ''); }
  function fallbackKey(w) {
    const s = normalizeWord(w);
    if (!s) return '';
    const m = s.match(/[aeiouy][^aeiouy]*$/);
    return m ? m[0] : s;
  }

  function loadRhymeCache() {
    try {
      const raw = localStorage.getItem(RHYME_CACHE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      arr.forEach(([k, v]) => rhymeCache.set(k, v));
    } catch (_) {}
  }
  function saveRhymeCache() {
    try {
      localStorage.setItem(RHYME_CACHE_KEY, JSON.stringify([...rhymeCache.entries()]));
    } catch (_) {}
  }
  function cacheGetRhymes(word) {
    if (!rhymeCache.has(word)) return null;
    const v = rhymeCache.get(word);
    rhymeCache.delete(word); rhymeCache.set(word, v); // bump recency (LRU-ish)
    return v;
  }
  function cacheSetRhymes(word, list) {
    rhymeCache.set(word, list);
    while (rhymeCache.size > RHYME_CACHE_CAP) {
      const oldest = rhymeCache.keys().next().value;
      rhymeCache.delete(oldest);
    }
    saveRhymeCache();
  }

  // Fetches (or reuses cached) Datamuse rhyme lists for every unique end word.
  // Returns a Map: normalised word -> Set of lowercase rhymes, or null if the
  // fetch failed (signals "use the offline heuristic for this word").
  async function fetchRhymeLists(words) {
    const result = new Map();
    const toFetch = [];
    words.forEach((w) => {
      const cached = cacheGetRhymes(w);
      if (cached) result.set(w, new Set(cached));
      else toFetch.push(w);
    });
    await Promise.all(toFetch.map(async (w) => {
      try {
        const list = await API.datamuse({ rel_rhy: w, max: 50 });
        const set = new Set((list || []).map((x) => (x.word || '').toLowerCase()));
        result.set(w, set);
        cacheSetRhymes(w, [...set]);
      } catch (_) {
        result.set(w, null);
      }
    }));
    return result;
  }

  // Union-find over the unique end words: primary tier is a mutual Datamuse
  // rel_rhy check; if either word's fetch failed, fall back to the orthographic
  // heuristic (matching trailing vowel-cluster+consonants) for that pair only.
  function buildRhymeGroups(words, rhymeMap) {
    const n = words.length;
    const parent = words.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[a] = b; };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (words[i] === words[j]) { union(i, j); continue; }
        const setA = rhymeMap.get(words[i]);
        const setB = rhymeMap.get(words[j]);
        if ((setA && setA.has(words[j])) || (setB && setB.has(words[i]))) { union(i, j); continue; }
        if (setA === null || setB === null) { // at least one fetch failed -> heuristic fallback
          const ka = fallbackKey(words[i]), kb = fallbackKey(words[j]);
          if (ka && ka === kb) union(i, j);
        }
      }
    }
    const groups = {};
    for (let i = 0; i < n; i++) { const r = find(i); (groups[r] = groups[r] || []).push(i); }
    const groupOf = new Map();
    let colorIdx = 0;
    Object.values(groups).forEach((members) => {
      if (members.length < 2) return; // no rhyme partner => no decoration
      const color = colorIdx % 6; colorIdx++;
      members.forEach((i) => groupOf.set(words[i], color));
    });
    return groupOf;
  }

  function applyRhymeDecorations(endWords, groupOf) {
    endWords.forEach(({ word, start, end }) => {
      const norm = normalizeWord(word);
      if (!groupOf.has(norm)) return;
      const color = groupOf.get(norm);
      // Re-walk the DOM before every insertion: surroundContents can split/replace
      // the text node it wraps, so node references from earlier in this pass may
      // be stale even though the absolute character offsets are still valid.
      const nodes = buildTextNodeIndex();
      const range = rangeForSpan(nodes, start, end);
      if (!range) return;
      try {
        const span = document.createElement('span');
        span.className = 'rhyme-mark rhyme-' + color;
        range.surroundContents(span);
      } catch (_) { /* skip this word on any unexpected DOM shape */ }
    });
  }

  function scheduleRhymes() {
    if (editMode || !rhymesOn) return;
    clearTimeout(rhymeTimer);
    rhymeTimer = setTimeout(recomputeRhymes, 400);
  }

  async function recomputeRhymes() {
    if (editMode || !rhymesOn) return;
    unwrapRhymeMarks();
    const endWords = getLineEndWords();
    if (endWords.length < 2) return;
    const uniqueWords = [...new Set(endWords.map((e) => normalizeWord(e.word)))].filter(Boolean);
    if (uniqueWords.length < 2) return;
    const rhymeMap = await fetchRhymeLists(uniqueWords);
    if (editMode || !rhymesOn) return; // draft/mode may have changed while awaiting the network
    const groupOf = buildRhymeGroups(uniqueWords, rhymeMap);
    if (!groupOf.size) return;
    unwrapRhymeMarks(); // in case something re-decorated during the await (shouldn't, but stay safe)
    const freshEndWords = getLineEndWords();
    applyRhymeDecorations(freshEndWords, groupOf);
  }

  // ---------- Forge ----------
  // Liptikl-style cut-up line dealer. All dealing/re-roll behaviour lives in
  // this section so it's easy to retune independently of the rest of the app.
  const FORGE_WORD_STEPS = [4, 5, 6, 7, 8];
  const FORGE_WORDS_KEY = 'songsmith.forgewords';
  const FORGE_LINE3_TARGET = 4; // third roll box is always a fixed 4 words

  let forgeWordsTarget = readForgeWords();
  let forgePool = [];          // [{ t, a }] — in-memory pool fetched from forge.php
  let forgePoolReady = false;
  let forgeInitialized = false; // has the tab been auto-dealt once already
  let forgeLoading = false;
  // forgeLines[lineIndex] = [{ t, a, benched }] — one entry per single word
  let forgeLines = [[], [], []];
  let forgePopoverTarget = null; // { lineIndex, pillIndex } currently open, or null

  function readForgeWords() {
    try {
      const v = parseInt(localStorage.getItem(FORGE_WORDS_KEY), 10);
      return FORGE_WORD_STEPS.includes(v) ? v : 6;
    } catch (_) { return 6; }
  }
  function writeForgeWords(v) {
    try { localStorage.setItem(FORGE_WORDS_KEY, String(v)); } catch (_) {}
  }

  function forgeWordCount(text) { return text.trim().split(/\s+/).filter(Boolean).length; }
  function forgeChunkKey(c) { return c.t.toLowerCase() + '|' + (c.a || ''); }
  function forgeLineTargets() { return [forgeWordsTarget, forgeWordsTarget, FORGE_LINE3_TARGET]; }

  // ---- pure dealing logic (retune here) ----
  // Deals fresh lines from `pool`, one per entry in `targets`. Each line
  // accumulates pool chunks (which may themselves be 1–3 word runs) until its
  // word count reaches its target, then splits every chunk into individual
  // single-word pills — words from the same run stay adjacent so the
  // contiguity flavour survives even though each word is its own pill.
  // Overshoot past the target is trimmed from the trailing words. A chunk
  // (by text+author) is never dealt twice across the lines in one deal.
  function forgeDealLines(pool, targets) {
    const used = new Set();
    const lines = targets.map(() => []);
    if (!pool.length) return lines;
    for (let li = 0; li < targets.length; li++) {
      const target = targets[li];
      let words = [];
      let guard = 0;
      while (words.length < target && guard < 300) {
        guard++;
        const cand = pool[Math.floor(Math.random() * pool.length)];
        const key = forgeChunkKey(cand);
        if (used.has(key)) continue;
        used.add(key);
        cand.t.trim().split(/\s+/).filter(Boolean).forEach((w) => {
          words.push({ t: w, a: cand.a, benched: false });
        });
      }
      if (words.length > target) words = words.slice(0, target);
      lines[li] = words;
    }
    return lines;
  }

  function lineText(line) { return line.map((c) => c.t).join(' '); }

  // ---- pool fetch ----
  async function fetchForgePool() {
    hideForgeNotice();
    forgeLoading = true;
    try {
      // selectedSources is read live here (not copied at tab-open time) so the
      // pool always reflects whatever the Write-tab filter currently is.
      const { chunks } = await API.forgePool(150, selectedSources);
      forgePool = chunks;
      forgePoolReady = true;
    } catch (err) {
      forgePoolReady = false;
      showForgeFailure();
      throw err;
    } finally {
      forgeLoading = false;
    }
  }

  function showForgeFailure() {
    el.forgeNotice.innerHTML = '<span>Couldn’t load the Forge pool.</span>' +
      '<button type="button" class="forge-notice-retry">Retry</button>';
    el.forgeNotice.classList.remove('hidden');
    el.forgeNotice.querySelector('.forge-notice-retry').addEventListener('click', () => {
      fullForgeDeal();
    });
  }
  function hideForgeNotice() {
    el.forgeNotice.classList.add('hidden');
    el.forgeNotice.innerHTML = '';
  }

  // ---- tab lifecycle ----
  function ensureForgeReady() {
    if (forgeInitialized) return;
    forgeInitialized = true;
    renderBench(); // restore any persisted harvest before the first deal
    fullForgeDeal();
  }

  // [Deal] — full fresh deal: fetches a fresh pool, deals anew.
  async function fullForgeDeal() {
    try {
      await fetchForgePool();
    } catch (_) { return; } // failure state already shown
    forgeLines = forgeDealLines(forgePool, forgeLineTargets());
    renderForgeLines();
  }

  el.forgeDealBtn.addEventListener('click', fullForgeDeal);

  // [⟳ Re-roll] — every pill in every line is replaced; nothing survives a
  // re-roll (harvesting to the bench is the only way to keep a word).
  el.forgeRerollBtn.addEventListener('click', () => {
    if (!forgePoolReady || forgeLoading) return;
    forgeLines = forgeDealLines(forgePool, forgeLineTargets());
    renderForgeLines();
  });

  // ---- words-per-line pill ----
  function updateForgeWordsPill() {
    el.forgeWordsPill.textContent = forgeWordsTarget + ' word' + (forgeWordsTarget === 1 ? '' : 's');
  }
  el.forgeWordsPill.addEventListener('click', () => {
    const idx = FORGE_WORD_STEPS.indexOf(forgeWordsTarget);
    forgeWordsTarget = FORGE_WORD_STEPS[(idx + 1) % FORGE_WORD_STEPS.length];
    writeForgeWords(forgeWordsTarget);
    updateForgeWordsPill();
  });

  // ---- rendering ----
  function renderForgeLines() {
    forgeLines.forEach((line, li) => renderForgeLine(li, line));
  }

  function renderForgeLine(lineIndex, line) {
    const container = el.forgeLineEls[lineIndex];
    container.innerHTML = '';
    line.forEach((chunk, pi) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'forge-pill' + (chunk.benched ? ' benched' : '');
      pill.dataset.lineIndex = String(lineIndex);
      pill.dataset.pillIndex = String(pi);
      pill.innerHTML = (chunk.benched ? '<span class="forge-benched-ico">✓</span>' : '') +
        `<span>${escapeHtml(chunk.t)}</span>`;
      wireForgePill(pill, lineIndex, pi);
      container.appendChild(pill);
    });
    // The line's text just changed underneath it — any previous "kept" state
    // on this line's ♡ button no longer reflects what → Song / ♡ would act on.
    const card = el.forgeLineCards[lineIndex];
    const keepBtn = card && card.querySelector('.forge-keep-btn');
    if (keepBtn) { keepBtn.disabled = false; keepBtn.classList.remove('kept'); keepBtn.textContent = '♡'; }
  }

  function wireForgePill(pill, lineIndex, pillIndex) {
    let pressTimer = null;
    let longPressed = false;

    const openAlts = () => {
      longPressed = true;
      openForgePopover(pill, lineIndex, pillIndex);
    };

    pill.addEventListener('touchstart', () => {
      longPressed = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(openAlts, 500);
    }, { passive: true });
    pill.addEventListener('touchend', () => clearTimeout(pressTimer));
    pill.addEventListener('touchmove', () => clearTimeout(pressTimer));
    pill.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openAlts();
    });

    pill.addEventListener('click', () => {
      if (longPressed) { longPressed = false; return; } // long-press already handled this interaction
      const chunk = forgeLines[lineIndex][pillIndex];
      chunk.benched = !chunk.benched;
      if (chunk.benched) {
        benchAdd(chunk); // first tap harvests to the bench
      } else {
        benchRemoveLast(chunk.t); // second tap is a forgiving undo
      }
      renderForgeLine(lineIndex, forgeLines[lineIndex]);
    });
  }

  // ---- Bench: harvested words gather here; unlimited size, duplicates allowed ----
  let benchChunks = (() => {
    try { return JSON.parse(localStorage.getItem('songsmith.forgebench')) || []; }
    catch (_) { return []; }
  })();

  function benchPersist() {
    try { localStorage.setItem('songsmith.forgebench', JSON.stringify(benchChunks)); } catch (_) {}
  }

  function benchAdd(chunk) {
    benchChunks.push({ t: chunk.t, a: chunk.a });
    benchPersist();
    renderBench();
  }

  // Undoes a harvest: drops the LAST bench entry matching `text` (case-
  // insensitive) rather than trying to track which exact entry a pill added,
  // since duplicates are now allowed on the bench.
  function benchRemoveLast(text) {
    const key = text.toLowerCase();
    for (let i = benchChunks.length - 1; i >= 0; i--) {
      if (benchChunks[i].t.toLowerCase() === key) {
        benchChunks.splice(i, 1);
        break;
      }
    }
    benchPersist();
    renderBench();
  }

  function benchText() { return benchChunks.map((c) => c.t).join(' '); }

  function renderBench() {
    el.forgeBench.classList.toggle('hidden', benchChunks.length === 0);
    el.benchPills.innerHTML = '';
    benchChunks.forEach((c, i) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'forge-pill bench-pill';
      pill.dataset.bi = String(i);
      pill.title = 'Drag to reorder';
      pill.innerHTML = `<span>${escapeHtml(c.t)}</span><span class="bench-x" role="button" aria-label="Remove">✕</span>`;
      pill.querySelector('.bench-x').addEventListener('click', (ev) => {
        ev.stopPropagation();
        benchChunks.splice(i, 1);
        benchPersist();
        renderBench();
      });
      pill.addEventListener('pointerdown', (e) => startBenchDrag(e, pill));
      el.benchPills.appendChild(pill);
    });
    el.benchKeepBtn.disabled = false;
    el.benchKeepBtn.classList.remove('kept');
    el.benchKeepBtn.textContent = '♡';
  }

  // Pointer-based drag reordering (works for touch and mouse alike).
  // A press that never moves past the threshold is treated as a plain tap
  // (which does nothing on the pill body — removal lives on the ✕).
  function startBenchDrag(e, pill) {
    if (e.target.classList.contains('bench-x')) return;
    const startX = e.clientX, startY = e.clientY;
    let active = false;
    const move = (ev) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
        active = true;
        pill.classList.add('dragging');
        try { pill.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (!active) return;
      if (ev.cancelable) ev.preventDefault();
      // Row-aware insertion: place before the first sibling whose row is below
      // the pointer, or whose centre is to the right of it on the same row.
      const siblings = [...el.benchPills.children].filter((p) => p !== pill);
      let placed = false;
      for (const s of siblings) {
        const r = s.getBoundingClientRect();
        if (ev.clientY < r.top - 2 ||
            (ev.clientY <= r.bottom + 2 && ev.clientX < r.left + r.width / 2)) {
          el.benchPills.insertBefore(pill, s);
          placed = true;
          break;
        }
      }
      if (!placed) el.benchPills.appendChild(pill);
    };
    // Listeners live on document (not the pill) so the drag survives the
    // pointer leaving the pill before the activation threshold, or pointer
    // capture failing to take — either way `up` always runs and always tidies up.
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (active) {
        pill.classList.remove('dragging');
        const order = [...el.benchPills.children].map((p) => +p.dataset.bi);
        benchChunks = order.map((i) => benchChunks[i]);
        benchPersist();
        renderBench();
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  el.benchClearBtn.addEventListener('click', () => {
    benchChunks = [];
    benchPersist();
    renderBench();
  });
  el.benchTosongBtn.addEventListener('click', () => {
    if (!benchChunks.length) return;
    insertFragment(benchText());
    showView('write');
  });
  el.benchKeepBtn.addEventListener('click', async () => {
    if (!benchChunks.length) return;
    try {
      await keepFragment(benchText(), 'forge bench');
      el.benchKeepBtn.textContent = '♥';
      el.benchKeepBtn.classList.add('kept');
    } catch (_) {}
  });

  // ---- long-press swap popover ----
  function openForgePopover(pillEl, lineIndex, pillIndex) {
    // Every pill on the board is now a single word, so alternatives offered
    // must also be single-word pool chunks (they're ~70% of the pool).
    const singleWordPool = forgePool.filter((c) => forgeWordCount(c.t) === 1);
    if (!singleWordPool.length) return;
    forgePopoverTarget = { lineIndex, pillIndex };
    const current = forgeChunkKey(forgeLines[lineIndex][pillIndex]);
    const candidates = shuffle([...singleWordPool]).filter((c) => forgeChunkKey(c) !== current);
    const alts = [];
    const seen = new Set();
    for (const c of candidates) {
      const key = forgeChunkKey(c);
      if (seen.has(key)) continue;
      seen.add(key);
      alts.push(c);
      if (alts.length >= 6) break;
    }
    // If the pool is small and everything collided with in-use chunks, still
    // offer whatever distinct alternatives exist rather than an empty sheet.
    if (!alts.length) return;

    el.forgePopover.innerHTML = '';
    alts.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'forge-alt-btn';
      b.textContent = c.t;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        forgeLines[lineIndex][pillIndex] = { t: c.t, a: c.a, benched: false };
        renderForgeLine(lineIndex, forgeLines[lineIndex]);
        closeForgePopover();
      });
      el.forgePopover.appendChild(b);
    });

    el.forgePopover.classList.remove('hidden');
    positionForgePopover(pillEl);
  }

  function positionForgePopover(pillEl) {
    const r = pillEl.getBoundingClientRect();
    const pop = el.forgePopover;
    pop.style.left = '0px'; pop.style.top = '0px'; // reset before measuring
    const popRect = pop.getBoundingClientRect();
    let left = r.left;
    let top = r.bottom + 8;
    if (left + popRect.width > window.innerWidth - 8) left = window.innerWidth - popRect.width - 8;
    if (top + popRect.height > window.innerHeight - 8) top = r.top - popRect.height - 8;
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = Math.max(8, top) + 'px';
  }

  function closeForgePopover() {
    forgePopoverTarget = null;
    el.forgePopover.classList.add('hidden');
    el.forgePopover.innerHTML = '';
  }
  document.addEventListener('click', (e) => {
    if (!forgePopoverTarget) return;
    if (el.forgePopover.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.forge-pill')) return; // its own tap handler manages this
    closeForgePopover();
  });

  // ---- per-line → Song / ♡ Keep ----
  el.forgeLineCards.forEach((card) => {
    const li = parseInt(card.dataset.lineIndex, 10);
    const toSongBtn = card.querySelector('.forge-tosong-btn');
    const keepBtn = card.querySelector('.forge-keep-btn');
    toSongBtn.addEventListener('click', () => {
      const text = lineText(forgeLines[li]);
      if (!text) return;
      insertFragment(text);
      showView('write');
    });
    keepBtn.addEventListener('click', () => {
      const text = lineText(forgeLines[li]);
      if (!text || keepBtn.disabled) return;
      keepBtn.disabled = true;
      keepFragment(text, 'forge', () => {
        keepBtn.classList.add('kept');
        keepBtn.textContent = '♥';
      }).catch(() => { keepBtn.disabled = false; });
    });
  });

  updateForgeWordsPill();

  // ---------- Utilities ----------
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function countSyllables(w) {
    w = w.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3) return 1;
    const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  }

  // ---------- Version (shown in the ... menu; must match sw.js CACHE) ----------
  const APP_VERSION = 'v2.9';
  const versionEl = $('app-version');
  if (versionEl) versionEl.textContent = 'Songsmith ' + APP_VERSION;

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // updateViaCache:'none' = always check sw.js against the network, and
      // explicitly poke for updates on every load (some mobile browsers are lazy).
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then((reg) => reg.update().catch(() => {}))
        .catch(() => {});
    });
    // When a freshly deployed SW takes control, reload once so the page runs the
    // new assets immediately (kills the "deployed but device shows old app" trap).
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) location.reload();
      hadController = true;
    });
  }

  // Save on exit
  window.addEventListener('beforeunload', () => { if (dirty) navigator.sendBeacon && flushSave(); });

  updateModePill();
  applyEditMode();
  loadRhymeCache();
  updateToggleUI();
  init();
})();
