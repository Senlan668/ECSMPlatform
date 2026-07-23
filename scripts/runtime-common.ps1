$ErrorActionPreference = 'Stop'

$script:WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:RuntimeRoot = Join-Path $script:WorkspaceRoot '.runtime\platform'
$script:ManifestPath = Join-Path $script:WorkspaceRoot 'config\runtime-manifest.json'
$script:ProcessPath = Join-Path $script:RuntimeRoot 'processes.json'
$script:TokenPath = Join-Path $script:RuntimeRoot 'control-token.txt'

function Get-RuntimeManifest {
    Get-Content -Raw -Encoding UTF8 $script:ManifestPath | ConvertFrom-Json
}

function Get-RuntimeProcesses {
    if (-not (Test-Path -LiteralPath $script:ProcessPath)) { return @() }
    $value = Get-Content -Raw -Encoding UTF8 $script:ProcessPath | ConvertFrom-Json
    if ($null -eq $value) { return @() }
    return @($value)
}

function Save-RuntimeProcesses([array]$Processes) {
    New-Item -ItemType Directory -Path $script:RuntimeRoot -Force | Out-Null
    ConvertTo-Json -InputObject @($Processes) -Depth 8 | Set-Content -LiteralPath $script:ProcessPath -Encoding UTF8
}

function Get-OrCreateControlToken {
    New-Item -ItemType Directory -Path $script:RuntimeRoot -Force | Out-Null
    if (Test-Path -LiteralPath $script:TokenPath) {
        $existing = (Get-Content -Raw -LiteralPath $script:TokenPath).Trim()
        if ($existing.Length -ge 64) { return $existing }
    }
    $bytes = New-Object byte[] 48
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    $token = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
    Set-Content -LiteralPath $script:TokenPath -Value $token -Encoding ASCII -NoNewline
    return $token
}

function Resolve-ServiceExecutable($Service) {
    $workingDirectory = Join-Path $script:WorkspaceRoot $Service.workingDirectory
    $candidate = Join-Path $workingDirectory $Service.command[0]
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return (Resolve-Path -LiteralPath $candidate).Path }
    $command = Get-Command $Service.command[0] -ErrorAction SilentlyContinue
    if ($null -eq $command) { throw "Executable not found for $($Service.id): $($Service.command[0])" }
    return $command.Source
}

function Test-ServiceHealth($Service, [int]$TimeoutSeconds = 2) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Service.health -TimeoutSec $TimeoutSeconds
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Test-RegisteredProcess($Record) {
    $process = Get-Process -Id $Record.pid -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $false }
    try {
        if ($Record.PSObject.Properties.Name -contains 'startedAtFileTimeUtc') {
            return $process.StartTime.ToFileTimeUtc() -eq [long]$Record.startedAtFileTimeUtc
        }
        $expected = [DateTime]::Parse([string]$Record.startedAt).ToUniversalTime()
        return $process.StartTime.ToUniversalTime() -eq $expected
    } catch {
        return $false
    }
}

function Stop-RegisteredProcessTree([int]$ProcessId) {
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue
    foreach ($child in @($children)) { Stop-RegisteredProcessTree -ProcessId $child.ProcessId }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}
