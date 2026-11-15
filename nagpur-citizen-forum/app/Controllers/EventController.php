<?php
declare(strict_types=1);
namespace App\Controllers;
use App\Core\Auth;use App\Core\Database;use App\Core\View;
final class EventController
{
    public function show(string $slug):void{$event=Database::one("SELECT e.*,(SELECT COUNT(*) FROM event_registrations r WHERE r.event_id=e.id AND r.status='registered') registered FROM events e WHERE e.slug=? AND e.status='published'",[$slug]);if(!$event){http_response_code(404);View::render('errors/404',['title'=>'Event not found']);return;}View::render('events/show',compact('event'));}
    public function register(string $id):void{Auth::requireLogin();$pdo=Database::connection();$sqlite=$pdo->getAttribute(\PDO::ATTR_DRIVER_NAME)==='sqlite';$pdo->beginTransaction();try{$event=Database::one("SELECT * FROM events WHERE id=? AND status='published' AND registration_enabled=1".($sqlite?'':' FOR UPDATE'),[(int)$id]);if(!$event)throw new \RuntimeException('Registration is unavailable.');$count=(int)(Database::one("SELECT COUNT(*) n FROM event_registrations WHERE event_id=? AND status='registered'",[(int)$id])['n']??0);if($event['capacity']!==null&&$count>=(int)$event['capacity'])throw new \RuntimeException('This event is full.');$sql=$sqlite?"INSERT INTO event_registrations(event_id,user_id,status) VALUES(?,?,'registered') ON CONFLICT(event_id,user_id) DO UPDATE SET status='registered'":"INSERT INTO event_registrations(event_id,user_id,status) VALUES(?,?,'registered') ON DUPLICATE KEY UPDATE status='registered'";Database::run($sql,[(int)$id,auth()['id']]);$pdo->commit();flash('success','Your event registration is confirmed.');}catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();flash('error',$e->getMessage());}redirect('events');}
}
