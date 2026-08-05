<?php
declare(strict_types=1);
$required=['bootstrap.php','shared/auth.php','shared/commercial_router.php','api/v1/index.php','.htaccess','config.example.php'];
$missing=[]; foreach($required as $path){if(!is_file(dirname(__DIR__).DIRECTORY_SEPARATOR.$path))$missing[]=$path;}
if($missing!==[]){fwrite(STDERR,'Missing: '.implode(', ',$missing).PHP_EOL);exit(1);} echo "VowHumans PHP package structure OK\n";
