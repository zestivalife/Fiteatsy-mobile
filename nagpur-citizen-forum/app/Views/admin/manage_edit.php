<?php
$images=$cfg['images']??[];
$fieldLabel=static fn(string $field):string=>$cfg['labels'][$field]??ucwords(str_replace('_',' ',$field));
$wide=['body','description','summary','message','setting_value','meta_description'];
$required=['title','name','body','description','setting_key'];
$statusOptions=match($module){'events'=>['draft','published','cancelled','archived'],default=>['draft','published','archived']};
?>
<header class="admin-header"><div><span class="eyebrow">Edit website content</span><h1><?=e($cfg['title'])?></h1><p>These field names match the content shown on the public website.</p></div><a href="<?=url('admin/manage/'.$module)?>">← Back to <?=e($cfg['title'])?></a></header>
<section class="admin-panel">
    <form class="admin-form" method="post" enctype="multipart/form-data" action="<?=url('admin/manage/'.$module.'/'.$row['id'])?>">
        <?=csrf_field()?><?=method_field('PUT')?>
        <?php foreach($cfg['fields'] as $field):?><?php $label=$fieldLabel($field);$value=$row[$field]??'';?>
        <label class="<?=in_array($field,$wide,true)?'full':''?>"><?=e($label)?>
            <?php if($field==='category_id'):?><select name="category_id"><?php foreach($categories as $c):?><option value="<?=e($c['id'])?>"<?=selected($value,$c['id'])?>><?=e($c['name'])?></option><?php endforeach;?></select>
            <?php elseif(in_array($field,$images,true)):?><?php if($value):?><img class="admin-image-preview" src="<?=e(url((string)$value))?>" alt=""><span class="check-field"><input type="checkbox" name="remove_<?=e($field)?>"> Remove current image</span><?php endif;?><input type="file" name="<?=e($field)?>" accept="image/jpeg,image/png,image/webp"><small>Upload a new image to replace the current one.</small>
            <?php elseif(str_starts_with($field,'is_')||$field==='registration_enabled'):?><input type="checkbox" name="<?=e($field)?>" value="1" <?=$value?'checked':''?>>
            <?php elseif(in_array($field,$wide,true)):?><textarea name="<?=e($field)?>" <?=in_array($field,$required,true)?'required':''?>><?=e($value)?></textarea>
            <?php elseif(str_ends_with($field,'_at')):?><input type="datetime-local" name="<?=e($field)?>" value="<?=e($value?date('Y-m-d\TH:i',strtotime((string)$value)):'')?>">
            <?php elseif($field==='status'):?><select name="status"><?php foreach($statusOptions as $status):?><option<?=selected($value,$status)?>><?=e($status)?></option><?php endforeach;?></select>
            <?php elseif(in_array($field,['position','capacity'],true)):?><input type="number" name="<?=e($field)?>" value="<?=e($value)?>">
            <?php else:?><input name="<?=e($field)?>" value="<?=e($value)?>" <?=in_array($field,$required,true)?'required':''?>><?php endif;?>
        </label>
        <?php endforeach;?>
        <button class="pill pill-dark">Save changes</button>
    </form>
</section>
