<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/bootstrap.php';
$method=vhm_method(['GET','POST'],$requestId);
if ($method==='GET') { $auth=vhm_require_scope($pdo,'renders:read',$requestId); $stmt=$pdo->prepare('SELECT id,title,course,module,lesson,aspect_ratio,output_language,status,created_at FROM vhm_presenter_projects WHERE organisation_id=? ORDER BY created_at DESC'); $stmt->execute([$auth['organisation_id']]); vhm_success(['items'=>$stmt->fetchAll()],$requestId); }
$auth=vhm_require_scope($pdo,'renders:create',$requestId); $body=vhm_body($requestId); $humanId=vhm_uuid(isset($body['digital_human_id'])?(string)$body['digital_human_id']:null,'digital_human_id',$requestId);
$allowed=$pdo->prepare('SELECT h.id FROM vhm_digital_humans h JOIN vhm_identities i ON i.id=h.identity_id WHERE h.id=? AND h.organisation_id=? AND h.status="active" AND i.consent_status="approved" AND i.consent_complete=1 AND i.revoked_at IS NULL'); $allowed->execute([$humanId,$auth['organisation_id']]); if(!$allowed->fetch()) vhm_error('Identity not permitted for rendering','IDENTITY_NOT_PERMITTED',409,$requestId);
$id=vhm_new_uuid(); $title=vhm_required_string($body,'title',$requestId,180); $script=vhm_required_string($body,'script',$requestId,100000); $ratio=(string)($body['aspect_ratio']??'16:9'); if(!in_array($ratio,['16:9','9:16','1:1','audio'],true))vhm_error('Invalid aspect ratio','VALIDATION_ERROR',422,$requestId);
$pdo->prepare('INSERT INTO vhm_presenter_projects(id,organisation_id,application_id,digital_human_id,title,course,module,lesson,script,aspect_ratio,output_language,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,"draft",UTC_TIMESTAMP())')->execute([$id,$auth['organisation_id'],$auth['application_id'],$humanId,$title,(string)($body['course']??''),(string)($body['module']??''),(string)($body['lesson']??''),$script,$ratio,(string)($body['output_language']??'en-ZA')]);
vhm_audit($pdo,$auth,'presenter_project.create','presenter_project',$id,$requestId); vhm_success(['id'=>$id,'status'=>'draft','render_mode'=>'external-worker-required'],$requestId,201);

