<?php
declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));

$envFile = BASE_PATH . '/.env';
if (is_file($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
        [$key, $value] = array_map('trim', explode('=', $line, 2));
        $_ENV[$key] = trim($value, "\"'");
    }
}

require BASE_PATH . '/bootstrap/helpers.php';
spl_autoload_register(function (string $class): void {
    if (!str_starts_with($class, 'App\\')) return;
    $file = BASE_PATH . '/app/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($file)) require $file;
});

$GLOBALS['config'] = [
    'app' => require BASE_PATH . '/config/app.php',
    'database' => require BASE_PATH . '/config/database.php',
];
date_default_timezone_set(config('app.timezone'));

if (config('app.env') === 'production' && strlen((string) config('app.key')) < 32) {
    http_response_code(500); exit('Application key is not configured.');
}

ini_set('display_errors', config('app.debug') ? '1' : '0');
ini_set('log_errors', '1');
ini_set('error_log', BASE_PATH . '/storage/logs/php-error.log');
session_name('ncf_session');
session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>(bool)config('app.session_secure'),'httponly'=>true,'samesite'=>'Lax']);
session_start();
$now=time();
if(!empty($_SESSION['user_id'])&&!empty($_SESSION['_last_activity'])&&$now-(int)$_SESSION['_last_activity']>(int)config('app.session_lifetime')){
    $_SESSION=[];session_regenerate_id(true);$_SESSION['_flash'][]=['type'=>'error','message'=>'Your session expired. Please sign in again.'];
}
$_SESSION['_last_activity']=$now;
header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Permissions-Policy: camera=(), microphone=(), geolocation=(self)");
header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'self'");

return new \App\Core\Application();
