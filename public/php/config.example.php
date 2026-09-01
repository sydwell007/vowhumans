<?php
declare(strict_types=1);

// TEMPLATE ONLY. Copy outside public_html and set VOWHUMANS_CONFIG_FILE.
return [
    'environment' => 'production',
    'allowed_origins' => ['https://vowhumans.com', 'https://www.vowhumans.com', 'https://humans.goalvow.co.za', 'https://plugconnect.co.za'],
    'database' => [
        'host' => 'localhost', 'port' => 3306, 'name' => 'REPLACE_DATABASE',
        'user' => 'REPLACE_USER', 'password' => 'REPLACE_PASSWORD',
    ],
    'rate_limit' => ['window_seconds' => 60, 'max_requests' => 90],
    'platform' => [
        'base_url' => 'https://api.vowhumans.com',
        'service_api_key' => 'REPLACE_WITH_SERVER_SIDE_PLATFORM_KEY',
    ],
    'webhook_secrets' => ['platform' => 'REPLACE_WITH_32_PLUS_RANDOM_BYTES'],
    'private_storage' => [
        // This must stay outside public_html on Afrihost Shared Hosting.
        'root' => '/home/vowhumg0z5c9/vowhumans-private',
        'public_url' => 'https://api.vowhumans.com/api/v1/replica-storage/',
        'secret' => 'REPLACE_WITH_32_PLUS_RANDOM_BYTES_SHARED_WITH_VERCEL',
        // Generate with: php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
        'encryption_key' => 'REPLACE_WITH_BASE64_ENCODED_32_BYTE_KEY',
        'max_chunk_bytes' => 3145728,
    ],
    'providers' => [
        'billing'=>['enabled'=>false], 'email'=>['enabled'=>false], 'livekit'=>['enabled'=>false],
        'object_storage'=>['enabled'=>false], 'gpu_worker'=>['enabled'=>false],
    ],
];
