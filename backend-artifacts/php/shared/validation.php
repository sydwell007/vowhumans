<?php
declare(strict_types=1);
function vhm_body(string $requestId): array {
    $raw=file_get_contents('php://input');
    if ($raw===false || strlen($raw)>1048576) vhm_error('Invalid request body','INVALID_BODY',400,$requestId);
    if ($raw==='') return [];
    try { $data=json_decode($raw,true,32,JSON_THROW_ON_ERROR); } catch (JsonException) { vhm_error('Malformed JSON','MALFORMED_JSON',400,$requestId); }
    if (!is_array($data)) vhm_error('JSON object required','INVALID_BODY',400,$requestId);
    return $data;
}
function vhm_method(array $allowed, string $requestId): string {
    $method=$_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method,$allowed,true)) { header('Allow: '.implode(', ',$allowed)); vhm_error('Method not allowed','METHOD_NOT_ALLOWED',405,$requestId); }
    return $method;
}
function vhm_required_string(array $body, string $key, string $requestId, int $max=500): string {
    $value=$body[$key]??null;
    if (!is_string($value) || trim($value)==='' || mb_strlen($value)>$max) vhm_error("Invalid {$key}",'VALIDATION_ERROR',422,$requestId,['field'=>$key]);
    return trim($value);
}
function vhm_uuid(?string $value, string $field, string $requestId): string {
    if (!is_string($value) || preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',$value)!==1) vhm_error("Invalid {$field}",'VALIDATION_ERROR',422,$requestId,['field'=>$field]);
    return strtolower($value);
}
function vhm_new_uuid(): string {
    $bytes=random_bytes(16); $bytes[6]=chr((ord($bytes[6])&0x0f)|0x40); $bytes[8]=chr((ord($bytes[8])&0x3f)|0x80); $hex=bin2hex($bytes);
    return substr($hex,0,8).'-'.substr($hex,8,4).'-'.substr($hex,12,4).'-'.substr($hex,16,4).'-'.substr($hex,20);
}

