<?php
declare(strict_types=1);
namespace VowHumans;

interface NotificationAdapter { public function send(string $templateCode,string $recipient,array $data,string $idempotencyKey): array; }
final class DisabledNotificationAdapter implements NotificationAdapter {
    public function send(string $templateCode,string $recipient,array $data,string $idempotencyKey): array { throw new \RuntimeException('EMAIL_PROVIDER_DISABLED'); }
}
