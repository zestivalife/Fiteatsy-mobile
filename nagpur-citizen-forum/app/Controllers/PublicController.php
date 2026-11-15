<?php
declare(strict_types=1);
namespace App\Controllers;

use App\Core\Database;
use App\Core\View;

final class PublicController
{
    public function home(): void
    {
        View::render('public/home',$this->homeData(false));
    }
    public function homeData(bool $preview=false):array
    {
        $heroWhere=$preview?"status<>'archived'":"status='published' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>=CURRENT_TIMESTAMP)";
        $hero=Database::one("SELECT * FROM hero_banners WHERE {$heroWhere} ORDER BY CASE status WHEN 'published' THEN 0 ELSE 1 END,position,id LIMIT 1")?:['eyebrow'=>'Citizen-led · Nagpur-wide','heading'=>'Our city.','accent_text'=>'Our voice.','description'=>'A public platform to raise civic issues, exchange ideas and turn neighbourhood concerns into collective action.','cta_label'=>'Raise an issue','cta_url'=>'/issues/create','secondary_cta_label'=>'Explore civic issues','secondary_cta_url'=>'/issues','layout'=>'typography','desktop_image'=>null,'mobile_image'=>null];
        $announcements=Database::all($preview?'SELECT * FROM announcements ORDER BY position,id':"SELECT * FROM announcements WHERE is_active=1 AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>=CURRENT_TIMESTAMP) ORDER BY CASE priority WHEN 'urgent' THEN 0 ELSE 1 END,position,id");
        $strips=Database::all($preview?'SELECT * FROM scrolling_strips ORDER BY position,id':'SELECT * FROM scrolling_strips WHERE is_visible=1 ORDER BY position,id');
        foreach($strips as &$strip){
            if($strip['source_mode']==='automatic'){
                $limit=max(1,min(20,(int)$strip['source_limit']));
                $strip['items']=match($strip['source_type']){
                    'issues'=>Database::all("SELECT title,'Featured issue' subtitle,'issue' content_type,CONCAT('/issues/',slug) destination_url,'coral' colour FROM civic_issues WHERE moderation_status='approved' AND deleted_at IS NULL ORDER BY is_featured DESC,published_at DESC LIMIT {$limit}"),
                    'discussions'=>Database::all("SELECT title,'Community discussion' subtitle,'discussion' content_type,CONCAT('/discussions/',slug) destination_url,'blue' colour FROM discussions WHERE status IN('published','locked') AND deleted_at IS NULL ORDER BY is_pinned DESC,published_at DESC LIMIT {$limit}"),
                    'events'=>Database::all("SELECT title,'Upcoming event' subtitle,'event' content_type,CONCAT('/events/',slug) destination_url,'yellow' colour,featured_image image_path FROM events WHERE status='published' AND starts_at>=CURRENT_TIMESTAMP ORDER BY starts_at LIMIT {$limit}"),
                    'campaigns'=>Database::all("SELECT title,'Citizen campaign' subtitle,'campaign' content_type,CONCAT('/campaigns/',slug) destination_url,'blue' colour,image_path FROM campaigns WHERE status='published' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>=CURRENT_TIMESTAMP) ORDER BY starts_at DESC,id DESC LIMIT {$limit}"),
                    'articles'=>Database::all("SELECT title,'Latest publication' subtitle,'article' content_type,CONCAT('/articles/',slug) destination_url,'dark' colour,featured_image image_path FROM articles WHERE status='published' ORDER BY published_at DESC LIMIT {$limit}"),
                    default=>[],
                };
            } else {$itemWhere=$preview?"status<>'archived'":"status='published' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>=CURRENT_TIMESTAMP)";$strip['items']=Database::all("SELECT * FROM scrolling_strip_items WHERE strip_id=? AND {$itemWhere} ORDER BY position,id",[$strip['id']]);$strip['items']=array_values(array_filter($strip['items'],fn(array $item):bool=>$this->linkedContentAvailable($item)));}
        }
        $strips=array_values(array_filter($strips,static fn(array $strip):bool=>!empty($strip['items'])));
        $sections=[];foreach(Database::all('SELECT * FROM homepage_sections ORDER BY position') as $section)$sections[$section['section_key']]=$section;
        $issueLimit=max(1,min(12,(int)($sections['issues']['record_limit']??3)));$discussionLimit=max(1,min(12,(int)($sections['discussions']['record_limit']??3)));
        $issues=Database::all("SELECT i.*,c.name category,(SELECT COUNT(*) FROM issue_supports s WHERE s.issue_id=i.id) supports FROM civic_issues i JOIN issue_categories c ON c.id=i.category_id WHERE i.moderation_status='approved' AND i.deleted_at IS NULL ORDER BY i.is_featured DESC,i.published_at DESC LIMIT {$issueLimit}");
        $discussions=Database::all("SELECT d.*,c.name category,(SELECT COUNT(*) FROM discussion_comments dc WHERE dc.discussion_id=d.id AND dc.status='approved' AND dc.deleted_at IS NULL) replies FROM discussions d JOIN discussion_categories c ON c.id=d.category_id WHERE d.status IN('published','locked') AND d.deleted_at IS NULL ORDER BY d.is_pinned DESC,d.published_at DESC LIMIT {$discussionLimit}");
        return compact('hero','announcements','strips','issues','discussions','sections','preview');
    }
    public function page(string $slug): void
    {
        $pages=['about'=>['About NCF','Nagpur Citizen Forum is an independent, citizen-led platform helping residents participate constructively in civic life.'],'privacy'=>['Privacy','We collect only the information needed to operate citizen accounts and civic participation features.'],'accessibility'=>['Accessibility','NCF is designed for keyboard access, readable contrast, clear labels and reduced-motion preferences.']];
        $managed=Database::one("SELECT * FROM pages WHERE slug=? AND status='published'",[$slug]);if($managed){View::render('public/page',['title'=>$managed['title'],'description'=>$managed['meta_description']?:$managed['title'],'body'=>$managed['body'],'image'=>$managed['featured_image']??null]);return;}
        if(!isset($pages[$slug])){http_response_code(404);View::render('errors/404',['title'=>'Page not found']);return;} View::render('public/page',['title'=>$pages[$slug][0],'description'=>$pages[$slug][1]]);
    }
    public function events(): void {$items=Database::all("SELECT * FROM events WHERE status='published' ORDER BY starts_at DESC LIMIT 30");View::render('public/list',['title'=>'Events','description'=>'Meet, organise and take part in public conversations and practical community action.','items'=>$items,'type'=>'event']);}
    public function campaigns(): void {$items=Database::all("SELECT * FROM campaigns WHERE status='published' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>=CURRENT_TIMESTAMP) ORDER BY starts_at DESC,id DESC LIMIT 30");View::render('public/list',['title'=>'Campaigns','description'=>'Citizen-led campaigns turning shared concerns into coordinated local action.','items'=>$items,'type'=>'campaign']);}
    public function campaign(string $slug): void {$item=Database::one("SELECT * FROM campaigns WHERE slug=? AND status='published' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>=CURRENT_TIMESTAMP)",[$slug]);if(!$item){http_response_code(404);View::render('errors/404',['title'=>'Campaign not found']);return;}View::render('public/detail',['item'=>$item,'type'=>'Campaign','image'=>$item['image_path']??null,'body'=>$item['body'],'meta'=>$item['summary']??'']);}
    public function articles(): void {$items=Database::all("SELECT a.*,c.name category FROM articles a LEFT JOIN article_categories c ON c.id=a.category_id WHERE a.status='published' ORDER BY published_at DESC LIMIT 30");View::render('public/list',['title'=>'News & publications','description'=>'Civic reporting, forum updates, press coverage and public documents.','items'=>$items,'type'=>'article']);}
    public function article(string $slug): void {$item=Database::one("SELECT a.*,c.name category FROM articles a LEFT JOIN article_categories c ON c.id=a.category_id WHERE a.slug=? AND a.status='published'",[$slug]);if(!$item){http_response_code(404);View::render('errors/404',['title'=>'Publication not found']);return;}View::render('public/detail',['item'=>$item,'type'=>$item['category']?:'News & publication','image'=>$item['featured_image']??null,'body'=>$item['body'],'meta'=>$item['summary']??'']);}
    public function search(): void {$q=trim($_GET['q']??'');$like='%'.$q.'%';$results=$q===''?[]:array_merge(Database::all("SELECT 'Issue' type,title,CONCAT('/issues/',slug) url,description excerpt FROM civic_issues WHERE moderation_status='approved' AND deleted_at IS NULL AND (title LIKE ? OR description LIKE ?) LIMIT 10",[$like,$like]),Database::all("SELECT 'Discussion' type,title,CONCAT('/discussions/',slug) url,body excerpt FROM discussions WHERE status IN('published','locked') AND deleted_at IS NULL AND (title LIKE ? OR body LIKE ?) LIMIT 10",[$like,$like]),Database::all("SELECT 'Article' type,title,CONCAT('/articles/',slug) url,summary excerpt FROM articles WHERE status='published' AND (title LIKE ? OR summary LIKE ?) LIMIT 10",[$like,$like]));View::render('public/search',compact('q','results'));}
    public function contact(): void {View::render('public/form',['title'=>'Contact NCF','description'=>'Send the forum a message.','kind'=>'contact']);}
    public function storeContact(): void {$name=trim($_POST['name']??'');$email=filter_var($_POST['email']??'',FILTER_VALIDATE_EMAIL);$subject=trim($_POST['subject']??'');$message=trim($_POST['message']??'');if(!$name||!$email||!$subject||mb_strlen($message)<10){$_SESSION['_old']=$_POST;flash('error','Please complete all fields with a valid email and message.');redirect('contact');}Database::run('INSERT INTO contact_submissions(name,email,subject,message) VALUES(?,?,?,?)',[$name,$email,$subject,$message]);flash('success','Thank you. Your message has been received.');redirect('contact');}
    public function join(): void {View::render('public/form',['title'=>'Join the movement','description'=>'Register to volunteer in your neighbourhood.','kind'=>'join']);}
    public function storeJoin(): void {$name=trim($_POST['full_name']??'');$email=filter_var($_POST['email']??'',FILTER_VALIDATE_EMAIL);if(!$name||!$email){$_SESSION['_old']=$_POST;flash('error','Name and a valid email are required.');redirect('join');}Database::run('INSERT INTO volunteer_applications(user_id,full_name,email,mobile,locality,interests) VALUES(?,?,?,?,?,?)',[auth()['id']??null,$name,$email,trim($_POST['mobile']??''),trim($_POST['locality']??''),trim($_POST['interests']??'')]);flash('success','Your volunteer registration has been received.');redirect('join');}
    private function linkedContentAvailable(array $item):bool
    {
        $id=(int)($item['content_id']??0);$type=$item['content_type']??'custom';if(!$id||in_array($type,['custom','image','text','cta'],true))return true;
        return match($type){
            'issue'=>(bool)Database::one("SELECT id FROM civic_issues WHERE id=? AND moderation_status='approved' AND deleted_at IS NULL",[$id]),
            'discussion'=>(bool)Database::one("SELECT id FROM discussions WHERE id=? AND status IN('published','locked') AND deleted_at IS NULL",[$id]),
            'event'=>(bool)Database::one("SELECT id FROM events WHERE id=? AND status='published'",[$id]),
            'campaign'=>(bool)Database::one("SELECT id FROM campaigns WHERE id=? AND status='published' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>=CURRENT_TIMESTAMP)",[$id]),
            'article'=>(bool)Database::one("SELECT id FROM articles WHERE id=? AND status='published'",[$id]),
            default=>false,
        };
    }
}
