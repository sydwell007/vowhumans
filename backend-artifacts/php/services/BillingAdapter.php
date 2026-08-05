<?php
declare(strict_types=1);
namespace VowHumans;

interface BillingAdapter {
    public function createCheckout(string $organisationId, string $priceId, string $idempotencyKey): array;
    public function verifyWebhook(string $rawBody, string $signature): bool;
    public function refund(string $paymentReference, int $amountMinor, string $idempotencyKey): array;
}

final class DisabledBillingAdapter implements BillingAdapter {
    public function createCheckout(string $organisationId,string $priceId,string $idempotencyKey): array { throw new \RuntimeException('BILLING_PROVIDER_DISABLED'); }
    public function verifyWebhook(string $rawBody,string $signature): bool { return false; }
    public function refund(string $paymentReference,int $amountMinor,string $idempotencyKey): array { throw new \RuntimeException('BILLING_PROVIDER_DISABLED'); }
}
