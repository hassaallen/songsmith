<?php
// Text processing shared by texts.php (save-time) and the my-texts servers
// (library.php, forge.php). Ports scripts/build_corpus.py's normalisation
// and segmentation to PHP so user-pasted texts get the same treatment as
// the real corpus: smart-punctuation + US->AU normalisation, per-type
// segmentation (lyric/poem -> lines, prose -> sentences, long ones split
// into clauses), boilerplate filtering.

require_once __DIR__ . '/db.php';

// Same boilerplate/roman-numeral filters as build_corpus.py's BOILER/ROMAN.
const BOILER_RX = '/(isbn|copyright|all rights reserved|project gutenberg|gutenberg-tm|' .
    'www\.|https?:|table of contents|^contents$|^chapter\b|^\s*verse\b|^\s*chorus\b|' .
    'written by|produced by|recorded|^\[|^###|first published|penguin|faber|' .
    'ebook|e-book|cover image|illustration|^\s*\d+\s*$)/i';
const ROMAN_RX = '/^[ivxlcdm]+\.?$/i';

// ---- US -> AU spelling (word-boundary, longest-first alternation, case-preserving) ----
function us_au_map(): array
{
    static $map = null;
    if ($map === null) {
        $p = __DIR__ . '/us_au_map.json';
        $map = is_file($p) ? (json_decode(file_get_contents($p), true) ?: []) : [];
    }
    return $map;
}

function us_au_pattern(): ?string
{
    static $pattern = null;
    if ($pattern === null) {
        $map = us_au_map();
        if (!$map) {
            $pattern = '';
            return null;
        }
        $words = array_keys($map);
        usort($words, static fn($a, $b) => mb_strlen($b) - mb_strlen($a));
        $pattern = '/\b(' . implode('|', array_map(static fn($w) => preg_quote($w, '/'), $words)) . ')\b/i';
    }
    return $pattern ?: null;
}

function text_normalise(string $s): string
{
    // Smart quotes/dashes/ellipsis -> straight ASCII, nbsp -> space.
    $s = str_replace(
        ["\xE2\x80\x99", "\xE2\x80\x98", "\xE2\x80\x9C", "\xE2\x80\x9D", "\xE2\x80\xA6", "\xE2\x80\x93", "\xE2\x80\x94", "\xC2\xA0"],
        ["'", "'", '"', '"', '...', '-', '-', ' '],
        $s
    );

    $pattern = us_au_pattern();
    if ($pattern === null) {
        return $s;
    }
    $map = us_au_map();
    return preg_replace_callback($pattern, static function ($m) use ($map) {
        $w = $m[0];
        $au = $map[mb_strtolower($w)] ?? null;
        if ($au === null) {
            return $w;
        }
        if (ctype_upper($w)) {
            return strtoupper($au);
        }
        if (ctype_upper($w[0])) {
            return ucfirst($au);
        }
        return $au;
    }, $s);
}

// ---- filtering ----
function letters_ratio(string $s): float
{
    $len = mb_strlen($s, 'UTF-8');
    if ($len === 0) {
        return 0.0;
    }
    $letters = preg_match_all('/\pL/u', $s);
    return $letters / $len;
}

function frag_good(string $f, int $lo, int $hi): ?string
{
    // Same strip-set as build_corpus.py's frag.strip(' \t•-—–*').
    $f = preg_replace('/^[\s\x{2022}\-\x{2014}\x{2013}*]+|[\s\x{2022}\-\x{2014}\x{2013}*]+$/u', '', $f);
    $len = mb_strlen($f, 'UTF-8');
    if ($len < $lo || $len > $hi) {
        return null;
    }
    $words = preg_split('/\s+/u', trim($f), -1, PREG_SPLIT_NO_EMPTY);
    if (count($words) < 2) {
        return null;
    }
    if (preg_match(BOILER_RX, $f) || preg_match(ROMAN_RX, $f)) {
        return null;
    }
    if (letters_ratio($f) < 0.6) {
        return null;
    }
    $alpha = preg_match_all('/\pL/u', $f);
    $upper = preg_match_all('/\p{Lu}/u', $f);
    if ($upper / max(1, $alpha) > 0.7) { // all-caps heading
        return null;
    }
    return $f;
}

// ---- segmentation ----
function seg_lines(string $text, int $lo = 12, int $hi = 90): array
{
    $out = [];
    foreach (preg_split('/\r\n|\r|\n/', $text) as $ln) {
        $g = frag_good($ln, $lo, $hi);
        if ($g !== null) {
            $out[] = $g;
        }
    }
    return $out;
}

function split_sentences(string $text): array
{
    $text = preg_replace('/\s+/u', ' ', $text);
    return preg_split('/(?<=[.!?])\s+(?=[A-Z"\'(])/', $text);
}

function seg_sentences(string $text, int $lo = 18, int $hi = 95): array
{
    $out = [];
    foreach (split_sentences($text) as $sent) {
        $sent = trim($sent);
        $g = frag_good($sent, $lo, $hi);
        if ($g !== null) {
            $out[] = $g;
            continue;
        }
        if (mb_strlen($sent, 'UTF-8') > $hi) { // break long sentence into clauses
            foreach (preg_split('/[;:,]\s+|\s+[-—]\s+/u', $sent) as $clause) {
                $g = frag_good($clause, $lo, $hi);
                if ($g !== null) {
                    $out[] = $g;
                }
            }
        }
    }
    return $out;
}

// ---- type detection ----
function detect_type(string $text): string
{
    $lines = array_values(array_filter(
        array_map('trim', preg_split('/\r\n|\r|\n/', $text)),
        static fn($l) => $l !== ''
    ));
    if (!$lines) {
        return 'prose';
    }
    $short = 0;
    foreach ($lines as $l) {
        if (mb_strlen($l, 'UTF-8') <= 60) {
            $short++;
        }
    }
    return ($short / count($lines)) >= 0.6 ? 'lyric' : 'prose';
}

// ---- entry point: normalise, resolve type, segment, dedupe ----
function process_text(string $body, string $type): array
{
    $body = text_normalise($body);
    $resolved = $type === 'auto' ? detect_type($body) : $type;
    $frags = ($resolved === 'lyric' || $resolved === 'poem')
        ? seg_lines($body)
        : seg_sentences($body);

    $seen = [];
    $uniq = [];
    foreach ($frags as $f) {
        $k = mb_strtolower($f, 'UTF-8');
        if (!isset($seen[$k])) {
            $seen[$k] = true;
            $uniq[] = $f;
        }
    }
    return ['type' => $resolved, 'fragments' => $uniq];
}

// ---- serving: the user's own imported texts as cut-up fragments ----
// Self-heals pre-WP10 rows (fragments IS NULL) by running process_text once
// and persisting the result.
function texts_migrate(): void
{
    foreach (["ALTER TABLE texts ADD COLUMN type VARCHAR(10) NOT NULL DEFAULT 'lyric'",
              'ALTER TABLE texts ADD COLUMN fragments LONGTEXT NULL'] as $sql) {
        try {
            db()->exec($sql);
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), 'Duplicate column') === false) {
                throw $e;
            }
        }
    }
}

function my_texts_fragments(int $uid): array
{
    // Pre-WP10 installs lack the type/fragments columns; migrate on the
    // first failed read rather than paying an ALTER attempt every request.
    try {
        $stmt = db()->prepare('SELECT id, title, type, fragments, body FROM texts WHERE user_id = ?');
        $stmt->execute([$uid]);
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'Unknown column') === false) {
            throw $e;
        }
        texts_migrate();
        $stmt = db()->prepare('SELECT id, title, type, fragments, body FROM texts WHERE user_id = ?');
        $stmt->execute([$uid]);
    }
    $out = [];
    foreach ($stmt->fetchAll() as $t) {
        $type = $t['type'];
        $fragmentsText = $t['fragments'];
        if ($fragmentsText === null) {
            $result = process_text((string) $t['body'], 'auto');
            $type = $result['type'];
            $fragmentsText = implode("\n", $result['fragments']);
            $upd = db()->prepare('UPDATE texts SET type = ?, fragments = ? WHERE id = ? AND user_id = ?');
            $upd->execute([$type, $fragmentsText, $t['id'], $uid]);
        }
        foreach (explode("\n", (string) $fragmentsText) as $p) {
            $p = trim($p);
            if ($p !== '') {
                $out[] = ['text' => $p, 'title' => $t['title'], 'type' => $type];
            }
        }
    }
    return $out;
}
