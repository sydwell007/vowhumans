<?php
declare(strict_types=1);
require_once dirname(__DIR__,2).'/bootstrap.php';
require_once dirname(__DIR__,2).'/shared/commercial_router.php';
$resource=$_GET['resource']??'';
if (!is_string($resource) || preg_match('/^[a-z0-9-]{2,80}$/',$resource)!==1) vhm_error('Resource not found','NOT_FOUND',404,$requestId);
vhm_commercial_route($pdo,$config,$resource,$requestId);
