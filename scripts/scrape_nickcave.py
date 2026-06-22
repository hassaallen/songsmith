"""Scrape Nick Cave lyrics from his official site (nickcave.com) into a text file.
Official source, WordPress, /lyric/[slug]/ pages. robots.txt permits it.
Lyrics live in <div class="lyrics"> with <h1> title, <h2 artist>, <div class="date"> year.

Usage:
  python scrape_nickcave.py test     # one song to screen
  python scrape_nickcave.py          # full -> sources/nick-cave-lyrics.txt
"""
import urllib.request, re, html, time, sys, os

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
INDEX = 'https://www.nickcave.com/lyrics/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'sources', 'nick-cave-lyrics.txt')


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        raw = r.read()
    try:
        return raw.decode('utf-8')
    except UnicodeDecodeError:
        return raw.decode('cp1252', 'replace')


def normalize(s):
    return (s.replace('’', "'").replace('‘', "'")
             .replace('“', '"').replace('”', '"')
             .replace('…', '...').replace('–', '-').replace('—', '-'))


def song_urls():
    h = get(INDEX)
    return sorted(set(re.findall(r'https://www\.nickcave\.com/lyric/[a-z0-9-]+/', h)))


def strip_tags(s):
    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.I)
    s = re.sub('<[^>]+>', '', s)
    return html.unescape(s)


def extract(h):
    hh = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', h, flags=re.S)
    tm = re.search(r'<h1[^>]*>(.*?)</h1>', hh, flags=re.S)
    title = strip_tags(tm.group(1)).strip() if tm else 'Untitled'
    ym = re.search(r'<div[^>]*class="date"[^>]*>(.*?)</div>', hh, flags=re.S)
    year = strip_tags(ym.group(1)).strip() if ym else ''
    lm = re.search(r'<div[^>]*class="lyrics"[^>]*>(.*?)</div>', hh, flags=re.S)
    if not lm:
        return title, year, ''
    ps = re.findall(r'<p[^>]*>(.*?)</p>', lm.group(1), flags=re.S)
    verses = []
    for p in ps:
        t = strip_tags(p)
        t = '\n'.join(ln.strip() for ln in t.splitlines())
        t = re.sub(r'\n{3,}', '\n\n', t).strip()
        if t and len(t) > 2:
            verses.append(t)
    return normalize(title), year, normalize('\n\n'.join(verses))


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'test':
        title, year, lyrics = extract(get('https://www.nickcave.com/lyric/the-mercy-seat/'))
        print('TITLE:', title, '| YEAR:', year)
        print('---')
        print(lyrics[:600])
        return

    urls = song_urls()
    print(f'Found {len(urls)} lyric pages.')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    n_ok = 0
    with open(OUT, 'w', encoding='utf-8') as f:
        for i, url in enumerate(urls, 1):
            try:
                title, year, lyrics = extract(get(url))
                if not lyrics.strip():
                    print(f'  [{i}/{len(urls)}] no lyrics: {url}')
                    continue
                f.write(f'### {title}\n')
                if year:
                    f.write(f'[{year}]\n')
                f.write(f'{lyrics}\n\n\n')
                n_ok += 1
                if i % 25 == 0:
                    print(f'  [{i}/{len(urls)}] ok={n_ok}')
            except Exception as e:
                print(f'  [{i}/{len(urls)}] ERROR {url}: {e}')
            time.sleep(0.5)
    print(f'DONE. {n_ok} songs written to {OUT}')


if __name__ == '__main__':
    main()
