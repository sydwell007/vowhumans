<?php
declare(strict_types=1);
function vhm_require_scope(PDO $pdo, string $scope, string $requestId): array {
    $provided=$_SERVER['HTTP_X_API_KEY']??'';
    if (!is_string($provided) || strlen($provided)<24) vhm_error('Unauthorised','UNAUTHORISED',401,$requestId);
    $hash=hash('sha256',$provided);
    $stmt=$pdo->prepare('SELECT id, organisation_id, application_id, scopes_json FROM vhm_api_keys WHERE key_hash=? AND status="active" AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) LIMIT 1');
    $stmt->execute([$hash]); $key=$stmt->fetch();
    if (!$key) vhm_error('Unauthorised','UNAUTHORISED',401,$requestId);
    $scopes=json_decode((string)$key['scopes_json'],true);
    if (!is_array($scopes) || (!in_array('*',$scopes,true) && !in_array($scope,$scopes,true))) vhm_error('API key lacks required scope','FORBIDDEN',403,$requestId);
    $pdo->prepare('UPDATE vhm_api_keys SET last_used_at=UTC_TIMESTAMP() WHERE id=?')->execute([$key['id']]);
    return ['key_id'=>$key['id'],'organisation_id'=>$key['organisation_id'],'application_id'=>$key['application_id']];
}

