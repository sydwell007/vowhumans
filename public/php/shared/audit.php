<?php
declare(strict_types=1);
function vhm_audit(PDO $pdo, array $auth, string $action, string $resourceType, ?string $resourceId, string $requestId, array $detail=[]): void {
    $stmt=$pdo->prepare('INSERT INTO vhm_audit_logs(id,organisation_id,api_key_id,action,resource_type,resource_id,request_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP())');
    $stmt->execute([vhm_new_uuid(),$auth['organisation_id'],$auth['key_id'],$action,$resourceType,$resourceId,$requestId,json_encode($detail,JSON_UNESCAPED_SLASHES)]);
}

