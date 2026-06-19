<?php
// PDO connection. Returns a shared PDO instance.

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $cfgPath = __DIR__ . '/config.php';
    if (!is_file($cfgPath)) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Server not configured: config.php missing.']);
        exit;
    }
    $cfg = require $cfgPath;

    $dsn = "mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset={$cfg['db_charset']}";
    try {
        $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Database connection failed.']);
        exit;
    }
    return $pdo;
}
