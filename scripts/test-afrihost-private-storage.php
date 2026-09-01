<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/public/php/shared/response.php';
require_once dirname(__DIR__) . '/public/php/shared/private_storage.php';

function test_assert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

function test_remove_directory(string $path): void {
    $temporaryRoot = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR;
    if (!str_starts_with($path . DIRECTORY_SEPARATOR, $temporaryRoot . 'vhm-storage-test-')) {
        throw new RuntimeException('Refusing to remove an unexpected test path.');
    }
    if (!is_dir($path)) return;
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST,
    );
    foreach ($items as $item) $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    rmdir($path);
}

$requestId = 'private-storage-test';
$root = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'vhm-storage-test-' . bin2hex(random_bytes(8));
$storage = vhm_private_storage_config([
    'root'=>$root,
    'secret'=>str_repeat('s', 48),
    'encryption_key'=>base64_encode(random_bytes(32)),
    'public_url'=>'https://api.vowhumans.com/api/v1/replica-storage/',
    'max_chunk_bytes'=>1048576,
], $requestId);

$objectKey = 'organisations/11111111-1111-4111-8111-111111111111/replicas/22222222-2222-4222-8222-222222222222/captures/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.webm';
$parts = ['authorised-performer-', 'capture-evidence'];
$complete = implode('', $parts);

try {
    $signedBody = 'signed-storage-boundary';
    $timestamp = (string)time();
    $nonce = '55555555-5555-4555-8555-555555555555';
    $bodySha256 = hash('sha256', $signedBody);
    $canonical = "PUT\nput-part\n{$timestamp}\n{$nonce}\n{$objectKey}\n{$bodySha256}";
    $_SERVER['HTTP_X_VOWHUMANS_STORAGE_TIMESTAMP'] = $timestamp;
    $_SERVER['HTTP_X_VOWHUMANS_STORAGE_NONCE'] = $nonce;
    $_SERVER['HTTP_X_VOWHUMANS_STORAGE_BODY_SHA256'] = $bodySha256;
    $_SERVER['HTTP_X_VOWHUMANS_STORAGE_SIGNATURE'] = hash_hmac('sha256', $canonical, $storage['secret']);
    vhm_storage_verify_request($storage, 'PUT', 'put-part', $objectKey, $signedBody, $requestId);
    test_assert(is_file($storage['root'] . DIRECTORY_SEPARATOR . 'nonces' . DIRECTORY_SEPARATOR . hash('sha256', $nonce)), 'Signed request nonce was not recorded.');

    foreach ($parts as $index => $part) {
        $_SERVER['CONTENT_TYPE'] = 'video/webm';
        $_SERVER['HTTP_X_VOWHUMANS_PART_NUMBER'] = (string)($index + 1);
        $_SERVER['HTTP_X_VOWHUMANS_TOTAL_PARTS'] = (string)count($parts);
        $_SERVER['HTTP_X_VOWHUMANS_PART_SHA256'] = hash('sha256', $part);
        $_SERVER['HTTP_X_VOWHUMANS_CLASSIFICATION'] = 'biometric-capture';
        vhm_storage_put_part($storage, $objectKey, $part, $requestId);
    }
    $_SERVER['HTTP_X_VOWHUMANS_TOTAL_PARTS'] = (string)count($parts);
    $_SERVER['HTTP_X_VOWHUMANS_OBJECT_BYTES'] = (string)strlen($complete);
    $_SERVER['HTTP_X_VOWHUMANS_OBJECT_SHA256'] = hash('sha256', $complete);
    $_SERVER['HTTP_X_VOWHUMANS_CONTENT_TYPE'] = 'video/webm';
    $_SERVER['HTTP_X_VOWHUMANS_CLASSIFICATION'] = 'biometric-capture';
    vhm_storage_complete($storage, $objectKey, $requestId);

    $head = vhm_storage_head($storage, $objectKey, $requestId);
    test_assert($head['byte_size'] === strlen($complete), 'Final byte size did not match.');
    test_assert($head['sha256'] === hash('sha256', $complete), 'Final SHA-256 did not match.');
    $directory = vhm_storage_object_directory($storage, $objectKey);
    $ciphertext = file_get_contents($directory . DIRECTORY_SEPARATOR . 'parts' . DIRECTORY_SEPARATOR . '000001.bin');
    test_assert(is_string($ciphertext) && !str_contains($ciphertext, $parts[0]), 'Plaintext leaked into the stored encrypted part.');
    $manifest = vhm_storage_read_manifest($storage, $directory, $requestId);
    $restored = '';
    foreach ($manifest['parts'] as $part) $restored .= vhm_storage_decrypt_part($storage, $directory, $part);
    test_assert($restored === $complete, 'Encrypted parts did not round-trip.');
    echo "Afrihost private storage encryption and chunk integrity: PASS\n";
} finally {
    test_remove_directory($root);
}
