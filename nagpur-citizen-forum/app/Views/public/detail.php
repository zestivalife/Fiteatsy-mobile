<div class="page-shell">
    <article class="detail-page wrap">
        <?php if($image):?><div class="detail-image"><img src="<?=e(url($image))?>" alt="<?=e($item['title'])?>"></div><?php endif;?>
        <span class="eyebrow"><?=e($type)?></span>
        <h1><?=e($item['title'])?></h1>
        <?php if($meta):?><p class="lead"><?=e($meta)?></p><?php endif;?>
        <div class="prose"><?=nl2br(e($body))?></div>
    </article>
</div>
