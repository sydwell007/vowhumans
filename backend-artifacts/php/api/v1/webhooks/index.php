<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/bootstrap.php';
vhm_method(['POST'],$requestId); $raw=file_get_contents('php://input')?:''; $signature=$_SERVER['HTTP_X_VOWHUMANS_SIGNATURE']??''; $secret=(string)($config['webhook_secrets']['platform']??'');
if($secret===''||!preg_match('/^t=(\d+),v1=([a-f0-9]{64})$/',$signature,$matches)||abs(time()-(int)$matches[1])>300||!hash_equals(hash_hmac('sha256',$matches[1].'.'.$raw,$secret),$matches[2])) vhm_error('Invalid webhook signature','INVALID_SIGNATURE',401,$requestId);
try{$event=json_decode($raw,true,32,JSON_THROW_ON_ERROR);}catch(JsonException){vhm_error('Malformed webhook JSON','MALFORMED_JSON',400,$requestId);} $eventId=vhm_uuid(isset($event['id'])?(string)$event['id']:null,'id',$requestId); $organisationId=vhm_uuid(isset($event['organisation_id'])?(string)$event['organisation_id']:null,'organisation_id',$requestId); $type=vhm_required_string($event,'type',$requestId,160);
$stmt=$pdo->prepare('INSERT IGNORE INTO vhm_webhook_events(id,organisation_id,event_type,payload_json,received_at) VALUES(?,?,?,?,UTC_TIMESTAMP())'); $stmt->execute([$eventId,$organisationId,$type,$raw]); vhm_success(['accepted'=>true,'duplicate'=>$stmt->rowCount()===0],$requestId,202);

