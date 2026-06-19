<?php
// CRUD for drafts. All operations scoped to the logged-in user.
//   GET    drafts.php            -> list (id, title, status, updated_at) for active drafts
//   GET    drafts.php?id=N       -> full draft incl. body
//   POST   drafts.php            -> create {title, body} -> {id}
//   PUT    drafts.php?id=N       -> update {title, body, status}
//   DELETE drafts.php?id=N       -> delete

require __DIR__ . '/helpers.php';
require __DIR__ . '/db.php';

$uid = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

switch ($method) {
    case 'GET':
        if ($id > 0) {
            $stmt = db()->prepare('SELECT id, title, body, status, created_at, updated_at FROM drafts WHERE id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([$id, $uid]);
            $row = $stmt->fetch();
            if (!$row) {
                json_out(['error' => 'Draft not found.'], 404);
            }
            json_out(['draft' => $row]);
        }
        $stmt = db()->prepare('SELECT id, title, status, updated_at FROM drafts WHERE user_id = ? AND status = "active" ORDER BY updated_at DESC');
        $stmt->execute([$uid]);
        json_out(['drafts' => $stmt->fetchAll()]);
        break;

    case 'POST':
        $b = read_json_body();
        $title = trim((string) ($b['title'] ?? 'Untitled')) ?: 'Untitled';
        $bodyText = (string) ($b['body'] ?? '');
        $stmt = db()->prepare('INSERT INTO drafts (user_id, title, body) VALUES (?, ?, ?)');
        $stmt->execute([$uid, mb_substr($title, 0, 200), $bodyText]);
        json_out(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
        break;

    case 'PUT':
        if ($id <= 0) {
            json_out(['error' => 'Missing id.'], 400);
        }
        $b = read_json_body();
        $fields = [];
        $vals = [];
        if (array_key_exists('title', $b)) {
            $fields[] = 'title = ?';
            $vals[] = mb_substr(trim((string) $b['title']) ?: 'Untitled', 0, 200);
        }
        if (array_key_exists('body', $b)) {
            $fields[] = 'body = ?';
            $vals[] = (string) $b['body'];
        }
        if (array_key_exists('status', $b) && in_array($b['status'], ['active', 'archived'], true)) {
            $fields[] = 'status = ?';
            $vals[] = $b['status'];
        }
        if (!$fields) {
            json_out(['error' => 'Nothing to update.'], 400);
        }
        $vals[] = $id;
        $vals[] = $uid;
        $stmt = db()->prepare('UPDATE drafts SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?');
        $stmt->execute($vals);
        json_out(['ok' => true, 'updated' => $stmt->rowCount()]);
        break;

    case 'DELETE':
        if ($id <= 0) {
            json_out(['error' => 'Missing id.'], 400);
        }
        $stmt = db()->prepare('DELETE FROM drafts WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $uid]);
        json_out(['ok' => true, 'deleted' => $stmt->rowCount()]);
        break;

    default:
        json_out(['error' => 'Method not allowed.'], 405);
}
