$ErrorActionPreference = 'SilentlyContinue'
$appId = 'hk.cyrene.cytime'
$cacheRoot = Join-Path $env:LOCALAPPDATA $appId

Write-Host '[1/4] Killing CyTime...' -ForegroundColor Cyan
Get-Process -Name 'cytime' | Stop-Process -Force
Start-Sleep -Milliseconds 400

Write-Host '[2/4] Clearing WebView2 cache (preserving data)...' -ForegroundColor Cyan
$eb = Join-Path $cacheRoot 'EBWebView'
if (Test-Path $eb) {
  $default = Join-Path $eb 'Default'
  foreach ($name in @('Cache', 'Code Cache', 'Service Worker\CacheStorage', 'GPUPersistentCache', 'GrShaderCache')) {
    $target = Join-Path $default $name
    if (Test-Path $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  }
  foreach ($name in @('BrowserMetrics', 'CertificateRevocation', 'Crashpad', 'component_crx_cache', 'extensions_crx_cache')) {
    $target = Join-Path $eb $name
    if (Test-Path $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  }
}

Write-Host '[3/4] Uninstalling old version...' -ForegroundColor Cyan
$entries = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object { $_.DisplayName -match 'CyTime' }
foreach ($entry in $entries) {
  $uninstaller = ($entry.UninstallString -replace '^"|"$','').Split(' ')[0]
  if (Test-Path $uninstaller) { Start-Process $uninstaller -ArgumentList '/S' -Wait }
}

Write-Host '[4/4] Installing latest NSIS package...' -ForegroundColor Cyan
$nsis = Get-ChildItem (Join-Path $PSScriptRoot '..\src-tauri\target\release\bundle\nsis') -Filter '*setup.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $nsis) { throw 'NSIS installer not found. Run bun run tauri:build first.' }
Start-Process $nsis.FullName -ArgumentList '/S' -Wait
Write-Host "Installed $($nsis.Name)" -ForegroundColor Green
