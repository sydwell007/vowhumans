<?php
declare(strict_types=1);

$configPath = getenv('VOWHUMANS_CONFIG_FILE') ?: '';
$externalConfig = null;
if ($configPath !== '' && is_file($configPath)) {
    $loaded = require $configPath;
    if (is_array($loaded)) $externalConfig = $loaded;
}
$localConfig = null;
if (is_file(__DIR__ . '/config.php')) {
    $loaded = require __DIR__ . '/config.php';
    if (is_array($loaded)) $localConfig = $loaded;
}
$config = is_array($externalConfig) ? $externalConfig : $localConfig;
// Some established cPanel deployments point VOWHUMANS_CONFIG_FILE at an
// older database-only configuration. Allow the protected local configuration
// to supply only the missing storage authentication sections; never merge or
// override database credentials here.
if (is_array($config) && is_array($localConfig) && $config !== $localConfig) {
    foreach (['platform', 'private_storage'] as $section) {
        if (!isset($localConfig[$section]) || !is_array($localConfig[$section])) continue;
        if (!isset($config[$section]) || !is_array($config[$section])) $config[$section] = [];
        foreach ($localConfig[$section] as $key => $value) {
            if (!array_key_exists($key, $config[$section]) || $config[$section][$key] === '' || $config[$section][$key] === null) {
                $config[$section][$key] = $value;
            }
        }
    }
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
header('X-VowHumans-Storage-Version: 2026-09-03.3');

$requestId = $_SERVER['HTTP_X_REQUEST_ID'] ?? bin2hex(random_bytes(12));
if (!preg_match('/^[A-Za-z0-9._:-]{8,80}$/', $requestId)) $requestId = bin2hex(random_bytes(12));
$storageStage = 'resolve_settings';
set_exception_handler(static function (Throwable $error) use ($requestId, &$storageStage): never {
    error_log(sprintf('[VowHumans private storage:%s] %s: %s', $requestId, $error::class, $error->getMessage()));
    vhm_error('Private storage temporarily unavailable', 'STORAGE_INTERNAL_ERROR', 500, $requestId, [
        'stage' => $storageStage,
        'error_type' => $error::class,
        'storage_version' => '2026-09-03.3',
    ]);
});

// Keep storage bootstrapping compatible with a rolling cPanel upload. The
// shared helper and this bootstrap can briefly be at different revisions when
// files are uploaded one at a time; do not turn that harmless deployment
// window into a generic 500 response.
if (function_exists('vhm_private_storage_settings')) {
    $storageSettings = vhm_private_storage_settings($config);
} else {
    $storageSettings = $config['private_storage'] ?? [];
}

if (!is_array($storageSettings)) $storageSettings = [];
$platform = $config['platform'] ?? [];
$sharedSecret = is_array($platform) && is_string($platform['service_api_key'] ?? null)
    ? trim((string)$platform['service_api_key'])
    : '';
$baseUrl = is_array($platform) && is_string($platform['base_url'] ?? null)
    ? rtrim((string)$platform['base_url'], '/')
    : 'https://api.vowhumans.com';
if ((!is_string($storageSettings['secret'] ?? null) || strlen(trim((string)$storageSettings['secret'])) < 32) && strlen($sharedSecret) >= 32) {
    $storageSettings['secret'] = $sharedSecret;
}
$resolvedSecret = is_string($storageSettings['secret'] ?? null) ? trim((string)$storageSettings['secret']) : '';
$encodedEncryptionKey = is_string($storageSettings['encryption_key'] ?? null) ? trim((string)$storageSettings['encryption_key']) : '';
$decodedEncryptionKey = $encodedEncryptionKey !== '' ? base64_decode($encodedEncryptionKey, true) : false;
if ((!is_string($decodedEncryptionKey) || strlen($decodedEncryptionKey) !== 32) && strlen($resolvedSecret) >= 32) {
    $storageSettings['encryption_key'] = base64_encode(hash_hmac('sha256', 'vowhumans-private-storage-encryption-v1', $resolvedSecret, true));
}
if (!is_string($storageSettings['root'] ?? null) || $storageSettings['root'] === '') $storageSettings['root'] = '/home/vowhumg0z5c9/vowhumans-private';
if (!is_string($storageSettings['public_url'] ?? null) || $storageSettings['public_url'] === '') $storageSettings['public_url'] = $baseUrl . '/api/v1/replica-storage/';
if (!isset($storageSettings['max_chunk_bytes'])) $storageSettings['max_chunk_bytes'] = 3145728;

$storageStage = 'initialise_storage';
$storage = vhm_private_storage_config(is_array($storageSettings) ? $storageSettings : [], $requestId);
$storageStage = 'ready';
