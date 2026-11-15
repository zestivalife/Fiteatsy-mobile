<?php
declare(strict_types=1);

return [
    'name' => 'Nagpur Citizen Forum',
    'env' => env('APP_ENV', 'production'),
    'debug' => filter_var(env('APP_DEBUG', 'false'), FILTER_VALIDATE_BOOL),
    'url' => rtrim(env('APP_URL', ''), '/'),
    'key' => env('APP_KEY', ''),
    'timezone' => env('APP_TIMEZONE', 'Asia/Kolkata'),
    'session_secure' => filter_var(env('SESSION_SECURE', 'true'), FILTER_VALIDATE_BOOL),
    'upload_max_bytes' => (int) env('UPLOAD_MAX_BYTES', '5242880'),
    'session_lifetime' => (int) env('SESSION_LIFETIME', '1800'),
];
