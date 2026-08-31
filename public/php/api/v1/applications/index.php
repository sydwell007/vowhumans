<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/bootstrap.php';
$method=vhm_method(['GET'],$requestId); $auth=vhm_require_scope($pdo,'applications:read',$requestId);
$stmt=$pdo->prepare("SELECT id,name,slug,status,settings_json,created_at FROM vhm_applications WHERE organisation_id=? AND status <> 'archived' ORDER BY name");
$stmt->execute([$auth['organisation_id']]); vhm_success(['items'=>$stmt->fetchAll()],$requestId);
