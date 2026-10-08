[CmdletBinding()]
param(
    [string]$KeytoolPath = "keytool",
    [string]$KeyDirectory = (Join-Path $env:USERPROFILE ".codex\private\richangyu-preview-signing"),
    [string]$BackupDirectory = (Join-Path $env:LOCALAPPDATA "Richangyu\SigningBackup\Preview")
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($env:OS -ne "Windows_NT") { throw "This helper requires Windows current-user credential encryption." }
$workspace = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$keytool = (Get-Command $KeytoolPath -ErrorAction Stop).Source

function Protect-Directory([string]$Path) {
    $full = [System.IO.Path]::GetFullPath($Path)
    if ($full.Equals($workspace, [StringComparison]::OrdinalIgnoreCase) -or
        $full.StartsWith($workspace.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Signing keys and backups must remain outside the source workspace."
    }
    if (Test-Path -LiteralPath $full) {
        $entry = Get-Item -LiteralPath $full -Force
        if (-not $entry.PSIsContainer -or
            ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            throw "The signing destination must be an ordinary directory."
        }
    } else { [System.IO.Directory]::CreateDirectory($full) | Out-Null }
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $system = [System.Security.Principal.SecurityIdentifier]::new("S-1-5-18")
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($user)
    $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
        [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    foreach ($identity in @($user, $system)) {
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
            $identity, [System.Security.AccessControl.FileSystemRights]::FullControl,
            $inherit, [System.Security.AccessControl.PropagationFlags]::None,
            [System.Security.AccessControl.AccessControlType]::Allow))
    }
    Set-Acl -LiteralPath $full -AclObject $acl
    return $full
}

$keyRoot = Protect-Directory $KeyDirectory
$backupRoot = Protect-Directory $BackupDirectory
if ($keyRoot.Equals($backupRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Use separate primary and backup directories."
}
$keyPath = Join-Path $keyRoot "preview.keystore"
$metadataPath = Join-Path $keyRoot "credentials.dpapi.json"
$certificatePath = Join-Path $keyRoot "preview-certificate.der"
$exists = @(
    (Test-Path -LiteralPath $keyPath -PathType Leaf),
    (Test-Path -LiteralPath $metadataPath -PathType Leaf),
    (Test-Path -LiteralPath $certificatePath -PathType Leaf)
)
if (($exists -contains $true) -and ($exists -contains $false)) {
    throw "Incomplete existing signing material. Refusing to replace or rotate any key."
}
if (-not ($exists -contains $true)) {
    $storeBytes = [byte[]]::new(32)
    $keyBytes = [byte[]]::new(32)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($storeBytes); $rng.GetBytes($keyBytes) }
    finally { $rng.Dispose() }
    $storePassword = [Convert]::ToHexString($storeBytes)
    $keyPassword = [Convert]::ToHexString($keyBytes)
    $priorStore = [Environment]::GetEnvironmentVariable("RICHANGYU_SIGNING_STORE_PASS", "Process")
    $priorKey = [Environment]::GetEnvironmentVariable("RICHANGYU_SIGNING_KEY_PASS", "Process")
    try {
        [Environment]::SetEnvironmentVariable("RICHANGYU_SIGNING_STORE_PASS", $storePassword, "Process")
        [Environment]::SetEnvironmentVariable("RICHANGYU_SIGNING_KEY_PASS", $keyPassword, "Process")
        $generateArgs = @(
            "-genkeypair", "-noprompt", "-keystore", $keyPath, "-storetype", "JKS",
            "-storepass:env", "RICHANGYU_SIGNING_STORE_PASS", "-keypass:env", "RICHANGYU_SIGNING_KEY_PASS",
            "-alias", "preview", "-keyalg", "RSA", "-keysize", "3072", "-sigalg", "SHA256withRSA",
            "-validity", "10000", "-dname", "CN=Richangyu Preview, OU=Preview, O=Richangyu, C=CN"
        )
        & $keytool @generateArgs | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Preview key generation failed." }
        $exportArgs = @(
            "-exportcert", "-keystore", $keyPath, "-storepass:env", "RICHANGYU_SIGNING_STORE_PASS",
            "-alias", "preview", "-file", $certificatePath
        )
        & $keytool @exportArgs | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Public preview certificate export failed." }
        $metadata = [ordered]@{
            version = 1
            alias = "preview"
            certificateSha256 = (Get-FileHash -LiteralPath $certificatePath -Algorithm SHA256).Hash.ToLowerInvariant()
            storePassword = (ConvertTo-SecureString $storePassword -AsPlainText -Force | ConvertFrom-SecureString)
            keyPassword = (ConvertTo-SecureString $keyPassword -AsPlainText -Force | ConvertFrom-SecureString)
            passwordProtection = "Windows-current-user-DPAPI"
        }
        [System.IO.File]::WriteAllText(
            $metadataPath, ($metadata | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
    } finally {
        [Environment]::SetEnvironmentVariable("RICHANGYU_SIGNING_STORE_PASS", $priorStore, "Process")
        [Environment]::SetEnvironmentVariable("RICHANGYU_SIGNING_KEY_PASS", $priorKey, "Process")
        [Array]::Clear($storeBytes, 0, $storeBytes.Length)
        [Array]::Clear($keyBytes, 0, $keyBytes.Length)
        $storePassword = $null; $keyPassword = $null
    }
}
foreach ($source in @($keyPath, $metadataPath, $certificatePath)) {
    $destination = Join-Path $backupRoot ([System.IO.Path]::GetFileName($source))
    if (Test-Path -LiteralPath $destination) {
        if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne
            (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash) {
            throw "Existing backup differs. Refusing to overwrite any signing backup."
        }
    } else { Copy-Item -LiteralPath $source -Destination $destination }
}
[pscustomobject]@{
    status = "prepared"
    keyDirectory = $keyRoot
    backupDirectory = $backupRoot
    keyAlias = "preview"
    previewKeyPath = $keyPath
    encryptedMetadataPath = $metadataPath
    certificateSha256 = (Get-FileHash -LiteralPath $certificatePath -Algorithm SHA256).Hash.ToLowerInvariant()
    credentialEncryption = "Windows-current-user-DPAPI"
} | ConvertTo-Json -Compress
