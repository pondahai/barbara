# barbara
Barbara 是一款 Chrome 擴充工具，依賴本地 LLM 伺服器如 LMStudio 進行雙語翻譯、文章摘要，並具備主動讀取與改寫網頁的 Agent 能力。  

## 最新更新 (v1.60)
* **Gemma 4 ReAct 範式支援**: 針對最新 **Gemma 4** 模型優化了 ReAct 推理結構，並支援其特有的 `<|channel>thought` 思考標籤，顯著提升了本地模型執行工具調用 (Tool Calling) 的成功率與邏輯嚴密性。
* **推理模型支持 (Reasoning Support)**: 完美解析並呈現 `<think>` (DeepSeek) 與 `<|channel>thought` (Gemma 4) 標籤。現在您可以實時查看不同模型的完整思考過程。
* **智慧代理系統 (Active AI Agent)**: 正式引入具備 `read_current_webpage` 與 `execute_javascript_on_page` 等能力的 Agent 循環。
* **UI/UX 全面強化**:
    * **配置管理優化**: 改進了多組 API 配置的保存與切換機制，支持從伺服器動態獲取模型列表。
    * **精準捲動體驗**: 修正了 AI 回應結束時的自動捲動邏輯，確保畫面平滑對齊至最新回覆的起始位置。
    * **穩定性提升**: 優化了串流訊息渲染與 DOM 更新機制，減少長文本生成時的閃爍。

## chrome外掛安裝:  
https://chromewebstore.google.com/detail/barbara-local-ai-assistan/ccpdgcdldfgcdnfgigmnlimbnojamghi  

![image](https://github.com/user-attachments/assets/ecc21d90-3ae7-43b8-9f3a-5ee896bdc96c)


Barbara 是一款強大且直觀的 Chrome 擴充功能，專為提升網頁瀏覽體驗而設計。利用本地運行的輕量級語言模型（如 LMStudio 或 llama.cpp），Barbara 為使用者提供高效且準確的雙語翻譯、文章摘要，以及具備工具調用 (Function Calling) 能力的互動式聊天功能，讓日常工作與網頁操作更加輕鬆。

## 主要功能:

* **推理思考顯示**: 支援顯示 DeepSeek (`<think>`) 與 Gemma 4 (`<|channel>thought`) 等推理型模型的內心思維過程，讓 AI 的邏輯決策透明化。
* **Gemma 4 ReAct 引擎**: 深度優化 ReAct 推理循環，讓最新的 Gemma 4 等本地模型也能穩定地進行複雜的任務規劃與工具執行。
* **雙向翻譯**: 無論是中譯英或英譯中，Barbara 能夠快速且準確地翻譯網頁內容，支持多種語言的即時翻譯。
* **文章摘要**: 從長篇文章中快速提取核心信息，幫助您節省時間並快速掌握重點。
* **智慧代理 (AI Agent)**: 內建技能庫 (ToolRegistry)，AI 能主動判斷需求，抓取當下閱讀的網頁全文進行分析，或根據您的指示自動生成並注入 JavaScript 程式碼以動態修改網頁畫面。
    * **目前實作技能 (Tools)**:
        * 📄 `read_current_webpage`: 讀取並分析當前瀏覽的網頁全文。
        * ⚡ `execute_javascript_on_page`: 自動生成並注入 Vanilla JavaScript 以動態修改網頁畫面。
        * 🌐 `open_new_tab`: 根據網址或搜尋關鍵字開啟新分頁。
        * ⏪ `switch_to_previous_tab`: 快速切換回上一個瀏覽的分頁。
        * 🔍 `switch_to_tab`: 根據關鍵字尋找並切換到已開啟的特定分頁。
    * **遞迴思考迴圈**: Agent 具備初步的 Chain-of-Thought (思考鏈) 並有能力連續呼叫多個工具直到任務完成。
    * **人類回圈確認 (Human-in-the-loop)**: 所有 Agent 的操作 (包含執行 JS、開新分頁等) 皆需要使用者透過 UI 按下「允許 (Approve)」才能執行，保障您的瀏覽器安全並有效控制 API 請求速率。
* **互動式聊天**: 內建的聊天功能使您能與人工智慧助手互動，解答疑問或提供建議。

## 特色:

* 本地運行: 所有語言處理均在本地或透過自訂 API 進行，確保您的數據隱私。
* 輕量級: 針對一般文書筆電進行優化，不佔用過多系統資源。
* 易於使用: 簡單直觀的介面設計，無需專業知識即可輕鬆上手。
* 安全可控: 內建操作攔截機制，防止 AI 代理暴衝或執行惡意程式碼。

*** 注意事項:
Barbara 本身並不包含任何語言模型或數據，使用這些功能需用戶自行下載並設置相關工具（如 LMStudio 或 llama.cpp）及相應的模型參數檔。請務必注意，在安裝 Barbara 後，您需要另外安裝 and 配置這些外部資源，才能完全體驗到所有功能。

## 適用對象:

需要經常處理中英雙語內容的使用者
喜歡在瀏覽網頁時快速獲取信息的使用者
需要即時翻譯或文章摘要服務的專業人士或學生

## 下載及安裝:
立即下載 Barbara，體驗智慧助手為您帶來的便利！適用於 Chrome 瀏覽器，安裝簡便，開啟後即可使用。

## 隱私聲明:
Barbara 尊重您的隱私，所有數據均在本地處理，不會收集或傳輸您的個人信息。

## Support the Project! ❤️

This project is a labor of love, and I'm incredibly grateful for your use and feedback. If you appreciate what I'm building and want to help keep it going, any contribution would be greatly appreciated!  Your support allows me to dedicate more time to development, bug fixes, and new features.

Here are some ways you can contribute:  
[![paypal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.me/pondahai)
