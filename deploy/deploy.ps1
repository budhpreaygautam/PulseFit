# Builds PulseFit on this PC and puts it live on the server, with an automatic rollback if the
# new version does not start. Needs the OpenSSH client (built into Windows 10/11).
#
#   First time (also prepares the server):
#     .\deploy\deploy.ps1 -Server 203.0.113.10 -Setup -PublicUrl https://pulsefit.example.org
#   Every update after that:
#     .\deploy\deploy.ps1 -Server 203.0.113.10
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$User = 'ubuntu',
  [string]$Key = "$env:USERPROFILE\.ssh\pulsefit_server",
  [switch]$Setup,
  [string]$PublicUrl,
  # Skip the build when it was just run.
  [switch]$NoBuild
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if ($Setup -and $PublicUrl -notmatch '^https://[a-z0-9.-]+$') { throw '-Setup needs -PublicUrl https://your.domain (no trailing slash).' }
if (-not (Test-Path -LiteralPath $Key)) { throw "SSH key not found: $Key" }
$ssh = @('-i', $Key, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')
$target = "$User@$Server"

function Invoke-Native([string]$exe, [string[]]$arguments) {
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "$exe failed (exit $LASTEXITCODE)" }
}

if (-not $NoBuild) {
  Write-Host '==> Building server and website'
  Push-Location $repo
  try { Invoke-Native 'npm.cmd' @('run', 'build') } finally { Pop-Location }
}
foreach ($required in 'server\dist\index.js', 'client\dist\index.html') {
  if (-not (Test-Path -LiteralPath (Join-Path $repo $required))) { throw "Build output missing: $required" }
}

Write-Host '==> Packing the release'
$stage = Join-Path $env:TEMP 'pulsefit-release'
$archive = Join-Path $env:TEMP 'pulsefit-release.tgz'
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path "$stage\server", "$stage\client", "$stage\deploy" | Out-Null
Copy-Item -LiteralPath "$repo\server\dist" -Destination "$stage\server\dist" -Recurse
Copy-Item -LiteralPath "$repo\server\package.json", "$repo\server\package-lock.json" -Destination "$stage\server"
Copy-Item -LiteralPath "$repo\client\dist" -Destination "$stage\client\dist" -Recurse
# Shell scripts must reach Linux with LF line endings, whatever git did to them on Windows.
foreach ($file in Get-ChildItem -LiteralPath "$repo\deploy" -File | Where-Object { $_.Extension -in '.sh', '.service' }) {
  $text = [IO.File]::ReadAllText($file.FullName) -replace "`r`n", "`n"
  [IO.File]::WriteAllText((Join-Path "$stage\deploy" $file.Name), $text, (New-Object Text.UTF8Encoding $false))
}
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
Invoke-Native 'tar.exe' @('-czf', $archive, '-C', $stage, '.')
Remove-Item -LiteralPath $stage -Recurse -Force
Write-Host ("   {0:N1} MB" -f ((Get-Item -LiteralPath $archive).Length / 1MB))

Write-Host "==> Uploading to $target"
Invoke-Native 'scp.exe' ($ssh + @($archive, "${target}:/tmp/pulsefit-release.tgz"))
Remove-Item -LiteralPath $archive -Force

$remote = @(
  'set -e',
  'rm -rf /tmp/pulsefit-stage && mkdir -p /tmp/pulsefit-stage',
  'tar -xzf /tmp/pulsefit-release.tgz -C /tmp/pulsefit-stage ./deploy'
)
if ($Setup) { $remote += "sudo bash /tmp/pulsefit-stage/deploy/server-setup.sh '$PublicUrl'" }
$remote += 'sudo bash /tmp/pulsefit-stage/deploy/install-release.sh /tmp/pulsefit-release.tgz'
$remote += 'rm -rf /tmp/pulsefit-stage'
Write-Host '==> Installing on the server'
Invoke-Native 'ssh.exe' ($ssh + @($target, ($remote -join ' && ')))
Write-Host '==> Done'
