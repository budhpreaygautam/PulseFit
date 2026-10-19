# Copies the newest server database backup to this PC, so a copy survives even if the server is lost.
#   .\deploy\pull-backup.ps1 -Server 203.0.113.10
# To run it every day, create a Windows scheduled task (see deploy/README.md).
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$User = 'ubuntu',
  [string]$Key = "$env:USERPROFILE\.ssh\pulsefit_server",
  [string]$Destination = "$env:USERPROFILE\PulseFit-backups",
  [int]$KeepDays = 60
)
$ErrorActionPreference = 'Stop'
$ssh = @('-i', $Key, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')
$target = "$User@$Server"
New-Item -ItemType Directory -Force -Path $Destination | Out-Null

# Make a fresh backup, hand a copy to the login user, download it, then remove the copy.
$name = (& ssh.exe @ssh $target 'sudo /usr/local/sbin/pulsefit-backup && f=$(sudo ls -1t /var/lib/pulsefit/backups | head -1) && sudo install -m 600 -o $(id -un) "/var/lib/pulsefit/backups/$f" "/tmp/$f" && echo $f').Trim()
if ($LASTEXITCODE -ne 0 -or -not $name) { throw 'Could not prepare a backup on the server.' }
& scp.exe @ssh "${target}:/tmp/$name" (Join-Path $Destination $name)
$copied = $LASTEXITCODE -eq 0
& ssh.exe @ssh $target "rm -f /tmp/$name" | Out-Null
if (-not $copied) { throw 'Download failed.' }

Get-ChildItem -LiteralPath $Destination -Filter 'gym-db-*.json.gz' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item -Force
Write-Host "Saved $Destination\$name"
