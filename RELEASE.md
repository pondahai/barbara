# Barbara 發佈流程

## 日常發佈（設定完成後）

```powershell
# 1. 調高 manifest.json 的 version（商店規定每次上傳必須比前一版高）
# 2. 執行：
.\release.ps1            # 同步 dist → 打包 zip → 上傳為草稿
.\release.ps1 -Publish   # 同上，並直接送審發佈
.\release.ps1 -ZipOnly   # 只打包（不上傳，維持手動上傳流程時用）
```

腳本會自動：把根目錄的執行檔案同步到 `dist/`、依 manifest 版本產生 `barbara-v{版本}.zip`、透過 Chrome Web Store Publish API 上傳。

## 一次性設定（約 10 分鐘，只需做一次）

Chrome Web Store API 需要 OAuth 憑證，步驟：

1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)，用**發佈 Barbara 的同一個 Google 帳號**登入，建立一個新專案（名稱隨意，如 `barbara-release`）。
2. 「API 和服務」→「程式庫」→ 搜尋 **Chrome Web Store API** → 啟用。
3. 「API 和服務」→「OAuth 同意畫面」→ 使用者類型選「外部」→ 填 App 名稱與信箱 → 「測試使用者」加入自己的帳號。
4. 「API 和服務」→「憑證」→「建立憑證」→「OAuth 用戶端 ID」→ 應用程式類型選「**電腦版應用程式**」→ 記下 Client ID 與 Client Secret。
5. 回到 repo 執行：
   ```powershell
   .\release.ps1 -GetToken
   ```
   依提示貼上 Client ID / Secret → 開啟授權網址登入 → 從跳轉後的網址列複製 `code=` 的值貼回 → 憑證自動存到 `.cws-credentials.json`（已被 `.gitignore` 排除）。

完成後即可使用日常發佈指令。

## 注意事項

- **版本號必須遞增**：上傳同版本號會被 API 拒絕（`uploadState: FAILURE`）。
- `-Publish` 送審後仍需通過 Google 審核才會上架（通常數小時到數天），API 只是取代手動上傳與按鈕。
- `.cws-credentials.json` 含 refresh token，等同後台操作權，**絕對不要提交進 git**。
- 憑證也可改用環境變數提供：`CWS_CLIENT_ID`、`CWS_CLIENT_SECRET`、`CWS_REFRESH_TOKEN`（優先於檔案）。
- 商店 item ID：`ccpdgcdldfgcdnfgigmnlimbnojamghi`（寫死在 release.ps1）。
