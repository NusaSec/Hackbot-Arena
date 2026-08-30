<?php
require_once __DIR__ . '/_bootstrap.php';

$_SESSION = [];
session_destroy();
header('Location: /');
exit;
