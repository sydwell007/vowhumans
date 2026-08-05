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
    'providers' => [
        'billing'=>['enabled'=>false], 'email'=>['enabled'=>false], 'livekit'=>['enabled'=>false],
        'object_storage'=>['enabled'=>false], 'gpu_worker'=>['enabled'=>false],
    ],
];
