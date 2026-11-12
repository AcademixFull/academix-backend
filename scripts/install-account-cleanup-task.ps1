param([switch]$ActivatePermanentDeletion, [string]$BackendPath = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
if (!$ActivatePermanentDeletion) { throw 'No task was installed. Validate the migration and isolated tests, then explicitly supply -ActivatePermanentDeletion.' }
$resolvedBackend = (Resolve-Path -LiteralPath $BackendPath).Path
$runner = Join-Path $resolvedBackend 'scripts/run-account-cleanup.ps1'
if (!(Test-Path -LiteralPath (Join-Path $resolvedBackend 'dist/scripts/cleanup-accounts.js'))) { throw 'Build the backend before installing the task.' }
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$node = (Get-Command node -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $powershell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $runner + '" -BackendPath "' + $resolvedBackend + '" -NodePath "' + $node + '"') -WorkingDirectory $resolvedBackend
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
# Explicitly invoked installer only; no application startup installs this task.
Register-ScheduledTask -TaskName 'Academix Account Cleanup' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Processes due Academix account deletions; durable PostgreSQL queue and leases.'
