<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/bootstrap.php';
$method=vhm_method(['GET','POST','PATCH'],$requestId);
if ($method==='GET') {
    $auth=vhm_require_scope($pdo,'identities:read',$requestId);
    $stmt=$pdo->prepare('SELECT id,owner_name,display_name,consent_status,commercial_use_confirmed,geographic_scope,expires_at,revoked_at,created_at FROM vhm_identities WHERE organisation_id=? ORDER BY created_at DESC');
    $stmt->execute([$auth['organisation_id']]); vhm_success(['items'=>$stmt->fetchAll()],$requestId);
}
$auth=vhm_require_scope($pdo,'identities:write',$requestId); $body=vhm_body($requestId);
if ($method==='POST') {
    $id=vhm_new_uuid(); $owner=vhm_required_string($body,'owner_name',$requestId,180); $display=vhm_required_string($body,'display_name',$requestId,180);
    $provenance=vhm_required_string($body,'source_provenance',$requestId,1000); $geography=vhm_required_string($body,'geographic_scope',$requestId,300);
    $stmt=$pdo->prepare('INSERT INTO vhm_identities(id,organisation_id,owner_name,display_name,source_provenance,geographic_scope,commercial_use_confirmed,consent_status,created_at) VALUES(?,?,?,?,?,?,0,"pending",UTC_TIMESTAMP())');
    $stmt->execute([$id,$auth['organisation_id'],$owner,$display,$provenance,$geography]); vhm_audit($pdo,$auth,'identity.create','identity',$id,$requestId);
    vhm_success(['id'=>$id,'consent_status'=>'pending','publication_blocked'=>true],$requestId,201);
}
$id=vhm_uuid(isset($body['id'])?(string)$body['id']:null,'id',$requestId); $reason=vhm_required_string($body,'reason',$requestId,500);
$stmt=$pdo->prepare('UPDATE vhm_identities SET consent_status="revoked",revoked_at=UTC_TIMESTAMP(),revocation_reason=? WHERE id=? AND organisation_id=? AND consent_status<>"revoked"');
$stmt->execute([$reason,$id,$auth['organisation_id']]); if ($stmt->rowCount()!==1) vhm_error('Identity not found or already revoked','NOT_FOUND',404,$requestId);
$pdo->prepare('UPDATE vhm_digital_humans SET status="revoked" WHERE identity_id=? AND organisation_id=?')->execute([$id,$auth['organisation_id']]);
vhm_audit($pdo,$auth,'identity.revoke','identity',$id,$requestId,['reason'=>$reason]); vhm_success(['id'=>$id,'consent_status'=>'revoked','new_sessions_blocked'=>true],$requestId);

