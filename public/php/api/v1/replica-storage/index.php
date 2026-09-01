<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/storage-bootstrap.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = isset($_GET['action']) && is_string($_GET['action']) ? strtolower($_GET['action']) : '';
$rawObjectKey = isset($_GET['object_key']) && is_string($_GET['object_key']) ? $_GET['object_key'] : '';
$objectKey = vhm_storage_object_key($rawObjectKey, $requestId);

if ($action === 'download' && $method === 'GET') vhm_storage_download($storage, $objectKey, $requestId);
if (!in_array($method, ['GET', 'POST', 'PUT'], true) || !in_array($action, ['put', 'put-part', 'complete', 'head', 'download-token'], true)) {
    vhm_error('Private storage action not found', 'NOT_FOUND', 404, $requestId);
}

$declaredLength = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
if ($declaredLength > $storage['max_chunk_bytes']) vhm_error('Private storage request is too large', 'STORAGE_BODY_TOO_LARGE', 413, $requestId);
$body = file_get_contents('php://input');
if ($body === false || strlen($body) > $storage['max_chunk_bytes']) vhm_error('Private storage request body is invalid', 'INVALID_BODY', 400, $requestId);
vhm_storage_verify_request($storage, $method, $action, $objectKey, $body, $requestId);

if ($action === 'put' && $method === 'PUT') vhm_success(vhm_storage_put($storage, $objectKey, $body, $requestId), $requestId, 201);
if ($action === 'put-part' && $method === 'PUT') vhm_success(vhm_storage_put_part($storage, $objectKey, $body, $requestId), $requestId, 201);
if ($action === 'complete' && $method === 'POST') vhm_success(vhm_storage_complete($storage, $objectKey, $requestId), $requestId);
if ($action === 'head' && $method === 'POST') vhm_success(vhm_storage_head($storage, $objectKey, $requestId), $requestId);
if ($action === 'download-token' && $method === 'POST') vhm_success(vhm_storage_download_token($storage, $objectKey, $requestId), $requestId);
vhm_error('Method not allowed for private storage action', 'METHOD_NOT_ALLOWED', 405, $requestId);
