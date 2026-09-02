<?php
declare(strict_types=1);

$configPath = getenv('VOWHUMANS_CONFIG_FILE') ?: '';
$config = null;
if ($configPath !== '' && is_file($configPath)) {
    $loaded = require $configPath;
    if (is_array($loaded)) $config = $loaded;
}
if (!is_array($config) && is_file(__DIR__ . '/config.php')) {
    $loaded = require __DIR__ . '/config.php';
    if (is_array($loaded)) $config = $loaded;
}
if (!is_array($config)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success'=>false,'code'=>'CONFIG_UNAVAILABLE','message'=>'Service configuration unavailable']);
    exit;
}

require_once __DIR__ . '/shared/response.php';
require_once __DIR__ . '/shared/private_storage.php';

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

$requestId = $_SERVER['HTTP_X_REQUEST_ID'] ?? bin2hex(random_bytes(12));
if (!preg_match('/^[A-Za-z0-9._:-]{8,80}$/', $requestId)) $requestId = bin2hex(random_bytes(12));
set_exception_handler(static function (Throwable $error) use ($requestId): never {
    error_log(sprintf('[VowHumans private storage:%s] %s: %s', $requestId, $error::class, $error->getMessage()));
    vhm_error('Private storage temporarily unavailable', 'STORAGE_INTERNAL_ERROR', 500, $requestId);
});

$storage = vhm_private_storage_config(vhm_private_storage_settings($config), $requestId);
