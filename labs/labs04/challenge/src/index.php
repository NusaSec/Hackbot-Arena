<?php
require_once __DIR__ . '/_bootstrap.php';

if (current_user_id() !== null) {
    header('Location: /dashboard');
    exit;
}

$db = db_connect();
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';

    if ($username === '' || $password === '') {
        $error = 'Username and password are required.';
    } else {
        $stmt = mysqli_prepare($db, 'SELECT id, password_md5 FROM users WHERE username = ?');
        mysqli_stmt_bind_param($stmt, 's', $username);
        mysqli_stmt_execute($stmt);
        $user = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));

        if (is_array($user) && hash_equals($user['password_md5'], md5($password))) {
            session_regenerate_id(true);
            $_SESSION['user_id'] = (int) $user['id'];
            header('Location: /dashboard');
            exit;
        }

        $error = 'Invalid credentials.';
    }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RolePlay</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <main class="auth-shell">
    <section class="auth-panel">
      <p class="eyebrow">RolePlay Staff Portal</p>
      <h1>Sign in</h1>
      <p>Use your staff account to manage profile details and internal posts.</p>

      <?php if ($error !== ''): ?>
        <div class="alert"><?= e($error) ?></div>
      <?php endif; ?>

      <form method="post">
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button type="submit">Sign in</button>
      </form>

      <p>New staff member? <a href="/register">Create an account</a>.</p>
    </section>
  </main>
</body>
</html>
