<?php
declare(strict_types=1);

function vhm_commercial_route(PDO $pdo, array $config, string $resource, string $requestId): never {
    $tables = [
        'organisations'=>['vhm_organisations',null], 'workspaces'=>['vhm_workspaces','organisation_id'],
        'consents'=>['vhm_identity_consents','organisation_id'], 'voices'=>['vhm_voice_assets','organisation_id'],
        'knowledge'=>['vhm_knowledge_bases','organisation_id'], 'integrations'=>['vhm_integration_installations','organisation_id'],
        'templates'=>['vhm_marketplace_items',null], 'marketplace'=>['vhm_marketplace_items',null],
        'partners'=>['vhm_partners','organisation_id'], 'academy'=>['vhm_academy_courses',null],
        'billing'=>['vhm_subscriptions','organisation_id'], 'analytics'=>['vhm_analytics_events','organisation_id'],
        'notifications'=>['vhm_notifications','organisation_id'], 'audit'=>['vhm_audit_logs','organisation_id'],
    ];
    $publicRequests = ['demo-requests'=>'demo','contact-requests'=>'contact','signup-requests'=>'signup','partner-requests'=>'partner','investor-requests'=>'investor','trust-requests'=>'trust'];
    $method = vhm_method(['GET','POST'],$requestId);
    vhm_rate_limit($pdo,'commercial:'.$resource,$config['rate_limit']??[],$requestId);

    if ($method === 'POST' && isset($publicRequests[$resource])) {
        $body=vhm_body($requestId);
        $email=vhm_required_string($body,'email',$requestId,254);
        if (filter_var($email,FILTER_VALIDATE_EMAIL)===false) vhm_error('Invalid email','VALIDATION_ERROR',422,$requestId,['field'=>'email']);
        if (($body['consent']??'') !== 'accepted') vhm_error('Consent is required','CONSENT_REQUIRED',422,$requestId,['field'=>'consent']);
        $id=vhm_new_uuid(); $name=vhm_required_string($body,'name',$requestId,180); $organisation=vhm_required_string($body,'organisation',$requestId,180); $message=vhm_required_string($body,'message',$requestId,5000);
        $details=json_encode(['message'=>$message,'source'=>'vowhumans.com'],JSON_THROW_ON_ERROR);
        $stmt=$pdo->prepare('INSERT INTO vhm_sales_leads(id,lead_type,email,name,organisation_name,status,consent_at,details_json) VALUES(?,?,?,?,?,"received",UTC_TIMESTAMP(),?)');
        $stmt->execute([$id,$publicRequests[$resource],$email,$name,$organisation,$details]);
        vhm_success(['id'=>$id,'state'=>'received','persistent'=>true,'message'=>'Request received.'], $requestId, 202);
    }

    if ($method === 'POST' && $resource === 'support-requests') {
        $body=vhm_body($requestId); $id=vhm_new_uuid(); $email=vhm_required_string($body,'email',$requestId,254);
        if (filter_var($email,FILTER_VALIDATE_EMAIL)===false) vhm_error('Invalid email','VALIDATION_ERROR',422,$requestId,['field'=>'email']);
        if (($body['consent']??'') !== 'accepted') vhm_error('Consent is required','CONSENT_REQUIRED',422,$requestId,['field'=>'consent']);
        $subject=trim((string)($body['subject']??('Support request from '.($body['organisation']??'VowHumans customer'))));
        $description=trim((string)($body['description']??($body['message']??'')));
        if ($description==='' || mb_strlen($description)>5000) vhm_error('A support description is required','VALIDATION_ERROR',422,$requestId,['field'=>'message']);
        $stmt=$pdo->prepare('INSERT INTO vhm_support_tickets(id,email,subject,description,status) VALUES(?,?,?,? ,"open")'); $stmt->execute([$id,$email,$subject,$description]);
        vhm_success(['id'=>$id,'state'=>'open','persistent'=>true],$requestId,202);
    }

    if (!isset($tables[$resource])) vhm_error('Resource not found','NOT_FOUND',404,$requestId);
    [$table,$orgColumn]=$tables[$resource];
    $identity=vhm_require_scope($pdo,$resource.':read',$requestId);
    if ($method === 'POST') vhm_error('Write operation is not enabled for this resource','FEATURE_DISABLED',503,$requestId);
    $limit=min(100,max(1,(int)($_GET['limit']??25))); $offset=max(0,(int)($_GET['offset']??0));
    if ($orgColumn !== null) { $stmt=$pdo->prepare("SELECT id,status,created_at FROM {$table} WHERE {$orgColumn}=? ORDER BY created_at DESC LIMIT {$limit} OFFSET {$offset}"); $stmt->execute([$identity['organisation_id']]); }
    else { $stmt=$pdo->query("SELECT id,status,created_at FROM {$table} ORDER BY created_at DESC LIMIT {$limit} OFFSET {$offset}"); }
    vhm_success(['items'=>$stmt->fetchAll(),'pagination'=>['limit'=>$limit,'offset'=>$offset],'private_content_included'=>false],$requestId);
}
