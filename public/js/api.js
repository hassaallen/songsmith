// Thin wrapper around the PHP backend. All paths are relative so it works
// wherever the app is hosted.
const API = (() => {
  const base = 'api/';

  async function req(path, opts = {}) {
    const res = await fetch(base + path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* non-JSON */ }
    if (!res.ok) {
      const msg = (data && data.error) ? data.error : `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  return {
    me:      ()            => req('me.php'),
    login:   (u, p)        => req('login.php', { method: 'POST', body: JSON.stringify({ username: u, password: p }) }),
    logout:  ()            => req('logout.php', { method: 'POST' }),

    listDrafts: ()         => req('drafts.php'),
    getDraft:   (id)       => req('drafts.php?id=' + id),
    createDraft:(d)        => req('drafts.php', { method: 'POST', body: JSON.stringify(d) }),
    updateDraft:(id, d)    => req('drafts.php?id=' + id, { method: 'PUT', body: JSON.stringify(d) }),
    deleteDraft:(id)       => req('drafts.php?id=' + id, { method: 'DELETE' }),

    listTexts: ()          => req('texts.php'),
    getText:   (id)        => req('texts.php?id=' + id),
    createText:(d)         => req('texts.php', { method: 'POST', body: JSON.stringify(d) }),
    deleteText:(id)        => req('texts.php?id=' + id, { method: 'DELETE' }),

    // Proxy helpers
    datamuse: (params)     => req('proxy.php?service=datamuse&' + new URLSearchParams(params)),
    dictionary: (word)     => req('proxy.php?service=dictionary&word=' + encodeURIComponent(word)),
    poetryRandom: (n = 25) => req('proxy.php?service=poetry_random&n=' + n),

    libraryManifest: ()    => req('library.php?action=manifest'),
    libraryRandom: (n = 40, sources = []) =>
      req('library.php?action=random&n=' + n +
          (sources.length ? '&sources=' + encodeURIComponent(sources.join(',')) : '')),
  };
})();
