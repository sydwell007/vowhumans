<?php
declare(strict_types=1);

function vhm_storage_header(string $name): string {
    $serverName = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $value = $_SERVER[$serverName] ?? '';
    return is_string($value) ? trim($value) : '';
}

/**
 * Resolve the storage block from the live configuration.
 *
 * Older VowHumans Afrihost installations predate `private_storage` but already
 * share a strong platform service key with Vercel. Keep those installations
 * deployable by deriving a purpose-separated encryption key from that existing
 * secret. An explicit private_storage block always wins.
 */
function vhm_private_storage_settings(array $config): array {
    $configured = $config['private_storage'] ?? null;
    if (is_array($configured) && $configured !== []) return $configured;

    $platform = $config['platform'] ?? null;
    $sharedSecret = is_array($platform) && is_string($platform['service_api_key'] ?? null)
        ? trim((string)$platform['service_api_key'])
        : '';
    if (strlen($sharedSecret) < 32) return [];

    $baseUrl = is_array($platform) && is_string($platform['base_url'] ?? null)
        ? rtrim((string)$platform['base_url'], '/')
        : 'https://api.vowhumans.com';
    $home = getenv('HOME');
    $storageHome = is_string($home) && str_starts_with($home, '/')
        ? rtrim($home, '/\\')
        : '/home/vowhumg0z5c9';

    return [
        'root' => $storageHome . '/vowhumans-private',
        'public_url' => $baseUrl . '/api/v1/replica-storage/',
        'secret' => $sharedSecret,
        'encryption_key' => base64_encode(hash_hmac('sha256', 'vowhumans-private-storage-encryption-v1', $sharedSecret, true)),
        'max_chunk_bytes' => 3145728,
    ];
}

function vhm_private_storage_config(array $input, string $requestId): array {
    $root = isset($input['root']) && is_string($input['root']) ? rtrim($input['root'], '/\\') : '';
    $secret = isset($input['secret']) && is_string($input['secret']) ? $input['secret'] : '';
    $encodedKey = isset($input['encryption_key']) && is_string($input['encryption_key']) ? $input['encryption_key'] : '';
    $publicUrl = isset($input['public_url']) && is_string($input['public_url']) ? rtrim($input['public_url'], '/') . '/' : '';
    $maxChunkBytes = isset($input['max_chunk_bytes']) ? (int)$input['max_chunk_bytes'] : 3145728;
    $encryptionKey = base64_decode($encodedKey, true);
    $absolutePath = $root !== '' && ($root[0] === '/' || preg_match('/^[A-Za-z]:[\\\\\/]/', $root) === 1);
    if (!$absolutePath || strlen($secret) < 32 || !is_string($encryptionKey) || strlen($encryptionKey) !== 32 || !function_exists('openssl_encrypt') || !function_exists('openssl_decrypt')) {
        vhm_error('Private storage configuration is incomplete', 'STORAGE_CONFIG_INVALID', 503, $requestId);
    }
    if (!preg_match('#^https://#i', $publicUrl) || $maxChunkBytes < 1048576 || $maxChunkBytes > 4194304) {
        vhm_error('Private storage configuration is invalid', 'STORAGE_CONFIG_INVALID', 503, $requestId);
    }
    if (!is_dir($root) && !mkdir($root, 0700, true) && !is_dir($root)) {
        vhm_error('Private storage directory is unavailable', 'STORAGE_ROOT_UNAVAILABLE', 503, $requestId);
    }
    $resolvedRoot = realpath($root);
    $documentRoot = isset($_SERVER['DOCUMENT_ROOT']) && is_string($_SERVER['DOCUMENT_ROOT']) ? realpath($_SERVER['DOCUMENT_ROOT']) : false;
    if ($resolvedRoot === false || ($documentRoot !== false && ($resolvedRoot === $documentRoot || str_starts_with($resolvedRoot . DIRECTORY_SEPARATOR, $documentRoot . DIRECTORY_SEPARATOR)))) {
        vhm_error('Private storage must be outside the public web root', 'STORAGE_ROOT_PUBLIC', 503, $requestId);
    }
    foreach (['objects', 'nonces'] as $directory) {
        $path = $resolvedRoot . DIRECTORY_SEPARATOR . $directory;
        if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
            vhm_error('Private storage directory is unavailable', 'STORAGE_ROOT_UNAVAILABLE', 503, $requestId);
        }
    }
    return [
        'root' => $resolvedRoot,
        'secret' => $secret,
        'encryption_key' => $encryptionKey,
        'public_url' => $publicUrl,
        'max_chunk_bytes' => $maxChunkBytes,
    ];
}

function vhm_storage_object_key(string $value, string $requestId): string {
    $uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
    $capture = "organisations/{$uuid}/replicas/{$uuid}/captures/{$uuid}/{$uuid}\\.(?:webm|mp4|mov)";
    $manifest = "organisations/{$uuid}/replicas/{$uuid}/versions/[1-9][0-9]*/manifest\\.json";
    if (strlen($value) > 300 || preg_match("#^(?:{$capture}|{$manifest})$#i", $value) !== 1) {
        vhm_error('Invalid private object key', 'STORAGE_KEY_INVALID', 422, $requestId);
    }
    return strtolower($value);
}

function vhm_storage_object_directory(array $storage, string $objectKey): string {
    $hash = hash('sha256', $objectKey);
    return $storage['root'] . DIRECTORY_SEPARATOR . 'objects' . DIRECTORY_SEPARATOR . substr($hash, 0, 2) . DIRECTORY_SEPARATOR . $hash;
}

function vhm_storage_require_directory(string $path): void {
    if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
        throw new RuntimeException('Could not create the private object directory.');
    }
}

function vhm_storage_atomic_write(string $path, string $contents): void {
    $temporary = $path . '.tmp-' . bin2hex(random_bytes(8));
    if (file_put_contents($temporary, $contents, LOCK_EX) === false) throw new RuntimeException('Could not write a private object.');
    chmod($temporary, 0600);
    if (!rename($temporary, $path)) {
        @unlink($temporary);
        throw new RuntimeException('Could not finalise a private object.');
    }
}

function vhm_storage_verify_request(array $storage, string $method, string $action, string $objectKey, string $body, string $requestId): void {
    $timestamp = vhm_storage_header('X-VowHumans-Storage-Timestamp');
    $nonce = strtolower(vhm_storage_header('X-VowHumans-Storage-Nonce'));
    $declaredBodyHash = strtolower(vhm_storage_header('X-VowHumans-Storage-Body-Sha256'));
    $providedSignature = strtolower(vhm_storage_header('X-VowHumans-Storage-Signature'));
    if (!ctype_digit($timestamp) || abs(time() - (int)$timestamp) > 300 || preg_match('/^[0-9a-f-]{36}$/', $nonce) !== 1 || preg_match('/^[0-9a-f]{64}$/', $declaredBodyHash) !== 1 || preg_match('/^[0-9a-f]{64}$/', $providedSignature) !== 1) {
        vhm_error('Unauthorised private storage request', 'STORAGE_UNAUTHORISED', 401, $requestId);
    }
    $actualBodyHash = hash('sha256', $body);
    $canonical = strtoupper($method) . "\n" . $action . "\n" . $timestamp . "\n" . $nonce . "\n" . $objectKey . "\n" . $declaredBodyHash;
    $expectedSignature = hash_hmac('sha256', $canonical, $storage['secret']);
    if (!hash_equals($declaredBodyHash, $actualBodyHash) || !hash_equals($expectedSignature, $providedSignature)) {
        vhm_error('Unauthorised private storage request', 'STORAGE_UNAUTHORISED', 401, $requestId);
    }
    $noncePath = $storage['root'] . DIRECTORY_SEPARATOR . 'nonces' . DIRECTORY_SEPARATOR . hash('sha256', $nonce);
    $handle = @fopen($noncePath, 'x');
    if ($handle === false) vhm_error('Private storage request was already used', 'STORAGE_REPLAY_BLOCKED', 409, $requestId);
    fwrite($handle, $timestamp);
    fclose($handle);
    chmod($noncePath, 0600);
    if (random_int(1, 50) === 1) {
        foreach (glob($storage['root'] . DIRECTORY_SEPARATOR . 'nonces' . DIRECTORY_SEPARATOR . '*') ?: [] as $candidate) {
            if (is_file($candidate) && filemtime($candidate) !== false && filemtime($candidate) < time() - 600) @unlink($candidate);
        }
    }
}

function vhm_storage_positive_header(string $name, int $maximum, string $requestId): int {
    $raw = vhm_storage_header($name);
    if ($raw === '' || !ctype_digit($raw) || (int)$raw < 1 || (int)$raw > $maximum) {
        vhm_error('Invalid private storage metadata', 'STORAGE_METADATA_INVALID', 422, $requestId, ['field'=>$name]);
    }
    return (int)$raw;
}

function vhm_storage_sha_header(string $name, string $requestId): string {
    $value = strtolower(vhm_storage_header($name));
    if (preg_match('/^[0-9a-f]{64}$/', $value) !== 1) vhm_error('Invalid private storage integrity metadata', 'STORAGE_METADATA_INVALID', 422, $requestId, ['field'=>$name]);
    return $value;
}

function vhm_storage_content_type(string $value, string $requestId): string {
    $type = strtolower(trim(explode(';', $value)[0]));
    if (!in_array($type, ['video/webm', 'video/mp4', 'video/quicktime', 'application/json'], true)) {
        vhm_error('Unsupported private object type', 'STORAGE_MEDIA_UNSUPPORTED', 415, $requestId);
    }
    return $type;
}

function vhm_storage_classification(string $requestId): string {
    $value = vhm_storage_header('X-VowHumans-Classification');
    if (!in_array($value, ['biometric-capture', 'biometric-derived'], true)) {
        vhm_error('Invalid private object classification', 'STORAGE_METADATA_INVALID', 422, $requestId);
    }
    return $value;
}

function vhm_storage_encrypt_part(array $storage, string $directory, int $partNumber, string $plaintext, string $sha256): array {
    vhm_storage_require_directory($directory . DIRECTORY_SEPARATOR . 'parts');
    $iv = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $storage['encryption_key'], OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    if (!is_string($ciphertext)) throw new RuntimeException('Could not encrypt a private object.');
    $fileName = sprintf('%06d.bin', $partNumber);
    vhm_storage_atomic_write($directory . DIRECTORY_SEPARATOR . 'parts' . DIRECTORY_SEPARATOR . $fileName, $ciphertext);
    $metadata = [
        'number'=>$partNumber,
        'file'=>$fileName,
        'plaintext_bytes'=>strlen($plaintext),
        'sha256'=>$sha256,
        'iv'=>base64_encode($iv),
        'tag'=>base64_encode($tag),
    ];
    vhm_storage_atomic_write($directory . DIRECTORY_SEPARATOR . 'parts' . DIRECTORY_SEPARATOR . sprintf('%06d.json', $partNumber), json_encode($metadata, JSON_THROW_ON_ERROR));
    return $metadata;
}

function vhm_storage_decrypt_part(array $storage, string $directory, array $part): string {
    $ciphertext = file_get_contents($directory . DIRECTORY_SEPARATOR . 'parts' . DIRECTORY_SEPARATOR . (string)$part['file']);
    $iv = base64_decode((string)($part['iv'] ?? ''), true);
    $tag = base64_decode((string)($part['tag'] ?? ''), true);
    if ($ciphertext === false || !is_string($iv) || !is_string($tag)) throw new RuntimeException('Private object part is unavailable.');
    $plaintext = openssl_decrypt($ciphertext, 'aes-256-gcm', $storage['encryption_key'], OPENSSL_RAW_DATA, $iv, $tag, '');
    if (!is_string($plaintext) || strlen($plaintext) !== (int)($part['plaintext_bytes'] ?? -1) || !hash_equals((string)($part['sha256'] ?? ''), hash('sha256', $plaintext))) {
        throw new RuntimeException('Private object integrity verification failed.');
    }
    return $plaintext;
}

function vhm_storage_write_manifest(array $storage, string $directory, array $manifest): void {
    $payload = json_encode($manifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    $envelope = json_encode(['payload'=>$manifest,'hmac'=>hash_hmac('sha256', $payload, $storage['secret'])], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    vhm_storage_atomic_write($directory . DIRECTORY_SEPARATOR . 'manifest.json', $envelope);
}

function vhm_storage_read_manifest(array $storage, string $directory, string $requestId): array {
    $raw = file_get_contents($directory . DIRECTORY_SEPARATOR . 'manifest.json');
    if ($raw === false) vhm_error('Private object not found', 'STORAGE_OBJECT_NOT_FOUND', 404, $requestId);
    try { $envelope = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); } catch (JsonException) { throw new RuntimeException('Private object manifest is invalid.'); }
    $manifest = is_array($envelope) && is_array($envelope['payload'] ?? null) ? $envelope['payload'] : null;
    $hmac = is_array($envelope) && is_string($envelope['hmac'] ?? null) ? $envelope['hmac'] : '';
    $payload = is_array($manifest) ? json_encode($manifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) : '';
    if (!is_array($manifest) || !hash_equals(hash_hmac('sha256', $payload, $storage['secret']), $hmac)) throw new RuntimeException('Private object manifest authentication failed.');
    if (!is_array($manifest) || ($manifest['finalised'] ?? false) !== true || !is_array($manifest['parts'] ?? null)) throw new RuntimeException('Private object is incomplete.');
    return $manifest;
}

function vhm_storage_put(array $storage, string $objectKey, string $body, string $requestId): array {
    if ($body === '' || strlen($body) > $storage['max_chunk_bytes']) vhm_error('Private object exceeds the per-request limit', 'STORAGE_BODY_TOO_LARGE', 413, $requestId);
    $sha256 = vhm_storage_sha_header('X-VowHumans-Object-Sha256', $requestId);
    $bytes = vhm_storage_positive_header('X-VowHumans-Object-Bytes', $storage['max_chunk_bytes'], $requestId);
    if ($bytes !== strlen($body) || !hash_equals($sha256, hash('sha256', $body))) vhm_error('Private object integrity check failed', 'STORAGE_INTEGRITY_FAILED', 409, $requestId);
    $contentType = vhm_storage_content_type($_SERVER['CONTENT_TYPE'] ?? '', $requestId);
    $classification = vhm_storage_classification($requestId);
    $directory = vhm_storage_object_directory($storage, $objectKey);
    vhm_storage_require_directory($directory);
    $part = vhm_storage_encrypt_part($storage, $directory, 1, $body, $sha256);
    vhm_storage_write_manifest($storage, $directory, ['version'=>1,'object_key'=>$objectKey,'content_type'=>$contentType,'classification'=>$classification,'byte_size'=>$bytes,'sha256'=>$sha256,'finalised'=>true,'parts'=>[$part],'created_at'=>gmdate(DATE_ATOM)]);
    return ['stored'=>true,'encrypted_at_rest'=>true,'byte_size'=>$bytes];
}

function vhm_storage_put_part(array $storage, string $objectKey, string $body, string $requestId): array {
    if ($body === '' || strlen($body) > $storage['max_chunk_bytes']) vhm_error('Private upload part exceeds the per-request limit', 'STORAGE_BODY_TOO_LARGE', 413, $requestId);
    $partNumber = vhm_storage_positive_header('X-VowHumans-Part-Number', 256, $requestId);
    $totalParts = vhm_storage_positive_header('X-VowHumans-Total-Parts', 256, $requestId);
    if ($partNumber > $totalParts) vhm_error('Invalid private upload part', 'STORAGE_METADATA_INVALID', 422, $requestId);
    $sha256 = vhm_storage_sha_header('X-VowHumans-Part-Sha256', $requestId);
    if (!hash_equals($sha256, hash('sha256', $body))) vhm_error('Private upload part integrity check failed', 'STORAGE_INTEGRITY_FAILED', 409, $requestId);
    $contentType = vhm_storage_content_type($_SERVER['CONTENT_TYPE'] ?? '', $requestId);
    $classification = vhm_storage_classification($requestId);
    $directory = vhm_storage_object_directory($storage, $objectKey);
    vhm_storage_require_directory($directory);
    $part = vhm_storage_encrypt_part($storage, $directory, $partNumber, $body, $sha256);
    vhm_storage_atomic_write($directory . DIRECTORY_SEPARATOR . 'upload.json', json_encode(['object_key'=>$objectKey,'content_type'=>$contentType,'classification'=>$classification,'total_parts'=>$totalParts], JSON_THROW_ON_ERROR));
    return ['stored'=>true,'encrypted_at_rest'=>true,'part_number'=>$part['number'],'total_parts'=>$totalParts];
}

function vhm_storage_complete(array $storage, string $objectKey, string $requestId): array {
    $totalParts = vhm_storage_positive_header('X-VowHumans-Total-Parts', 256, $requestId);
    $expectedBytes = vhm_storage_positive_header('X-VowHumans-Object-Bytes', 314572800, $requestId);
    $expectedSha256 = vhm_storage_sha_header('X-VowHumans-Object-Sha256', $requestId);
    $contentType = vhm_storage_content_type(vhm_storage_header('X-VowHumans-Content-Type'), $requestId);
    $classification = vhm_storage_classification($requestId);
    $directory = vhm_storage_object_directory($storage, $objectKey);
    $parts = [];
    $bytes = 0;
    $hash = hash_init('sha256');
    for ($partNumber = 1; $partNumber <= $totalParts; $partNumber++) {
        $metadataPath = $directory . DIRECTORY_SEPARATOR . 'parts' . DIRECTORY_SEPARATOR . sprintf('%06d.json', $partNumber);
        $raw = file_get_contents($metadataPath);
        if ($raw === false) vhm_error('Private upload is incomplete', 'STORAGE_PART_MISSING', 409, $requestId, ['part'=>$partNumber]);
        try { $part = json_decode($raw, true, 16, JSON_THROW_ON_ERROR); } catch (JsonException) { throw new RuntimeException('Private upload part metadata is invalid.'); }
        if (!is_array($part) || (int)($part['number'] ?? 0) !== $partNumber) throw new RuntimeException('Private upload part order is invalid.');
        $plaintext = vhm_storage_decrypt_part($storage, $directory, $part);
        $bytes += strlen($plaintext);
        hash_update($hash, $plaintext);
        $parts[] = $part;
    }
    $actualSha256 = hash_final($hash);
    if ($bytes !== $expectedBytes || !hash_equals($expectedSha256, $actualSha256)) vhm_error('Completed private object failed its integrity check', 'STORAGE_INTEGRITY_FAILED', 409, $requestId);
    vhm_storage_write_manifest($storage, $directory, ['version'=>1,'object_key'=>$objectKey,'content_type'=>$contentType,'classification'=>$classification,'byte_size'=>$bytes,'sha256'=>$actualSha256,'finalised'=>true,'parts'=>$parts,'created_at'=>gmdate(DATE_ATOM)]);
    return ['completed'=>true,'encrypted_at_rest'=>true,'byte_size'=>$bytes,'sha256'=>$actualSha256];
}

function vhm_storage_head(array $storage, string $objectKey, string $requestId): array {
    $manifest = vhm_storage_read_manifest($storage, vhm_storage_object_directory($storage, $objectKey), $requestId);
    return ['byte_size'=>(int)$manifest['byte_size'],'sha256'=>(string)$manifest['sha256'],'content_type'=>(string)$manifest['content_type'],'classification'=>(string)$manifest['classification'],'encrypted_at_rest'=>true];
}

function vhm_storage_download_token(array $storage, string $objectKey, string $requestId): array {
    vhm_storage_read_manifest($storage, vhm_storage_object_directory($storage, $objectKey), $requestId);
    $expires = time() + 900;
    $token = hash_hmac('sha256', "download\n{$expires}\n{$objectKey}", $storage['secret']);
    return ['url'=>$storage['public_url'] . '?action=download&object_key=' . rawurlencode($objectKey) . '&expires=' . $expires . '&token=' . $token,'expires_in_seconds'=>900];
}

function vhm_storage_download(array $storage, string $objectKey, string $requestId): never {
    $expires = isset($_GET['expires']) && is_string($_GET['expires']) && ctype_digit($_GET['expires']) ? (int)$_GET['expires'] : 0;
    $provided = isset($_GET['token']) && is_string($_GET['token']) ? strtolower($_GET['token']) : '';
    $expected = hash_hmac('sha256', "download\n{$expires}\n{$objectKey}", $storage['secret']);
    if ($expires < time() || $expires > time() + 901 || preg_match('/^[0-9a-f]{64}$/', $provided) !== 1 || !hash_equals($expected, $provided)) {
        vhm_error('Private download link is invalid or expired', 'STORAGE_DOWNLOAD_UNAUTHORISED', 401, $requestId);
    }
    $directory = vhm_storage_object_directory($storage, $objectKey);
    $manifest = vhm_storage_read_manifest($storage, $directory, $requestId);
    header('Content-Type: ' . $manifest['content_type']);
    header('Content-Length: ' . (int)$manifest['byte_size']);
    header('Content-Disposition: attachment; filename="vowhumans-private-object"');
    header('X-VowHumans-Classification: ' . $manifest['classification']);
    foreach ($manifest['parts'] as $part) {
        echo vhm_storage_decrypt_part($storage, $directory, $part);
        flush();
    }
    exit;
}
