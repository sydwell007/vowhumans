<?php
declare(strict_types=1);

$configPath = getenv('VOWHUMANS_CONFIG_FILE') ?: '';
$config = null;
if ($configPath !== '' && is_file($configPath)) {
    $loaded = require $configPath;
    if (is_array($loaded)) $config = $loaded;
}
// Local fallback for Afrihost accounts that cannot set environment variables.
// .htaccess denies web access; placing config outside public_html is still preferred.
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
require_once __DIR__ . '/shared/cors.php';
require_once __DIR__ . '/shared/db.php';
require_once __DIR__ . '/shared/validation.php';
require_once __DIR__ . '/shared/auth.php';
require_once __DIR__ . '/shared/rate_limit.php';
require_once __DIR__ . '/shared/audit.php';
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

$requestId = $_SERVER['HTTP_X_REQUEST_ID'] ?? bin2hex(random_bytes(12));
if (!preg_match('/^[A-Za-z0-9._:-]{8,80}$/', $requestId)) $requestId = bin2hex(random_bytes(12));
set_exception_handler(static function (Throwable $error) use ($requestId): never {
    error_log(sprintf('[VowHumans:%s] %s: %s', $requestId, $error::class, $error->getMessage()));
    vhm_error('Service temporarily unavailable', 'INTERNAL_ERROR', 500, $requestId);
});
vhm_apply_cors($config['allowed_origins'] ?? []);
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }
$pdo = vhm_db($config['database'] ?? []);
