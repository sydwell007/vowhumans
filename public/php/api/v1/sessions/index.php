<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/bootstrap.php';
$method=vhm_method(['GET','POST','DELETE'],$requestId);
if ($method==='GET') {
    $auth=vhm_require_scope($pdo,'sessions:read-own',$requestId);
    $stmt=$pdo->prepare('SELECT id,application_id,digital_human_id,practice_mode,status,avatar_mode,transcript_consent,recording_consent,started_at,ended_at,created_at FROM vhm_sessions WHERE organisation_id=? AND (application_id=? OR ? IS NULL) ORDER BY created_at DESC LIMIT 100');
    $stmt->execute([$auth['organisation_id'],$auth['application_id'],$auth['application_id']]); vhm_success(['items'=>$stmt->fetchAll(),'private_answers_included'=>false],$requestId);
}
$auth=vhm_require_scope($pdo,$method==='POST'?'sessions:create':'sessions:delete-own',$requestId); vhm_rate_limit($pdo,'sessions',$config['rate_limit']??[],$requestId);
if ($method==='DELETE') {
    $id=vhm_uuid($_GET['id']??null,'id',$requestId); $stmt=$pdo->prepare('UPDATE vhm_sessions SET status="deleted",deleted_at=UTC_TIMESTAMP() WHERE id=? AND organisation_id=? AND (application_id=? OR ? IS NULL)');
    $stmt->execute([$id,$auth['organisation_id'],$auth['application_id'],$auth['application_id']]); if ($stmt->rowCount()!==1) vhm_error('Session not found','NOT_FOUND',404,$requestId);
    vhm_audit($pdo,$auth,'session.delete','session',$id,$requestId); vhm_success(['id'=>$id,'status'=>'deleted','media_deletion'=>'queued'],$requestId,202);
}
$body=vhm_body($requestId); $humanId=vhm_uuid(isset($body['digital_human_id'])?(string)$body['digital_human_id']:null,'digital_human_id',$requestId); $applicationId=$auth['application_id']?:vhm_uuid(isset($body['application_id'])?(string)$body['application_id']:null,'application_id',$requestId);
$check=$pdo->prepare('SELECT h.id FROM vhm_digital_humans h JOIN vhm_identities i ON i.id=h.identity_id AND i.organisation_id=h.organisation_id WHERE h.id=? AND h.organisation_id=? AND h.status="active" AND i.consent_status="approved" AND i.consent_complete=1 AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at>UTC_TIMESTAMP())');
$check->execute([$humanId,$auth['organisation_id']]); if (!$check->fetch()) vhm_error('Digital human is not permitted for new sessions','IDENTITY_NOT_PERMITTED',409,$requestId);
$mode=(string)($body['practice_mode']??'guided'); if (!in_array($mode,['realistic','guided','quick','confidence'],true)) vhm_error('Invalid practice mode','VALIDATION_ERROR',422,$requestId);
$id=vhm_new_uuid(); $ownerHash=hash('sha256',vhm_required_string($body,'owner_reference',$requestId,200)); $transcript=!empty($body['transcript_consent'])?1:0; $recording=!empty($body['recording_consent'])?1:0;
$pdo->prepare('INSERT INTO vhm_sessions(id,organisation_id,application_id,digital_human_id,owner_reference_hash,practice_mode,status,avatar_mode,transcript_consent,recording_consent,created_at) VALUES(?,?,?,?,?,?,"created","audio-only",?,?,UTC_TIMESTAMP())')->execute([$id,$auth['organisation_id'],$applicationId,$humanId,$ownerHash,$mode,$transcript,$recording]);
vhm_audit($pdo,$auth,'session.create','session',$id,$requestId,['mode'=>$mode]); vhm_success(['id'=>$id,'status'=>'created','avatar_mode'=>'audio-only','transcript_consent'=>(bool)$transcript,'employer_answer_access'=>false],$requestId,201);

