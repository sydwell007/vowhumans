<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/bootstrap.php';
$method=vhm_method(['GET','POST'],$requestId);
if ($method==='GET') {
    $auth=vhm_require_scope($pdo,'personas:read',$requestId);
    $stmt=$pdo->prepare('SELECT p.id,p.name,p.description,v.id AS version_id,v.version,v.status,v.role,v.language,v.created_at FROM vhm_personas p LEFT JOIN vhm_persona_versions v ON v.id=(SELECT pv.id FROM vhm_persona_versions pv WHERE pv.persona_id=p.id ORDER BY pv.version DESC LIMIT 1) WHERE p.organisation_id=? ORDER BY p.name');
    $stmt->execute([$auth['organisation_id']]); vhm_success(['items'=>$stmt->fetchAll()],$requestId);
}
$auth=vhm_require_scope($pdo,'personas:write',$requestId); $body=vhm_body($requestId); $personaId=isset($body['persona_id'])?vhm_uuid((string)$body['persona_id'],'persona_id',$requestId):vhm_new_uuid();
$name=vhm_required_string($body,'name',$requestId,180); $role=vhm_required_string($body,'role',$requestId,180); $instructions=vhm_required_string($body,'system_instructions',$requestId,20000); $opening=vhm_required_string($body,'opening_message',$requestId,2000);
$pdo->beginTransaction();
try {
    $exists=$pdo->prepare('SELECT id FROM vhm_personas WHERE id=? AND organisation_id=?'); $exists->execute([$personaId,$auth['organisation_id']]);
    if (!$exists->fetch()) $pdo->prepare('INSERT INTO vhm_personas(id,organisation_id,name,description,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())')->execute([$personaId,$auth['organisation_id'],$name,(string)($body['description']??'')]);
    $next=$pdo->prepare('SELECT COALESCE(MAX(version),0)+1 FROM vhm_persona_versions WHERE persona_id=?'); $next->execute([$personaId]); $version=(int)$next->fetchColumn(); $versionId=vhm_new_uuid();
    $pdo->prepare('INSERT INTO vhm_persona_versions(id,organisation_id,persona_id,version,status,role,system_instructions,conversation_style,opening_message,language,max_response_words,created_at) VALUES(?,?,?,?,"draft",?,?,?,?,?,?,UTC_TIMESTAMP())')->execute([$versionId,$auth['organisation_id'],$personaId,$version,$role,$instructions,(string)($body['conversation_style']??'Professional and concise'),$opening,(string)($body['language']??'en-ZA'),(int)($body['max_response_words']??150)]);
    vhm_audit($pdo,$auth,'persona_version.create','persona_version',$versionId,$requestId,['version'=>$version]); $pdo->commit();
    vhm_success(['persona_id'=>$personaId,'version_id'=>$versionId,'version'=>$version,'status'=>'draft'], $requestId,201);
} catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }

