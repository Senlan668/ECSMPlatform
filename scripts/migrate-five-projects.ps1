[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$SourceRoot,
    [string]$WorkspaceRoot = 'D:\Code\AIPlatform'
)

$ErrorActionPreference = 'Stop'

$sourceRootPath = (Resolve-Path -LiteralPath $SourceRoot).Path
$workspaceRootPath = (Resolve-Path -LiteralPath $WorkspaceRoot).Path

if ($sourceRootPath -eq $workspaceRootPath) {
    throw 'SourceRoot and WorkspaceRoot must be different directories.'
}

$excludedDirectoryNames = @(
    '.git',
    '.idea',
    '.vscode',
    '.venv',
    'venv',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '.ruff_cache',
    'test-results',
    'playwright-report',
    'blob-report',
    '.runtime',
    'logs'
)

$excludedExtensions = @(
    '.db',
    '.dump',
    '.log',
    '.mp3',
    '.mp4',
    '.p12',
    '.pem',
    '.pfx',
    '.pyc',
    '.sqlite',
    '.sqlite3',
    '.wav',
    '.zip'
)

$sourceDirectories = Get-ChildItem -LiteralPath $sourceRootPath -Directory

$liveClipDirectory = $sourceDirectories | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.FullName 'backend\app\workers\pipeline.py')
} | Select-Object -First 1
$salesKnowledgeDirectory = $sourceDirectories | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.FullName 'AGENTS.md')
} | Select-Object -First 1
$voiceDirectory = $sourceDirectories | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.FullName 'rag_llm_server\services\rag_service.py')
} | Select-Object -First 1
$contentCampaignDirectory = $sourceDirectories | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.FullName 'app\graph\workflow.py')
} | Select-Object -First 1
$mcpContainerDirectory = $sourceDirectories | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.FullName 'mcp-demo\gateway\main.py')
} | Select-Object -First 1

$discoveredDirectories = @(
    $liveClipDirectory,
    $salesKnowledgeDirectory,
    $voiceDirectory,
    $contentCampaignDirectory,
    $mcpContainerDirectory
)
if ($discoveredDirectories.Where({ $null -eq $_ }).Count -gt 0) {
    throw 'Could not discover all five source projects from their feature files.'
}

$mappings = @(
    @{
        Name = 'live-clip-runtime'
        SourcePath = $liveClipDirectory.FullName
        Target = 'ai\media-workers\modules\media-processing\live-clip-runtime'
        ExcludedPrefixes = @()
        ExcludedFiles = @('ai_slice_backup.sql', 'backend\ai_slice_dump.sql')
    },
    @{
        Name = 'sales-knowledge-runtime'
        SourcePath = $salesKnowledgeDirectory.FullName
        Target = 'ai\runtime\modules\customer-service-ai\sales-knowledge-runtime'
        ExcludedPrefixes = @()
        ExcludedFiles = @('docker\initdb\01-data.sql')
    },
    @{
        Name = 'voice-service-runtime'
        SourcePath = $voiceDirectory.FullName
        Target = 'ai\runtime\modules\customer-service-ai\voice-service-runtime'
        ExcludedPrefixes = @()
        ExcludedFiles = @()
    },
    @{
        Name = 'content-campaign-runtime'
        SourcePath = $contentCampaignDirectory.FullName
        Target = 'ai\runtime\modules\content-ai\content-campaign-runtime'
        ExcludedPrefixes = @('static')
        ExcludedFiles = @('scripts\test_output.txt')
    },
    @{
        Name = 'shared-ai-services'
        SourcePath = $mcpContainerDirectory.FullName
        Target = 'ai\runtime\modules\model-gateway\shared-ai-services'
        ExcludedPrefixes = @('mcp-demo\data\chromadb', 'mcp-demo\data\sqlite')
        ExcludedFiles = @()
    }
)

function Test-IsExcludedPath {
    param(
        [Parameter(Mandatory)] [string]$RelativePath,
        [Parameter(Mandatory)] [hashtable]$Mapping
    )

    $segments = $RelativePath -split '[\\/]'
    foreach ($segment in $segments) {
        if ($excludedDirectoryNames -contains $segment) {
            return $true
        }
    }

    foreach ($prefix in $Mapping.ExcludedPrefixes) {
        if ($RelativePath -eq $prefix -or $RelativePath.StartsWith("$prefix\", [StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }

    foreach ($file in $Mapping.ExcludedFiles) {
        if ($RelativePath.Equals($file, [StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }

    $name = [IO.Path]::GetFileName($RelativePath)
    if ($name -eq '.env' -or $name -eq 'env.example' -or $name.StartsWith('.env.', [StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }

    $extension = [IO.Path]::GetExtension($RelativePath).ToLowerInvariant()
    return $excludedExtensions -contains $extension
}

$results = @()

$targetChecks = @()
foreach ($mapping in $mappings) {
    $targetPath = [IO.Path]::GetFullPath((Join-Path $workspaceRootPath $mapping.Target))
    if (-not $targetPath.StartsWith($workspaceRootPath, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Resolved target escaped WorkspaceRoot: $targetPath"
    }

    $targetExists = Test-Path -LiteralPath $targetPath
    if ($targetExists) {
        $existingItems = @(Get-ChildItem -LiteralPath $targetPath -Force)
        if ($existingItems.Count -gt 0) {
            throw "Target already contains files; refusing to overwrite: $targetPath"
        }
    }

    $targetChecks += [pscustomobject]@{
        Mapping = $mapping
        TargetPath = $targetPath
        ExistsAndEmpty = $targetExists
    }
}

$stagingRootPath = [IO.Path]::GetFullPath((Join-Path $workspaceRootPath ('.migration-staging-' + [Guid]::NewGuid().ToString('N'))))
if (-not $stagingRootPath.StartsWith($workspaceRootPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Resolved staging directory escaped WorkspaceRoot: $stagingRootPath"
}
New-Item -ItemType Directory -Path $stagingRootPath | Out-Null

try {
    foreach ($targetCheck in $targetChecks) {
        $mapping = $targetCheck.Mapping
        $sourcePath = [IO.Path]::GetFullPath($mapping.SourcePath)
        $targetPath = [IO.Path]::GetFullPath((Join-Path $stagingRootPath $mapping.Target))

        if (-not $sourcePath.StartsWith($sourceRootPath, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Resolved source escaped SourceRoot: $sourcePath"
        }
        if (-not $targetPath.StartsWith($stagingRootPath, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Resolved staged target escaped staging directory: $targetPath"
        }
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
            throw "Source directory does not exist: $sourcePath"
        }

        New-Item -ItemType Directory -Path $targetPath -Force | Out-Null

        $copiedFiles = 0
        $copiedBytes = [long]0
        $skippedFiles = 0

        foreach ($sourceFile in Get-ChildItem -LiteralPath $sourcePath -Recurse -File -Force) {
            $relativePath = $sourceFile.FullName.Substring($sourcePath.Length).TrimStart([char[]]@('\', '/'))
            if (Test-IsExcludedPath -RelativePath $relativePath -Mapping $mapping) {
                $skippedFiles++
                continue
            }

            $destinationFile = Join-Path $targetPath $relativePath
            $destinationDirectory = Split-Path -Parent $destinationFile
            if (-not (Test-Path -LiteralPath $destinationDirectory)) {
                New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
            }

            Copy-Item -LiteralPath $sourceFile.FullName -Destination $destinationFile
            $copiedFiles++
            $copiedBytes += $sourceFile.Length
        }

        $results += [pscustomobject]@{
            Name = $mapping.Name
            Source = $sourcePath
            Target = $targetCheck.TargetPath
            CopiedFiles = $copiedFiles
            CopiedBytes = $copiedBytes
            SkippedFiles = $skippedFiles
        }
    }

    foreach ($targetCheck in $targetChecks) {
        if ($targetCheck.ExistsAndEmpty) {
            Remove-Item -LiteralPath $targetCheck.TargetPath
        }

        $targetParent = Split-Path -Parent $targetCheck.TargetPath
        if (-not (Test-Path -LiteralPath $targetParent)) {
            New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
        }

        $stagedTarget = Join-Path $stagingRootPath $targetCheck.Mapping.Target
        Move-Item -LiteralPath $stagedTarget -Destination $targetCheck.TargetPath
    }
}
finally {
    if (Test-Path -LiteralPath $stagingRootPath) {
        Remove-Item -LiteralPath $stagingRootPath -Recurse -Force
    }
}

$results | Format-Table -AutoSize
