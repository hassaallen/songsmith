<?php
// Shared helpers: JSON I/O, session, auth guard.

session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 30, // 30 days
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function current_user_id(): ?int
{
    return isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
}

function require_auth(): int
{
    $uid = current_user_id();
    if ($uid === null) {
        json_out(['error' => 'Not authenticated.'], 401);
    }
    return $uid;
}
