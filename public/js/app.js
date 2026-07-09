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

    toolsPanel: $('tools-panel'),
    sheetBackdrop: $('sheet-backdrop'), wordSheet: $('word-sheet'),
    sheetHandle: $('sheet-handle'), sheetContent: $('sheet-content'),

    tabbar: $('tabbar'),
    viewWrite: $('view-write'), viewForge: $('view-forge'), viewTray: $('view-tray'), viewSongs: $('view-songs'),
    draftsList: $('drafts-list'), songsNewBtn: $('songs-new-btn'),
  };

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
    else if (name === 'forge') el.viewForge.classList.remove('hidden');
    else if (name === 'tray') el.viewTray.classList.remove('hidden');
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
    el.scratchpad.innerText = draft.body || '';
    markSaved();
    updateFollowStrip();
  }

  function newDraft() {
    currentDraftId = null;
    el.draftTitle.value = '';
    el.scratchpad.innerText = '';
    markSaved();
    updateFollowStrip();
  }

  function markDirty() {
    dirty = true;
    el.saveStatus.textContent = 'editing…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 1200);
  }
  function markSaved() { dirty = false; el.saveStatus.textContent = 'saved'; }

  async function flushSave() {
    if (!dirty && currentDraftId) return;
    const payload = { title: el.draftTitle.value.trim() || 'Untitled', body: el.scratchpad.innerText };
    el.saveStatus.textContent = 'saving…';
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
      el.saveStatus.textContent = 'save failed';
    }
  }

  async function refreshDraftsCache() {
    const { drafts } = await API.listDrafts();
    draftsCache = drafts;
    if (!el.viewSongs.classList.contains('hidden')) renderDraftsList();
  }

  el.draftTitle.addEventListener('input', markDirty);

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
      d.innerHTML = `<div class="src-row"><span class="src-text">${escapeHtml(it.text)}</span></div>` +
                    `<div class="src-row"><span class="src-meta">${escapeHtml(it.meta || '')}</span>${badge}</div>`;
      d.addEventListener('click', () => insertFragment(it.text));
      d.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', it.text));
      el.sourceList.appendChild(d);
    });
  }

  // ---------- Scratchpad: insertion, selection, follow strip ----------
  el.scratchpad.addEventListener('input', () => { markDirty(); scheduleFollow(); });
  el.scratchpad.addEventListener('keyup', onCaretActivity);
  el.scratchpad.addEventListener('mouseup', onCaretActivity);
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
      el.scratchpad.innerText += text;
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
  }

  function onCaretActivity() {
    const sel = window.getSelection();
    const word = (sel.toString() || '').trim();
    if (word && /^[A-Za-z'’-]+$/.test(word)) {
      showWordTools(word);
    } else {
      hideWordTools();
    }
    scheduleFollow();
  }

  function scheduleFollow() {
    clearTimeout(followTimer);
    followTimer = setTimeout(updateFollowStrip, 400);
  }

  let followRequestId = 0;
  async function updateFollowStrip() {
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
      // Placeholder only — visual "keep" state, not yet wired to the Tray.
      btn.addEventListener('click', () => {
        const key = word.toLowerCase();
        if (keptWords.has(key)) keptWords.delete(key); else keptWords.add(key);
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

  // ---------- Utilities ----------
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function countSyllables(w) {
    w = w.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3) return 1;
    const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  }

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // Save on exit
  window.addEventListener('beforeunload', () => { if (dirty) navigator.sendBeacon && flushSave(); });

  updateModePill();
  init();
})();
