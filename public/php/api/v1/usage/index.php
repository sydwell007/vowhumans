<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/bootstrap.php';
vhm_method(['GET'],$requestId); $auth=vhm_require_scope($pdo,'usage:read-own',$requestId);
$stmt=$pdo->prepare('SELECT provider,unit,SUM(quantity) AS quantity,SUM(estimated_cost_minor) AS estimated_cost_minor,currency FROM vhm_usage_records WHERE organisation_id=? AND (application_id=? OR ? IS NULL) AND recorded_at>=DATE_FORMAT(UTC_TIMESTAMP(),"%Y-%m-01") GROUP BY provider,unit,currency');
$stmt->execute([$auth['organisation_id'],$auth['application_id'],$auth['application_id']]); vhm_success(['period'=>'current-month','items'=>$stmt->fetchAll(),'private_content_included'=>false],$requestId);

