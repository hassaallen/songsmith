"""Scrape Paul Kelly lyrics into a single structured text file for the cut-up library.
Polite: identifies itself, rate-limits, obeys robots (only /lyric/ pages, which are Allowed).

Usage:
  python scrape_paulkelly.py test          # extract one song, print to screen
  python scrape_paulkelly.py               # full scrape -> sources/paul-kelly-lyrics.txt
"""
import urllib.request, re, html, time, sys, os

UA = {'User-Agent': 'Mozilla/5.0 (personal lyrics archive; respectful, rate-limited)'}
SITEMAP = 'https://www.paulkelly.com.au/wp-sitemap-posts-lyric-1.xml'
OUT = os.path.join(os.path.dirname(__file__), '..', 'sources', 'paul-kelly-lyrics.txt')


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        raw = r.read()
    try:
        return raw.decode('utf-8')
    except UnicodeDecodeError:
        return raw.decode('cp1252', 'replace')


def normalize(s):
    # Smart punctuation -> plain ASCII (cleaner for the rhyme/synonym tools).
    return (s.replace('’', "'").replace('‘', "'")
             .replace('“', '"').replace('”', '"')
             .replace('…', '...'))


def extract(h):
    h = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', h, flags=re.S)
    m = re.search(r'<h1[^>]*>(.*?)</h1>', h, flags=re.S)
    title = html.unescape(re.sub('<[^>]+>', '', m.group(1))).strip() if m else 'Untitled'
    a = re.search(r'lyric-album-([a-z0-9-]+)', h)
    album = a.group(1).replace('-', ' ').title() if a else ''
    ps = re.findall(r'<p[^>]*>(.*?)</p>', h, flags=re.S)
    verses = []
    for p in ps:
        p = re.sub(r'<br\s*/?>', '\n', p, flags=re.I)
        p = re.sub('<[^>]+>', '', p)
        p = html.unescape(p).strip()
        # skip obvious non-lyric paragraphs (share/footer boilerplate)
        if p and len(p) > 2:
            verses.append(p)
    return normalize(title), album, normalize('\n\n'.join(verses))


def all_urls():
    xml = get(SITEMAP)
    return re.findall(r'<loc>(https://www\.paulkelly\.com\.au/lyric/[^<]+)</loc>', xml)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'test':
        title, album, lyrics = extract(get('https://www.paulkelly.com.au/lyric/dumb-things/'))
        print('TITLE:', title)
        print('ALBUM:', album)
        print('---')
        print(lyrics)
        return

    urls = all_urls()
    print(f'Found {len(urls)} lyric pages.')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    n_ok = 0
    with open(OUT, 'w', encoding='utf-8') as f:
        for i, url in enumerate(urls, 1):
            try:
                title, album, lyrics = extract(get(url))
                if not lyrics.strip():
                    print(f'  [{i}/{len(urls)}] EMPTY: {url}')
                    continue
                f.write(f'### {title}\n')
                if album:
                    f.write(f'[Album: {album}]\n')
                f.write(f'{lyrics}\n\n\n')
                n_ok += 1
                if i % 25 == 0:
                    print(f'  [{i}/{len(urls)}] ok={n_ok}')
            except Exception as e:
                print(f'  [{i}/{len(urls)}] ERROR {url}: {e}')
            time.sleep(0.5)  # be polite
    print(f'DONE. {n_ok} songs written to {OUT}')


if __name__ == '__main__':
    main()
