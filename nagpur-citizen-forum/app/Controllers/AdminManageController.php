<?php
declare(strict_types=1);
namespace App\Controllers;
use App\Core\Auth;use App\Core\Database;use App\Core\View;use App\Services\UploadService;

final class AdminManageController
{
    private const MODULES=[
        'events'=>['table'=>'events','permission'=>'events.manage','title'=>'Events','fields'=>['title','slug','description','featured_image','starts_at','ends_at','venue','address','organiser','capacity','registration_enabled','status'],'images'=>['featured_image'],'labels'=>['title'=>'Event title','slug'=>'Event URL slug','description'=>'Event description','featured_image'=>'Event image','starts_at'=>'Start date and time','ends_at'=>'End date and time','registration_enabled'=>'Allow citizen registration']],
        'campaigns'=>['table'=>'campaigns','permission'=>'events.manage','title'=>'Campaigns','fields'=>['title','slug','summary','body','image_path','starts_at','ends_at','status'],'images'=>['image_path'],'labels'=>['title'=>'Campaign title','slug'=>'Campaign URL slug','summary'=>'Short summary','body'=>'Campaign content','image_path'=>'Campaign image','starts_at'=>'Campaign starts','ends_at'=>'Campaign ends']],
        'articles'=>['table'=>'articles','permission'=>'content.manage','title'=>'News & publications','fields'=>['category_id','title','slug','summary','body','featured_image','seo_title','meta_description','published_at','status'],'images'=>['featured_image'],'labels'=>['category_id'=>'Publication category','title'=>'Publication title','slug'=>'Publication URL slug','summary'=>'Listing summary','body'=>'Publication content','featured_image'=>'Publication image','seo_title'=>'Search title','meta_description'=>'Search description','published_at'=>'Publish date and time']],
        'article-categories'=>['table'=>'article_categories','permission'=>'content.manage','title'=>'Publication categories','fields'=>['name','slug'],'labels'=>['name'=>'Category name','slug'=>'Category URL slug']],
        'pages'=>['table'=>'pages','permission'=>'content.manage','title'=>'Website pages','fields'=>['title','slug','body','featured_image','seo_title','meta_description','status'],'images'=>['featured_image'],'labels'=>['title'=>'Page title','slug'=>'Page URL slug','body'=>'Page content','featured_image'=>'Page image','seo_title'=>'Search title','meta_description'=>'Search description']],
        'issue-categories'=>['table'=>'issue_categories','permission'=>'issues.manage','title'=>'Civic issue categories','fields'=>['name','slug','description','position','is_active']],
        'discussion-categories'=>['table'=>'discussion_categories','permission'=>'discussions.moderate','title'=>'Discussion categories','fields'=>['name','slug','position','is_active']],
        'issue-comments'=>['table'=>'issue_comments','permission'=>'issues.manage','title'=>'Civic issue comments','fields'=>[]],
        'discussion-comments'=>['table'=>'discussion_comments','permission'=>'discussions.moderate','title'=>'Discussion replies','fields'=>[]],
        'citizens'=>['table'=>'users','permission'=>'users.manage','title'=>'Citizens & accounts','fields'=>[]],
        'volunteers'=>['table'=>'volunteer_applications','permission'=>'users.manage','title'=>'Volunteer requests','fields'=>[]],
        'enquiries'=>['table'=>'contact_submissions','permission'=>'users.manage','title'=>'Contact enquiries','fields'=>[]],
        'registrations'=>['table'=>'event_registrations','permission'=>'events.manage','title'=>'Event registrations','fields'=>[]],
        'media'=>['table'=>'media_assets','permission'=>'content.manage','title'=>'Media library','fields'=>[]],
        'settings'=>['table'=>'site_settings','permission'=>'settings.manage','title'=>'Website settings','fields'=>['setting_key','setting_value']],
        'navigation'=>['table'=>'navigation_items','permission'=>'settings.manage','title'=>'Navigation','fields'=>['label','url','location','position','is_active']],
        'homepage-sections'=>['table'=>'homepage_sections','permission'=>'homepage.manage','title'=>'Homepage sections','fields'=>['section_key','heading','description','position','record_limit','source_mode','is_visible']],
        'notifications'=>['table'=>'notifications','permission'=>'users.manage','title'=>'Notifications','fields'=>['user_id','title','message','url']],
        'roles'=>['table'=>'roles','permission'=>'users.manage','title'=>'Admin users & roles','fields'=>[]],
    ];
    public function index(string $module):void
    {
        $cfg=$this->cfg($module);Auth::requirePermission($cfg['permission']);$q=trim($_GET['q']??'');$table=$cfg['table'];$where='';$params=[];
        if($q!==''&&in_array($module,['events','campaigns','articles','pages'],true)){$where=' WHERE title LIKE ?';$params[]='%'.$q.'%';}
        $rows=match($module){
            'registrations'=>Database::all('SELECT r.*,e.title event_title,u.full_name,u.email FROM event_registrations r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 100'),
            'issue-comments'=>Database::all('SELECT c.id,i.title issue_title,u.full_name,c.body,c.status,c.created_at FROM issue_comments c JOIN civic_issues i ON i.id=c.issue_id JOIN users u ON u.id=c.user_id WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT 100'),
            'discussion-comments'=>Database::all('SELECT c.id,d.title discussion_title,u.full_name,c.body,c.status,c.created_at FROM discussion_comments c JOIN discussions d ON d.id=c.discussion_id JOIN users u ON u.id=c.user_id WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT 100'),
            'citizens'=>Database::all("SELECT u.id,u.username,u.full_name,u.email,u.mobile,u.locality,u.status,GROUP_CONCAT(r.name) roles,u.created_at FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100"),
            'roles'=>Database::all('SELECT r.*,COUNT(ur.user_id) users FROM roles r LEFT JOIN user_roles ur ON ur.role_id=r.id GROUP BY r.id ORDER BY r.id'),
            'settings'=>Database::all('SELECT setting_key,setting_value,updated_at FROM site_settings ORDER BY setting_key'),
            default=>Database::all("SELECT * FROM {$table}{$where} ORDER BY id DESC LIMIT 100",$params),
        };
        $categories=$module==='articles'?Database::all('SELECT id,name FROM article_categories ORDER BY name'):[];$users=$module==='notifications'?Database::all("SELECT id,full_name,email FROM users WHERE status='active' ORDER BY full_name"):[];
        View::render('admin/manage',compact('module','cfg','rows','categories','users'),'admin');
    }
    public function save(string $module):void
    {
        $cfg=$this->cfg($module);Auth::requirePermission($cfg['permission']);$table=$cfg['table'];
        if($module==='media'){$file=(new UploadService())->store($_FILES['asset']??[],'media');if(!$file)throw new \InvalidArgumentException('Choose a file.');Database::run('INSERT INTO media_assets(uploader_id,original_name,file_path,mime_type,file_size,alt_text,category) VALUES(?,?,?,?,?,?,?)',[auth()['id'],$file['original'],$file['path'],$file['mime'],$file['size'],trim($_POST['alt_text']??''),trim($_POST['category']??'')]);$this->audit('media.created',$table,Database::id());flash('success','Media uploaded.');redirect('admin/manage/media');}
        if($module==='settings'){$key=trim($_POST['setting_key']??'');$value=trim($_POST['setting_value']??'');if(!$key){flash('error','Setting key is required.');redirect('admin/manage/settings');}$existing=Database::one('SELECT setting_key FROM site_settings WHERE setting_key=?',[$key]);if($existing)Database::run('UPDATE site_settings SET setting_value=? WHERE setting_key=?',[$value,$key]);else Database::run('INSERT INTO site_settings(setting_key,setting_value) VALUES(?,?)',[$key,$value]);$this->audit('settings.saved','site_settings',0);flash('success','Website setting saved.');redirect('admin/manage/settings');}
        $data=[];$columns=$cfg['fields'];$imageFields=$cfg['images']??[];foreach($columns as $field){if(in_array($field,$imageFields,true))continue;if(str_starts_with($field,'is_')||$field==='registration_enabled'){$data[$field]=isset($_POST[$field])?1:0;continue;}$value=trim((string)($_POST[$field]??''));$data[$field]=str_ends_with($field,'_at')?$this->dateTimeOrNull($value):($value?:null);}
        foreach($imageFields as $field){$file=(new UploadService())->store($_FILES[$field]??[],$module,true);$data[$field]=$file['path']??null;}
        if(in_array($module,['events','campaigns','articles','pages'],true)&&empty($data['slug']))$data['slug']=$this->slug((string)$data['title']);
        if(in_array($module,['article-categories','issue-categories','discussion-categories'],true)&&empty($data['slug']))$data['slug']=$this->slug((string)$data['name']);
        if($module==='articles')$data['author_id']=auth()['id'];if($module==='notifications'){$data['type']='admin';}
        $names=array_keys($data);Database::run('INSERT INTO '.$table.'('.implode(',',$names).') VALUES('.implode(',',array_fill(0,count($names),'?')).')',array_values($data));$id=Database::id();$this->audit($module.'.created',$table,$id);flash('success',$cfg['title'].' record created.');redirect('admin/manage/'.$module);
    }
    public function edit(string $module,string $id):void{$cfg=$this->cfg($module);Auth::requirePermission($cfg['permission']);if(!$cfg['fields']){redirect('admin/manage/'.$module);}$row=Database::one('SELECT * FROM '.$cfg['table'].' WHERE id=?',[(int)$id]);if(!$row){http_response_code(404);exit('Record not found');}$categories=$module==='articles'?Database::all('SELECT id,name FROM article_categories ORDER BY name'):[];$users=$module==='notifications'?Database::all("SELECT id,full_name,email FROM users WHERE status='active' ORDER BY full_name"):[];View::render('admin/manage_edit',compact('module','cfg','row','categories','users'),'admin');}
    public function update(string $module,string $id):void
    {
        $cfg=$this->cfg($module);Auth::requirePermission($cfg['permission']);$allowed=match($module){'citizens','volunteers','enquiries','registrations','issue-comments','discussion-comments'=>['status'],default=>$cfg['fields']};$imageFields=$cfg['images']??[];$data=[];foreach($allowed as $f){if(in_array($f,$imageFields,true))continue;$boolean=str_starts_with($f,'is_')||$f==='registration_enabled';if($boolean){$data[$f]=isset($_POST[$f])?1:0;continue;}if(array_key_exists($f,$_POST)){$value=trim((string)$_POST[$f]);$data[$f]=str_ends_with($f,'_at')?$this->dateTimeOrNull($value):($value?:null);}}foreach($imageFields as $field){$file=(new UploadService())->store($_FILES[$field]??[],$module,true);if($file)$data[$field]=$file['path'];elseif(isset($_POST['remove_'.$field]))$data[$field]=null;}if(!$data){flash('error','No changes supplied.');redirect('admin/manage/'.$module);}Database::run('UPDATE '.$cfg['table'].' SET '.implode('=?,',array_keys($data)).'=? WHERE id=?',[...array_values($data),(int)$id]);$this->audit($module.'.updated',$cfg['table'],(int)$id);flash('success','Record updated.');redirect('admin/manage/'.$module);
    }
    public function delete(string $module,string $id):void{$cfg=$this->cfg($module);Auth::requirePermission($cfg['permission']);if(in_array($module,['citizens','roles'],true)){flash('error','This record must be disabled rather than deleted.');redirect('admin/manage/'.$module);}Database::run('DELETE FROM '.$cfg['table'].' WHERE id=?',[(int)$id]);$this->audit($module.'.deleted',$cfg['table'],(int)$id);flash('success','Record deleted.');redirect('admin/manage/'.$module);}
    private function cfg(string $module):array{if(!isset(self::MODULES[$module])){http_response_code(404);exit('Unknown module');}return self::MODULES[$module];}
    private function dateTimeOrNull(string $value):?string{if($value==='')return null;$timestamp=strtotime($value);return $timestamp===false?null:date('Y-m-d H:i:s',$timestamp);}
    private function slug(string $v):string{return trim(preg_replace('/[^a-z0-9]+/i','-',strtolower(iconv('UTF-8','ASCII//TRANSLIT',$v)?:$v)),'-').'-'.bin2hex(random_bytes(2));}
    private function audit(string $action,string $type,int $id):void{Database::run('INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,ip_address) VALUES(?,?,?,?,?)',[auth()['id'],$action,$type,$id,$_SERVER['REMOTE_ADDR']??null]);}
}
