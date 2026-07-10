<?php
// CRUD for the user's own imported source texts (cut-up material).
//   GET    texts.php          -> list (id, title, author, source, type)
//   GET    texts.php?id=N     -> full text incl. body
//   POST   texts.php          -> create {title, author, source, body, type} -> {id, fragments}
//   DELETE texts.php?id=N     -> delete

require __DIR__ . '/helpers.php';
require __DIR__ . '/db.php';
require __DIR__ . '/textproc.php';

$uid = require_auth();

// Auto-migrate the live table for pre-WP10 installs — idempotent, and this
// endpoint is hit rarely enough that an up-front attempt is fine (the read
// paths in textproc.php migrate lazily instead).
texts_migrate();

$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

switch ($method) {
    case 'GET':
        if ($id > 0) {
            $stmt = db()->prepare('SELECT id, title, author, source, body, type, fragments FROM texts WHERE id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([$id, $uid]);
            $row = $stmt->fetch();
            if (!$row) {
                json_out(['error' => 'Text not found.'], 404);
            }
            if ($row['fragments'] === null) { // pre-WP10 row: process once and persist
                $result = process_text((string) $row['body'], 'auto');
                $row['type'] = $result['type'];
                $row['fragments'] = implode("\n", $result['fragments']);
                $upd = db()->prepare('UPDATE texts SET type = ?, fragments = ? WHERE id = ? AND user_id = ?');
                $upd->execute([$row['type'], $row['fragments'], $id, $uid]);
            }
            json_out(['text' => $row]);
        }
        $stmt = db()->prepare('SELECT id, title, author, source, type FROM texts WHERE user_id = ? ORDER BY created_at DESC');
        $stmt->execute([$uid]);
        json_out(['texts' => $stmt->fetchAll()]);
        break;

    case 'POST':
        $b = read_json_body();
        $bodyText = (string) ($b['body'] ?? '');
        if (trim($bodyText) === '') {
            json_out(['error' => 'Text body is empty.'], 400);
        }
        $type = (string) ($b['type'] ?? 'auto');
        if (!in_array($type, ['auto', 'lyric', 'poem', 'prose'], true)) {
            json_out(['error' => 'Invalid type.'], 400);
        }
        $result = process_text($bodyText, $type);
        $stmt = db()->prepare('INSERT INTO texts (user_id, title, author, source, body, type, fragments) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $uid,
            mb_substr(trim((string) ($b['title'] ?? 'Untitled')) ?: 'Untitled', 0, 200),
            mb_substr(trim((string) ($b['author'] ?? '')), 0, 200) ?: null,
            mb_substr(trim((string) ($b['source'] ?? '')), 0, 120) ?: null,
            $bodyText,
            $result['type'],
            implode("\n", $result['fragments']),
        ]);
        json_out(['ok' => true, 'id' => (int) db()->lastInsertId(), 'fragments' => count($result['fragments'])], 201);
        break;

    case 'DELETE':
        if ($id <= 0) {
            json_out(['error' => 'Missing id.'], 400);
        }
        $stmt = db()->prepare('DELETE FROM texts WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $uid]);
        json_out(['ok' => true, 'deleted' => $stmt->rowCount()]);
        break;

    default:
        json_out(['error' => 'Method not allowed.'], 405);
}
