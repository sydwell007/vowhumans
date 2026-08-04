<?php
declare(strict_types=1);
function vhm_db(array $database): PDO {
    foreach (['host','name','user','password'] as $key) if (!isset($database[$key])) throw new RuntimeException('Incomplete database configuration');
    $dsn=sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',(string)$database['host'],(int)($database['port']??3306),(string)$database['name']);
    return new PDO($dsn,(string)$database['user'],(string)$database['password'],[
        PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES=>false,
        PDO::MYSQL_ATTR_INIT_COMMAND=>'SET time_zone = "+00:00"',
    ]);
}

