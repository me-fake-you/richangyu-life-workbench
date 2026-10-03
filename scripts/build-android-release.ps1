param(
    [ValidateSet('debug','release')][string]$BuildType = 'debug',
    [ValidateSet('apk','aab')][string]$OutputType = 'apk'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root 'android'
if ($BuildType -eq 'debug' -and $OutputType -eq 'aab') { throw 'AAB requires release mode and formal signing.' }
if ($BuildType -eq 'release') {
    if (!(Test-Path -LiteralPath "$android/app/release.keystore")) { throw 'Preserve and configure the existing release keystore. Do not regenerate it.' }
    if (!$env:RICHANGYU_ANDROID_KEYSTORE_PASSWORD -or !$env:RICHANGYU_ANDROID_KEY_PASSWORD) {
        throw 'Configure signing passwords locally. Never paste them into chat or public files.'
    }
}
$task = if ($OutputType -eq 'aab') { ':app:bundleRelease' } elseif ($BuildType -eq 'release') { ':app:assembleRelease' } else { ':app:assembleDebug' }
Push-Location $android
try {
    & .\gradlew.bat :app:testDebugUnitTest $task --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android tests/build failed. No package copied; do not skip checks.' }
} finally { Pop-Location }
$source = if ($OutputType -eq 'aab') { "$android/app/build/outputs/bundle/release/app-release.aab" } else { "$android/app/build/outputs/apk/$BuildType/app-$BuildType.apk" }
$out = Join-Path $root 'outputs/android'
$null = New-Item -ItemType Directory -Path $out -Force
$target = Join-Path $out "life-workbench-$BuildType.$OutputType"
Copy-Item -LiteralPath $source -Destination $target -Force
$hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$target.sha256", "$hash  $([IO.Path]::GetFileName($target))"+[Environment]::NewLine, [Text.Encoding]::ASCII)
Write-Output "Package: $target"
Write-Output "SHA-256: $hash"
if ($BuildType -eq 'debug') { Write-Warning 'Development preview only; not an app-store signed release or real-device acceptance.' }
