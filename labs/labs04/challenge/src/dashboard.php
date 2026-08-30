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
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard - RolePlay</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header class="site-header">
    <nav>
      <a class="brand" href="/dashboard">RolePlay</a>
      <div>
        <a href="/profile">Profile</a>
        <a href="/posts">Manage Posts</a>
        <a href="/admin">Admin</a>
        <a href="/logout">Logout</a>
      </div>
    </nav>
  </header>

  <main class="container">
    <section class="page-title">
      <p class="eyebrow">Dashboard</p>
      <h1><?= e($user['full_name']) ?></h1>
      <p>Signed in as <strong><?= e($user['username']) ?></strong>. Current role: <strong><?= e($user['role']) ?></strong>.</p>
    </section>

    <section class="grid">
      <article class="panel">
        <h2>Profile</h2>
        <p>Update staff details and review your assigned role.</p>
        <a class="button" href="/profile">Edit profile</a>
      </article>
      <article class="panel">
        <h2>Posts</h2>
        <p>Create and edit staff notes for the internal portal.</p>
        <a class="button secondary" href="/posts">Manage posts</a>
      </article>
      <article class="panel">
        <h2>Admin</h2>
        <p>Administrative notes are available only to admin users.</p>
        <a class="button secondary" href="/admin">Open admin</a>
      </article>
    </section>
  </main>
</body>
</html>
