"""Build the Songsmith cut-up corpus from everything in sources/.
Extracts (EPUB + TXT) -> cleans -> segments per content type -> writes per-source
fragment files + a manifest. Output goes to corpus/ (gitignored; copyrighted material).

  python build_corpus.py            # process everything
  python build_corpus.py --sample   # process + print sample fragments per source
"""
import os, re, html, zipfile, json, random, sys

random.seed(7)  # deterministic sampling
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'sources')
OUT = os.path.join(ROOT, 'corpus')
CAP = 4000  # max fragments per source (random sample if exceeded) — keeps serving fast

# ---- classification -------------------------------------------------------
AUTHOR_TYPE = {
    'Banjo Paterson': 'poem', 'C.J. Dennis': 'poem', 'Henry Lawson': 'poem',
    'W.B. Yeats': 'poem', 'Seamus Heaney': 'poem',
    'Bob Dylan': 'lyric', 'Grateful Dead': 'lyric', 'Jim Morrison': 'lyric',
    'Leonard Cohen': 'lyric', 'Sting': 'lyric', 'The Beatles': 'lyric',
    'Tom Waits': 'lyric', 'Mick Thomas': 'lyric',
    'Charles Dickens': 'prose', 'F Scott Fitzgerald': 'prose', 'Marcus Clarke': 'prose',
    'Miles Franklin': 'prose', 'Thomas Hardy': 'prose', 'Tom Collins': 'prose',
    'Samuell Beckett': 'play', 'Brendan Behan': 'prose',
    'Douglas Sladen': 'poem', 'Kuno Meyer': 'poem',
    'Hywel Williams': 'prose',  # Great Speeches — rhetoric cuts like prose
    'John Keats': 'letters',    # mixed life-and-letters volume (poems quoted within)
    # 10 Jul intake
    'Thomas Keneally': 'prose', 'Robert Hughes': 'prose',
    'Bobby Braddock': 'prose',  # Country Music's Greatest Lines — stories around the lyrics
    'Thomas Chatterton': 'poem',
    'Henry Rollins': 'lyric', 'Robert Burns': 'lyric', 'Irish Pub Songs': 'lyric',
    'Sixties Songbook': 'lyric', 'Noel Coward': 'lyric',
    'Robert Gogan': 'lyric', 'James N Healy': 'lyric',
    'Australian Bush Ballads': 'poem', 'Classic Australian Poetry': 'poem',
    'Francis James Child': 'poem',
}
FN_RULES = [('letter', 'letters'), ('plays', 'play'), ('lyric', 'lyric')]

# Files excluded pending better source versions (matched as lowercase substrings):
#  - Yeats "Volume VIII" is prose/essays, not his poems
#  - the Tom Waits file is badly OCR'd
#  - Child V1 extraction is dominated by scholarly headnotes, not the ballads
EXCLUDE = ['volume viii', 'early years the lyrics of tom waits',
           'english and scottish popular ballads']

def classify(author, fn):
    low = fn.lower()
    for k, t in FN_RULES:
        if k in low:
            return t
    return AUTHOR_TYPE.get(author, 'prose')

# ---- text extraction ------------------------------------------------------
with open(os.path.join(ROOT, 'public', 'api', 'us_au_map.json'), encoding='utf-8') as _f:
    US_AU = json.load(_f)
_AU_RX = re.compile(r'\b(' + '|'.join(sorted(US_AU, key=len, reverse=True)) + r')\b', re.I)

def _au_word(m):
    w = m.group(0)
    au = US_AU.get(w.lower())
    if not au:
        return w
    if w.isupper():
        return au.upper()
    if w[0].isupper():
        return au[0].upper() + au[1:]
    return au

def normalize(s):
    s = (s.replace('’', "'").replace('‘', "'")
          .replace('“', '"').replace('”', '"')
          .replace('…', '...').replace('–', '-').replace('—', '-')
          .replace('\xa0', ' '))
    return _AU_RX.sub(_au_word, s)

def epub_text(path):
    z = zipfile.ZipFile(path)
    names = []
    opf = [n for n in z.namelist() if n.endswith('.opf')]
    if opf:
        o = z.read(opf[0]).decode('utf-8', 'replace')
        base = os.path.dirname(opf[0])
        href = {}
        for m in re.finditer(r'<item\b[^>]*>', o):
            tag = m.group(0)
            i = re.search(r'id="([^"]+)"', tag)
            h = re.search(r'href="([^"]+)"', tag)
            if i and h:
                href[i.group(1)] = h.group(1)
        for idref in re.findall(r'<itemref[^>]*idref="([^"]+)"', o):
            if idref in href:
                p = (base + '/' + href[idref]) if base else href[idref]
                names.append(p.replace('//', '/'))
    if not names:
        names = [n for n in z.namelist() if n.lower().endswith(('.xhtml', '.html', '.htm'))]
    out = []
    for n in names:
        try:
            c = z.read(n).decode('utf-8', 'replace')
        except Exception:
            continue
        c = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', c, flags=re.S)
        c = re.sub(r'<br\b[^>]*/?>', '\n', c, flags=re.I)
        c = re.sub(r'</(p|div|h[1-6]|li|tr)>', '\n', c, flags=re.I)
        c = re.sub('<[^>]+>', '', c)
        out.append(html.unescape(c))
    return normalize('\n'.join(out))

def read_text(path):
    if path.lower().endswith('.epub'):
        return epub_text(path)
    with open(path, encoding='utf-8', errors='replace') as f:
        return normalize(f.read())

# ---- filtering ------------------------------------------------------------
BOILER = re.compile(
    r'(isbn|copyright|all rights reserved|project gutenberg|gutenberg-tm|'
    r'www\.|https?:|table of contents|^contents$|^chapter\b|^\s*verse\b|^\s*chorus\b|'
    r'written by|produced by|recorded|^\[|^###|first published|penguin|faber|'
    r'ebook|e-book|cover image|illustration|^\s*\d+\s*$)', re.I)
ROMAN = re.compile(r'^[ivxlcdm]+\.?$', re.I)

def letters_ratio(s):
    a = sum(c.isalpha() for c in s)
    return a / max(1, len(s))

def good(frag, lo, hi):
    f = frag.strip(' \t•-—–*')
    if not (lo <= len(f) <= hi):
        return None
    if len(f.split()) < 2:
        return None
    if BOILER.search(f) or ROMAN.match(f):
        return None
    if letters_ratio(f) < 0.6:
        return None
    up = sum(c.isupper() for c in f if c.isalpha())
    if up / max(1, sum(c.isalpha() for c in f)) > 0.7:  # all-caps heading
        return None
    return f

# ---- segmentation ---------------------------------------------------------
def seg_lines(text, lo=12, hi=90):
    for ln in text.splitlines():
        g = good(ln, lo, hi)
        if g:
            yield g

def split_sentences(text):
    text = re.sub(r'\s+', ' ', text)
    return re.split(r'(?<=[.!?])\s+(?=[A-Z"\'(])', text)

def seg_sentences(text, lo=18, hi=95):
    for sent in split_sentences(text):
        sent = sent.strip()
        g = good(sent, lo, hi)
        if g:
            yield g
            continue
        if len(sent) > hi:  # break long sentence into clauses
            for clause in re.split(r'[;:,]\s+|\s+[-—]\s+', sent):
                g = good(clause, lo, hi)
                if g:
                    yield g

def strip_play(text):
    out = []
    for ln in text.splitlines():
        s = ln.strip()
        if re.match(r'^[A-Z][A-Z .\'-]{1,28}[:.]$', s):     # speaker cue
            continue
        if re.match(r'^[A-Z][A-Z .\'-]{1,28}[:.]\s', s):    # "NAME: dialogue"
            s = s.split(None, 1)[1] if ' ' in s else s
        s = re.sub(r'\([^)]*\)', '', s)                      # inline stage dir
        s = re.sub(r'\[[^\]]*\]', '', s)
        out.append(s)
    return '\n'.join(out)

def fragments(text, ftype):
    if ftype in ('lyric', 'poem'):
        return list(seg_lines(text))
    if ftype == 'play':
        return list(seg_lines(strip_play(text), lo=14, hi=95)) + list(seg_sentences(strip_play(text)))
    return list(seg_sentences(text))  # prose, letters

# ---- main -----------------------------------------------------------------
def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def gather():
    items = []
    for dp, dn, fn in os.walk(SRC):
        for f in fn:
            if not f.lower().endswith(('.epub', '.txt')):
                continue
            if f.lower() == 'readme.md':
                continue
            if any(x in f.lower() for x in EXCLUDE):
                continue
            path = os.path.join(dp, f)
            rel = os.path.relpath(path, SRC)
            parts = rel.split(os.sep)
            if len(parts) >= 2:
                author = parts[0]
            else:
                author = re.sub(r'-lyrics$', '', os.path.splitext(f)[0]).replace('-', ' ').title()
            name = re.sub(r'\.(epub|txt)$', '', f, flags=re.I)
            items.append((path, author, name))
    return items

def main():
    sample = '--sample' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    grand = 0
    for path, author, name in sorted(gather()):
        ftype = classify(author, name)
        try:
            text = read_text(path)
        except Exception as e:
            print(f'!! FAILED {name}: {e}')
            continue
        frags = fragments(text, ftype)
        # dedupe (case-insensitive) preserving order
        seen, uniq = set(), []
        for fr in frags:
            k = fr.lower()
            if k not in seen:
                seen.add(k); uniq.append(fr)
        capped = False
        if len(uniq) > CAP:
            uniq = random.sample(uniq, CAP); capped = True
        slug = slugify(f'{author}-{name}')[:80]
        with open(os.path.join(OUT, slug + '.txt'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(uniq))
        manifest.append({'slug': slug, 'author': author, 'work': name,
                         'type': ftype, 'count': len(uniq), 'capped': capped})
        grand += len(uniq)
        flag = ' (capped)' if capped else ''
        print(f'{len(uniq):>6} [{ftype:<7}] {author} — {name}{flag}')
        if sample and uniq:
            for s in random.sample(uniq, min(4, len(uniq))):
                print('         >', s)
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f'\nTOTAL: {grand:,} fragments from {len(manifest)} sources -> {OUT}')

if __name__ == '__main__':
    main()
