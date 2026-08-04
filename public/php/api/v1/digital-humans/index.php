<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/bootstrap.php';
$method=vhm_method(['GET','POST'],$requestId);
if ($method==='GET') {
    $auth=vhm_require_scope($pdo,'digital-humans:read',$requestId);
    $stmt=$pdo->prepare('SELECT h.id,h.name,h.role,h.disclosure,h.status,h.created_at,i.display_name AS identity_name,i.consent_status FROM vhm_digital_humans h LEFT JOIN vhm_identities i ON i.id=h.identity_id AND i.organisation_id=h.organisation_id WHERE h.organisation_id=? ORDER BY h.created_at DESC');
    $stmt->execute([$auth['organisation_id']]); vhm_success(['items'=>$stmt->fetchAll()],$requestId);
}
$auth=vhm_require_scope($pdo,'digital-humans:write',$requestId); vhm_rate_limit($pdo,'human-write',$config['rate_limit']??[],$requestId); $body=vhm_body($requestId);
$id=vhm_new_uuid(); $name=vhm_required_string($body,'name',$requestId,160); $role=vhm_required_string($body,'role',$requestId,160); $disclosure=vhm_required_string($body,'disclosure',$requestId,500);
$identityId=isset($body['identity_id'])?vhm_uuid((string)$body['identity_id'],'identity_id',$requestId):null;
$stmt=$pdo->prepare('INSERT INTO vhm_digital_humans(id,organisation_id,identity_id,name,role,disclosure,status,created_at) VALUES(?,?,?,?,?,?,"draft",UTC_TIMESTAMP())');
$stmt->execute([$id,$auth['organisation_id'],$identityId,$name,$role,$disclosure]); vhm_audit($pdo,$auth,'digital_human.create','digital_human',$id,$requestId);
vhm_success(['id'=>$id,'name'=>$name,'status'=>'draft','publication_blocked'=>true],$requestId,201);

