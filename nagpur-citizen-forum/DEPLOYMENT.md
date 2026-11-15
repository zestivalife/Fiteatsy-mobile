# Deployment

1. Create an empty MySQL 8/MariaDB database and a least-privilege database user.
2. Copy `.env.example` to `.env`, generate `APP_KEY` with `php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"`, and set database credentials and the canonical HTTPS `APP_URL`.
3. Keep `app`, `bootstrap`, `config`, `database`, `routes`, `scripts` and `storage` outside `public_html`. Point the domain document root to `public`.
4. If cPanel forces `public_html`, copy only the contents of `public` into it and adjust `public/index.php` to require the application bootstrap from its private absolute path.
5. Run `php scripts/install.php` once, then `php scripts/create-admin.php "Administrator" admin@example.org "a strong unique password"`.
6. Make `storage/logs` and `public/uploads` writable by the PHP process but not executable.
7. Use HTTPS, set `SESSION_SECURE=true`, disable directory listing, and configure daily database/upload backups.

Apache requires `mod_rewrite` and `AllowOverride FileInfo`. PHP extensions: `pdo_mysql`, `fileinfo`, `mbstring`, `json`.
