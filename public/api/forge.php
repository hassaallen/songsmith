<?php
// Serves the Forge tab's word/phrase pool: random chunks (mostly single words,
// some short 2-3 word runs) cut from the same corpus library.php draws lines
// from, tagged with the source author. Same corpus dir + auth + my-texts
// pseudo-source conventions as library.php.
//
//   forge.php?n=150&sources=slug1,slug2   -> { chunks: [ {t, a}, ... ] }

require __DIR__ . '/helpers.php';
require __DIR__ . '/db.php';
require __DIR__ . '/textproc.php';
$uid = require_auth();

const MY_TEXTS_SLUG = 'my-texts';

// Corpus dir: sibling of the web root, e.g. /home/hassaall/songwriting_corpus/
$dir = realpath(__DIR__ . '/../../songwriting_corpus');
if ($dir === false) {
    // fallback: a corpus/ folder inside the deploy (if ever placed there)
    $dir = realpath(__DIR__ . '/../corpus');
}
if ($dir === false || !is_dir($dir)) {
    json_out(['error' => 'Corpus not installed on server.'], 500);
}

$manifestPath = $dir . '/manifest.json';
if (!is_file($manifestPath)) {
    json_out(['error' => 'Corpus manifest missing.'], 500);
}
$manifest = json_decode(file_get_contents($manifestPath), true) ?: [];

$n = max(1, min(300, (int) ($_GET['n'] ?? 150)));

$bySlug = [];
foreach ($manifest as $s) {
    $bySlug[$s['slug']] = $s;
}
// User texts join the pool (only when the user actually has some).
$mine = my_texts_fragments($uid);
if ($mine) {
    $bySlug[MY_TEXTS_SLUG] = ['slug' => MY_TEXTS_SLUG, 'author' => 'My texts', 'work' => 'Your imported texts'];
}

// Resolve the pool of sources to draw from (same semantics as library.php).
$requested = array_filter(array_map('trim', explode(',', (string) ($_GET['sources'] ?? ''))));
$pool = $requested ? array_values(array_intersect(array_keys($bySlug), $requested)) : array_keys($bySlug);
if (!$pool) {
    json_out(['chunks' => []]);
}

// Cap how many distinct source files we touch per request.
shuffle($pool);
$pool = array_slice($pool, 0, 15);

// Lazy-load + cache lines per source. My-texts fragments come from the DB.
$cache = [];
$lines_of = function ($slug) use (&$cache, $dir, $mine) {
    if (!isset($cache[$slug])) {
        if ($slug === MY_TEXTS_SLUG) {
            $cache[$slug] = $mine;
        } else {
            $p = $dir . '/' . $slug . '.txt';
            $cache[$slug] = is_file($p)
                ? file($p, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES)
                : [];
        }
    }
    return $cache[$slug];
};

// ---- sample ~60 random fragments (lines) across the resolved sources ----
$fragTarget = 60;
$fragments = []; // each: ['text' => ..., 'author' => ...]
$attempts = 0;
while (count($fragments) < $fragTarget && $attempts < $fragTarget * 6) {
    $attempts++;
    $slug = $pool[array_rand($pool)];
    $lines = $lines_of($slug);
    if (!$lines) {
        continue;
    }
    $frag = $lines[array_rand($lines)];
    $text = ($slug === MY_TEXTS_SLUG) ? $frag['text'] : $frag;
    $author = $bySlug[$slug]['author'] ?? '';
    $fragments[] = ['text' => $text, 'author' => $author];
}

// ---- tokenize each fragment into words, keeping internal apostrophes/hyphens ----
function forge_tokenize(string $text): array
{
    $raw = preg_split('/\s+/', trim($text));
    $tokens = [];
    foreach ($raw as $tok) {
        // strip surrounding punctuation/quotes but keep internal ' and -
        $tok = preg_replace('/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/u', '', $tok);
        if ($tok === '' || !preg_match('/[A-Za-z]/', $tok)) {
            continue; // skip tokens without letters
        }
        $tokens[] = $tok;
    }
    return $tokens;
}

// ---- build ~70% 1-word / 25% 2-word / 5% 3-word contiguous runs per fragment ----
function forge_pick_run_length(int $remaining): int
{
    $r = mt_rand(1, 100);
    $len = ($r <= 70) ? 1 : (($r <= 95) ? 2 : 3);
    return min($len, $remaining);
}

$chunks = []; // ['t' => text, 'a' => author]
foreach ($fragments as $frag) {
    $tokens = forge_tokenize($frag['text']);
    $count = count($tokens);
    $i = 0;
    while ($i < $count) {
        $remaining = $count - $i;
        $len = forge_pick_run_length($remaining);
        $run = array_slice($tokens, $i, $len);
        $chunks[] = ['t' => implode(' ', $run), 'a' => $frag['author']];
        $i += $len;
    }
}

// ---- filter: length 2..30 chars, must contain a vowel, letters-ratio >= 0.6 ----
function forge_letters_ratio(string $s): float
{
    $noSpace = str_replace(' ', '', $s);
    $total = mb_strlen($noSpace);
    if ($total === 0) {
        return 0.0;
    }
    $letters = preg_match_all('/[A-Za-z]/u', $noSpace);
    return $letters / $total;
}

$filtered = [];
$seen = [];
foreach ($chunks as $c) {
    $t = $c['t'];
    $len = mb_strlen($t);
    if ($len < 2 || $len > 30) {
        continue;
    }
    if (!preg_match('/[aeiouAEIOU]/', $t)) {
        continue;
    }
    if (forge_letters_ratio($t) < 0.6) {
        continue;
    }
    $key = mb_strtolower($t);
    if (isset($seen[$key])) {
        continue;
    }
    $seen[$key] = true;
    $filtered[] = $c;
}

shuffle($filtered);
$out = array_slice($filtered, 0, $n);

json_out(['chunks' => $out]);
