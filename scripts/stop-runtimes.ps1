[CmdletBinding()]
param([string[]]$Service)

. (Join-Path $PSScriptRoot 'runtime-common.ps1')

$records = @(Get-RuntimeProcesses)
$targets = @($records | Where-Object { -not $Service -or $_.id -in $Service })
[array]::Reverse($targets)
foreach ($record in $targets) {
    if (Test-RegisteredProcess $record) {
        Stop-RegisteredProcessTree -ProcessId $record.pid
        Write-Host "[stopped] $($record.id)"
    }
}
$remaining = @($records | Where-Object { $_.id -notin $targets.id -and (Test-RegisteredProcess $_) })
Save-RuntimeProcesses $remaining
