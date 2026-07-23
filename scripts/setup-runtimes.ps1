[CmdletBinding()]
param([switch]$SkipFrontend)

$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$uv = (Get-Command uv -ErrorAction Stop).Source

$pythonProjects = @(
    @{ Path = 'ai\media-workers\modules\media-processing\live-clip-runtime\backend'; Args = @('sync', '--extra', 'dev') },
    @{ Path = 'ai\runtime\modules\customer-service-ai\sales-knowledge-runtime\backend'; Args = @('sync', '--group', 'dev') },
    @{ Path = 'ai\runtime\modules\customer-service-ai\voice-service-runtime\rag_llm_server'; Args = @('sync', '--group', 'dev') },
    @{ Path = 'ai\runtime\modules\content-ai\content-campaign-runtime'; Args = @('sync', '--group', 'dev') },
    @{ Path = 'ai\runtime\modules\model-gateway\shared-ai-services\mcp-demo'; Args = @('sync', '--group', 'dev') }
)

foreach ($project in $pythonProjects) {
    $directory = Join-Path $workspaceRoot $project.Path
    Write-Host "[setup] $($project.Path)"
    $uvArguments = @($project.Args) + @('--directory', $directory)
    & $uv @uvArguments
    if ($LASTEXITCODE -ne 0) { throw "Python dependency setup failed: $($project.Path)" }
}

$videoRenderer = Join-Path $workspaceRoot 'ai\runtime\modules\content-ai\content-campaign-runtime\video-renderer'
Write-Host '[setup] content video renderer'
& npm.cmd install --prefix $videoRenderer
if ($LASTEXITCODE -ne 0) { throw 'Content video renderer dependency setup failed' }
& npm.cmd run build --prefix $videoRenderer
if ($LASTEXITCODE -ne 0) { throw 'Content video renderer build failed' }

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
    Write-Warning 'System FFmpeg/ffprobe not found. Browser-side clipping remains available; server-side full-video fallback will report FFmpeg unavailable.'
}

if (-not $SkipFrontend) {
    Write-Host '[setup] frontend'
    & npm.cmd install --prefix (Join-Path $workspaceRoot 'frontend')
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency setup failed' }
}

Write-Host 'All runtime dependencies are ready.'
