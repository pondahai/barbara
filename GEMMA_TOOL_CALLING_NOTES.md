# 本地端開源模型 (如 Gemma) 的 Tool Calling 相容性筆記

這份筆記記錄了在實作 AI Agent 工具呼叫 (Tool Calling) 時，遇到本地端開源模型（特別是 Gemma 系列）無法正確觸發工具的根本原因與解決方案。

## 問題現象

1.  **大型模型 (如 gpt-oss-120b 或官方 API) 正常運作**：當模型需要呼叫工具時，能完美輸出 API 伺服器預期的隱藏訊號，並被伺服器轉譯為 OpenAI 標準的 `tool_calls` JSON 陣列。
2.  **Gemma 4 等較小或特定架構模型失敗**：模型完全理解任務，且在文字對話中明確表示「I should call read_current_webpage」，甚至會輸出類似 JSON 的字串，但卻**沒有**觸發系統的 API 工具機制（即 `delta.tool_calls` 為空）。

## 根本原因分析

1.  **模型本身沒有原生的 Tool Calling Token**：
    與 OpenAI 或 Google 官方 Gemini API 不同，原版的 Gemma Instruct 模型底層並沒有內建專屬的工具呼叫標籤（例如沒有硬編碼的 `<tool_call>` token）。
2.  **依賴 System Prompt 與本地伺服器解析 (Parser)**：
    本地端 API 伺服器 (如 LM Studio, Ollama, llama.cpp) 是透過在 System Prompt 中加入強烈指示（例如要求輸出 `{"name": "...", "parameters": ...}`）來引導模型。
3.  **解析器崩潰 (Parser Breakage) 與對話慣性**：
    Gemma 被訓練得「太有禮貌」，它習慣在輸出 JSON 前先用自然語言解釋意圖（例如 `Therefore, I should call...`）。
    當本地伺服器的 JSON 解析器在等待純淨的 JSON 時，只要前面多出了這些自然語言，伺服器就會判定「這不是工具呼叫，而是一段普通對話」，進而放棄將其包裝為 `tool_calls`，而是原封不動地當作普通 `content` 串流回傳給前端。

## 思考過程標籤的差異 (Streaming Parsing)

除了 Tool Calling 的問題外，不同模型在輸出「思考過程 (Chain-of-Thought)」時使用的標籤也不同，前端必須同時支援：
*   **DeepSeek 等模型**: 使用 `<think>` 與 `</think>`。
*   **Gemma 4 等模型**: 使用 `<|channel>thought` 與 `<channel|>`。
（已在 `sidepanel.js` 的 `parseAndStoreFinalAssistantResponse` 與串流迴圈中實作相容性解析）。

## 解決方案與後續優化方向

若要解決 Gemma 等模型只吐文字而不觸發工具的問題，有以下三種途徑：

1.  **更新本地伺服器軟體 (最推薦)**：
    等待或更新 LM Studio、Ollama 等軟體，讓它們的解析器 (Parser) 能夠更聰明地從混雜自然語言的回覆中萃取出 JSON，並正確轉換為 OpenAI 格式的 `tool_calls`。
2.  **更換微調模型 (Function-Calling 專用版)**：
    使用社群專門為 Tool Calling 微調過的小模型（通常檔名帶有 `FC` 或 `Function-Calling`），這些模型被強制訓練成「只要使用工具就絕對只輸出 JSON，不講廢話」。
3.  **前端實作「文字備援解析器 (Text Fallback Parser)」 (Workaround)**：
    在擴充功能的 `sidepanel.js` 串流結束後，主動檢查 `accumulatedResponse`。若發現文字中包含特定的工具呼叫意圖（如 `{"name": "read_current_webpage"}` 的 JSON 結構），前端主動將其攔截並手動建構為 `tool_calls` 物件，強行觸發使用者的確認視窗與工具執行流程。

---
*記錄時間：2026年4月10日*