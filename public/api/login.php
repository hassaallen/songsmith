<?php
require __DIR__ . '/helpers.php';
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['error' => 'Method not allowed.'], 405);
}

$body = read_json_body();
$username = trim((string) ($body['username'] ?? ''));
$password = (string) ($body['password'] ?? '');

if ($username === '' || $password === '') {
    json_out(['error' => 'Username and password required.'], 400);
}

$stmt = db()->prepare('SELECT id, password_hash, display_name FROM users WHERE username = ? LIMIT 1');
$stmt->execute([$username]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    json_out(['error' => 'Invalid username or password.'], 401);
}

session_regenerate_id(true);
$_SESSION['user_id'] = (int) $user['id'];

json_out([
    'ok' => true,
    'user' => [
        'id' => (int) $user['id'],
        'username' => $username,
        'display_name' => $user['display_name'],
    ],
]);
