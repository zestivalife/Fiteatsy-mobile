<?php $hero=$hero?:['eyebrow'=>'Citizen-led · Nagpur-wide','heading'=>'Our city.','accent_text'=>'Our voice.','description'=>'A public platform to raise civic issues, exchange ideas and turn neighbourhood concerns into collective action.','cta_label'=>'Raise an issue','cta_url'=>'/issues/create','secondary_cta_label'=>'Explore civic issues','secondary_cta_url'=>'/issues']; ?>
<?php if(!empty($preview)):?><div class="admin-preview-banner">Admin preview · Draft homepage content may be visible</div><?php endif;?>
<section class="hero">
    <div class="hero-copy">
        <div>
            <span class="eyebrow"><?=e($hero['eyebrow'])?></span>
            <h1><?=e($hero['heading'])?><span><?=e($hero['accent_text'])?></span></h1>
            <p class="lead"><?=e($hero['description'])?></p>
            <div class="hero-buttons">
                <?php if($hero['cta_label']):?><a class="pill pill-dark" href="<?=e(destination_url($hero['cta_url']))?>"><?=e($hero['cta_label'])?> ↗</a><?php endif;?>
                <?php if($hero['secondary_cta_label']):?><a class="pill pill-light" href="<?=e(destination_url($hero['secondary_cta_url']))?>"><?=e($hero['secondary_cta_label'])?></a><?php endif;?>
            </div>
        </div>
        <div class="hero-note"><span>Independent citizen forum</span><span>Transparent issue tracking</span></div>
    </div>
    <div class="mosaic" aria-label="Featured civic activity">
        <?php if($hero['layout']==='image'&&!empty($hero['desktop_image'])):?>
            <picture class="hero-media"><?php if($hero['mobile_image']):?><source media="(max-width: 600px)" srcset="<?=e(url($hero['mobile_image']))?>"><?php endif;?><img src="<?=e(url($hero['desktop_image']))?>" alt=""></picture>
        <?php elseif($strips):?>
            <button class="mosaic-pause" type="button" aria-pressed="false" aria-label="Pause hero animation">Ⅱ</button>
            <div class="mosaic-cols" style="--column-count:<?=e(count($strips))?>">
            <?php foreach($strips as $si=>$strip):?>
                <div class="mosaic-col <?=e($strip['direction'])?> <?=$strip['mobile_enabled']?'':'mobile-disabled'?>" style="--speed:<?=e($strip['speed_seconds'])?>s">
                <?php $m=array_merge($strip['items'],$strip['items']);foreach($m as $i=>$item):?>
                    <a class="tile <?=e($item['colour'])?> <?=!empty($item['image_path'])?'photo':''?> <?=($i+$si)%3===0?'tall':''?> <?=!empty($preview)&&($item['status']??'published')!=='published'?'preview-draft':''?>" href="<?=e(destination_url($item['destination_url']?:''))?>" <?=$i>=count($strip['items'])?'aria-hidden="true" tabindex="-1"':''?>>
                        <?php if(!empty($item['image_path'])):?><img src="<?=e(url($item['image_path']))?>" alt="<?=e($item['alt_text']??'')?>" loading="lazy"><?php endif;?>
                        <?php if(!empty($preview)&&($item['status']??'published')!=='published'&&$i<count($strip['items'])):?><span class="preview-status">Draft</span><?php endif;?>
                        <small><?=e($item['subtitle'])?></small><strong><?=e($item['title'])?></strong><small>Explore ↗</small>
                    </a>
                <?php endforeach;?>
                </div>
            <?php endforeach;?>
            </div>
        <?php else:?><div class="mosaic-empty">Homepage mosaic is being updated.</div><?php endif;?>
    </div>
</section>
<?php if(($sections['issues']['is_visible']??1)):?><section class="section"><div class="wrap"><div class="section-head"><div><span class="eyebrow"><?=e($sections['issues']['description']??'Issues citizens care about')?></span><h2><?=e($sections['issues']['heading']??'City watch')?></h2></div><a class="text-link" href="<?=url('issues')?>">View all issues ↗</a></div><div class="issue-grid"><?php if(!$issues):?><div class="empty-state">No approved issues yet.</div><?php endif;?><?php foreach($issues as $i=>$issue):?><article class="issue-card <?=$i===0?'featured':''?>"><div class="card-meta"><span><?=e($issue['category'])?></span><span class="status"><?=e(str_replace('_',' ',$issue['progress_status']))?></span></div><div><h3><?=e($issue['title'])?></h3><p><?=e(mb_strimwidth($issue['description'],0,180,'…'))?></p></div><div class="card-bottom"><span class="support"><?=e($issue['supports'])?> supporters</span><a class="arrow" href="<?=url('issues/'.$issue['slug'])?>" aria-label="View issue">↗</a></div></article><?php endforeach;?></div></div></section><?php endif;?>
<?php if(($sections['discussions']['is_visible']??1)):?><section class="section dark-section"><div class="wrap"><div class="section-head"><div><span class="eyebrow"><?=e($sections['discussions']['description']??'Ideas in public')?></span><h2><?=e($sections['discussions']['heading']??'Community talks')?></h2></div><a class="text-link" href="<?=url('discussions')?>">All discussions ↗</a></div><div class="discussion-list"><?php if(!$discussions):?><div class="empty-state">No published discussions yet.</div><?php endif;?><?php foreach($discussions as $d):?><a class="discussion-row" href="<?=url('discussions/'.$d['slug'])?>"><span class="category"><?=e($d['category'])?></span><h3><?=e($d['title'])?></h3><span class="replies"><?=e($d['replies'])?> replies</span><span class="arrow">→</span></a><?php endforeach;?></div></div></section><?php endif;?>
<?php if(($sections['join']['is_visible']??1)):?><section class="section"><div class="wrap join"><article class="join-card"><div><span class="eyebrow">Membership</span><h2><?=e($sections['join']['heading']??'Add your voice')?></h2><p>Join citizens from across Nagpur who want informed discussion, transparent follow-through and constructive civic action.</p></div><a class="pill pill-dark" href="<?=url('register')?>">Become a member ↗</a></article><article class="join-card"><div><span class="eyebrow">Volunteer</span><h2>Act locally</h2><p>Contribute your time and skills to community outreach, events, documentation and neighbourhood initiatives.</p></div><a class="pill pill-light" href="<?=url('join')?>">Register to volunteer ↗</a></article></div></section><?php endif;?>
