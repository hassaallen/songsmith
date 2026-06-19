<?php
// ONE-SHOT user creation utility. Run from a browser once, then DELETE this file.
// Usage:  songwriting.hassaallen.net/api/make_user.php?username=neil&password=SECRET&name=Neil
//
// Safety: refuses to run if any users already exist UNLESS you pass &force=1.
// This prevents it being left live as an open account-creation hole.

require __DIR__ . '/helpers.php';
require __DIR__ . '/db.php';

$username = trim((string) ($_GET['username'] ?? ''));
$password = (string) ($_GET['password'] ?? '');
$name     = trim((string) ($_GET['name'] ?? '')) ?: null;
$force    = ($_GET['force'] ?? '') === '1';

if ($username === '' || $password === '') {
    json_out(['error' => 'Provide ?username= and ?password='], 400);
}

$count = (int) db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
if ($count > 0 && !$force) {
    json_out(['error' => 'Users already exist. Append &force=1 to add another, then delete this file.'], 403);
}

$hash = password_hash($password, PASSWORD_DEFAULT);
try {
    $stmt = db()->prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)');
    $stmt->execute([$username, $hash, $name]);
} catch (PDOException $e) {
    json_out(['error' => 'Could not create user (username may already exist).'], 409);
}

json_out([
    'ok' => true,
    'created' => $username,
    'reminder' => 'DELETE this file (make_user.php) now.',
], 201);
