<?php
declare(strict_types=1);
namespace App\Core;

final class Application
{
    public function run(): void { $router=new Router(); require BASE_PATH.'/routes/web.php'; require BASE_PATH.'/routes/admin.php'; $router->dispatch(); }
}
