<#
.SYNOPSIS
Barbara 一鍵發佈腳本：同步檔案到 dist → 打包 zip → 上傳 Chrome Web Store →（可選）送審發佈。

.DESCRIPTION
用法：
  .\release.ps1 -ZipOnly    # 只同步 dist 並打包 zip（不需要憑證）
  .\release.ps1             # 同步 + 打包 + 上傳為草稿（可再到後台手動按發佈）
  .\release.ps1 -Publish    # 同步 + 打包 + 上傳 + 直接送審發佈
  .\release.ps1 -GetToken   # 一次性：引導取得 API 憑證並存到 .cws-credentials.json

憑證來源（擇一）：
  1. 環境變數 CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN
  2. repo 根目錄的 .cws-credentials.json（已加入 .gitignore，勿提交）

一次性設定步驟見 RELEASE.md。
#>
param(
    [switch]$Publish,
    [switch]$ZipOnly,
    [switch]$GetToken
)

$ErrorActionPreference = 'Stop'
$ExtensionId = 'ccpdgcdldfgcdnfgigmnlimbnojamghi'
$Root = $PSScriptRoot
$Dist = Join-Path $Root 'dist'
$CredFile = Join-Path $Root '.cws-credentials.json'

# 要打包進擴充功能的檔案清單（相對於 repo 根目錄，即 dist 的完整內容）
$Files = @(
    'manifest.json',
    'background.js',
    'content.js',
    'sidepanel.html',
    'sidepanel.js',
    'settings.html',
    'settings.js',
    'popup/popup.html',
    'popup/popup.js',
    'marked.min.js',
    'styles.css',
    'icon.png',
    'lang.gif',
    'summary.gif'
)

function Get-CwsCredentials {
    if ($env:CWS_CLIENT_ID -and $env:CWS_CLIENT_SECRET -and $env:CWS_REFRESH_TOKEN) {
        return @{
            client_id     = $env:CWS_CLIENT_ID
            client_secret = $env:CWS_CLIENT_SECRET
            refresh_token = $env:CWS_REFRESH_TOKEN
        }
    }
    if (Test-Path $CredFile) {
        $j = Get-Content $CredFile -Raw -Encoding UTF8 | ConvertFrom-Json
        return @{
            client_id     = $j.client_id
            client_secret = $j.client_secret
            refresh_token = $j.refresh_token
        }
    }
    throw "找不到憑證。請先執行 .\release.ps1 -GetToken 完成一次性設定（見 RELEASE.md）。"
}

# ---- 一次性：取得 refresh token ----
if ($GetToken) {
    Write-Host "=== Chrome Web Store API 憑證設定 ===" -ForegroundColor Cyan
    Write-Host "前置作業（詳見 RELEASE.md）：Google Cloud Console 建立 OAuth 用戶端（桌面應用程式）並啟用 Chrome Web Store API。"
    $cid = Read-Host "請貼上 Client ID"
    $csec = Read-Host "請貼上 Client Secret"

    $authUrl = "https://accounts.google.com/o/oauth2/auth?client_id=$cid&redirect_uri=http://localhost:8818&response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&access_type=offline&prompt=consent"
    Write-Host "`n請用瀏覽器開啟以下網址並登入你的開發者帳號授權：" -ForegroundColor Yellow
    Write-Host $authUrl
    Write-Host "`n授權後瀏覽器會導向 http://localhost:8818/?code=XXXX（頁面顯示無法連線是正常的），"
    Write-Host "請從網址列複製 code= 後面的那串值（& 之前）。"
    $code = Read-Host "請貼上 code"

    $tok = Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' -Body @{
        client_id     = $cid
        client_secret = $csec
        code          = $code
        redirect_uri  = 'http://localhost:8818'
        grant_type    = 'authorization_code'
    }
    if (-not $tok.refresh_token) { throw "沒有取得 refresh_token，請確認授權網址帶有 access_type=offline&prompt=consent 後重試。" }

    @{ client_id = $cid; client_secret = $csec; refresh_token = $tok.refresh_token } |
        ConvertTo-Json | Set-Content -Path $CredFile -Encoding utf8
    Write-Host "`n✅ 憑證已存到 $CredFile（已被 .gitignore 排除，請勿提交）。" -ForegroundColor Green
    Write-Host "之後直接執行 .\release.ps1 或 .\release.ps1 -Publish 即可。"
    exit 0
}

# ---- 1. 同步 root -> dist ----
Write-Host "[1/4] 同步檔案到 dist ..." -ForegroundColor Cyan
foreach ($f in $Files) {
    $src = Join-Path $Root $f
    $dst = Join-Path $Dist $f
    if (-not (Test-Path $src)) { throw "缺少檔案: $f" }
    $dstDir = Split-Path $dst -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Force $dstDir | Out-Null }
    Copy-Item $src $dst -Force
}

# ---- 2. 讀版本、打包 zip ----
# -Encoding UTF8 必須明寫：PS 5.1 對無 BOM 檔案預設用 ANSI 解讀，中文 description 會破壞 JSON
$manifest = Get-Content (Join-Path $Root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
$zipPath = Join-Path $Root "barbara-v$version.zip"
Write-Host "[2/4] 打包 v$version -> $zipPath ..." -ForegroundColor Cyan
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $Dist '*') -DestinationPath $zipPath

if ($ZipOnly) {
    Write-Host "✅ 已完成打包（-ZipOnly）：$zipPath" -ForegroundColor Green
    exit 0
}

# ---- 3. 取得 access token 並上傳 ----
Write-Host "[3/4] 上傳到 Chrome Web Store（item: $ExtensionId）..." -ForegroundColor Cyan
$creds = Get-CwsCredentials
$tok = Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' -Body @{
    client_id     = $creds.client_id
    client_secret = $creds.client_secret
    refresh_token = $creds.refresh_token
    grant_type    = 'refresh_token'
}
$headers = @{ Authorization = "Bearer $($tok.access_token)"; 'x-goog-api-version' = '2' }

$upload = Invoke-RestMethod -Method Put `
    -Uri "https://www.googleapis.com/upload/chromewebstore/v1.1/items/$ExtensionId" `
    -Headers $headers -InFile $zipPath -ContentType 'application/zip'

if ($upload.uploadState -ne 'SUCCESS') {
    Write-Host ($upload | ConvertTo-Json -Depth 5) -ForegroundColor Red
    throw "上傳失敗（uploadState: $($upload.uploadState)）。常見原因：版本號未調高、manifest 格式錯誤。"
}
Write-Host "✅ 上傳成功（v$version 已成為草稿）。" -ForegroundColor Green

# ---- 4. （可選）送審發佈 ----
if ($Publish) {
    Write-Host "[4/4] 送審發佈 ..." -ForegroundColor Cyan
    $pub = Invoke-RestMethod -Method Post `
        -Uri "https://www.googleapis.com/chromewebstore/v1.1/items/$ExtensionId/publish" `
        -Headers $headers
    Write-Host "✅ 已送審。狀態: $($pub.status -join ', ')（審核通過後自動上架）" -ForegroundColor Green
} else {
    Write-Host "[4/4] 未加 -Publish，僅上傳為草稿。可到開發者後台確認後手動發佈，或重跑 .\release.ps1 -Publish" -ForegroundColor Yellow
}
