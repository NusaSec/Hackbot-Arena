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

$viewId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$editId = isset($_GET['edit']) ? (int) $_GET['edit'] : 0;
$editPost = null;
$viewPost = null;
$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postId = (int) ($_POST['id'] ?? 0);
    $title = trim($_POST['title'] ?? '');
    $body = trim($_POST['body'] ?? '');

    if ($title === '' || $body === '') {
        $message = 'Title and body are required.';
    } elseif ($postId > 0) {
        $stmt = mysqli_prepare($db, 'UPDATE posts SET title = ?, body = ? WHERE id = ? AND author_id = ?');
        mysqli_stmt_bind_param($stmt, 'ssii', $title, $body, $postId, $user['id']);
        mysqli_stmt_execute($stmt);
        $message = 'Post updated.';
    } else {
        $stmt = mysqli_prepare($db, 'INSERT INTO posts (author_id, title, body) VALUES (?, ?, ?)');
        mysqli_stmt_bind_param($stmt, 'iss', $user['id'], $title, $body);
        mysqli_stmt_execute($stmt);
        $message = 'Post created.';
    }
}

if ($viewId > 0) {
    $stmt = mysqli_prepare($db, 'SELECT p.id, p.title, p.body, p.created_at, u.username, u.full_name FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?');
    mysqli_stmt_bind_param($stmt, 'i', $viewId);
    mysqli_stmt_execute($stmt);
    $viewPost = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));

    if (!is_array($viewPost)) {
        http_response_code(404);
        exit('Post not found');
    }
}

if ($editId > 0) {
    $stmt = mysqli_prepare($db, 'SELECT id, title, body FROM posts WHERE id = ? AND author_id = ?');
    mysqli_stmt_bind_param($stmt, 'ii', $editId, $user['id']);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $editPost = mysqli_fetch_assoc($result);
}

$stmt = mysqli_prepare($db, 'SELECT id, title, body, created_at FROM posts WHERE author_id = ? ORDER BY id DESC');
mysqli_stmt_bind_param($stmt, 'i', $user['id']);
mysqli_stmt_execute($stmt);
$posts = mysqli_fetch_all(mysqli_stmt_get_result($stmt), MYSQLI_ASSOC);
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Manage Posts - RolePlay</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header class="site-header">
    <nav>
      <a class="brand" href="/dashboard">RolePlay</a>
      <div>
        <a href="/profile">Profile</a>
        <a href="/admin">Admin</a>
        <a href="/logout">Logout</a>
      </div>
    </nav>
  </header>

  <main class="container">
    <section class="page-title">
      <p class="eyebrow">Posts</p>
      <h1>Manage posts</h1>
      <p>Create and edit your own staff notes.</p>
    </section>

    <?php if ($message !== ''): ?>
      <div class="notice"><?= e($message) ?></div>
    <?php endif; ?>

    <?php if (is_array($viewPost)): ?>
      <section class="panel">
        <p class="eyebrow">Post #<?= e((string) $viewPost['id']) ?></p>
        <h2><?= e($viewPost['title']) ?></h2>
        <p>Author: <strong><?= e($viewPost['username']) ?></strong>. Created: <?= e($viewPost['created_at']) ?>.</p>
        <pre class="notes"><?= e($viewPost['body']) ?></pre>
      </section>
    <?php endif; ?>

    <section class="panel">
      <h2><?= $editPost ? 'Edit post' : 'Create post' ?></h2>
      <form method="post">
        <input type="hidden" name="id" value="<?= e((string) ($editPost['id'] ?? 0)) ?>">
        <label for="title">Title</label>
        <input id="title" name="title" value="<?= e($editPost['title'] ?? '') ?>" required>
        <label for="body">Body</label>
        <textarea id="body" name="body" rows="5" required><?= e($editPost['body'] ?? '') ?></textarea>
        <button type="submit"><?= $editPost ? 'Update post' : 'Create post' ?></button>
      </form>
    </section>

    <section class="panel">
      <h2>Your posts</h2>
      <?php if (count($posts) === 0): ?>
        <p>No posts yet.</p>
      <?php else: ?>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <?php foreach ($posts as $post): ?>
              <tr>
                <td><?= e($post['title']) ?></td>
                <td><?= e($post['created_at']) ?></td>
                <td>
                  <a href="/posts?id=<?= e((string) $post['id']) ?>">View</a>
                  <a href="/posts?edit=<?= e((string) $post['id']) ?>">Edit</a>
                </td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      <?php endif; ?>
    </section>
  </main>
</body>
</html>
