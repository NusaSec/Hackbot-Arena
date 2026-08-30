<?php

declare(strict_types=1);

ini_set('display_errors', '0');
mysqli_report(MYSQLI_REPORT_OFF);

session_start([
    'cookie_httponly' => true,
    'cookie_samesite' => 'Lax',
    'use_strict_mode' => true,
]);

function db_connect(): mysqli
{
    $host = getenv('DB_HOST') ?: 'db';
    $name = getenv('DB_NAME') ?: 'roleplay';
    $user = getenv('DB_USER') ?: 'roleuser';
    $pass = getenv('DB_PASS') ?: 'rolepass';

    for ($attempt = 0; $attempt < 40; $attempt++) {
        $db = mysqli_connect($host, $user, $pass, $name);
        if ($db instanceof mysqli) {
            mysqli_set_charset($db, 'utf8mb4');
            return $db;
        }
        usleep(250000);
    }

    http_response_code(503);
    exit('Service unavailable');
}

function e(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function current_user_id(): ?int
{
    return isset($_SESSION['user_id']) && is_int($_SESSION['user_id']) ? $_SESSION['user_id'] : null;
}

function require_login(): void
{
    if (current_user_id() === null) {
        header('Location: /');
        exit;
    }
}

function fetch_current_user(mysqli $db): ?array
{
    $id = current_user_id();
    if ($id === null) {
        return null;
    }

    $stmt = mysqli_prepare($db, 'SELECT id, username, full_name, email, role, bio FROM users WHERE id = ?');
    mysqli_stmt_bind_param($stmt, 'i', $id);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $user = mysqli_fetch_assoc($result);

    return is_array($user) ? $user : null;
}
