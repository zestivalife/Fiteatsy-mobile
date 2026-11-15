# Security model

- All state-changing routes require session-bound CSRF tokens.
- Authentication regenerates the session identifier and uses generic failure messages plus database-backed throttling.
- Passwords use PHP's current `PASSWORD_DEFAULT`; plaintext passwords are never stored.
- Authorization is evaluated server-side from role/permission relations for every admin action.
- Database operations use PDO prepared statements with emulation disabled.
- Uploads are limited by bytes and actual Fileinfo MIME type, receive random names, and are restricted to JPEG, PNG, WebP and PDF.
- Public queries enforce publication/moderation state.
- Security response headers include CSP, frame, MIME-sniffing, referrer and permissions policies.
- Moderation changes generate status history, citizen notifications and admin audit records.
- Mobile numbers are optional and never represented as verified.

Operationally, deny script execution in `public/uploads`, rotate credentials, monitor `storage/logs/php-error.log`, and keep PHP/MySQL patched.
