<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit("CLI only.\n");
$app=require dirname(__DIR__).'/bootstrap/app.php';
use App\Core\Database;
$pdo=Database::connection();
foreach(['database/migrations/001_initial_schema.sql','database/migrations/002_admin_cms.sql','database/migrations/003_page_images.sql','database/migrations/004_mosaic_accessibility.sql','database/seeders/seed.sql'] as $file){
    $sql=file_get_contents(dirname(__DIR__).'/'.$file);
    if($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite'&&str_contains($file,'migrations')){
        $sql=preg_replace('/^SET .*?;\s*/m','',$sql);
        $sql=preg_replace('/BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY/i','INTEGER PRIMARY KEY AUTOINCREMENT',$sql);
        $sql=preg_replace('/\bBIGINT UNSIGNED\b|\bINT UNSIGNED\b/i','INTEGER',$sql);
        $sql=preg_replace('/\bBIGINT\b|\bINT\b/i','INTEGER',$sql);
        $sql=preg_replace('/ENUM\([^)]*\)/i','TEXT',$sql);
        $sql=preg_replace('/DECIMAL\([^)]*\)/i','REAL',$sql);
        $sql=preg_replace('/\bMEDIUMTEXT\b|\bJSON\b/i','TEXT',$sql);
        $sql=preg_replace('/TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/i','TEXT DEFAULT CURRENT_TIMESTAMP',$sql);
        $sql=preg_replace('/TIMESTAMP DEFAULT CURRENT_TIMESTAMP/i','TEXT DEFAULT CURRENT_TIMESTAMP',$sql);
        $sql=preg_replace('/\bDATETIME\b/i','TEXT',$sql);
        $sql=preg_replace('/,\s*(?:INDEX|FULLTEXT)\([^)]*\)/i','',$sql);
        $sql=preg_replace('/\s+AFTER\s+\w+/i','',$sql);
        $sql=preg_replace('/\) ENGINE=InnoDB/i',')',$sql);
    }
    $pdo->exec($sql);echo "Applied {$file}\n";
}
echo "Schema and seed data installed. Run scripts/create-admin.php next.\n";
