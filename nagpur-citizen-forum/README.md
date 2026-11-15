# Nagpur Citizen Forum

Production-oriented PHP 8.3/MySQL civic engagement platform with an ATRIUM-inspired server-rendered interface.

## Requirements

- PHP 8.3+ with PDO MySQL, Fileinfo and Mbstring
- MySQL 8 or compatible MariaDB
- Apache with `mod_rewrite`

## Install

```bash
cp .env.example .env
php scripts/install.php
php scripts/create-admin.php "Administrator" admin@example.org "use-a-unique-password"
php -S 127.0.0.1:8765 -t public public/index.php
```

See `DEPLOYMENT.md`, `SECURITY.md`, and `ENGINEERING_GAP_ASSESSMENT.md`.
