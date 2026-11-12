param([string]$BackendPath = (Split-Path -Parent $PSScriptRoot), [string]$NodePath = '')
$ErrorActionPreference = 'Stop'
$resolvedBackend = (Resolve-Path -LiteralPath $BackendPath).Path
$entry = Join-Path $resolvedBackend 'dist/scripts/cleanup-accounts.js'
if (!(Test-Path -LiteralPath $entry)) { throw 'Build the backend before running account cleanup.' }
$logDirectory = Join-Path $resolvedBackend 'logs/account-cleanup'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$node = if ($NodePath) { (Resolve-Path -LiteralPath $NodePath).Path } else { (Get-Command node -ErrorAction Stop).Source }
$process = Start-Process -FilePath $node -ArgumentList @('"' + $entry + '"') -WorkingDirectory $resolvedBackend -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $logDirectory "$stamp.out.log") -RedirectStandardError (Join-Path $logDirectory "$stamp.error.log")
exit $process.ExitCode
