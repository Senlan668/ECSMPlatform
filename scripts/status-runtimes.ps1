. (Join-Path $PSScriptRoot 'runtime-common.ps1')

$manifest = Get-RuntimeManifest
$records = Get-RuntimeProcesses
$status = foreach ($item in $manifest.services) {
    $record = $records | Where-Object id -eq $item.id | Select-Object -First 1
    $managed = $record -and (Test-RegisteredProcess $record)
    $healthy = Test-ServiceHealth $item
    $portOwner = if ($healthy -and -not $managed) {
        @(Get-NetTCPConnection -LocalPort $item.port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    } else { @() }
    [pscustomobject]@{
        Service = $item.id
        Port = $item.port
        Process = if ($managed) { "managed PID $($record.pid)" } elseif ($portOwner.Count -gt 0) { "unmanaged PID $($portOwner -join ',')" } else { '-' }
        Health = if ($healthy) { 'ready' } else { 'offline' }
        URL = $item.health
    }
}
$status | Format-Table -AutoSize
