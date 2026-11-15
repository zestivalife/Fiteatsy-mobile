<?php
declare(strict_types=1);
namespace App\Core;

final class Auth
{
    private static ?array $cached = null;
    public static function user(): ?array
    {
        if (self::$cached !== null) return self::$cached ?: null;
        if (empty($_SESSION['user_id'])) return self::$cached = [];
        return self::$cached = Database::one("SELECT u.id,u.full_name,u.email,u.mobile,u.locality,u.status,GROUP_CONCAT(DISTINCT r.slug) roles,GROUP_CONCAT(DISTINCT p.slug) permissions FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id WHERE u.id=? AND u.deleted_at IS NULL GROUP BY u.id", [(int)$_SESSION['user_id']]) ?: [];
    }
    public static function attempt(string $email, string $password): bool
    {
        $user=Database::one('SELECT * FROM users WHERE email=? AND status=? AND deleted_at IS NULL', [mb_strtolower(trim($email)),'active']);
        if (!$user || !password_verify($password,$user['password_hash'])) return false;
        session_regenerate_id(true); $_SESSION['user_id']=(int)$user['id']; self::$cached=null;
        Database::run('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?',[$user['id']]); return true;
    }
    public static function attemptUsername(string $username,string $password,bool $adminOnly=true):bool
    {
        $user=Database::one('SELECT * FROM users WHERE username=? AND status=? AND deleted_at IS NULL',[trim($username),'active']);
        if(!$user||!password_verify($password,$user['password_hash']))return false;
        if($adminOnly&&!Database::one("SELECT 1 ok FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.slug IN('super-admin','administrator','content-editor','moderator') LIMIT 1",[$user['id']]))return false;
        session_regenerate_id(true);$_SESSION['user_id']=(int)$user['id'];$_SESSION['_last_activity']=time();self::$cached=null;Database::run('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?',[$user['id']]);return true;
    }
    public static function logout(): void { $_SESSION=[]; if(ini_get('session.use_cookies')) setcookie(session_name(),'',time()-42000,'/'); session_destroy(); self::$cached=null; }
    public static function requireLogin(): void { if(!self::user()) { flash('error','Please sign in to continue.');$path=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)?:'/';redirect(str_starts_with($path,'/admin')?'admin/login':'login'); } }
    public static function can(string $permission): bool { $u=self::user(); return $u && (str_contains(',' . ($u['roles']??'') . ',', ',super-admin,') || in_array($permission,explode(',',(string)($u['permissions']??'')),true)); }
    public static function requirePermission(string $permission): void { self::requireLogin(); if(!self::can($permission)){http_response_code(403); View::render('errors/403',['title'=>'Access denied']); exit;} }
}
