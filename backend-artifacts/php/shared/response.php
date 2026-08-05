<?php
declare(strict_types=1);
function vhm_json(array $payload, int $status, string $requestId): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Request-ID: ' . $requestId);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function vhm_success(array $data, string $requestId, int $status = 200): never {
    vhm_json(['success'=>true,'data'=>$data,'meta'=>['request_id'=>$requestId,'timestamp'=>gmdate(DATE_ATOM)]], $status, $requestId);
}
function vhm_error(string $message, string $code, int $status, string $requestId, array $details = []): never {
    $payload=['success'=>false,'code'=>$code,'message'=>$message,'meta'=>['request_id'=>$requestId]];
    if ($details !== []) $payload['details']=$details;
    vhm_json($payload,$status,$requestId);
}

