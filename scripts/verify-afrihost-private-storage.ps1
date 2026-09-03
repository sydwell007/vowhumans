param(
    [Parameter(Mandatory = $true)][string]$Endpoint,
    [Parameter(Mandatory = $true)][string]$Secret
)

$ErrorActionPreference = 'Stop'

function Get-Sha256Hex([byte[]]$Bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $digest = $sha.ComputeHash($Bytes) } finally { $sha.Dispose() }
    return -join ($digest | ForEach-Object { $_.ToString('x2') })
}

function Get-HmacHex([string]$Value, [string]$Key) {
    $hmac = New-Object Security.Cryptography.HMACSHA256
    try {
        $hmac.Key = [Text.Encoding]::UTF8.GetBytes($Key)
        $digest = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))
    } finally { $hmac.Dispose() }
    return -join ($digest | ForEach-Object { $_.ToString('x2') })
}

function New-SignedHeaders([string]$Method, [string]$Action, [string]$ObjectKey, [byte[]]$Body) {
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
    $nonce = [guid]::NewGuid().ToString()
    $bodyHash = Get-Sha256Hex $Body
    $canonical = "$($Method.ToUpperInvariant())`n$Action`n$timestamp`n$nonce`n$ObjectKey`n$bodyHash"
    return @{
        'X-VowHumans-Storage-Timestamp' = $timestamp
        'X-VowHumans-Storage-Nonce' = $nonce
        'X-VowHumans-Storage-Body-Sha256' = $bodyHash
        'X-VowHumans-Storage-Signature' = Get-HmacHex $canonical $Secret
    }
}

if ($Secret.Trim().Length -lt 32) { throw 'The private-storage secret is missing or too short.' }
$baseUrl = $Endpoint.TrimEnd('/')
$organisationId = [guid]::NewGuid().ToString()
$replicaId = [guid]::NewGuid().ToString()
$captureId = [guid]::NewGuid().ToString()
$segmentId = [guid]::NewGuid().ToString()
$objectKey = "organisations/$organisationId/replicas/$replicaId/captures/$captureId/$segmentId.webm"
$encodedKey = [Uri]::EscapeDataString($objectKey)
$body = [Text.Encoding]::UTF8.GetBytes("VowHumans authorised private-storage audit $([guid]::NewGuid())")
$sha256 = Get-Sha256Hex $body
$emptyBody = [byte[]]@()
$temporaryDownload = [IO.Path]::GetTempFileName()

try {
    $putHeaders = New-SignedHeaders 'PUT' 'put-part' $objectKey $body
    $putHeaders['X-VowHumans-Part-Number'] = '1'
    $putHeaders['X-VowHumans-Total-Parts'] = '1'
    $putHeaders['X-VowHumans-Part-Sha256'] = $sha256
    $putHeaders['X-VowHumans-Classification'] = 'biometric-capture'
    $put = Invoke-WebRequest -UseBasicParsing -Method Put -Uri "$baseUrl/?action=put-part&object_key=$encodedKey" -Headers $putHeaders -ContentType 'video/webm' -Body $body
    $putData = ($put.Content | ConvertFrom-Json).data

    $completeHeaders = New-SignedHeaders 'POST' 'complete' $objectKey $emptyBody
    $completeHeaders['X-VowHumans-Total-Parts'] = '1'
    $completeHeaders['X-VowHumans-Object-Bytes'] = $body.Length.ToString()
    $completeHeaders['X-VowHumans-Object-Sha256'] = $sha256
    $completeHeaders['X-VowHumans-Content-Type'] = 'video/webm'
    $completeHeaders['X-VowHumans-Classification'] = 'biometric-capture'
    $complete = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$baseUrl/?action=complete&object_key=$encodedKey" -Headers $completeHeaders -ContentType 'application/octet-stream' -Body $emptyBody
    $completeData = ($complete.Content | ConvertFrom-Json).data

    $headHeaders = New-SignedHeaders 'POST' 'head' $objectKey $emptyBody
    $head = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$baseUrl/?action=head&object_key=$encodedKey" -Headers $headHeaders -ContentType 'application/octet-stream' -Body $emptyBody
    $headData = ($head.Content | ConvertFrom-Json).data

    $tokenHeaders = New-SignedHeaders 'POST' 'download-token' $objectKey $emptyBody
    $token = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$baseUrl/?action=download-token&object_key=$encodedKey" -Headers $tokenHeaders -ContentType 'application/octet-stream' -Body $emptyBody
    $tokenData = ($token.Content | ConvertFrom-Json).data
    Invoke-WebRequest -UseBasicParsing -Uri $tokenData.url -OutFile $temporaryDownload
    $downloaded = [IO.File]::ReadAllBytes($temporaryDownload)

    $result = [ordered]@{
        put_part = $put.StatusCode -eq 201 -and $putData.stored -eq $true -and $putData.encrypted_at_rest -eq $true
        complete = $complete.StatusCode -eq 200 -and $completeData.completed -eq $true -and $completeData.sha256 -eq $sha256
        head = $head.StatusCode -eq 200 -and $headData.byte_size -eq $body.Length -and $headData.sha256 -eq $sha256 -and $headData.encrypted_at_rest -eq $true
        download = (Get-Sha256Hex $downloaded) -eq $sha256
        byte_size = $body.Length
        object_key = $objectKey
    }
    $result | ConvertTo-Json -Compress
    if ($result.Values -contains $false) { throw 'One or more private-storage verification stages failed.' }
} finally {
    $resolvedTemp = [IO.Path]::GetFullPath($temporaryDownload)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTemp.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
        Remove-Item -LiteralPath $resolvedTemp
    }
}
