// Songsmith — Phase 1 client logic.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = {
    loginView: $('login-view'), appView: $('app-view'),
    loginForm: $('login-form'), loginUser: $('login-username'),
    loginPass: $('login-password'), loginError: $('login-error'),
    draftTitle: $('draft-title'), draftSelect: $('draft-select'),
    newDraftBtn: $('new-draft-btn'), saveStatus: $('save-status'),
    logoutBtn: $('logout-btn'),
    sourceMode: $('source-mode'), shuffleBtn: $('shuffle-btn'), sourceList: $('source-list'),
    addTextBtn: $('add-text-btn'), filterBtn: $('filter-btn'),
    filterModal: $('filter-modal'), filterList: $('filter-list'),
    filterAll: $('filter-all'), filterNone: $('filter-none'),
    filterApply: $('filter-apply'), filterCancel: $('filter-cancel'),
    textModal: $('text-modal'), textTitle: $('text-title'), textAuthor: $('text-author'),
    textBody: $('text-body'), textSave: $('text-save'), textCancel: $('text-cancel'), textError: $('text-error'),
    scratchpad: $('scratchpad'), followChips: $('follow-chips'),
    wordPopup: $('word-popup'), toolsPanel: $('tools-panel'),
    workspace: document.querySelector('.workspace'),
  };

  let currentDraftId = null;
  let dirty = false;
  let saveTimer = null;
  let followTimer = null;
  let pinned = false;
  let selectedSources = [];   // empty = all sources
  let libManifest = null;

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

  // ---------- Drafts ----------
  async function loadDraftsList() {
    const { drafts } = await API.listDrafts();
    el.draftSelect.innerHTML = '';
    drafts.forEach((d) => {
      const o = document.createElement('option');
      o.value = d.id; o.textContent = d.title || 'Untitled';
      el.draftSelect.appendChild(o);
    });
    if (drafts.length) {
      await openDraft(drafts[0].id);
    } else {
      newDraft();
    }
  }

  el.draftSelect.addEventListener('change', () => openDraft(+el.draftSelect.value));

  async function openDraft(id) {
    const { draft } = await API.getDraft(id);
    currentDraftId = draft.id;
    el.draftTitle.value = draft.title || '';
    el.scratchpad.innerText = draft.body || '';
    el.draftSelect.value = String(draft.id);
    markSaved();
    updateFollowStrip();
  }

  function newDraft() {
    currentDraftId = null;
    el.draftTitle.value = '';
    el.scratchpad.innerText = '';
    markSaved();
  }
  el.newDraftBtn.addEventListener('click', () => { if (!dirty || confirm('Start a new song? Unsaved changes will be saved first.')) { flushSave().then(newDraft); } });

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
        await refreshDraftOptions();
        el.draftSelect.value = String(currentDraftId);
      }
      // keep the dropdown label in sync with the title
      const opt = [...el.draftSelect.options].find((o) => o.value === String(currentDraftId));
      if (opt) opt.textContent = payload.title;
      markSaved();
    } catch (err) {
      el.saveStatus.textContent = 'save failed';
    }
  }

  async function refreshDraftOptions() {
    const { drafts } = await API.listDrafts();
    el.draftSelect.innerHTML = '';
    drafts.forEach((d) => {
      const o = document.createElement('option');
      o.value = d.id; o.textContent = d.title || 'Untitled';
      el.draftSelect.appendChild(o);
    });
  }

  el.draftTitle.addEventListener('input', markDirty);

  // ---------- Sources ----------
  el.sourceMode.addEventListener('change', loadSources);
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
      el.sourceMode.value = 'my_texts';
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
    el.sourceMode.value = 'library';
    loadSources();
  });

  async function openFilter() {
    if (!libManifest) {
      try { libManifest = (await API.libraryManifest()).sources; }
      catch (_) { libManifest = []; }
    }
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

  async function loadSources() {
    el.sourceList.innerHTML = '<p class="muted" style="padding:10px">Loading…</p>';
    try {
      const mode = el.sourceMode.value;
      if (mode === 'my_texts') await loadMyTextLines();
      else if (mode === 'poetry_random') await loadPoetryLines();
      else await loadLibraryLines();
    } catch (err) {
      el.sourceList.innerHTML = `<p class="error" style="padding:10px">${err.message}</p>`;
    }
  }

  async function loadLibraryLines() {
    const { fragments } = await API.libraryRandom(40, selectedSources);
    renderSourceLines(fragments.map((f) => ({ text: f.text, meta: f.author })));
  }

  async function loadPoetryLines() {
    // Pull many poems but take only 1-2 lines from each, so the list spans
    // lots of different poets instead of flooding with one repeated name.
    const poems = await API.poetryRandom(25);
    const lines = [];
    poems.forEach((p) => {
      const good = (p.lines || []).map((l) => l.trim()).filter((l) => l.length > 8);
      shuffle(good).slice(0, 2).forEach((t) => lines.push({ text: t, meta: `${p.author} — ${p.title}` }));
    });
    renderSourceLines(shuffle(lines).slice(0, 40));
  }

  async function loadMyTextLines() {
    const { texts } = await API.listTexts();
    if (!texts.length) {
      el.sourceList.innerHTML = '<p class="muted" style="padding:10px">No texts imported yet. Tap <strong>+ Text</strong> above to paste in lyrics, a poem, a chapter — anything — and cut it up.</p>';
      return;
    }
    // pull a random text's body and cut into lines/sentences
    const pick = texts[Math.floor(Math.random() * texts.length)];
    const { text } = await API.getText(pick.id);
    const fragments = (text.body || '')
      .split(/[\n.;:!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 6);
    renderSourceLines(shuffle(fragments).slice(0, 40).map((t) => ({ text: t, meta: `${text.title}` })));
  }

  function renderSourceLines(items) {
    el.sourceList.innerHTML = '';
    if (!items.length) {
      el.sourceList.innerHTML = '<p class="muted" style="padding:10px">Nothing found — try shuffle.</p>';
      return;
    }
    items.forEach((it) => {
      const d = document.createElement('div');
      d.className = 'source-line';
      d.draggable = true;
      d.innerHTML = `${escapeHtml(it.text)}<span class="src-meta">${escapeHtml(it.meta || '')}</span>`;
      d.addEventListener('click', () => insertTextAtCaret('\n' + it.text + '\n'));
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
    if (t) insertTextAtCaret(t);
  });
  // keep contenteditable plain-text on paste
  el.scratchpad.addEventListener('paste', (e) => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text');
    insertTextAtCaret(t);
  });
  document.addEventListener('mousedown', (e) => {
    if (!el.wordPopup.contains(e.target) && e.target !== el.scratchpad && !el.scratchpad.contains(e.target)) hidePopup();
  });

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
      hidePopup();
    }
    scheduleFollow();
  }

  function scheduleFollow() {
    clearTimeout(followTimer);
    followTimer = setTimeout(updateFollowStrip, 400);
  }

  async function updateFollowStrip() {
    const prev = wordBeforeCaret();
    if (!prev) { el.followChips.innerHTML = ''; return; }
    try {
      const words = await API.datamuse({ rel_bga: prev, max: 10 });
      el.followChips.innerHTML = '';
      words.slice(0, 10).forEach((w) => {
        const c = document.createElement('button');
        c.className = 'chip';
        c.textContent = w.word;
        c.addEventListener('click', () => insertTextAtCaret((needsLeadingSpace() ? ' ' : '') + w.word));
        el.followChips.appendChild(c);
      });
    } catch (_) { /* silent — ambient feature */ }
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
  let savedRange = null;

  async function showWordTools(word) {
    const sel = window.getSelection();
    if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();

    const html = renderToolsShell(word);
    if (pinned) {
      el.toolsPanel.innerHTML = html;
      el.toolsPanel.classList.remove('hidden');
    } else {
      el.wordPopup.innerHTML = html;
      positionPopup();
      el.wordPopup.classList.remove('hidden');
    }
    wireToolsButtons(word);
    fillToolsData(word);
  }

  function renderToolsShell(word) {
    return `
      <div class="tools-head">
        <span class="word">${escapeHtml(word)}</span>
        <button class="pin-toggle" data-pin>${pinned ? 'Unpin' : 'Pin'}</button>
      </div>
      <div class="tools-block" data-syll></div>
      <div class="tools-label">Rhymes</div>          <div class="tools-words" data-rhy>…</div>
      <div class="tools-label">Near rhymes</div>      <div class="tools-words" data-nry>…</div>
      <div class="tools-label">Synonyms</div>         <div class="tools-words" data-syn>…</div>
      <div class="tools-label">Related</div>          <div class="tools-words" data-trg>…</div>
      <div class="tools-label">Definition</div>       <div class="def" data-def>…</div>`;
  }

  function wireToolsButtons(word) {
    const root = pinned ? el.toolsPanel : el.wordPopup;
    root.querySelector('[data-pin]').addEventListener('click', () => togglePin(word));
  }

  async function fillToolsData(word) {
    const root = pinned ? el.toolsPanel : el.wordPopup;
    const fill = (sel, words) => {
      const box = root.querySelector(sel);
      if (!box) return;
      box.innerHTML = '';
      if (!words.length) { box.innerHTML = '<span class="muted">—</span>'; return; }
      words.slice(0, 12).forEach((w) => {
        const b = document.createElement('button');
        b.className = 'chip'; b.textContent = w.word;
        b.addEventListener('click', () => replaceSelection(w.word));
        box.appendChild(b);
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
      const syll = rhy[0]?.numSyllables;
      const sb = root.querySelector('[data-syll]');
      if (sb) sb.innerHTML = `<span class="muted">syllables: </span>${countSyllables(word)}`;
    } catch (_) {}
    try {
      const dict = await API.dictionary(word);
      const def = dict?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      const pos = dict?.[0]?.meanings?.[0]?.partOfSpeech;
      const box = root.querySelector('[data-def]');
      if (box) box.innerHTML = def ? `<em>${escapeHtml(pos || '')}</em> ${escapeHtml(def)}` : '<span class="muted">no definition</span>';
    } catch (_) {
      const box = root.querySelector('[data-def]');
      if (box) box.innerHTML = '<span class="muted">no definition</span>';
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
    hidePopup();
    markDirty();
  }

  function togglePin(word) {
    pinned = !pinned;
    el.workspace.classList.toggle('pinned', pinned);
    el.wordPopup.classList.add('hidden');
    el.toolsPanel.classList.toggle('hidden', !pinned);
    showWordTools(word);
  }

  function positionPopup() {
    if (!savedRange) return;
    const rect = savedRange.getBoundingClientRect();
    const pop = el.wordPopup;
    pop.style.visibility = 'hidden';
    pop.classList.remove('hidden');
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top + ph > window.scrollY + window.innerHeight - 8) top = rect.top + window.scrollY - ph - 6;
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = Math.max(8, top) + 'px';
    pop.style.visibility = 'visible';
  }

  function hidePopup() { el.wordPopup.classList.add('hidden'); }

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

  init();
})();
