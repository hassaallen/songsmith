<?php
// CRUD for the user's own imported source texts (cut-up material).
//   GET    texts.php          -> list (id, title, author, source)
//   GET    texts.php?id=N     -> full text incl. body
//   POST   texts.php          -> create {title, author, source, body} -> {id}
//   DELETE texts.php?id=N     -> delete

require __DIR__ . '/helpers.php';
require __DIR__ . '/db.php';

$uid = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

switch ($method) {
    case 'GET':
        if ($id > 0) {
            $stmt = db()->prepare('SELECT id, title, author, source, body FROM texts WHERE id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([$id, $uid]);
            $row = $stmt->fetch();
            if (!$row) {
                json_out(['error' => 'Text not found.'], 404);
            }
            json_out(['text' => $row]);
        }
        $stmt = db()->prepare('SELECT id, title, author, source FROM texts WHERE user_id = ? ORDER BY created_at DESC');
        $stmt->execute([$uid]);
        json_out(['texts' => $stmt->fetchAll()]);
        break;

    case 'POST':
        $b = read_json_body();
        $bodyText = (string) ($b['body'] ?? '');
        if (trim($bodyText) === '') {
            json_out(['error' => 'Text body is empty.'], 400);
        }
        $stmt = db()->prepare('INSERT INTO texts (user_id, title, author, source, body) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([
            $uid,
            mb_substr(trim((string) ($b['title'] ?? 'Untitled')) ?: 'Untitled', 0, 200),
            mb_substr(trim((string) ($b['author'] ?? '')), 0, 200) ?: null,
            mb_substr(trim((string) ($b['source'] ?? '')), 0, 120) ?: null,
            $bodyText,
        ]);
        json_out(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
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
