[CmdletBinding()]
param(
    [string[]]$Service,
    [switch]$SkipFrontend,
    [int]$ReadinessTimeoutSeconds = 90
)

. (Join-Path $PSScriptRoot 'runtime-common.ps1')

$manifest = Get-RuntimeManifest
$selected = @($manifest.services | Where-Object {
    (-not $Service -or $_.id -in $Service) -and (-not $SkipFrontend -or $_.id -ne 'frontend')
})
if ($Service) {
    $unknown = @($Service | Where-Object { $_ -notin $manifest.services.id })
    if ($unknown) { throw "Unknown services: $($unknown -join ', ')" }
}

$token = Get-OrCreateControlToken
$records = [Collections.Generic.List[object]]::new()
foreach ($record in Get-RuntimeProcesses) {
    if ((Test-RegisteredProcess $record) -and -not ($records | Where-Object id -eq $record.id)) {
        $records.Add($record)
    }
}
$startedThisRun = [Collections.Generic.List[object]]::new()

try {
    foreach ($item in $selected) {
        $registered = @($records | Where-Object id -eq $item.id)
        if (Test-ServiceHealth $item) {
            if ($registered.Count -gt 0) {
                Write-Host "[ready] $($item.label) is already managed on $($item.port)"
                continue
            }
            $owners = @(Get-NetTCPConnection -LocalPort $item.port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
            $ownerText = if ($owners.Count -gt 0) { " PID $($owners -join ', ')" } else { '' }
            throw "$($item.label) is healthy on $($item.port) but is not managed by this workspace.$ownerText Stop that process before starting the unified runtime set."
        }
        foreach ($record in $registered) {
            Write-Host "[restart] stopping unhealthy managed process for $($item.label)"
            Stop-RegisteredProcessTree -ProcessId $record.pid
            [void]$records.Remove($record)
            Save-RuntimeProcesses $records
        }
        $portOwner = Get-NetTCPConnection -LocalPort $item.port -State Listen -ErrorAction SilentlyContinue
        if ($portOwner) { throw "$($item.label) port $($item.port) is occupied by an unhealthy process" }

        $workingDirectory = (Resolve-Path (Join-Path $script:WorkspaceRoot $item.workingDirectory)).Path
        $executable = Resolve-ServiceExecutable $item
        $arguments = @($item.command | Select-Object -Skip 1)
        $logDirectory = Join-Path $script:RuntimeRoot 'logs'
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

        $environmentBackup = @{}
        $environment = @{'RUNTIME_CONTROL_TOKEN' = $token; 'PYTHONUTF8' = '1'; 'PYTHONIOENCODING' = 'utf-8'}
        foreach ($property in $item.environment.PSObject.Properties) { $environment[$property.Name] = [string]$property.Value }
        foreach ($name in $environment.Keys) {
            $environmentBackup[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $environment[$name], 'Process')
        }
        try {
            $process = Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $workingDirectory `
                -RedirectStandardOutput (Join-Path $logDirectory "$($item.id).out.log") `
                -RedirectStandardError (Join-Path $logDirectory "$($item.id).err.log") `
                -WindowStyle Hidden -PassThru
        } finally {
            foreach ($name in $environmentBackup.Keys) {
                [Environment]::SetEnvironmentVariable($name, $environmentBackup[$name], 'Process')
            }
        }

        $record = [pscustomobject]@{
            id = $item.id
            pid = $process.Id
            startedAt = $process.StartTime.ToUniversalTime().ToString('o')
            startedAtFileTimeUtc = $process.StartTime.ToFileTimeUtc()
            executable = $executable
        }
        $records.Add($record)
        $startedThisRun.Add($record)
        Save-RuntimeProcesses $records

        $deadline = [DateTime]::UtcNow.AddSeconds($ReadinessTimeoutSeconds)
        while ([DateTime]::UtcNow -lt $deadline -and -not (Test-ServiceHealth $item)) {
            if ($process.HasExited) { break }
            Start-Sleep -Milliseconds 500
        }
        if (-not (Test-ServiceHealth $item)) {
            $errorLog = Join-Path $logDirectory "$($item.id).err.log"
            $tail = if (Test-Path $errorLog) { (Get-Content $errorLog -Tail 12) -join [Environment]::NewLine } else { '' }
            throw "$($item.label) did not become ready in time.$([Environment]::NewLine)$tail"
        }
        Write-Host "[ready] $($item.label) -> $($item.health)"
    }
} catch {
    $rollbackRecords = @($startedThisRun)
    [array]::Reverse($rollbackRecords)
    foreach ($record in $rollbackRecords) {
        if (Test-RegisteredProcess $record) { Stop-RegisteredProcessTree -ProcessId $record.pid }
    }
    $remaining = @($records | Where-Object { $_.id -notin $startedThisRun.id -and (Test-RegisteredProcess $_) })
    Save-RuntimeProcesses $remaining
    throw
}

Write-Host 'Platform runtimes are ready. Frontend: http://127.0.0.1:5173'
