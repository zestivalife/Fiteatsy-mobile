# Engineering gap assessment

## Audited baseline

The original NCF directory contained a static `index.html`, one stylesheet, local Archivo/Inter fonts, and a JavaScript object that generated page-like states from hardcoded arrays. A placeholder `index.php` read the static file. Forms were intercepted client-side and discarded. There was no persistence, routing, authentication, authorization, upload processing, administration, schema, deployment boundary, audit history, or automated server validation.

## Remediation delivered

- Lightweight PHP front controller and parameterized router.
- PDO-only MySQL access with native prepared statements.
- Normalized InnoDB schema, constraints, indexes and seed data.
- Secure sessions, CSRF validation, password hashing, login throttling, CSP and security headers.
- Server-enforced roles and permissions.
- Persistent citizen registration, login, dashboard, issue submission/support, discussion submission, contact and volunteer flows.
- MIME-inspected randomized local uploads.
- Database-backed hero, mosaic strips/items and announcements.
- Admin moderation, issue status timeline, notifications and audit logs.
- Server-rendered public search, events, articles and accessibility-conscious ATRIUM visual system.

## Deployment dependency

Production requires PHP 8.3 with PDO MySQL, Fileinfo and Mbstring, plus MySQL 8 or compatible MariaDB. SMTP remains optional. The source tree does not require Node, Composer, Redis or WebSockets.
