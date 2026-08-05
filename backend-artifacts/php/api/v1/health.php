<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/bootstrap.php';
vhm_method(['GET'],$requestId);
vhm_rate_limit($pdo,'health',$config['rate_limit']??[],$requestId);
$pdo->query('SELECT 1')->fetchColumn();
vhm_success(['status'=>'ok','service'=>'vowhumans-afrihost-adapter','database'=>'connected','core_platform'=>'external','gpu_inference'=>'not-hosted-here'],$requestId);

