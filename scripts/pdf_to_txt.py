"""One-off PDF -> clean .txt conversion for corpus sources.
Handles de-hyphenation, page-number/header stripping, and (optionally) an
English-only line filter for bilingual editions.

  python pdf_to_txt.py            # converts the two known PDFs in sources/
"""
import re, os
from pypdf import PdfReader

COMMON_EN = set('''the a an and or but of to in on at by for with from as is am are was were be been
it this that these those there here i you he she we they me him her us them my your his our their
not no so if then than when what who how where why all one two out up down over under into through
o'er now old new day night love time man men heart eyes long great little king son god sea land'''.split())


def english_ratio(line: str) -> float:
    words = re.findall(r"[A-Za-z']+", line)
    if not words:
        return 0.0
    hits = sum(1 for w in words if w.lower() in COMMON_EN)
    return hits / len(words)


def non_ascii_letters(line: str) -> int:
    return sum(1 for c in line if c.isalpha() and ord(c) > 127)


def convert(path: str, out: str, english_only: bool = False):
    r = PdfReader(path)
    pages = []
    for pg in r.pages:
        t = pg.extract_text() or ''
        pages.append(t)
    text = '\n'.join(pages)
    # De-hyphenate: word- \n word -> wordword
    text = re.sub(r'(\w)-\s*\n\s*(\w)', r'\1\2', text)
    # Replace extraction artefacts
    text = text.replace('�', "'")
    lines_out = []
    for ln in text.splitlines():
        s = ln.strip()
        if not s:
            lines_out.append('')
            continue
        if re.fullmatch(r'\d+', s):                       # bare page number
            continue
        if re.fullmatch(r'[\dIVXLC .\-]+', s):            # page/roman furniture
            continue
        if len(s) > 4 and s.upper() == s and not re.search(r'[a-z]', s):
            continue                                      # ALL-CAPS running heads
        if english_only:
            # keep only lines that read as English: few accented letters and
            # a reasonable share of common English words
            if non_ascii_letters(s) >= 2:
                continue
            if english_ratio(s) < 0.18:
                continue
        lines_out.append(s)
    result = '\n'.join(lines_out)
    result = re.sub(r'\n{3,}', '\n\n', result)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(result)
    print(f'{os.path.basename(out)}: {len(result.split()):,} words')


BASE = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'sources'))

convert(os.path.join(BASE, 'Hywel Williams', 'Great speeches of our time- Hywel Williams.pdf'),
        os.path.join(BASE, 'Hywel Williams', 'Great Speeches of Our Time - Hywel Williams.txt'),
        english_only=False)

convert(os.path.join(BASE, 'Gerard Murphy', 'Early Irish Lyrics - Eighth to Twelfth Century - Gerard Murphy.pdf'),
        os.path.join(BASE, 'Gerard Murphy', 'Early Irish Lyrics (English translations) - Gerard Murphy.txt'),
        english_only=True)
