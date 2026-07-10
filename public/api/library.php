<?php
// Serves the cut-up corpus: a random blend of fragments across all sources,
// with an optional source filter. The corpus lives OUTSIDE the web root
// (not publicly downloadable); only this endpoint reads it server-side.
//
//   library.php?action=manifest                       -> list of sources (for the filter UI)
//   library.php?action=random&n=40                     -> 40 random fragments from ALL sources
//   library.php?action=random&n=40&sources=slug1,slug2 -> blend limited to those sources

require __DIR__ . '/helpers.php';
require __DIR__ . '/db.php';
require __DIR__ . '/textproc.php';
$uid = require_auth();

// The user's own imported texts join the blend as a pseudo-source.
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

$action = $_GET['action'] ?? 'random';

if ($action === 'manifest') {
    // Trim to what the UI needs.
    $out = array_map(static function ($s) {
        return [
            'slug' => $s['slug'], 'author' => $s['author'],
            'work' => $s['work'], 'type' => $s['type'], 'count' => $s['count'],
        ];
    }, $manifest);
    $mine = my_texts_fragments($uid);
    if ($mine) {
        $types = array_values(array_unique(array_column($mine, 'type')));
        $out[] = ['slug' => MY_TEXTS_SLUG, 'author' => 'My texts',
                  'work' => 'Your imported texts', 'type' => count($types) === 1 ? $types[0] : 'mixed',
                  'count' => count($mine)];
    }
    json_out(['sources' => $out]);
}

// ---- random blend ----
$n = max(1, min(80, (int) ($_GET['n'] ?? 40)));

$bySlug = [];
foreach ($manifest as $s) {
    $bySlug[$s['slug']] = $s;
}
// User texts join the pool (only when the user actually has some).
$mine = my_texts_fragments($uid);
if ($mine) {
    $bySlug[MY_TEXTS_SLUG] = ['slug' => MY_TEXTS_SLUG, 'author' => 'My texts', 'work' => 'Your imported texts'];
}

// Resolve the pool of sources to draw from.
$requested = array_filter(array_map('trim', explode(',', (string) ($_GET['sources'] ?? ''))));
$pool = $requested ? array_values(array_intersect(array_keys($bySlug), $requested)) : array_keys($bySlug);
if (!$pool) {
    json_out(['fragments' => []]);
}

// Cap how many distinct source files we touch per request (IO bound + adds
// serendipity: a different handful of voices surfaces each refresh).
shuffle($pool);
$pool = array_slice($pool, 0, 18);

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

$out = [];
$seen = [];
$attempts = 0;
while (count($out) < $n && $attempts < $n * 6) {
    $attempts++;
    $slug = $pool[array_rand($pool)];
    $lines = $lines_of($slug);
    if (!$lines) {
        continue;
    }
    $frag = $lines[array_rand($lines)];
    if ($slug === MY_TEXTS_SLUG) {
        $text = $frag['text'];
        $work = $frag['title'];
    } else {
        $text = $frag;
        $work = $bySlug[$slug]['work'] ?? '';
    }
    if (isset($seen[$text])) {
        continue;
    }
    $seen[$text] = true;
    $out[] = [
        'text' => $text,
        'author' => $bySlug[$slug]['author'] ?? '',
        'work' => $work,
    ];
}

json_out(['fragments' => $out]);
