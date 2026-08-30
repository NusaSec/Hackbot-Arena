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
    $fullName = trim($_POST['full_name'] ?? '');
    $email = trim($_POST['email'] ?? '');

    if ($username === '' || $password === '' || $fullName === '' || $email === '') {
        $error = 'All fields are required.';
    } elseif (!preg_match('/\A[a-z0-9_.-]{3,32}\z/', $username)) {
        $error = 'Username must be 3-32 lowercase letters, numbers, dots, dashes, or underscores.';
    } else {
        $passwordMd5 = md5($password);
        $bio = 'New staff account.';
        $stmt = mysqli_prepare($db, 'INSERT INTO users (username, password_md5, full_name, email, role, bio) VALUES (?, ?, ?, ?, "user", ?)');
        mysqli_stmt_bind_param($stmt, 'sssss', $username, $passwordMd5, $fullName, $email, $bio);

        if (!mysqli_stmt_execute($stmt)) {
            $error = 'Registration failed.';
        } else {
            $userId = mysqli_insert_id($db);
            session_regenerate_id(true);
            $_SESSION['user_id'] = (int) $userId;
            header('Location: /dashboard');
            exit;
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Register - RolePlay</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <main class="auth-shell">
    <section class="auth-panel">
      <p class="eyebrow">RolePlay Staff Portal</p>
      <h1>Create account</h1>
      <p>New staff accounts start with the lowest access level.</p>

      <?php if ($error !== ''): ?>
        <div class="alert"><?= e($error) ?></div>
      <?php endif; ?>

      <form method="post">
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" required>

        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="new-password" required>

        <label for="full_name">Full name</label>
        <input id="full_name" name="full_name" autocomplete="name" required>

        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required>

        <button type="submit">Create account</button>
      </form>

      <p>Already have an account? <a href="/">Sign in</a>.</p>
    </section>
  </main>
</body>
</html>
