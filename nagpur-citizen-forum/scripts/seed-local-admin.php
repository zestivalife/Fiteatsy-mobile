<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit("CLI only.\n");require dirname(__DIR__).'/bootstrap/app.php';
use App\Core\Database;
if(config('app.env')!=='local')exit("Refusing to create predictable credentials outside APP_ENV=local.\n");
$user=Database::one("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.slug='super-admin' LIMIT 1");
if($user)Database::run('UPDATE users SET username=?,password_hash=? WHERE id=?',['admin',password_hash('admin',PASSWORD_DEFAULT),$user['id']]);
else{Database::run('INSERT INTO users(username,full_name,email,password_hash,status,email_verified_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)',['admin','Local Administrator','admin@localhost',password_hash('admin',PASSWORD_DEFAULT),'active']);$id=Database::id();Database::run("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE slug='super-admin'",[$id]);}
echo "Local-only admin/admin credential seeded.\n";
