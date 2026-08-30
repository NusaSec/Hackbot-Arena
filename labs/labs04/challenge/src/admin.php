<?php
require_once __DIR__ . '/_bootstrap.php';

require_login();
$db = db_connect();
$user = fetch_current_user($db);

if ($user === null) {
    session_destroy();
    header('Location: /');
    exit;
}

if ($user['role'] !== 'admin') {
    http_response_code(403);
    exit('Forbidden');
}

$flag = getenv('FLAG') ?: 'FLAG{nusasec-not-set}';
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin - RolePlay</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header class="site-header">
    <nav>
      <a class="brand" href="/dashboard">RolePlay</a>
      <div>
        <a href="/profile">Profile</a>
        <a href="/posts">Manage Posts</a>
        <a href="/logout">Logout</a>
      </div>
    </nav>
  </header>

  <main class="container narrow">
    <section class="page-title">
      <p class="eyebrow">Admin</p>
      <h1>Administrative note</h1>
      <p>This page is available only to users with the admin role.</p>
    </section>

    <section class="flag-panel">
      <h2>Flag</h2>
      <code><?= e($flag) ?></code>
    </section>
  </main>
</body>
</html>
