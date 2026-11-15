<?php
declare(strict_types=1);

// PHP's development server sends every request to this router script. Let it
// serve existing CSS, JavaScript, fonts, images and uploaded files directly.
if (PHP_SAPI === 'cli-server') {
    $requestPath = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    $publicPath = __DIR__ . $requestPath;
    if ($requestPath !== '/' && is_file($publicPath)) {
        return false;
    }
}

$app = require dirname(__DIR__) . '/bootstrap/app.php';
$app->run();
