<?php
declare(strict_types=1);
namespace App\Controllers;
use App\Core\Auth;use App\Core\Database;use App\Core\View;
final class AdminAuthController
{
    public function login():void{if(auth()&&$this->isAdmin())redirect('admin/dashboard');View::render('admin/login',['title'=>'Administrator login'],'auth');}
    public function authenticate():void{$username=trim($_POST['username']??'');$key=hash('sha256','admin|'.$username.'|'.($_SERVER['REMOTE_ADDR']??''));$rate=Database::one("SELECT * FROM rate_limit_records WHERE action_key='admin_login' AND identity_hash=?",[$key]);if($rate&&$rate['blocked_until']&&strtotime($rate['blocked_until'])>time()){flash('error','Too many attempts. Try again later.');redirect('admin/login');}if(!Auth::attemptUsername($username,$_POST['password']??'')){if($rate){$n=(int)$rate['attempts']+1;Database::run('UPDATE rate_limit_records SET attempts=?,blocked_until=? WHERE id=?',[$n,$n>=5?date('Y-m-d H:i:s',time()+900):null,$rate['id']]);}else Database::run("INSERT INTO rate_limit_records(action_key,identity_hash,window_started_at) VALUES('admin_login',?,CURRENT_TIMESTAMP)",[$key]);flash('error','The administrator credentials are incorrect.');redirect('admin/login');}Database::run("DELETE FROM rate_limit_records WHERE action_key='admin_login' AND identity_hash=?",[$key]);redirect('admin/dashboard');}
    public function logout():void{Auth::logout();redirect('admin/login');}
    private function isAdmin():bool{return can('homepage.manage')||can('issues.manage')||can('content.manage')||can('users.manage');}
}
