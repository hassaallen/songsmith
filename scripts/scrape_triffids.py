"""Scrape The Triffids (David McComb) lyrics from songlyrics.com into a text file.
NOTE: aggregator source — lyrics are user-submitted and may contain errors.
Polite: identifies itself, rate-limits. robots.txt permits /the-triffids/ pages.

Usage:
  python scrape_triffids.py test     # one song to screen
  python scrape_triffids.py          # full -> sources/the-triffids-lyrics.txt
"""
import urllib.request, re, html, time, sys, os

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
LIST = 'https://www.songlyrics.com/the-triffids-lyrics/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'sources', 'the-triffids-lyrics.txt')


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


def title_from_slug(slug):
    return normalize(slug.replace('-', ' ').title())


def song_urls():
    seen = {}
    for page in (1, 2, 3, 4):
        url = LIST + ('' if page == 1 else f'?page={page}')
        try:
            h = get(url)
        except Exception:
            break
        found = re.findall(r'href="(/the-triffids/([a-z0-9-]+)-lyrics/)"', h)
        if not found:
            break
        for path, slug in found:
            seen.setdefault(slug, 'https://www.songlyrics.com' + path)
        time.sleep(0.6)
    return seen  # {slug: url}


def extract(h):
    # Lyrics live in <div id="songLyricsDiv" class="lyrics-body">. Text runs until
    # the first NESTED <div (ads/annotations the site injects after the lyrics).
    m = re.search(r'<div[^>]*id=["\']songLyricsDiv["\'][^>]*>', h, flags=re.I)
    if not m:
        return ''
    rest = h[m.end():]
    cut = re.search(r'<div', rest, flags=re.I)
    seg = rest[:cut.start()] if cut else rest.split('</div>')[0]
    seg = re.sub(r'<br\s*/?>', '\n', seg, flags=re.I)
    seg = re.sub('<[^>]+>', '', seg)
    seg = html.unescape(seg)
    seg = '\n'.join(ln.strip() for ln in seg.splitlines())
    seg = re.sub(r'\n{3,}', '\n\n', seg).strip()
    if 'do not have the lyrics' in seg.lower() or len(seg) < 25:
        return ''
    return normalize(seg)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'test':
        print(extract(get('https://www.songlyrics.com/the-triffids/wide-open-road-lyrics/'))[:500])
        return

    songs = song_urls()
    print(f'Found {len(songs)} unique songs.')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    n_ok = 0
    with open(OUT, 'w', encoding='utf-8') as f:
        for i, (slug, url) in enumerate(sorted(songs.items()), 1):
            try:
                lyrics = extract(get(url))
                if not lyrics:
                    print(f'  [{i}/{len(songs)}] no lyrics: {slug}')
                    continue
                f.write(f'### {title_from_slug(slug)}\n{lyrics}\n\n\n')
                n_ok += 1
            except Exception as e:
                print(f'  [{i}/{len(songs)}] ERROR {slug}: {e}')
            time.sleep(0.7)
    print(f'DONE. {n_ok} songs written to {OUT}')


if __name__ == '__main__':
    main()
