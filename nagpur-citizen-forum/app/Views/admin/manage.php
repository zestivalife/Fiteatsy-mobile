<?php
$images=$cfg['images']??[];
$fieldLabel=static fn(string $field):string=>$cfg['labels'][$field]??ucwords(str_replace('_',' ',$field));
$wide=['body','description','summary','message','setting_value','meta_description'];
$required=['title','name','body','description','setting_key'];
$statusOptions=match($module){'events'=>['draft','published','cancelled','archived'],default=>['draft','published','archived']};
$statusOnlyModules=['citizens','volunteers','enquiries','registrations','issue-comments','discussion-comments'];
?>
<header class="admin-header"><div><span class="eyebrow">Website management</span><h1><?=e($cfg['title'])?></h1><p>The labels below match the corresponding public website content.</p></div><span><?=count($rows)?> records</span></header>
<?php if($cfg['fields']&&$module!=='settings'):?>
<section class="admin-panel">
    <h2>Add new — <?=e($cfg['title'])?></h2>
    <form class="admin-form" method="post" action="<?=url('admin/manage/'.$module)?>" <?=$images?'enctype="multipart/form-data"':''?>>
        <?=csrf_field()?>
        <?php foreach($cfg['fields'] as $field):?><?php $label=$fieldLabel($field);?>
        <label class="<?=in_array($field,$wide,true)?'full':''?>"><?=e($label)?>
            <?php if($field==='category_id'):?><select name="category_id"><?php foreach($categories as $c):?><option value="<?=e($c['id'])?>"><?=e($c['name'])?></option><?php endforeach;?></select>
            <?php elseif($field==='user_id'):?><select name="user_id"><?php foreach($users as $u):?><option value="<?=e($u['id'])?>"><?=e($u['full_name'].' · '.$u['email'])?></option><?php endforeach;?></select>
            <?php elseif(in_array($field,$images,true)):?><input type="file" name="<?=e($field)?>" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG or WebP. Maximum <?=e((string)round(config('app.upload_max_bytes')/1048576))?> MB.</small>
            <?php elseif(str_starts_with($field,'is_')||$field==='registration_enabled'):?><input type="checkbox" name="<?=e($field)?>" value="1">
            <?php elseif(in_array($field,$wide,true)):?><textarea name="<?=e($field)?>" <?=in_array($field,$required,true)?'required':''?>></textarea>
            <?php elseif(str_ends_with($field,'_at')):?><input type="datetime-local" name="<?=e($field)?>" <?=$module==='events'&&$field==='starts_at'?'required':''?>>
            <?php elseif($field==='status'):?><select name="status"><?php foreach($statusOptions as $status):?><option><?=e($status)?></option><?php endforeach;?></select>
            <?php elseif(in_array($field,['position','capacity'],true)):?><input type="number" name="<?=e($field)?>">
            <?php else:?><input name="<?=e($field)?>" <?=in_array($field,$required,true)?'required':''?>><?php if($field==='slug'):?><small>Leave blank to generate automatically.</small><?php endif;?>
            <?php endif;?>
        </label>
        <?php endforeach;?>
        <button class="pill pill-dark">Add to <?=e($cfg['title'])?></button>
    </form>
</section>
<?php elseif($module==='settings'):?><?php $settings=[];foreach($rows as $setting)$settings[$setting['setting_key']]=$setting['setting_value'];?>
<section class="admin-panel"><h2>Public website identity</h2><p>These labels describe exactly where each value appears.</p><div class="settings-grid">
<form class="admin-form admin-form-single" method="post" action="<?=url('admin/manage/settings')?>"><?=csrf_field()?><input type="hidden" name="setting_key" value="site_name"><label class="full">Website name shown in the header and footer<input name="setting_value" required value="<?=e($settings['site_name']??'Nagpur Citizen Forum')?>"></label><div class="admin-form-actions full"><button class="pill pill-dark">Save website name</button></div></form>
<form class="admin-form admin-form-single" method="post" action="<?=url('admin/manage/settings')?>"><?=csrf_field()?><input type="hidden" name="setting_key" value="footer_tagline"><label class="full">Footer tagline<textarea name="setting_value" required><?=e($settings['footer_tagline']??"Citizen voices. Collective action.\nA better Nagpur.")?></textarea></label><div class="admin-form-actions full"><button class="pill pill-dark">Save footer tagline</button></div></form>
</div></section>
<?php elseif($module==='media'):?>
<section class="admin-panel"><h2>Upload media</h2><form class="admin-form" enctype="multipart/form-data" method="post" action="<?=url('admin/manage/media')?>"><?=csrf_field()?><label>Media file<input type="file" name="asset" required></label><label>Alternative text<input name="alt_text"></label><label>Media category<input name="category"></label><button class="pill pill-dark">Upload media</button></form></section>
<?php endif;?>
<section class="admin-panel table-wrap">
    <table><thead><tr><?php if($rows):?><?php foreach(array_slice(array_keys($rows[0]),0,7) as $key):?><th><?=e($fieldLabel($key))?></th><?php endforeach;?><th>Actions</th><?php endif;?></tr></thead>
    <tbody><?php foreach($rows as $row):?><tr><?php foreach(array_slice($row,0,7,true) as $key=>$value):?><td><?php if(in_array($key,$images,true)&&$value):?><img class="admin-thumb" src="<?=e(url((string)$value))?>" alt=""><?php else:?><?=e(mb_strimwidth((string)$value,0,90,'…'))?><?php endif;?></td><?php endforeach;?><td>
        <?php if(in_array($module,$statusOnlyModules,true)):?><form class="row-form" method="post" action="<?=url('admin/manage/'.$module.'/'.$row['id'])?>"><?=csrf_field()?><?=method_field('PUT')?><select name="status"><?php $rowStatuses=match($module){'citizens'=>['active','suspended'],'registrations'=>['registered','cancelled','attended'],'enquiries'=>['new','in_progress','closed'],'issue-comments','discussion-comments'=>['approved','pending','rejected'],default=>['pending','approved','declined']};foreach($rowStatuses as $status):?><option<?=selected($row['status'],$status)?>><?=e($status)?></option><?php endforeach;?></select><button>Update status</button></form>
        <?php elseif(!in_array($module,['roles','settings','media','notifications'],true)):?><div class="row-form"><a href="<?=url('admin/manage/'.$module.'/'.$row['id'])?>">Edit</a><form method="post" action="<?=url('admin/manage/'.$module.'/'.$row['id'])?>"><?=csrf_field()?><?=method_field('DELETE')?><button class="danger" data-confirm="Delete this record?">Delete</button></form></div><?php endif;?>
    </td></tr><?php endforeach;?></tbody></table>
    <?php if(!$rows):?><div class="empty-state">No <?=e(strtolower($cfg['title']))?> records yet.</div><?php endif;?>
</section>
