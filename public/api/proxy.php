<?php
// Server-side proxy for the external data APIs. Avoids browser CORS issues,
// keeps the frontend simple, and lets us cache responses.
// Only whitelisted services and parameters are allowed through.
//
//   proxy.php?service=datamuse&...      -> Datamuse words endpoint (rhymes, synonyms, etc.)
//   proxy.php?service=dictionary&word=X -> Free Dictionary API
//   proxy.php?service=poetry_random&n=1 -> PoetryDB random poem(s)
//   proxy.php?service=poetry_authors    -> PoetryDB list of authors
//   proxy.php?service=poetry_by_author&author=X -> poems by author

require __DIR__ . '/helpers.php';
require_auth();

$service = (string) ($_GET['service'] ?? '');

function fetch_url(string $url): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 12,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT      => 'Songsmith/1.0 (+songs.hassaallen.net)',
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    return ['body' => $body, 'code' => $code, 'err' => $err];
}

function passthrough_json(array $res): void
{
    if ($res['body'] === false || $res['err'] !== '') {
        json_out(['error' => 'Upstream request failed.'], 502);
    }
    // Validate it is JSON, then pass straight through.
    $decoded = json_decode($res['body'], true);
    if ($decoded === null && trim((string) $res['body']) !== 'null') {
        json_out(['error' => 'Upstream returned invalid data.'], 502);
    }
    json_out($decoded, $res['code'] ?: 200);
}

switch ($service) {
    case 'datamuse':
        // Allow only known Datamuse query keys.
        $allowed = ['rel_rhy', 'rel_nry', 'ml', 'rel_syn', 'rel_trg', 'rel_bga', 'lc', 'rc', 'sp', 'max', 'md', 'topics'];
        $params = [];
        foreach ($allowed as $k) {
            if (isset($_GET[$k]) && $_GET[$k] !== '') {
                $params[$k] = $_GET[$k];
            }
        }
        if (!$params) {
            json_out(['error' => 'No valid Datamuse parameters.'], 400);
        }
        if (!isset($params['max'])) {
            $params['max'] = 12;
        }
        if (!isset($params['md'])) {
            $params['md'] = 's'; // include syllable count metadata
        }
        passthrough_json(fetch_url('https://api.datamuse.com/words?' . http_build_query($params)));
        break;

    case 'dictionary':
        $word = trim((string) ($_GET['word'] ?? ''));
        if ($word === '') {
            json_out(['error' => 'Missing word.'], 400);
        }
        passthrough_json(fetch_url('https://api.dictionaryapi.dev/api/v2/entries/en/' . rawurlencode($word)));
        break;

    case 'poetry_random':
        $n = max(1, min(10, (int) ($_GET['n'] ?? 1)));
        passthrough_json(fetch_url("https://poetrydb.org/random/$n"));
        break;

    case 'poetry_authors':
        passthrough_json(fetch_url('https://poetrydb.org/author'));
        break;

    case 'poetry_by_author':
        $author = trim((string) ($_GET['author'] ?? ''));
        if ($author === '') {
            json_out(['error' => 'Missing author.'], 400);
        }
        passthrough_json(fetch_url('https://poetrydb.org/author/' . rawurlencode($author)));
        break;

    default:
        json_out(['error' => 'Unknown service.'], 400);
}
