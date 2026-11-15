<?php
declare(strict_types=1);

return [
    'dsn' => env('DB_DSN') ?: sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', env('DB_HOST', '127.0.0.1'), env('DB_PORT', '3306'), env('DB_DATABASE', 'ncf')),
    'username' => env('DB_USERNAME', ''),
    'password' => env('DB_PASSWORD', ''),
];
