# 从 Edge 的 Local State 里取出 os_crypt 密钥，用 Windows DPAPI（当前用户）解密。
# 结果写到 .cache/.dpapi-key（base64，32 字节 AES-256 密钥）。绝不打印密钥本身。
#
# 只在本机、当前用户下有意义；换用户或换机器都解不开。

$ErrorActionPreference = 'Stop'

$repo   = Split-Path -Parent $PSScriptRoot
$cache  = Join-Path $repo '.cache'
New-Item -ItemType Directory -Force -Path $cache | Out-Null

$userData = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data'
$localState = Join-Path $userData 'Local State'

if (-not (Test-Path $localState)) { throw "找不到 Edge Local State: $localState" }

$json = Get-Content $localState -Raw -Encoding UTF8 | ConvertFrom-Json
$b64  = $json.os_crypt.encrypted_key
if (-not $b64) { throw 'Local State 里没有 os_crypt.encrypted_key' }

$blob = [Convert]::FromBase64String($b64)

# 前 5 字节是 'DPAPI' 标记
$marker = [Text.Encoding]::ASCII.GetString($blob[0..4])
if ($marker -ne 'DPAPI') { throw "encrypted_key 前缀不是 DPAPI，而是 '$marker'" }
$enc = $blob[5..($blob.Length - 1)]

# --- 优先用 .NET 的 ProtectedData ---
$key = $null
try {
  Add-Type -AssemblyName System.Security.Cryptography.ProtectedData -ErrorAction Stop
  $key = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $enc, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
} catch {
  Write-Output "ProtectedData 不可用（$($_.Exception.Message)），改用 CryptUnprotectData P/Invoke"
}

# --- 回退：直接调 CryptUnprotectData ---
if (-not $key) {
  Add-Type -Namespace Win32 -Name Crypt -MemberDefinition @'
    [DllImport("crypt32.dll", SetLastError=true, CharSet=CharSet.Auto)]
    public static extern bool CryptUnprotectData(
        ref DATA_BLOB pDataIn, IntPtr ppszDataDescr, IntPtr pOptionalEntropy,
        IntPtr pvReserved, IntPtr pPromptStruct, int dwFlags, ref DATA_BLOB pDataOut);
    [StructLayout(LayoutKind.Sequential)]
    public struct DATA_BLOB { public int cbData; public IntPtr pbData; }
'@
  $blobIn = New-Object Win32.Crypt+DATA_BLOB
  $blobIn.cbData = $enc.Length
  $blobIn.pbData = [Runtime.InteropServices.Marshal]::AllocHGlobal($enc.Length)
  [Runtime.InteropServices.Marshal]::Copy($enc, 0, $blobIn.pbData, $enc.Length)

  $blobOut = New-Object Win32.Crypt+DATA_BLOB
  $ok = [Win32.Crypt]::CryptUnprotectData([ref]$blobIn, [IntPtr]::Zero, [IntPtr]::Zero,
        [IntPtr]::Zero, [IntPtr]::Zero, 0, [ref]$blobOut)
  if (-not $ok) { throw "CryptUnprotectData 失败，Win32 错误码 $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }

  $key = New-Object byte[] $blobOut.cbData
  [Runtime.InteropServices.Marshal]::Copy($blobOut.pbData, $key, 0, $blobOut.cbData)
  [Runtime.InteropServices.Marshal]::FreeHGlobal($blobIn.pbData)
}

if ($key.Length -ne 32) { throw "解出的密钥长度是 $($key.Length)，期望 32" }

[Convert]::ToBase64String($key) | Set-Content (Join-Path $cache '.dpapi-key') -NoNewline -Encoding ASCII
Write-Output "✓ 已写出 .cache/.dpapi-key（32 字节 AES 密钥，未打印内容）"
