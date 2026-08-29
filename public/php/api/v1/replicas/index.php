<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/bootstrap.php';

$method=vhm_method(['GET','POST','PATCH'],$requestId);
vhm_rate_limit($pdo,'replicas',$config['rate_limit']??[],$requestId);

if ($method==='GET') {
    $auth=vhm_require_scope($pdo,'replicas:read',$requestId);
    $stmt=$pdo->prepare('SELECT rp.id,rp.digital_human_id,rp.identity_id,rp.name,rp.renderer_tier,rp.status,rp.quality_mode,rp.provider,rp.active_version_id,rp.approved_at,rp.revoked_at,rp.created_at,rp.updated_at,i.display_name AS identity_name FROM vhm_replica_profiles rp JOIN vhm_identities i ON i.id=rp.identity_id AND i.organisation_id=rp.organisation_id WHERE rp.organisation_id=? ORDER BY rp.updated_at DESC');
    $stmt->execute([$auth['organisation_id']]);
    vhm_success(['items'=>$stmt->fetchAll(),'private_media_included'=>false,'upload_authority'=>'canonical-platform-api'], $requestId);
}

$auth=vhm_require_scope($pdo,'replicas:write',$requestId);
$body=vhm_body($requestId);
$action=(string)($_GET['action']??($method==='PATCH'?'revoke':'create'));

if ($method==='POST' && $action==='create') {
    $identityId=vhm_uuid(isset($body['identity_id'])?(string)$body['identity_id']:null,'identity_id',$requestId);
    $humanId=vhm_uuid(isset($body['digital_human_id'])?(string)$body['digital_human_id']:null,'digital_human_id',$requestId);
    $name=vhm_required_string($body,'name',$requestId,180);
    $quality=(string)($body['quality_mode']??'standard');
    if (!in_array($quality,['standard','premium','presenter'],true)) vhm_error('Invalid quality_mode','VALIDATION_ERROR',422,$requestId,['field'=>'quality_mode']);
    $identityStmt=$pdo->prepare('SELECT id FROM vhm_identities WHERE id=? AND organisation_id=? AND consent_status="approved" AND commercial_use_confirmed=1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) LIMIT 1');
    $identityStmt->execute([$identityId,$auth['organisation_id']]);
    if (!$identityStmt->fetchColumn()) vhm_error('Approved identity and commercial-use consent are required','CONSENT_REQUIRED',409,$requestId);
    $consentStmt=$pdo->prepare('SELECT consent_type FROM vhm_identity_consents WHERE organisation_id=? AND identity_id=? AND consent_type IN ("face","commercial") AND status="approved" AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())');
    $consentStmt->execute([$auth['organisation_id'],$identityId]);
    $types=array_column($consentStmt->fetchAll(),'consent_type');
    foreach (['face','commercial'] as $required) if (!in_array($required,$types,true)) vhm_error('Approved likeness and commercial consent are required','CONSENT_REQUIRED',409,$requestId,['missing'=>$required]);
    $humanStmt=$pdo->prepare('SELECT id FROM vhm_digital_humans WHERE id=? AND organisation_id=? AND status<>"revoked" LIMIT 1');
    $humanStmt->execute([$humanId,$auth['organisation_id']]);
    if (!$humanStmt->fetchColumn()) vhm_error('Digital Human not found','NOT_FOUND',404,$requestId);
    $profileId=vhm_new_uuid(); $captureId=vhm_new_uuid();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO vhm_replica_profiles(id,organisation_id,digital_human_id,identity_id,name,status,quality_mode,motion_profile_json) VALUES(?,?,?,?,?,"capturing",?,JSON_OBJECT())')->execute([$profileId,$auth['organisation_id'],$humanId,$identityId,$name,$quality]);
        $pdo->prepare('INSERT INTO vhm_replica_capture_sessions(id,organisation_id,replica_profile_id,identity_id,status,consent_scope_json,capture_settings_json,consent_verified_at) VALUES(?,?,?,?,"consent_verified",JSON_OBJECT("likeness",true,"commercial",true),JSON_OBJECT(),UTC_TIMESTAMP())')->execute([$captureId,$auth['organisation_id'],$profileId,$identityId]);
        vhm_audit($pdo,$auth,'replica.create','replica_profile',$profileId,$requestId,['quality_mode'=>$quality]);
        $pdo->commit();
    } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
    vhm_success(['id'=>$profileId,'capture_session_id'=>$captureId,'status'=>'capturing','raw_media_storage'=>'private-object-storage-only'], $requestId, 201);
}

$profileId=vhm_uuid(isset($body['id'])?(string)$body['id']:null,'id',$requestId);
$profileStmt=$pdo->prepare('SELECT id,identity_id,status FROM vhm_replica_profiles WHERE id=? AND organisation_id=? LIMIT 1');
$profileStmt->execute([$profileId,$auth['organisation_id']]); $profile=$profileStmt->fetch();
if (!$profile) vhm_error('Replica profile not found','NOT_FOUND',404,$requestId);

if ($method==='POST' && $action==='queue-processing') {
    $captureStmt=$pdo->prepare('SELECT id FROM vhm_replica_capture_sessions WHERE replica_profile_id=? AND organisation_id=? AND status IN ("consent_verified","capturing","uploaded","accepted") ORDER BY created_at DESC LIMIT 1');
    $captureStmt->execute([$profileId,$auth['organisation_id']]); $captureId=$captureStmt->fetchColumn();
    if (!$captureId) vhm_error('Capture session is not ready','CAPTURE_INCOMPLETE',409,$requestId);
    $requiredStmt=$pdo->prepare('SELECT segment_type,gesture_key,starts_neutral,ends_neutral FROM vhm_replica_capture_segments WHERE capture_session_id=? AND organisation_id=? AND status="uploaded"');
    $requiredStmt->execute([$captureId,$auth['organisation_id']]); $segments=$requiredStmt->fetchAll();
    $has=static function(string $type, ?string $gesture=null) use ($segments): bool { foreach ($segments as $segment) if ($segment['segment_type']===$type && ($gesture===null || ($segment['gesture_key']===$gesture && (int)$segment['starts_neutral']===1 && (int)$segment['ends_neutral']===1))) return true; return false; };
    $missing=[]; foreach ([['idle',null],['listening',null],['speaking',null],['gesture','acknowledge'],['gesture','explain']] as [$type,$gesture]) if (!$has($type,$gesture)) $missing[]=$gesture??$type;
    if ($missing!==[]) vhm_error('Required performer captures are incomplete','CAPTURE_INCOMPLETE',409,$requestId,['missing'=>$missing]);
    $jobId=vhm_new_uuid();
    $pdo->prepare('INSERT INTO vhm_replica_processing_jobs(id,organisation_id,replica_profile_id,capture_session_id,status,safe_metrics_json) VALUES(?,?,?,? ,"queued",JSON_OBJECT())')->execute([$jobId,$auth['organisation_id'],$profileId,$captureId]);
    $pdo->prepare('UPDATE vhm_replica_profiles SET status="processing" WHERE id=? AND organisation_id=?')->execute([$profileId,$auth['organisation_id']]);
    vhm_audit($pdo,$auth,'replica.processing.queue','replica_profile',$profileId,$requestId,['job_id'=>$jobId]);
    vhm_success(['job_id'=>$jobId,'status'=>'queued','execution_authority'=>'canonical-platform-worker'], $requestId, 202);
}

if ($method==='PATCH' || $action==='revoke') {
    $reason=vhm_required_string($body,'reason',$requestId,500);
    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE vhm_replica_profiles SET status="revoked",revoked_at=UTC_TIMESTAMP(),revocation_reason=? WHERE id=? AND organisation_id=?')->execute([$reason,$profileId,$auth['organisation_id']]);
        $pdo->prepare('UPDATE vhm_replica_versions SET status="revoked",revoked_at=UTC_TIMESTAMP() WHERE replica_profile_id=? AND organisation_id=?')->execute([$profileId,$auth['organisation_id']]);
        $pdo->prepare('UPDATE vhm_human_replica_assignments SET enabled=0 WHERE replica_profile_id=? AND organisation_id=?')->execute([$profileId,$auth['organisation_id']]);
        vhm_audit($pdo,$auth,'replica.revoke','replica_profile',$profileId,$requestId,['reason'=>$reason]);
        $pdo->commit();
    } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
    vhm_success(['id'=>$profileId,'status'=>'revoked','runtime_disabled'=>true,'object_deletion_required'=>true], $requestId);
}

vhm_error('Replica action not found','NOT_FOUND',404,$requestId);
