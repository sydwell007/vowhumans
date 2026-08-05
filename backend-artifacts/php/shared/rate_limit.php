<?php
declare(strict_types=1);
function vhm_rate_limit(PDO $pdo, string $bucket, array $config, string $requestId): void {
    $window=max(10,(int)($config['window_seconds']??60)); $limit=max(10,(int)($config['max_requests']??90));
    $ip=$_SERVER['REMOTE_ADDR']??'unknown'; $key=hash('sha256',$bucket.'|'.$ip); $windowStart=gmdate('Y-m-d H:i:s',intdiv(time(),$window)*$window);
    $stmt=$pdo->prepare('INSERT INTO vhm_rate_limits(bucket_key,window_start,hits) VALUES(?,?,1) ON DUPLICATE KEY UPDATE hits=hits+1'); $stmt->execute([$key,$windowStart]);
    $check=$pdo->prepare('SELECT hits FROM vhm_rate_limits WHERE bucket_key=? AND window_start=?'); $check->execute([$key,$windowStart]);
    if ((int)$check->fetchColumn()>$limit) vhm_error('Rate limit exceeded','RATE_LIMITED',429,$requestId);
}

