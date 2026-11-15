<?php
declare(strict_types=1);
namespace App\Core;

final class View
{
    public static function render(string $view, array $data = [], string $layout = 'public'): void
    {
        $viewFile=BASE_PATH.'/app/Views/'.$view.'.php'; if(!is_file($viewFile)) throw new \RuntimeException('View not found');
        extract($data,EXTR_SKIP); ob_start(); require $viewFile; $content=ob_get_clean();
        $flashes=$_SESSION['_flash']??[]; unset($_SESSION['_flash'],$_SESSION['_old']);
        if($layout==='public'){
            $siteSettings=[];foreach(Database::all('SELECT setting_key,setting_value FROM site_settings') as $setting)$siteSettings[$setting['setting_key']]=$setting['setting_value'];
            $publicNavigation=Database::all("SELECT * FROM navigation_items WHERE is_active=1 ORDER BY location,position,id");
        }
        require BASE_PATH.'/app/Views/layouts/'.$layout.'.php';
    }
}
