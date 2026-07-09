<?php
// CRUD for the Tray — a persistent pocket of kept phrases/words, across songs.
//   GET    tray.php          -> list (id, text, source, created_at) for the user, newest first, cap 500
//   POST   tray.php          -> create {text, source} -> {ok, id} (or {ok, id, duplicate:true} if already kept)
//   DELETE tray.php?id=N     -> delete, scoped to user_id

require __DIR__ . '/helpers.php';
require __DIR__ . '/db.php';

$uid = require_auth();

// Auto-create the table on every request — cheap and idempotent, so no
// manual migration is needed. No foreign key, to stay order-independent
// of the users table's creation.
db()->exec(
    'CREATE TABLE IF NOT EXISTS tray (' .
    'id INT UNSIGNED NOT NULL AUTO_INCREMENT, ' .
    'user_id INT UNSIGNED NOT NULL, ' .
    'text VARCHAR(500) NOT NULL, ' .
    'source VARCHAR(200) DEFAULT NULL, ' .
    'created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ' .
    'PRIMARY KEY (id), ' .
    'KEY idx_tray_user (user_id)' .
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
);

$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

switch ($method) {
    case 'GET':
        $stmt = db()->prepare('SELECT id, text, source, created_at FROM tray WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 500');
        $stmt->execute([$uid]);
        json_out(['items' => $stmt->fetchAll()]);
        break;

    case 'POST':
        $b = read_json_body();
        $text = trim((string) ($b['text'] ?? ''));
        if ($text === '') {
            json_out(['error' => 'Text is empty.'], 400);
        }
        $text = mb_substr($text, 0, 500);
        $source = trim((string) ($b['source'] ?? ''));
        $source = $source !== '' ? mb_substr($source, 0, 200) : null;

        // Reject exact duplicates for this user — hand back the existing row instead of erroring.
        $dup = db()->prepare('SELECT id FROM tray WHERE user_id = ? AND text = ? LIMIT 1');
        $dup->execute([$uid, $text]);
        $existing = $dup->fetch();
        if ($existing) {
            json_out(['ok' => true, 'id' => (int) $existing['id'], 'duplicate' => true]);
        }

        $stmt = db()->prepare('INSERT INTO tray (user_id, text, source) VALUES (?, ?, ?)');
        $stmt->execute([$uid, $text, $source]);
        json_out(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
        break;

    case 'DELETE':
        if ($id <= 0) {
            json_out(['error' => 'Missing id.'], 400);
        }
        $stmt = db()->prepare('DELETE FROM tray WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $uid]);
        json_out(['ok' => true, 'deleted' => $stmt->rowCount()]);
        break;

    default:
        json_out(['error' => 'Method not allowed.'], 405);
}
