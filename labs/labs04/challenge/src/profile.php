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

$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $fullName = trim($_POST['full_name'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $bio = trim($_POST['bio'] ?? '');

    if ($fullName === '' || $email === '') {
        $message = 'Full name and email are required.';
    } else {
        $stmt = mysqli_prepare($db, 'UPDATE users SET full_name = ?, email = ?, bio = ? WHERE id = ?');
        mysqli_stmt_bind_param($stmt, 'sssi', $fullName, $email, $bio, $user['id']);
        mysqli_stmt_execute($stmt);
        $message = 'Profile updated.';
        $user = fetch_current_user($db);
    }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Profile - RolePlay</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header class="site-header">
    <nav>
      <a class="brand" href="/dashboard">RolePlay</a>
      <div>
        <a href="/posts">Manage Posts</a>
        <a href="/admin">Admin</a>
        <a href="/logout">Logout</a>
      </div>
    </nav>
  </header>

  <main class="container narrow">
    <section class="page-title">
      <p class="eyebrow">Profile</p>
      <h1>Edit profile</h1>
      <p>Role changes are managed by administrators.</p>
    </section>

    <?php if ($message !== ''): ?>
      <div class="notice"><?= e($message) ?></div>
    <?php endif; ?>

    <section class="panel">
      <form method="post">
        <label for="full_name">Full name</label>
        <input id="full_name" name="full_name" value="<?= e($user['full_name']) ?>" required>

        <label for="email">Email</label>
        <input id="email" name="email" type="email" value="<?= e($user['email']) ?>" required>

        <label for="bio">Bio</label>
        <textarea id="bio" name="bio" rows="4"><?= e($user['bio']) ?></textarea>

        <label for="role">Role</label>
        <select id="role" name="role" disabled>
          <?php foreach (['user', 'editor', 'support', 'admin'] as $roleOption): ?>
            <option value="<?= e($roleOption) ?>" <?= $user['role'] === $roleOption ? 'selected' : '' ?>>
              <?= e($roleOption) ?>
            </option>
          <?php endforeach; ?>
        </select>

        <button type="submit">Save profile</button>
      </form>
    </section>
  </main>
</body>
</html>
