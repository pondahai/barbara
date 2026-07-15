# 兩階段生成架構筆記（自由推理 → 反芻抽取）

這份筆記記錄 Barbara 在使用本地模型作為代理人時的架構結論：將「推理」與「格式化輸出」拆成兩個階段，格式約束只施加在第二階段。此為討論結論，尚未實作。

## 核心結論

### 1. Barbara 現況已是「退化版」兩階段架構
- 第一階段：模型自由輸出（含思考標籤、含自然語言鋪陳），已存在。
- 第二階段：目前由 `sidepanel.js` 的文字備援解析器（regex，四種模式）擔任「抽取」角色。
- 因此本提案**不是推翻重來，而是把第二階段從 regex 升級為受約束的模型呼叫**；regex 解析器降級為備援，一行不用刪。

### 2. 第二階段 = 同一顆模型反芻自己的輸出（重要釐清）
- 所謂「第二模型」在 Barbara 的場合**就是第一模型再吃一次自己前一輪的輸出**，做純抽取。
- 好處：
  - 不需雙模型駐留，沒有消費級 GPU 的 VRAM 互擠與 LM Studio JIT 換載延遲問題。
  - 同模型、同上下文前綴的第二次呼叫會命中 llama.cpp / LM Studio 的 prefix cache（KV cache），prompt 處理成本趨近於零。
- 換更小的抽取模型只作為**未來選配**（設定欄位預設同主模型），不是前提。

### 3. 格式約束只施加在第二階段
- 約束解碼（JSON mode / grammar）會壓低推理品質有實證（EMNLP 2024 *Let Me Speak Freely* 系列）；分類／抽取這類選項式局部決策則幾乎不受影響。
- 注意：**grammar 保證形式、不保證真值**。模型想輸出的東西不在文法內時，會被靜默扭成「合法但錯誤」的輸出。所以抽取後的驗證層不可省。

### 4. 兩階段直接消解 Gemma 的根因問題
- `GEMMA_TOOL_CALLING_NOTES.md` 記錄的根因：Gemma 習慣在 JSON 前先講自然語言，導致伺服器工具解析器崩潰。
- 兩階段下這不再是 bug：第一階段本來就允許自由發揮，第二階段只做抽取、不在乎鋪陳。

### 5. 單次生成優化（分隔符後才啟動 grammar）——擱置
- 需要在解碼迴圈內部動手（guidance / outlines / llama.cpp in-process grammar hook）。
- Barbara 透過 OpenAI 相容 HTTP API 溝通，**標準 chat completions 沒有中途掛 grammar 的介面**。
- 綁 llama.cpp 原生 `/completion` 端點雖可行，但失去伺服器中立性，不採用。
- 兩次呼叫因 prefix cache 命中，實際成本低，接受之。除非未來出本地 companion proxy 再重新評估。

## 第二階段的關鍵限制

1. **Prompt 限定「只從上文抽取，不得新增或改寫」**，避免反芻時引入新幻覺。
2. **抽取後雙層驗證（放 harness，不放模型）**：
   - Schema 驗證：工具名必須存在於 ToolRegistry、required／type 檢查（現有 fallback parser 的必要參數檢查可沿用擴充）。
   - 一致性檢查：欄位值必須出現在第一階段文本中，防止張冠李戴。
3. **一致性檢查必須逐欄位設定政策，不能一刀切**：
   - 摘錄型欄位（URL、選擇器、查詢字串）→ 做子字串比對，比對前先做空白／全半形正規化。
   - 合成型欄位（如 `execute_javascript` 的程式碼）→ 天生不會逐字出現在推理文本，不得套用此檢查。
   - 建議在 ToolRegistry schema 上標註欄位屬性（例如 `extractive: true`）。

## Harness 分工原則

- 長程規劃、狀態機、流程控制交給 harness（即擴充功能的 JS 本身，`runAgentStreamLoop` 已是狀態機：HITL 三按鈕、只思考強制接續上限 3 次、輪間 2 秒節流）；模型只負責眼前的單一微型決策。
- Harness 語言不影響模型輸出品質，無須為此引入 Rust／Python。
- **已知缺口（已於 2026-07 處理）**：工具執行遞迴原本沒有全域輪數硬上限。授權模型改為「first-use 授權」（每個工具在一次對話中第一次被呼叫時詢問，可按「本次對話都允許」授權該工具後續自動放行）後，已同步實作每連續 8 輪自動放行即強制人工確認一次的檢查點（`AUTO_APPROVE_CHECKPOINT_ROUNDS`）。自動放行的輪次會在對話中保留完整動作紀錄（含執行腳本的程式碼），事後可審。

## 適用邊界

- 適合：分類、抽取、路由等流程可窮舉、延遲敏感的任務（工具路由、參數抽取、「呼叫工具 vs 直接回答」的判斷）。
- 不適合：深層除錯、模糊需求判斷、多步工具組合、長上下文理解——仍由主模型承擔，抽取階段不參與規劃。

## 重試與 Fallback 鏈

- 抽取重試上限 **2 次**：失敗兩次通常代表第一階段文本本身沒有可抽的東西，再試是空轉。
- 降級順序：模型抽取 → 現有 regex 備援解析器 → 現有遞迴提示（強制接續）→ 交還使用者（HITL）。
- 為未預期狀況保留升級路徑（更大模型或轉人工），窮舉式流程遇例外比端到端方案脆弱。

## 實作進度

**v1 已實作（2026-07-15）**，範圍如下：
- `extractToolCallViaModel()`：串流結束後若無原生 tool_calls 且全文有提到已註冊工具名（便宜的前置過濾，避免普通回答多花一次 API 呼叫），用**同一顆模型**做非串流純抽取（temperature 0、max_tokens 1024），重試上限 2。
- `validateExtractedToolCall()`：harness 端 schema 驗證（工具名存在、required 參數非空）。
- 抽取器回 `{"name": null}` 視為「明確判定無工具呼叫」→ 跳過 regex（消除 regex 假陽性）；抽取**失敗**才降級到 regex 備援解析器。
- `extractFirstJsonObject()`：括號配對式 JSON 抽取，同步修正 regex parser 兩處巢狀 JSON 截斷 bug。

**v1 未含（後續）**：`response_format: json_schema` 約束（現靠 prompt + harness 驗證，各伺服器通吃）、逐欄位一致性檢查（需 schema 標註 extractive 屬性）、選配抽取器模型設定。

## 原始規劃落點

1. 新增 `extractToolCall(phase1Text)`：對同一端點發一次**非串流**呼叫，帶 `response_format: {type: "json_schema"}`（LM Studio 0.3+、Ollama、llama.cpp server 均支援）；偵測不支援時退回純 prompt 引導 + harness 驗證。
2. 驗證管線放 harness：`JSON.parse` → schema 驗證 → 摘錄型欄位一致性比對 → 通過才進現有 HITL 確認流程。
3. 設定頁加選配「抽取器模型」欄位，預設同主模型。
4. 抽取失敗 2 次後降級到現有 regex parser。

## 附帶發現（現有 bug）

- regex 備援解析器的模式 1 與模式 4 抓參數用 `/\{[\s\S]*?\}/`（非貪婪），**遇巢狀 JSON 會在第一個 `}` 截斷**——這正是 regex 抽取先天不如模型抽取的具體例證，也是升級第二階段的直接動機之一。

---
*記錄時間：2026年7月15日*
