# Reasoning 欄位支援筆記（OpenAI 標準思考欄位）

記錄 Barbara 支援「後端把思考內容從 `content` 剝離、改放獨立 delta 欄位」這條路徑的實作結論，
以及一個**尚未驗證、待實測**的待辦（見文末「待辦 (3)」）。

## 背景：兩種後端，兩種思考傳遞方式

| 後端型態 | 思考在哪裡 | 例子 |
|---|---|---|
| 內嵌標籤 | `delta.content` 裡夾 `<think>` / `<thought>` / `<\|channel>thought` | LM Studio、本機 Gemma |
| 獨立欄位 | `delta.reasoning`（或 `delta.reasoning_content`），`content` 不含思考 | vLLM 啟用 `--reasoning-parser` |

兩者不會同時出現，但程式必須各自處理。原本 Barbara 只讀 `delta.content`，
所以對第二種後端**完全收不到思考內容**，模型思考期間畫面一片空白。

### 實測封包（vLLM，Qwen3.8）

一般對話：

    29 個 chunk → "delta":{"reasoning":"..."}
     2 個 chunk → "delta":{"content":"..."}

帶工具的那一輪（`tools` + `tool_choice:"auto"`）：

    13 個 chunk → "delta":{"reasoning":"..."}
     2 個 chunk → "delta":{"tool_calls":[...]}
     0 個 chunk → "delta":{"content":...}

**注意欄位名稱是 `reasoning`，不是較常見的 `reasoning_content`。** 程式兩個都收。

工具輪 `content` 完全為空，是這個問題在代理流程中比一般對話更明顯的原因：
一般對話至少最後有正文冒出來，工具輪則從頭到尾空白。

## 實作結論

### 1. 兩種後端共用同一套思考區塊 UI
`reasoning` 走的是既有的 `details` + `thinking-content-inner`，沒有另寫一套。
`<think>` 字串比對的邏輯原封不動保留。

### 2. 思考結束的判斷時機
`reasoning` 是逐 token 串流、**沒有結束標籤**。結束訊號取「開始收到 `delta.content`」。
第一個 chunk 的 `"content":""` 是 falsy，不會誤觸發。

串流結束時（例如工具輪，正文永遠不會來）另外再收尾一次，
避免 `currentStreamIsThinking` 卡在 `true`。

### 3. 以 `<think>` 包裝寫進 `accumulatedResponse`
讓文字備援解析器（它刻意掃描思考內容找工具呼叫，見 `GEMMA_TOOL_CALLING_NOTES.md`）
在兩種後端行為一致。**但這連帶改變了送回模型的內容——見待辦 (3)。**

### 4. 非串流路徑
`sowhat.js` 的 `runSingleTurn` 會顯示思考，已加上 `message.reasoning_content || message.reasoning`。

`transcribeImageToText`（vision OCR）刻意不處理：它要的是純文字辨識結果，
把思考併進去會污染輸出。reasoning parser 後端仍會把最終答案放 `content`，所以不受影響。

## 思考過程的持久化與上下文邊界

畫面上的對話項目有兩種來源，混在同一個清單裡：

- **(A) 串流期間手工建立的臨時 DOM**：思考區塊、工具確認框、`⚙️ 正在處理步驟`
- **(B) 從 storage 重畫**：`loadConversations()`

最終回覆完成時會 `loadConversations()` 整份重畫，而它第一件事是 `conversationList.innerHTML = ''`。
**所有 (A) 類一次清空，只有走過 `addConversation` 的才能重生。**

原本中間輪（工具輪）的思考沒有存，所以執行當下看得到、最終答案一出現就消失。
現已補上 `storeToolRoundThinking()`，存成 `isThinking: true`。

### 為什麼存了不會污染上下文

`messagesForAPI` 會濾掉 `isThinking` 和 `isStep`，所以帶 `isThinking: true` 的資料
**天生落在排除範圍內，純粹給人看**。

只取 `<think>` 區段、捨棄該輪非思考正文：那些正文多半是模型用文字寫出的工具呼叫嘗試
（`Therefore, I should call ...`、` ```json ` 區塊），存成一般訊息反而會進上下文變成雜訊。
代價是模型若在呼叫工具前寫了有意義的正文，畫面上會遺失。

### 跨輪次不放思考——這個決定仍然成立

不把前幾輪思考放進下一輪上下文，現在已是模型廠商明寫的使用規範
（Qwen3、DeepSeek-R1 都明確要求歷史訊息不含前輪思考；Anthropic extended thinking 同方向）。

理由不只省 token：思考是模型的草稿，含它自己推翻掉的錯誤路線；
把草稿當成「我說過的話」餵回去，模型會把已否定的推論當成既定結論。

---

## 待辦 (3)：同一輪內，工具呼叫的思考該怎麼帶回去——**尚未驗證**

### 問題

上述「不放思考」的規範，在**同一輪還沒結束、中間插入工具呼叫**的情況下要求是相反的：
這段思考應該帶回去，否則模型接到工具結果時會失去當初決定呼叫工具的理由，
容易重複呼叫或前後矛盾。（Anthropic 對 tool use 明確要求 thinking block 原樣回傳。）

### Barbara 現況與本次改動造成的變化

工具分支送回去的是：

```js
const assistMsg = {
    role: "assistant",
    content: accumulatedResponse || null,
    tool_calls: validToolCalls
};
```

- **改動前**：reasoning 後端的工具輪 `accumulatedResponse` 是空的 → `content` 為 `null`
  → 思考完全沒帶回去。
- **改動後**：reasoning 被包成 `<think>...</think>` 寫進 `accumulatedResponse`
  → 以**字面標籤的形式出現在送回模型的 prompt 裡**。

### 兩面看法

- 好處：正好補上「同輪思考要帶回去」這個規範，以前 reasoning 後端是缺的。
- 疑慮：正規做法是放回獨立的 `reasoning_content` 欄位讓 chat template 處理，
  而不是把 `<think>` 當純文字塞進 `content`。
  **Qwen3 的 template 看到 content 裡的字面 `<think>` 會怎麼處理，尚未驗證。**
  可能無害（當普通文字讀），也可能跟 template 自己插入的標籤打架。

### 測試方式

對同一個需要多輪工具的問題，各發一次「帶思考／不帶思考」的續接請求，
比較模型第二輪回應的品質（是否重複呼叫同一工具、是否前後矛盾、是否忘記原始目標）。

測試端點（皆已啟用 reasoning parser）：

- `http://95.153.57.4:16591/v1`，model `qwen3.8-27b`，需 `Authorization: Bearer sk-...`
- `http://100.89.149.50:8006/v1`，model `qwen3.8`，免金鑰

### 實測結果（2026-09-14，vLLM qwen3.8 @ 100.89.149.50:8006）

已驗證「單輪工具續接」這個層面**兩種送法都正常**：

    messages = [system, user, assistant(<think>…</think> + tool_calls), tool(結果)]

- `assistant.content` 帶 `<think>` → 未重複呼叫工具，正確引用工具結果作答。
- `assistant.content` 為 `null` → 同上。

亦即 `<think>` 字面標籤沒有打壞 Qwen3 的 chat template，方案 1 在此範圍內無害。

**尚未驗證**：多輪（三輪以上）累積、以及超長工具結果下的表現。

### 三個候選方案

1. 維持現狀的 `<think>` 字面作法——簡單，單輪已驗證無害。
2. 改送 `reasoning_content` 欄位——正規，但要分辨後端類型。
3. 退回不帶——最保守，但違反同輪規範。

注意方案 2、3 都會影響文字備援解析器：它目前靠 `accumulatedResponse` 內含思考來掃工具呼叫。
若要把「送給模型的內容」和「本地解析用的文字」分開，需要拆成兩個變數。

---

## 待辦 (4)：代理跑到一半重複要求讀取網頁——**未複現，待現場 log**

### 回報症狀

自動網頁讀取的代理流程中，**同一次提問、工具輪尚未跑完**，模型又要求讀取一次網頁
（授權框再跳一次）。不是每次都發生。

### 已排除

- **訊息格式與續接**：見待辦 (3) 的實測，單輪續接正常，模型正確引用工具結果，未重複呼叫。
- **context 溢位**：測試端點 `max_model_len = 131072`，一般網頁遠不到。

### 兩個嫌疑（皆由「reasoning 包成 `<think>` 寫進 `accumulatedResponse`」引入）

改動前，reasoning 後端的工具輪 `accumulatedResponse` 是空字串，以下兩條路徑都不會觸發；
改動後它有內容了，兩條路徑都變成可達。

**嫌疑一：幽靈工具呼叫。** 某輪沒有原生 `tool_calls` 時，會拿 `accumulatedResponse`
去跑第二階段抽取器與文字備援解析器。守門的 `textMentionsAnyTool()` 是**純子字串比對**：

```js
return Object.keys(ToolRegistry).some(name => text.includes(name));
```

模型在思考裡寫「I should call read_current_webpage」是很自然的事
（實測探測工具輪時，思考確實寫過「I should call get_page_content」），
足以啟動抽取器（一次額外 API 呼叫，也解釋了等待感），
而備援解析器模式 4 會比對 `call|use|execute|run + 工具名` → **憑空造出工具呼叫**。

對 `<think>` 後端這是刻意設計（Gemma 把呼叫意圖寫在思考裡，見 `GEMMA_TOOL_CALLING_NOTES.md`）；
但 reasoning 模型的思考是大量英文自言自語，性質不同，且它本來就有原生 `tool_calls`，
根本不需要這條備援。

**嫌疑二：強制接續路徑**（「只有思考、沒有正文」→ 塞一則 user 訊息要求立刻執行下一步）。
同樣因為 `accumulatedResponse` 從空變成有內容才變得可達，該指令本身可能誘發重新呼叫工具。

### 現場診斷方式

複現後開 DevTools Console，看有無：

- `[Extractor] 第二階段反芻抽取，嘗試 1/...` → 嫌疑一
- `[Fallback Parser] 成功攔截到模型在文字中嘗試呼叫工具: ...` → 嫌疑一
- `[Agent] 發現模型僅輸出思考過程而中斷，啟動強制接續遞迴...` → 嫌疑二
  （畫面上對應橘色提示「代理僅完成思考，系統已自動要求其繼續執行後續動作」）

### 若確認是嫌疑一，修法方向

抽取器與備援解析器**不應掃描 reasoning 欄位來的思考**。
需要把「送給模型的文字」與「本地解析用的文字」拆成兩個變數
（與待辦 (3) 方案 2、3 的連帶影響是同一件事）。

---

## 附帶發現：網頁內容 token 預算的潛在地雷

`getPageContentTokenBudget()` = `contextTokens - RESERVED_OUTPUT_TOKENS(2048) - RESERVED_PROMPT_TOKENS(2048)`。

131072 的模型算下來，單次網頁讀取可注入約 **127k tokens**，
而那 2048 的「保留給 system prompt、工具定義與既有對話」是**固定常數，
完全沒有考慮代理迴圈後面還要跑好幾輪**。

一般網頁不會觸發，但超長頁面（大型文件、長討論串）會在第二、三輪爆掉。
與待辦 (4) 的症狀無關，獨立事項。
