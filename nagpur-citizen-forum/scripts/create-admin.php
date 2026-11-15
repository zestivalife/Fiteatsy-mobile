<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit("CLI only.\n");
if($argc<4)exit("Usage: php scripts/create-admin.php \"Full Name\" email@example.org \"Strong password\"\n");
require dirname(__DIR__).'/bootstrap/app.php';
use App\Core\Database;
[$script,$name,$email,$password]=$argv;if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($password)<12)exit("Use a valid email and a password of at least 12 characters.\n");
Database::connection()->beginTransaction();try{Database::run('INSERT INTO users(full_name,email,password_hash,status,email_verified_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)',[$name,mb_strtolower($email),password_hash($password,PASSWORD_DEFAULT),'active']);$id=Database::id();Database::run("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE slug='super-admin'",[$id]);Database::connection()->commit();echo "Super admin created.\n";}catch(Throwable $e){Database::connection()->rollBack();throw $e;}
