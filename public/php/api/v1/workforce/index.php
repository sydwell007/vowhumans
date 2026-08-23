<?php
declare(strict_types=1);

require_once dirname(__DIR__, 3) . '/bootstrap.php';

// Shared-hosting control-plane adapter. It persists configuration and review
// evidence, but intentionally does not call models, tools, or schedulers.
function vhm_workforce_json(mixed $value, mixed $fallback=[]): mixed {
    if (is_array($value)) return $value;
    if (!is_string($value) || $value==='') return $fallback;
    $decoded=json_decode($value,true);
    return is_array($decoded)?$decoded:$fallback;
}

function vhm_workforce_list(mixed $value, string $field, string $requestId, int $limit=30): array {
    if (!is_array($value) || count($value)>$limit) vhm_error("Invalid {$field}",'VALIDATION_ERROR',422,$requestId,['field'=>$field]);
    $items=[];
    foreach ($value as $item) {
        if (!is_string($item) || trim($item)==='' || mb_strlen($item)>300) vhm_error("Invalid {$field}",'VALIDATION_ERROR',422,$requestId,['field'=>$field]);
        $items[]=trim($item);
    }
    return array_values(array_unique($items));
}

function vhm_workforce_colleague(PDO $pdo, string $organisationId, string $id, string $requestId): array {
    $stmt=$pdo->prepare('SELECT * FROM vhm_digital_colleagues WHERE id=? AND organisation_id=? LIMIT 1');
    $stmt->execute([$id,$organisationId]); $item=$stmt->fetch();
    if (!$item) vhm_error('Digital Colleague not found','NOT_FOUND',404,$requestId);
    foreach (['supported_languages_json','availability_json','configuration_json'] as $field) $item[$field]=vhm_workforce_json($item[$field]);
    return $item;
}

function vhm_workforce_snapshot(PDO $pdo, string $organisationId, string $id, string $requestId): array {
    $item=vhm_workforce_colleague($pdo,$organisationId,$id,$requestId);
    $sections=[
        'functions'=>['vhm_colleague_functions','priority ASC,created_at ASC'],
        'skills'=>['vhm_colleague_skills','created_at ASC'],
        'knowledge'=>['vhm_colleague_knowledge_sources','assigned_at ASC'],
        'tools'=>['vhm_colleague_tool_permissions','created_at ASC'],
        'workflows'=>['vhm_colleague_workflows','created_at ASC'],
        'objectives'=>['vhm_colleague_objectives','created_at ASC'],
        'kpis'=>['vhm_colleague_kpis','created_at ASC'],
        'guardrails'=>['vhm_colleague_guardrails','created_at ASC'],
        'collaboration'=>['vhm_colleague_collaboration_routes','created_at ASC'],
        'tests'=>['vhm_colleague_tests','created_at ASC'],
        'approvals'=>['vhm_colleague_approvals','created_at DESC'],
        'deployments'=>['vhm_colleague_deployments','created_at DESC'],
    ];
    foreach ($sections as $name=>[$table,$order]) {
        $stmt=$pdo->prepare("SELECT * FROM {$table} WHERE organisation_id=? AND digital_colleague_id=? ORDER BY {$order}");
        $stmt->execute([$organisationId,$id]); $item[$name]=$stmt->fetchAll();
    }
    return $item;
}

function vhm_workforce_readiness(PDO $pdo, string $organisationId, string $id, string $requestId): array {
    $item=vhm_workforce_colleague($pdo,$organisationId,$id,$requestId);
    $checks=[
        'role'=>trim((string)$item['role_title'])!=='' && trim((string)$item['purpose'])!=='',
        'identity'=>!empty($item['digital_human_id']),
        'persona'=>!empty($item['persona_version_id']),
        'human_owner'=>!empty($item['human_owner_user_id']),
        'escalation_owner'=>!empty($item['escalation_owner_user_id']),
    ];
    foreach (['functions'=>'vhm_colleague_functions','guardrails'=>'vhm_colleague_guardrails','collaboration'=>'vhm_colleague_collaboration_routes','workflows'=>'vhm_colleague_workflows'] as $name=>$table) {
        $stmt=$pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE organisation_id=? AND digital_colleague_id=? AND status IN ('active','draft')");
        $stmt->execute([$organisationId,$id]); $checks[$name]=(int)$stmt->fetchColumn()>0;
    }
    $checks['risk_autonomy']=!((int)$item['autonomy_level']>2 && in_array((string)$item['risk_level'],['high','regulated'],true)) && (int)$item['autonomy_level']<=4;
    $missing=[]; foreach ($checks as $key=>$passed) if (!$passed) $missing[]=$key;
    return ['ready'=>$missing===[],'checks'=>$checks,'missing'=>$missing,'label'=>'deterministic readiness evidence'];
}

function vhm_workforce_event(PDO $pdo, array $auth, string $workItemId, string $eventType, array $detail=[]): void {
    $pdo->prepare('INSERT INTO vhm_work_item_events(id,organisation_id,work_item_id,event_type,actor_type,actor_id,safe_detail_json,occurred_at) VALUES(?,?,?,? ,"api_key",?,?,UTC_TIMESTAMP())')
        ->execute([vhm_new_uuid(),$auth['organisation_id'],$workItemId,$eventType,$auth['key_id'],json_encode($detail,JSON_THROW_ON_ERROR)]);
}

$method=vhm_method(['GET','POST','PUT'],$requestId);
$resource=$_GET['resource']??($method==='GET'?'capabilities':'');
if (!is_string($resource) || preg_match('/^[a-z0-9-]{2,80}$/',$resource)!==1) vhm_error('Resource not found','NOT_FOUND',404,$requestId);
vhm_rate_limit($pdo,'workforce:'.$resource,$config['rate_limit']??[],$requestId);

if ($method==='GET') {
    $auth=vhm_require_scope($pdo,$resource==='analytics'?'workforce:analytics':'workforce:read',$requestId);
    if ($resource==='capabilities') {
        vhm_success(['control_plane'=>true,'persistence'=>true,'model_execution'=>false,'tool_execution'=>false,'schedules'=>false,'adapter'=>'Afrihost PHP/MySQL','truth'=>'Models, tools and durable jobs execute only on separately configured platform workers.'],$requestId);
    }
    if ($resource==='templates') {
        $stmt=$pdo->query('SELECT id,slug,name,department,summary,risk_level,autonomy_level,configuration_json,status FROM vhm_workforce_templates WHERE status="published" ORDER BY department,name');
        $items=$stmt->fetchAll(); foreach ($items as &$item) $item['configuration']=vhm_workforce_json($item['configuration_json']);
        vhm_success(['items'=>$items,'creates_drafts_only'=>true],$requestId);
    }
    if ($resource==='colleagues') {
        $stmt=$pdo->prepare('SELECT id,public_id,name,role_title,department,risk_level,autonomy_level,status,deployment_status,builder_step,updated_at FROM vhm_digital_colleagues WHERE organisation_id=? ORDER BY updated_at DESC LIMIT 100');
        $stmt->execute([$auth['organisation_id']]); vhm_success(['items'=>$stmt->fetchAll()],$requestId);
    }
    if ($resource==='colleague') {
        $id=vhm_uuid(isset($_GET['id'])?(string)$_GET['id']:null,'id',$requestId);
        vhm_success(['item'=>vhm_workforce_snapshot($pdo,$auth['organisation_id'],$id,$requestId)],$requestId);
    }
    if ($resource==='tasks') {
        $stmt=$pdo->prepare('SELECT w.*,c.name AS colleague_name,(SELECT COUNT(*) FROM vhm_work_products p WHERE p.work_item_id=w.id) AS product_count FROM vhm_work_items w JOIN vhm_digital_colleagues c ON c.id=w.digital_colleague_id AND c.organisation_id=w.organisation_id WHERE w.organisation_id=? ORDER BY w.created_at DESC LIMIT 100');
        $stmt->execute([$auth['organisation_id']]); vhm_success(['items'=>$stmt->fetchAll()],$requestId);
    }
    if ($resource==='analytics') {
        $org=$auth['organisation_id']; $metrics=[];
        $queries=['colleagues'=>'SELECT COUNT(*) FROM vhm_digital_colleagues WHERE organisation_id=?','deployed'=>'SELECT COUNT(*) FROM vhm_digital_colleagues WHERE organisation_id=? AND deployment_status="deployed"','open_work'=>'SELECT COUNT(*) FROM vhm_work_items WHERE organisation_id=? AND status NOT IN ("completed","cancelled","failed")','awaiting_review'=>'SELECT COUNT(*) FROM vhm_work_products WHERE organisation_id=? AND status="awaiting_review"','open_escalations'=>'SELECT COUNT(*) FROM vhm_colleague_escalations WHERE organisation_id=? AND status IN ("open","acknowledged")'];
        foreach ($queries as $key=>$query) { $stmt=$pdo->prepare($query); $stmt->execute([$org]); $metrics[$key]=(int)$stmt->fetchColumn(); }
        $stmt=$pdo->prepare('SELECT COALESCE(SUM(amount_minor),0) AS amount_minor,currency FROM vhm_colleague_costs WHERE organisation_id=? GROUP BY currency'); $stmt->execute([$org]);
        vhm_success(['metrics'=>$metrics,'recorded_costs'=>$stmt->fetchAll(),'evidence_only'=>true,'inferred_metrics'=>false],$requestId);
    }
    vhm_error('Resource not found','NOT_FOUND',404,$requestId);
}

if ($method==='PUT') {
    if ($resource!=='steps') vhm_error('Resource not found','NOT_FOUND',404,$requestId);
    $auth=vhm_require_scope($pdo,'workforce:configure',$requestId); $body=vhm_body($requestId);
    $id=vhm_uuid(isset($body['digital_colleague_id'])?(string)$body['digital_colleague_id']:null,'digital_colleague_id',$requestId);
    $step=(int)($body['step']??0); if ($step<1 || $step>12) vhm_error('Step must be between 1 and 12','VALIDATION_ERROR',422,$requestId,['field'=>'step']);
    $item=vhm_workforce_colleague($pdo,$auth['organisation_id'],$id,$requestId); $payload=$body['configuration']??null;
    if (!is_array($payload)) vhm_error('Configuration object required','VALIDATION_ERROR',422,$requestId,['field'=>'configuration']);
    $configuration=vhm_workforce_json($item['configuration_json']); $configuration['step_'.$step]=$payload;
    $updates=['configuration_json'=>json_encode($configuration,JSON_THROW_ON_ERROR),'builder_step'=>max($step,(int)$item['builder_step']),'status'=>$step>=10?'testing':'configuring'];
    if ($step===1) {
        foreach (['name','role_title','department','team_name','purpose','seniority'] as $field) if (isset($payload[$field]) && is_string($payload[$field])) $updates[$field]=trim($payload[$field]);
        foreach (['digital_human_id','persona_version_id','human_owner_user_id','escalation_owner_user_id'] as $field) if (isset($payload[$field]) && $payload[$field]!=='') $updates[$field]=vhm_uuid((string)$payload[$field],$field,$requestId);
        if (isset($payload['risk_level']) && in_array($payload['risk_level'],['low','medium','high','regulated'],true)) $updates['risk_level']=$payload['risk_level'];
        if (isset($payload['autonomy_level'])) { $level=(int)$payload['autonomy_level']; if ($level<0 || $level>4) vhm_error('Autonomy level must be 0 to 4','VALIDATION_ERROR',422,$requestId,['field'=>'autonomy_level']); $updates['autonomy_level']=$level; }
    }
    $assignments=[]; $values=[]; foreach ($updates as $field=>$value) { $assignments[]="{$field}=?"; $values[]=$value; }
    $values[]=$id; $values[]=$auth['organisation_id'];
    $pdo->prepare('UPDATE vhm_digital_colleagues SET '.implode(',',$assignments).',updated_at=UTC_TIMESTAMP() WHERE id=? AND organisation_id=?')->execute($values);
    vhm_audit($pdo,$auth,'workforce.step.save','digital_colleague',$id,$requestId,['step'=>$step]);
    vhm_success(['id'=>$id,'saved_step'=>$step,'next_step'=>min(12,$step+1),'persistent'=>true],$requestId);
}

if ($resource==='colleagues') {
    $auth=vhm_require_scope($pdo,'workforce:create',$requestId); $body=vhm_body($requestId);
    $templateId=vhm_uuid(isset($body['template_id'])?(string)$body['template_id']:null,'template_id',$requestId);
    $stmt=$pdo->prepare('SELECT * FROM vhm_workforce_templates WHERE id=? AND status="published" LIMIT 1'); $stmt->execute([$templateId]); $template=$stmt->fetch();
    if (!$template) vhm_error('Template not found','NOT_FOUND',404,$requestId);
    $name=isset($body['name'])?vhm_required_string($body,'name',$requestId,180):(string)$template['name'];
    $configuration=vhm_workforce_json($template['configuration_json']); $id=vhm_new_uuid(); $publicId='dc_'.bin2hex(random_bytes(12));
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO vhm_digital_colleagues(id,public_id,organisation_id,template_id,name,role_title,department,purpose,supported_languages_json,availability_json,risk_level,autonomy_level,status,deployment_status,builder_step,configuration_json,created_by_api_key_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,"draft","not_deployed",1,?,?)')
            ->execute([$id,$publicId,$auth['organisation_id'],$templateId,$name,(string)$template['name'],(string)$template['department'],(string)$template['summary'],json_encode(['en-ZA'],JSON_THROW_ON_ERROR),json_encode(['mode'=>'business-hours','timezone'=>'Africa/Johannesburg'],JSON_THROW_ON_ERROR),(string)$template['risk_level'],min(4,(int)$template['autonomy_level']),json_encode(['template_slug'=>$template['slug']],JSON_THROW_ON_ERROR),$auth['key_id']]);
        foreach (($configuration['functions']??[]) as $priority=>$function) if (is_string($function)) $pdo->prepare('INSERT INTO vhm_colleague_functions(id,organisation_id,digital_colleague_id,name,description,in_scope_json,out_of_scope_json,human_review_required,priority,status) VALUES(?,?,?,?,?,JSON_ARRAY(),JSON_ARRAY(?),1,?,"active")')->execute([vhm_new_uuid(),$auth['organisation_id'],$id,$function,$function,(string)($configuration['human_review']??'Out-of-scope work'),$priority]);
        foreach (($configuration['skills']??[]) as $skill) if (is_string($skill)) $pdo->prepare('INSERT INTO vhm_colleague_skills(id,organisation_id,digital_colleague_id,name,proficiency,evidence,status) VALUES(?,?,?,? ,"guided","Template starting point; validate in testing","active")')->execute([vhm_new_uuid(),$auth['organisation_id'],$id,$skill]);
        $guardrails=[['human-review','Material outputs require accountable human review','human_review','review'],['escalate-uncertainty','Escalate uncertainty, conflicts and out-of-scope requests','hard','escalate'],['no-unsupported-claims','Do not invent facts, completion, citations or outcomes','hard','block'],['no-high-impact-decisions','Do not make final employment, legal, financial, medical or access-control decisions','hard','block']];
        foreach ($guardrails as [$code,$instruction,$enforcement,$action]) $pdo->prepare('INSERT INTO vhm_colleague_guardrails(id,organisation_id,digital_colleague_id,code,instruction,enforcement,action_on_violation,status) VALUES(?,?,?,?,?,?,?,"active")')->execute([vhm_new_uuid(),$auth['organisation_id'],$id,$code,$instruction,$enforcement,$action]);
        $pdo->prepare('INSERT INTO vhm_colleague_workflows(id,organisation_id,digital_colleague_id,name,trigger_type,trigger_config_json,steps_json,expected_output,exception_policy,human_checkpoint_policy,max_iterations,status) VALUES(?,?,?,"Governed work queue","manual",JSON_OBJECT(),JSON_ARRAY("validate scope","prepare reviewable output","route to human review"),"Reviewable work product","Escalate errors, ambiguity and policy conflict","Human approval before release",1,"draft")')->execute([vhm_new_uuid(),$auth['organisation_id'],$id]);
        vhm_audit($pdo,$auth,'digital_colleague.create','digital_colleague',$id,$requestId,['template'=>$template['slug']]); $pdo->commit();
        vhm_success(['id'=>$id,'public_id'=>$publicId,'status'=>'draft','builder_step'=>1,'approval_created'=>false,'deployment_created'=>false],$requestId,201);
    } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
}

if ($resource==='tests') {
    $auth=vhm_require_scope($pdo,'workforce:test',$requestId); $body=vhm_body($requestId);
    $id=vhm_uuid(isset($body['digital_colleague_id'])?(string)$body['digital_colleague_id']:null,'digital_colleague_id',$requestId);
    $readiness=vhm_workforce_readiness($pdo,$auth['organisation_id'],$id,$requestId);
    $tests=[['configuration-readiness','Configuration readiness','readiness',$readiness['ready']],['human-escalation','Human escalation route','safety',$readiness['checks']['escalation_owner']&&$readiness['checks']['collaboration']],['bounded-autonomy','Risk and autonomy boundary','safety',$readiness['checks']['risk_autonomy']],['identity-and-persona','Identity and published Persona linkage','readiness',$readiness['checks']['identity']&&$readiness['checks']['persona']]];
    foreach ($tests as [$code,$name,$type,$passed]) $pdo->prepare('INSERT INTO vhm_colleague_tests(id,organisation_id,digital_colleague_id,test_code,name,test_type,input_fixture_json,expected_policy_json,status,result_json,run_by_api_key_id,run_at) VALUES(?,?,?,?,?,?,JSON_OBJECT(),JSON_OBJECT("deterministic",true),?,JSON_OBJECT("passed",?,"missing",?),?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status=VALUES(status),result_json=VALUES(result_json),run_by_api_key_id=VALUES(run_by_api_key_id),run_at=VALUES(run_at)')
        ->execute([vhm_new_uuid(),$auth['organisation_id'],$id,$code,$name,$type,$passed?'passed':'failed',$passed?1:0,json_encode($readiness['missing'],JSON_THROW_ON_ERROR),$auth['key_id']]);
    $pdo->prepare('UPDATE vhm_digital_colleagues SET status="testing",builder_step=GREATEST(builder_step,10) WHERE id=? AND organisation_id=?')->execute([$id,$auth['organisation_id']]);
    vhm_audit($pdo,$auth,'workforce.tests.run','digital_colleague',$id,$requestId,['ready'=>$readiness['ready']]);
    vhm_success(['readiness'=>$readiness,'tests_recorded'=>count($tests)],$requestId);
}

if ($resource==='approvals') {
    $auth=vhm_require_scope($pdo,'workforce:approve',$requestId); $body=vhm_body($requestId);
    $id=vhm_uuid(isset($body['digital_colleague_id'])?(string)$body['digital_colleague_id']:null,'digital_colleague_id',$requestId);
    $decision=$body['decision']??'approved'; if (!in_array($decision,['approved','rejected','revoked'],true)) vhm_error('Invalid decision','VALIDATION_ERROR',422,$requestId,['field'=>'decision']);
    $rationale=vhm_required_string($body,'rationale',$requestId,3000); $readiness=vhm_workforce_readiness($pdo,$auth['organisation_id'],$id,$requestId);
    if ($decision==='approved' && !$readiness['ready']) vhm_error('Readiness requirements are not met','READINESS_FAILED',409,$requestId,['missing'=>$readiness['missing']]);
    $snapshot=vhm_workforce_snapshot($pdo,$auth['organisation_id'],$id,$requestId); $approvalId=vhm_new_uuid();
    $pdo->prepare('INSERT INTO vhm_colleague_approvals(id,organisation_id,digital_colleague_id,decision,scope_code,snapshot_json,rationale,approved_by_api_key_id) VALUES(?,?,?,? ,"deployment",?,?,?)')->execute([$approvalId,$auth['organisation_id'],$id,$decision,json_encode($snapshot,JSON_THROW_ON_ERROR),$rationale,$auth['key_id']]);
    $status=$decision==='approved'?'approved':'review'; $pdo->prepare('UPDATE vhm_digital_colleagues SET status=?,approved_at=IF(?="approved",UTC_TIMESTAMP(),NULL),builder_step=GREATEST(builder_step,11) WHERE id=? AND organisation_id=?')->execute([$status,$decision,$id,$auth['organisation_id']]);
    vhm_audit($pdo,$auth,'workforce.approval.'.$decision,'digital_colleague',$id,$requestId,['approval_id'=>$approvalId]);
    vhm_success(['id'=>$approvalId,'decision'=>$decision,'append_only'=>true],$requestId,201);
}

if ($resource==='deployments') {
    $auth=vhm_require_scope($pdo,'workforce:deploy',$requestId); $body=vhm_body($requestId);
    $id=vhm_uuid(isset($body['digital_colleague_id'])?(string)$body['digital_colleague_id']:null,'digital_colleague_id',$requestId);
    $environment=$body['environment']??'sandbox'; if (!in_array($environment,['sandbox','pilot','production'],true)) vhm_error('Invalid environment','VALIDATION_ERROR',422,$requestId,['field'=>'environment']);
    $channels=vhm_workforce_list($body['channels']??['work_queue'],'channels',$requestId,10);
    foreach ($channels as $channel) if ($channel!=='work_queue') vhm_error('External channel execution is disabled on the Afrihost adapter','FEATURE_DISABLED',503,$requestId,['channel'=>$channel]);
    $stmt=$pdo->prepare('SELECT id FROM vhm_colleague_approvals WHERE organisation_id=? AND digital_colleague_id=? AND decision="approved" ORDER BY created_at DESC LIMIT 1'); $stmt->execute([$auth['organisation_id'],$id]); $approvalId=$stmt->fetchColumn();
    if (!$approvalId) vhm_error('An approved configuration snapshot is required','APPROVAL_REQUIRED',409,$requestId);
    $snapshot=vhm_workforce_snapshot($pdo,$auth['organisation_id'],$id,$requestId); $versionStmt=$pdo->prepare('SELECT COALESCE(MAX(version),0)+1 FROM vhm_colleague_deployments WHERE digital_colleague_id=? AND environment=?'); $versionStmt->execute([$id,$environment]); $version=(int)$versionStmt->fetchColumn(); $deploymentId=vhm_new_uuid();
    $pdo->prepare('INSERT INTO vhm_colleague_deployments(id,organisation_id,digital_colleague_id,approval_id,environment,channels_json,version,status,configuration_snapshot_json,deployed_by_api_key_id,deployed_at) VALUES(?,?,?,?,?,?,?,"deployed",?,?,UTC_TIMESTAMP())')->execute([$deploymentId,$auth['organisation_id'],$id,$approvalId,$environment,json_encode($channels,JSON_THROW_ON_ERROR),$version,json_encode($snapshot,JSON_THROW_ON_ERROR),$auth['key_id']]);
    $pdo->prepare('UPDATE vhm_digital_colleagues SET status="deployed",deployment_status="deployed",builder_step=12,deployed_at=UTC_TIMESTAMP() WHERE id=? AND organisation_id=?')->execute([$id,$auth['organisation_id']]);
    vhm_audit($pdo,$auth,'workforce.deployment.create','digital_colleague',$id,$requestId,['environment'=>$environment,'version'=>$version]);
    vhm_success(['id'=>$deploymentId,'environment'=>$environment,'version'=>$version,'channels'=>$channels,'provider_execution'=>false],$requestId,201);
}

if ($resource==='tasks') {
    $auth=vhm_require_scope($pdo,'workforce:assign',$requestId); $body=vhm_body($requestId);
    $colleagueId=vhm_uuid(isset($body['digital_colleague_id'])?(string)$body['digital_colleague_id']:null,'digital_colleague_id',$requestId);
    $colleague=vhm_workforce_colleague($pdo,$auth['organisation_id'],$colleagueId,$requestId);
    if ($colleague['deployment_status']!=='deployed') vhm_error('Digital Colleague must be deployed before work is assigned','DEPLOYMENT_REQUIRED',409,$requestId);
    $title=vhm_required_string($body,'title',$requestId,255); $requestText=vhm_required_string($body,'request',$requestId,20000);
    $priority=$body['priority']??'normal'; if (!in_array($priority,['low','normal','high','urgent'],true)) vhm_error('Invalid priority','VALIDATION_ERROR',422,$requestId,['field'=>'priority']);
    $risk=$body['risk_level']??$colleague['risk_level']; if (!in_array($risk,['low','medium','high','regulated'],true)) vhm_error('Invalid risk level','VALIDATION_ERROR',422,$requestId,['field'=>'risk_level']);
    $id=vhm_new_uuid(); $publicId='wi_'.bin2hex(random_bytes(12));
    $pdo->prepare('INSERT INTO vhm_work_items(id,public_id,organisation_id,digital_colleague_id,title,request_text,input_data_json,priority,risk_level,status,assigned_by_api_key_id) VALUES(?,?,?,?,?,?,JSON_OBJECT(),?,? ,"queued",?)')->execute([$id,$publicId,$auth['organisation_id'],$colleagueId,$title,$requestText,$priority,$risk,$auth['key_id']]);
    vhm_workforce_event($pdo,$auth,$id,'work_item.queued',['risk_level'=>$risk]); vhm_audit($pdo,$auth,'work_item.create','work_item',$id,$requestId);
    vhm_success(['id'=>$id,'public_id'=>$publicId,'status'=>'queued','automatic_execution'=>false],$requestId,201);
}

if ($resource==='review-brief') {
    $auth=vhm_require_scope($pdo,'workforce:assign',$requestId); $body=vhm_body($requestId);
    $workItemId=vhm_uuid(isset($body['work_item_id'])?(string)$body['work_item_id']:null,'work_item_id',$requestId);
    $stmt=$pdo->prepare('SELECT w.*,c.name AS colleague_name,c.purpose FROM vhm_work_items w JOIN vhm_digital_colleagues c ON c.id=w.digital_colleague_id AND c.organisation_id=w.organisation_id WHERE w.id=? AND w.organisation_id=? LIMIT 1'); $stmt->execute([$workItemId,$auth['organisation_id']]); $work=$stmt->fetch();
    if (!$work) vhm_error('Work item not found','NOT_FOUND',404,$requestId);
    $versionStmt=$pdo->prepare('SELECT COALESCE(MAX(version),0)+1 FROM vhm_work_products WHERE work_item_id=?'); $versionStmt->execute([$workItemId]); $version=(int)$versionStmt->fetchColumn();
    $content=['label'=>'Deterministic review brief — no model used','request'=>$work['request_text'],'assigned_colleague'=>$work['colleague_name'],'bounded_purpose'=>$work['purpose'],'risk_level'=>$work['risk_level'],'review_checklist'=>['Confirm the request is in scope','Verify facts against approved sources','Check personal and confidential data','Approve, request changes, or reject'],'limitations'=>['No inference was generated','No external tool was called','A human reviewer owns the decision']];
    $id=vhm_new_uuid();
    $pdo->prepare('INSERT INTO vhm_work_products(id,organisation_id,work_item_id,digital_colleague_id,product_type,title,content_json,source_refs_json,status,version) VALUES(?,?,?,?,"review_brief",?,?,JSON_ARRAY(),"awaiting_review",?)')->execute([$id,$auth['organisation_id'],$workItemId,$work['digital_colleague_id'],'Review brief: '.$work['title'],json_encode($content,JSON_THROW_ON_ERROR),$version]);
    $pdo->prepare('UPDATE vhm_work_items SET status="awaiting_review",started_at=COALESCE(started_at,UTC_TIMESTAMP()) WHERE id=? AND organisation_id=?')->execute([$workItemId,$auth['organisation_id']]);
    vhm_workforce_event($pdo,$auth,$workItemId,'work_product.awaiting_review',['product_id'=>$id,'model_used'=>false]);
    vhm_success(['id'=>$id,'version'=>$version,'status'=>'awaiting_review','content'=>$content,'model_used'=>false],$requestId,201);
}

if ($resource==='reviews') {
    $auth=vhm_require_scope($pdo,'workforce:review',$requestId); $body=vhm_body($requestId);
    $productId=vhm_uuid(isset($body['work_product_id'])?(string)$body['work_product_id']:null,'work_product_id',$requestId);
    $decision=$body['decision']??''; if (!in_array($decision,['approved','changes_requested','rejected'],true)) vhm_error('Invalid decision','VALIDATION_ERROR',422,$requestId,['field'=>'decision']);
    $notes=vhm_required_string($body,'notes',$requestId,5000); $stmt=$pdo->prepare('SELECT work_item_id FROM vhm_work_products WHERE id=? AND organisation_id=? LIMIT 1'); $stmt->execute([$productId,$auth['organisation_id']]); $workItemId=$stmt->fetchColumn();
    if (!$workItemId) vhm_error('Work product not found','NOT_FOUND',404,$requestId); $reviewId=vhm_new_uuid();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO vhm_work_product_reviews(id,organisation_id,work_product_id,decision,notes,reviewed_by_api_key_id) VALUES(?,?,?,?,?,?)')->execute([$reviewId,$auth['organisation_id'],$productId,$decision,$notes,$auth['key_id']]);
        $productStatus=$decision==='approved'?'approved':($decision==='rejected'?'rejected':'awaiting_review'); $workStatus=$decision==='approved'?'completed':'awaiting_review';
        $pdo->prepare('UPDATE vhm_work_products SET status=? WHERE id=? AND organisation_id=?')->execute([$productStatus,$productId,$auth['organisation_id']]);
        $pdo->prepare('UPDATE vhm_work_items SET status=?,completed_at=IF(?="completed",UTC_TIMESTAMP(),NULL) WHERE id=? AND organisation_id=?')->execute([$workStatus,$workStatus,$workItemId,$auth['organisation_id']]);
        vhm_workforce_event($pdo,$auth,(string)$workItemId,'work_product.reviewed',['product_id'=>$productId,'decision'=>$decision]); $pdo->commit();
    } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
    vhm_success(['id'=>$reviewId,'decision'=>$decision,'append_only'=>true],$requestId,201);
}

if (in_array($resource,['execute','generate-role','tool-execution','schedules'],true)) {
    vhm_error('This capability is disabled on the Afrihost control-plane adapter','FEATURE_DISABLED',503,$requestId,['resource'=>$resource,'required_runtime'=>'configured platform worker']);
}

vhm_error('Resource not found','NOT_FOUND',404,$requestId);
