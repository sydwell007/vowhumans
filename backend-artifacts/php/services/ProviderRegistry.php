<?php
declare(strict_types=1);
namespace VowHumans;

final class ProviderRegistry {
    public function __construct(private readonly array $config) {}
    public function status(): array {
        return [
            'billing'=>$this->enabled('billing'), 'email'=>$this->enabled('email'),
            'livekit'=>$this->enabled('livekit'), 'object_storage'=>$this->enabled('object_storage'),
            'gpu_worker'=>$this->enabled('gpu_worker'),
        ];
    }
    private function enabled(string $name): string {
        $provider=$this->config['providers'][$name]??null;
        return is_array($provider) && ($provider['enabled']??false)===true ? 'configured-not-health-verified' : 'disabled';
    }
}
