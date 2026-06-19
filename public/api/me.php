<?php
require __DIR__ . '/helpers.php';
require __DIR__ . '/db.php';

$uid = current_user_id();
if ($uid === null) {
    json_out(['authenticated' => false]);
}

$stmt = db()->prepare('SELECT id, username, display_name FROM users WHERE id = ? LIMIT 1');
$stmt->execute([$uid]);
$user = $stmt->fetch();

if (!$user) {
    json_out(['authenticated' => false]);
}

json_out([
    'authenticated' => true,
    'user' => [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'display_name' => $user['display_name'],
    ],
]);
