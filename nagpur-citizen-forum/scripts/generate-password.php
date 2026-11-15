<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Command-line access only.');
}

$password = readline('Enter new admin password: ');
echo 'Password hash: ' . password_hash($password, PASSWORD_DEFAULT) . PHP_EOL;