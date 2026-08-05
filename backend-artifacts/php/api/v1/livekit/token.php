<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/bootstrap.php';
vhm_method(['POST'],$requestId); $auth=vhm_require_scope($pdo,'sessions:create',$requestId); $body=vhm_body($requestId); $sessionId=vhm_uuid(isset($body['session_id'])?(string)$body['session_id']:null,'session_id',$requestId);
$platform=$config['platform']??[]; $url=rtrim((string)($platform['base_url']??''),'/').'/api/v1/livekit/token'; $key=(string)($platform['service_api_key']??'');
if ($url==='/api/v1/livekit/token'||$key==='') vhm_error('Core realtime platform is not configured','PROVIDER_UNAVAILABLE',503,$requestId);
$payload=json_encode(['session_id'=>$sessionId,'participant_identity'=>vhm_required_string($body,'participant_identity',$requestId,180)]);
$curl=curl_init($url); curl_setopt_array($curl,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$payload,CURLOPT_HTTPHEADER=>['Content-Type: application/json','X-API-Key: '.$key,'X-Organisation-ID: '.$auth['organisation_id'],'X-Request-ID: '.$requestId],CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>12,CURLOPT_CONNECTTIMEOUT=>4]);
$response=curl_exec($curl); $status=(int)curl_getinfo($curl,CURLINFO_RESPONSE_CODE); $error=curl_error($curl); curl_close($curl);
if($response===false||$status<200||$status>=300){error_log('[VowHumans:'.$requestId.'] LiveKit proxy failed '.$status.' '.$error);vhm_error('Realtime service unavailable','PROVIDER_UNAVAILABLE',503,$requestId);}
$decoded=json_decode($response,true); if(!is_array($decoded))vhm_error('Invalid realtime response','PROVIDER_ERROR',502,$requestId); vhm_success($decoded,$requestId);

