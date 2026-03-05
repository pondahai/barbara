// MODIFIED sidepanel.js to handle <think> tags

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('configSelect').addEventListener('change', handleConfigChange);
    document.getElementById('sendMessageButton').addEventListener('click', sendMessage);
    document.getElementById('summaryButton').addEventListener('click', summarizeText);
    document.getElementById('translateButton').addEventListener('click', translateText);
    document.getElementById('userInput').addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.key === 'Enter') {
            sendMessage();
        }
    });
    document.getElementById('fetchModelsButton').addEventListener('click', fetchModels);
    document.getElementById('saveConfigButton').addEventListener('click', saveConfig);
    document.getElementById('configList').addEventListener('click', (event) => {
        // MODIFICATION START: Ensure target is a DIV or SPAN within the config-item for loading
        const configItemTarget = event.target.closest('.config-item');
        if (configItemTarget && (event.target.tagName === 'DIV' || event.target.tagName === 'SPAN' || event.target === configItemTarget)) {
            // MODIFICATION END
            const index = configItemTarget.dataset.index; // MODIFIED: Get index from configItemTarget
            chrome.storage.local.get({ configs: [] }, (result) => {
                const selectedConfig = result.configs[index];
                if (selectedConfig) { // NEW: Check if selectedConfig exists
                    document.getElementById('apiUrl').value = selectedConfig.apiUrl;
                    document.getElementById('apiKey').value = selectedConfig.apiKey;
                    // MODIFICATION START: Handle modelId potentially being undefined or empty
                    const modelSelectElement = document.getElementById('modelSelect');
                    if (modelSelectElement) {
                        modelSelectElement.value = selectedConfig.modelId || "";
                    }
                    // MODIFICATION END
                    fetchModels().then(() => {
                        // MODIFICATION START: Ensure setSavedModelAsDefault handles empty modelId
                        if (selectedConfig.modelId) {
                            setSavedModelAsDefault(selectedConfig.modelId);
                        }
                        // MODIFICATION END
                    });
                }
            });
        }
    });
    document.getElementById('prevButton').addEventListener('click', () => changePage(-1));
    document.getElementById('nextButton').addEventListener('click', () => changePage(1));
    document.getElementById('deleteAllConversationsButton').addEventListener('click', deleteAllConversations);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('sidepanel.js received message:', request);

        // Ensure only the side panel in the actively focused window processes the 
        // global runtime message, to prevent 3 open side panels from answering at once.
        // We bypass this check if background.js explicitly tells us to (e.g. for the popup).
        chrome.windows.getCurrent((win) => {
            if (!win.focused && request.action !== "reloadConversations" && !request.bypassFocusCheck) {
                console.log('sidepanel.js ignoring message because window is not focused.');
                return;
            }

            if (request.action === "reloadConversations") {
                loadSelectedConfig();
            } else if (request.action === "summarizeFromContent") {
                summarizeTextFromContent(request.text);
            } else if (request.action === "translateFromContent") {
                translateTextFromContent(request.text);
            }
        });

        // NEW: Add a way to indicate a response was sent if needed by the listener
        // sendResponse({status: "received"}); // Optional: if the sender expects a response
        return true; // Keep the message channel open for asynchronous sendResponse if needed in the future
        // MODIFICATION END
    });

    // --- MODIFIED INITIALIZATION ---
    async function initializeSidePanel() {
        console.log("[DEBUG] Initializing Side Panel...");
        await initialLoadAndDisplayConfigs(); // Main function to load configs and then conversations
        updateButtons(); // This depends on currentPage, which is fine
        changePage(1);   // This changes UI, also fine after data load
        console.log("[DEBUG] Side Panel Initialized.");
    }

    initializeSidePanel(); // Start the initialization
    // --- END MODIFIED INITIALIZATION ---
});

let currentPage = 1;
const totalPages = 2;
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
// const deleteAllConversationsButton = document.getElementById('deleteAllConversationsButton'); // Already declared

function updateButtons() {
    if (prevButton) prevButton.style.display = currentPage === 1 ? 'none' : 'block';
    if (nextButton) nextButton.style.display = currentPage === totalPages ? 'none' : 'block';
}

let scrollTop = document.body.scrollTop;
let targetScrollTop = 0;
let duration = 500;
let startTime = null;

function animate() {
    const currentTime = Date.now();
    if (startTime === null) {
        startTime = currentTime;
    }
    const progress = (currentTime - startTime) / duration;
    if (progress < 1) {
        document.body.scrollTop = scrollTop + (targetScrollTop - scrollTop) * progress;
        requestAnimationFrame(animate);
    } else {
        document.body.scrollTop = targetScrollTop; // Ensure it reaches the target
    }
}

function changePage(direction) {
    const container = document.getElementById('container');
    currentPage += direction;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (container) container.style.transform = `translateX(-${(currentPage - 1) * 100}vw)`;
    updateButtons();

    if (currentPage === 1) {
        scrollTop = document.body.scrollTop || document.documentElement.scrollTop; // MODIFIED: more robust scroll detection
        targetScrollTop = 0;
        duration = 500;
        startTime = null;
        requestAnimationFrame(animate); // MODIFIED: ensure animate is called
    }
}

let selectedConfigIndex = 0; // Keep this if it's used by other logic not shown
let selectedConfig = null;
let currentConversationItem = null; // This will be an object {parentItem, contentContainer} for streaming
let accumulatedResponse = ''; // Stores raw, parsed, concatenated content tokens from stream

// NEW GLOBAL VARIABLES for <think> tag handling
let streamingDOMs = { // Used to update specific DOM parts during streaming
    main: null, // Points to the .conversation-content div for main response
    think: null // Points to the .thinking-content-inner div for thinking response
};
let currentStreamIsThinking = false; // Flag for current streaming content type
// END NEW GLOBAL VARIABLES

// NEW: Central function for initial config loading and display
async function initialLoadAndDisplayConfigs() {
    return new Promise((resolve) => {
        chrome.storage.local.get({ configs: [], selectedConfigIndex: 0 }, (result) => {
            let configs = result.configs; // Use let as it might be modified by checkAndAdd...
            const initialSelectedConfigIndex = result.selectedConfigIndex;
            const configSelect = document.getElementById('configSelect');

            if (!configSelect) {
                console.error("[DEBUG] configSelect not found during initial load.");
                resolve();
                return;
            }
            configSelect.innerHTML = '';

            // Function to populate dropdown and settings list, and load conversations
            const populateAndLoad = (currentConfigs, activeIndex) => {
                configSelect.innerHTML = ''; // Clear again in case of re-population
                if (currentConfigs.length === 0) {
                    const option = document.createElement('option');
                    option.textContent = "無設定 - 請至設定頁新增";
                    option.disabled = true;
                    configSelect.appendChild(option);
                    selectedConfig = null;
                    loadConversations(null);
                    loadConfigList([]); // Also update the settings page list
                    resolve();
                    return;
                }

                currentConfigs.forEach((config, index) => {
                    const option = document.createElement('option');
                    option.value = index;
                    option.textContent = `${config.apiUrl ? config.apiUrl.substring(0, 30) : '無API網址'}... - ${config.modelId || '(未選模型)'}`;
                    configSelect.appendChild(option);
                });

                let finalActiveIndex = activeIndex;
                if (finalActiveIndex < 0 || finalActiveIndex >= currentConfigs.length) {
                    finalActiveIndex = 0; // Default to first if out of bounds
                    if (currentConfigs.length > 0) { // Only set if there are configs
                        chrome.storage.local.set({ selectedConfigIndex: finalActiveIndex });
                    }
                }

                if (currentConfigs.length > 0) {
                    configSelect.selectedIndex = finalActiveIndex;
                    selectedConfig = currentConfigs[finalActiveIndex];
                    selectedConfigIndex = finalActiveIndex; // Update global
                } else {
                    selectedConfig = null; // No configs, so no selected config
                }

                loadConversations(selectedConfig); // Load conversations for the determined selectedConfig
                loadConfigList(currentConfigs);    // Update the list on the settings page
                resolve();
            };

            // Now, handle the checkAndAddStoredConfig logic before the final populateAndLoad
            // This is tricky because checkAndAddStoredConfig is async and might modify 'configs'
            // We need to chain these checks.
            checkAndAddStoredConfig('llmUrl1', 'llmUrl1apiKey', configs, (modifiedConfigs1) => {
                checkAndAddStoredConfig('llmUrl2', 'llmUrl2apiKey', modifiedConfigs1, (modifiedConfigs2) => {
                    checkAndAddStoredConfig('llmUrl3', 'llmUrl3apiKey', modifiedConfigs2, (finalModifiedConfigs) => {
                        // All checks are done, now populate based on finalModifiedConfigs
                        populateAndLoad(finalModifiedConfigs, initialSelectedConfigIndex);
                    });
                });
            });
        });
    });
}

// MODIFIED: loadConfigs now only populates UI and is called when configs array changes
// It does NOT trigger loadSelectedConfig itself anymore to prevent loops.
// The selection and conversation loading is handled by initialLoadAndDisplayConfigs or handleConfigChange.
function loadConfigs() { // This function is now more of a UI updater for config lists
    console.log("[DEBUG] loadConfigs (UI updater) called");
    chrome.storage.local.get({ configs: [], selectedConfigIndex: 0 }, (result) => {
        const configs = result.configs;
        const currentSelectedConfigIndex = result.selectedConfigIndex; // Get current index
        const configSelect = document.getElementById('configSelect');

        if (!configSelect) return;
        configSelect.innerHTML = '';

        if (configs.length === 0) {
            const option = document.createElement('option');
            option.textContent = "無設定 - 請至設定頁新增";
            option.disabled = true;
            configSelect.appendChild(option);
            // selectedConfig = null; // Don't change global selectedConfig here
            // loadConversations(null); // Don't reload conversations here
            loadConfigList([]); // Update settings list
            return;
        }

        configs.forEach((config, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${config.apiUrl ? config.apiUrl.substring(0, 30) : '無API網址'}... - ${config.modelId || '(未選模型)'}`;
            configSelect.appendChild(option);
        });

        // Set the dropdown to the currently stored selected index
        let activeIndex = currentSelectedConfigIndex;
        if (activeIndex < 0 || activeIndex >= configs.length) {
            activeIndex = (configs.length > 0) ? 0 : -1; // Default to 0 if configs exist, else -1 (no selection)
            if (activeIndex !== -1) {
                chrome.storage.local.set({ selectedConfigIndex: activeIndex });
            }
        }
        if (activeIndex !== -1) {
            configSelect.selectedIndex = activeIndex;
            // If selectedConfig is not already set by another flow (like initial load), set it here.
            // This part is tricky. The goal is for loadConfigs to primarily be a UI updater
            // for the dropdown. The actual 'selectedConfig' object and loading conversations
            // should ideally be triggered by a more explicit action like initial load or user change.
            if (!selectedConfig || selectedConfig !== configs[activeIndex]) {
                // This might be a good place to call loadSelectedConfig IF the intent is that
                // loadConfigs always re-evaluates the selected config and reloads conversations.
                // However, to fix the double-load, let's make loadSelectedConfig more explicit.
                // For now, just update the dropdown. The global selectedConfig will be set by
                // initialLoadAndDisplayConfigs or handleConfigChange.
            }
        }

        loadConfigList(configs); // Update settings page list
        // DO NOT CALL loadSelectedConfig() here to prevent loops.
    });
}


function handleConfigChange(event) {
    const selectedIndex = parseInt(event.target.value, 10);
    chrome.storage.local.set({ selectedConfigIndex: selectedIndex }, () => {
        loadSelectedConfig();
    });
}

function loadSelectedConfig() {
    console.log("[DEBUG] loadSelectedConfig called");
    const configSelect = document.getElementById('configSelect');
    if (!configSelect) {
        loadConversations(null); // No select, no config.
        return;
    }

    chrome.storage.local.get({ configs: [], selectedConfigIndex: 0 }, (result) => {
        const configs = result.configs;
        let activeIndex = configSelect.selectedIndex; // Get current UI selection

        // If UI selection is -1 (e.g. no options), try to use stored index
        if (activeIndex === -1 && configs.length > 0) {
            activeIndex = result.selectedConfigIndex;
            if (activeIndex < 0 || activeIndex >= configs.length) {
                activeIndex = 0;
            }
            configSelect.selectedIndex = activeIndex; // Sync UI
        }


        if (configs.length > 0 && activeIndex >= 0 && activeIndex < configs.length) {
            selectedConfig = configs[activeIndex];
            selectedConfigIndex = activeIndex; // Update global
            // Save the potentially corrected/updated selected index to storage
            chrome.storage.local.set({ selectedConfigIndex: activeIndex });
        } else {
            selectedConfig = null;
        }
        loadConversations(selectedConfig);
    });
}

let loadConversationsCallCount = 0; // Debug counter
function loadConversations(config) {
    loadConversationsCallCount++;
    console.log(`[DEBUG] loadConversations called. Count: ${loadConversationsCallCount}, Time: ${new Date().toLocaleTimeString()}`, 'Config:', config ? config.apiUrl : 'null');

    const conversationList = document.getElementById('conversationList');
    if (!conversationList) return;
    conversationList.innerHTML = '';

    if (!config) {
        const placeholder = document.createElement('div');
        placeholder.textContent = "請先在設定頁新增並選擇一個設定檔。";
        // ... (placeholder styling)
        conversationList.appendChild(placeholder);
        return;
    }

    const conversationKey = `${config.apiUrl}-${config.modelId}`;
    chrome.storage.local.get({ conversations: {} }, (result) => {
        const conversations = result.conversations[conversationKey] || [];
        // ... (rest of loadConversations, rendering each item) ...
        // (The rendering part from your provided code is good here)
        if (conversations.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.textContent = "尚無對話。";
            placeholder.style.textAlign = "center";
            placeholder.style.padding = "20px";
            conversationList.appendChild(placeholder);
            return;
        }

        conversations.forEach((conversation, index) => {
            const div = document.createElement('div');
            div.className = 'conversation-item';
            if (conversation.role === 'user') div.classList.add('user-message');
            if (conversation.role === 'assistant') div.classList.add('assistant-message');
            if (conversation.isThinking) div.classList.add('thinking-process');

            const contentDiv = document.createElement('div');
            contentDiv.className = 'conversation-content';

            if (conversation.isThinking) {
                const details = document.createElement('details');
                const summary = document.createElement('summary');
                summary.textContent = '顯示/隱藏 AI 思考過程';
                details.appendChild(summary);
                const thinkingContentInnerDiv = document.createElement('div');
                thinkingContentInnerDiv.className = 'thinking-content-inner';
                thinkingContentInnerDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(conversation.content) : escapeHtml(conversation.content);
                addCopyButtonIfCodeExists(thinkingContentInnerDiv);
                details.appendChild(thinkingContentInnerDiv);
                contentDiv.appendChild(details);
            } else {
                contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(conversation.content) : escapeHtml(conversation.content);
                addCopyButtonIfCodeExists(contentDiv);
            }
            div.appendChild(contentDiv);

            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.textContent = 'X';
            deleteButton.title = '刪除此訊息';
            deleteButton.onclick = () => confirmDeleteConversation(conversationKey, index);
            div.appendChild(deleteButton);

            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.innerHTML = '';
            copyButton.title = '複製此訊息';
            copyButton.onclick = () => copySingleConversationContent(conversationKey, index);
            div.appendChild(copyButton);

            conversationList.appendChild(div);
        });
        scrollToBottom();
    });
}

// NEW HELPER FUNCTION (extracted from original copyConversation)
async function copySingleConversationContent(key, index) {
    const conversations = await getConversations(key); // getConversations is your existing function
    if (conversations && conversations[index]) {
        const conversationItem = conversations[index];
        navigator.clipboard.writeText(conversationItem.content)
            .then(() => console.log('Content copied!')) // Can show an alert or UI feedback
            .catch(err => console.error('Failed to copy content:', err));
    }
}


// MODIFIED FUNCTION to handle 'isThinking' property when adding to storage
async function addConversation(key, messageObject) { // messageObject can now have {role, content, isThinking}
    const conversations = await getConversations(key);
    const newConversationEntry = {
        role: messageObject.role,
        content: messageObject.content,
        isThinking: messageObject.isThinking || false, // Default to false if not provided
        timestamp: new Date().toISOString() // NEW: Add timestamp for potential future use
    };
    conversations.push(newConversationEntry);
    await setConversations(key, conversations);
}

// MODIFIED FUNCTION for unified DOM creation and to handle 'isThinking'
// This replaces the main DOM creation part of the old updateConversationItem
// It's called by sendMessage for user message, and by loadConversations for all stored messages.
// For streaming AI responses, sendMessage will have a more specialized DOM update logic.
async function renderAndAppendConversationItem(messageObject, isNewItem = true) {
    const conversationList = document.getElementById('conversationList');
    if (!conversationList) return null;

    // If it's a new item being added (not from full loadConversations), find its future index
    let itemIndex = -1;
    if (isNewItem) {
        const currentConversations = await getConversations(`${selectedConfig.apiUrl}-${selectedConfig.modelId}`);
        itemIndex = currentConversations.length - 1; // Index of the item just added by addConversation
    }


    const div = document.createElement('div');
    div.className = 'conversation-item';
    if (messageObject.role === 'user') div.classList.add('user-message');
    if (messageObject.role === 'assistant') div.classList.add('assistant-message');
    if (messageObject.isThinking) div.classList.add('thinking-process');

    const contentDiv = document.createElement('div');
    contentDiv.className = 'conversation-content';

    let thinkingContentContainer = null;

    if (messageObject.isThinking) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = '顯示/隱藏 AI 思考過程';
        details.appendChild(summary);

        thinkingContentContainer = document.createElement('div');
        thinkingContentContainer.className = 'thinking-content-inner';
        thinkingContentContainer.innerHTML = typeof marked !== 'undefined' ? marked.parse(messageObject.content) : escapeHtml(messageObject.content);
        addCopyButtonIfCodeExists(thinkingContentContainer);
        details.appendChild(thinkingContentContainer);
        contentDiv.appendChild(details);
    } else {
        contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(messageObject.content) : escapeHtml(messageObject.content);
        addCopyButtonIfCodeExists(contentDiv);
    }
    div.appendChild(contentDiv);

    // Add buttons only if it's a new item being rendered immediately (not part of a full reload)
    // or if itemIndex is valid (meaning it's from a full load and we have the correct index)
    if (itemIndex !== -1 || !isNewItem) { // !isNewItem means it's from loadConversations
        const finalIndex = isNewItem ? itemIndex : await getConversationIndex(messageObject); // Requires messageObject to be unique enough

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.textContent = 'X';
        deleteButton.title = '刪除此訊息';
        deleteButton.onclick = () => confirmDeleteConversation(`${selectedConfig.apiUrl}-${selectedConfig.modelId}`, finalIndex);
        div.appendChild(deleteButton);

        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.innerHTML = '&#128203;';
        copyButton.title = '複製此訊息';
        copyButton.onclick = () => copySingleConversationContent(`${selectedConfig.apiUrl}-${selectedConfig.modelId}`, finalIndex);
        div.appendChild(copyButton);
    }


    // Remove placeholder if it exists and we are adding an actual conversation item
    const placeholder = conversationList.querySelector('div[style*="text-align: center"]');
    if (placeholder) {
        placeholder.remove();
    }

    conversationList.appendChild(div);
    scrollToBottom();

    // Return references for streaming if needed
    if (messageObject.isThinking) {
        return { parentItem: div, contentContainer: thinkingContentContainer };
    }
    return { parentItem: div, contentContainer: contentDiv };
}


// ORIGINAL updateConversationItem - REPURPOSED for user message rendering primarily
// The AI response rendering will be handled differently due to potential splitting.
async function updateConversationItem(message) { // message is {role, content}
    const conversationList = document.getElementById('conversationList');
    const div = document.createElement('div');
    div.className = 'conversation-item';
    // NEW: Add class based on role
    if (message.role === 'user') div.classList.add('user-message');
    else if (message.role === 'assistant') div.classList.add('assistant-message');

    div.innerHTML = marked.parse(message.content); // Keep original parsing for user message

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.textContent = 'X';

    // Instead of searching by content (which breaks for duplicates), get the last index
    // because we *just* added it to the end of the array.
    const conversations = await getConversations(`${selectedConfig.apiUrl}-${selectedConfig.modelId}`);
    const itemIndex = Math.max(0, conversations.length - 1);

    deleteButton.onclick = () => confirmDeleteConversation(`${selectedConfig.apiUrl}-${selectedConfig.modelId}`, itemIndex);
    div.appendChild(deleteButton);

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.innerHTML = '&#128203;';
    copyButton.onclick = () => copySingleConversationContent(`${selectedConfig.apiUrl}-${selectedConfig.modelId}`, itemIndex);
    div.appendChild(copyButton);

    addCopyButtonIfCodeExists(div);

    // Remove placeholder if it exists
    const placeholder = conversationList.querySelector('div[style*="text-align: center"]');
    if (placeholder) {
        placeholder.remove();
    }
    conversationList.appendChild(div);
    scrollToBottom(); // NEW: Scroll to bottom

    return itemIndex + 1; // This will be the starting index for the AI's response parts
}
// NEW HELPER FUNCTION: Get Page Content from Active Tab
async function getCurrentPageContext() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                const activeTab = tabs[0];
                chrome.tabs.sendMessage(activeTab.id, { action: "getPageContent" }, (response) => {
                    if (chrome.runtime.lastError || !response) {
                        console.warn("無法取得網頁內容:", chrome.runtime.lastError);
                        resolve(null);
                    } else {
                        resolve(response); // 回傳 {title, content}
                    }
                });
            } else {
                resolve(null);
            }
        });
    });
}

// NEW HELPER FUNCTION: Get YouTube Transcript from Active Tab
async function getYoutubeTranscriptContext() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                const activeTab = tabs[0];
                chrome.tabs.sendMessage(activeTab.id, { action: "getYoutubeTranscript" }, (response) => {
                    if (chrome.runtime.lastError || !response) {
                        console.warn("無法取得 YouTube 字幕:", chrome.runtime.lastError);
                        resolve(null);
                    } else {
                        resolve(response); // 回傳 {transcript, language, error}
                    }
                });
            } else {
                resolve(null);
            }
        });
    });
}

// NEW HELPER FUNCTION: Execute JS in Active Tab
async function executeScriptInActiveTab(code) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                const activeTab = tabs[0];
                // Check if it's a restricted URL (chrome://, etc.) before trying to inject
                if (activeTab.url && (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://'))) {
                    reject(new Error("擴充功能無法在 Chrome 內部頁面中執行腳本。"));
                    return;
                }

                chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: (codeString) => {
                        try {
                            // Using eval in the page context.
                            // If it returns a value (e.g., querying DOM length), it might be a Promise, handle accordingly if needed, 
                            // but for basic injection DOM changes, eval is sufficient.
                            return window.eval(codeString);
                        } catch (e) {
                            return `腳本執行錯誤: ${e.message}`;
                        }
                    },
                    args: [code],
                    world: 'MAIN' // Inject into the page's main context to manipulate target variables if needed
                }, (results) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (results && results[0]) {
                        resolve(results[0].result);
                    } else {
                        resolve(null);
                    }
                });
            } else {
                reject(new Error("找不到活躍的標籤頁。"));
            }
        });
    });
}

// ✨ NEW: Tool Registry (模組化技能庫) ✨
const ToolRegistry = {
    // 技能 1: 讀網頁
    read_current_webpage: {
        schema: {
            type: "function",
            function: {
                name: "read_current_webpage",
                description: "當使用者要求摘要、總結、翻譯當前網頁，或詢問了需要看網頁內容（例如『這篇文章』、『這個網頁寫什麼』）才能回答的問題時，呼叫此工具。",
                parameters: {
                    type: "object",
                    properties: {},
                    required: []
                }
            }
        },
        execute: async (args) => {
            console.log("[Tool] 正在執行 read_current_webpage...");
            const pageData = await getCurrentPageContext();
            if (pageData && pageData.content) {
                return `網頁標題: ${pageData.title}\n網頁內文 (截斷至前 15000 字元):\n${pageData.content.substring(0, 15000)}`;
            } else {
                return "工具執行失敗，無法讀取網頁內容。";
            }
        }
    },
    // 技能 2: 執行 JavaScript 程式碼
    execute_javascript_on_page: {
        schema: {
            type: "function",
            function: {
                name: "execute_javascript_on_page",
                description: "當使用者要求修改網頁畫面（例如更改顏色、隱藏元素、操作 DOM）時，自動生成 Vanilla JavaScript 並呼叫此工具注入目前網頁執行。程式碼應盡量簡潔，且以操作 document 為主。",
                parameters: {
                    type: "object",
                    properties: {
                        code: {
                            type: "string",
                            description: "要在網頁中執行的 JavaScript 程式碼字串。例如: 'document.body.style.backgroundColor = \"black\";'"
                        }
                    },
                    required: ["code"]
                }
            }
        },
        execute: async (args) => {
            console.log("[Tool] 正在執行 execute_javascript_on_page...", args.code);
            try {
                const result = await executeScriptInActiveTab(args.code);
                return `指令已成功執行。執行結果: ${JSON.stringify(result)}`;
            } catch (error) {
                return `工具執行失敗: ${error.message}`;
            }
        }
    }
    /* 暫時隱藏 YouTube 字幕功能 (影片大綱)，直到找到修復方法
    // 技能 3: 讀取 YouTube 字幕
    get_youtube_transcript: {
        schema: {
            type: "function",
            function: {
                name: "get_youtube_transcript",
                description: "當使用者要求摘要、總結或理解當前 YouTube 影片內容時，呼叫此工具來取得影片的 CC 字幕。",
                parameters: {
                    type: "object",
                    properties: {},
                    required: []
                }
            }
        },
        execute: async (args) => {
            console.log("[Tool] 正在執行 get_youtube_transcript...");
            const ytData = await getYoutubeTranscriptContext();
            if (ytData && ytData.transcript) {
                // Return up to a safe limit, e.g., 25000 chars
                let limitedTranscript = ytData.transcript.substring(0, 25000);
                return `[影片字幕內容 (語言: ${ytData.language || '未知'})]\n${limitedTranscript}`;
            } else if (ytData && ytData.error) {
                return \`工具執行失敗: \${ytData.error}\`;
            } else {
                return "工具執行失敗，無法取得 YouTube 字幕。請確定目前在 YouTube 影片頁面。";
            }
        }
    }
    */
    // 未來可以在這裡新增技能 3...
};

// NEW FUNCTION: The Agent Loop for handling Tool Calls
async function runAgentLoop(config, messages, conversationKey) {
    setInterfaceLoading(true);
    let currentMessages = [...messages];

    // ✨ 動態載入所有註冊的工具 Schema ✨
    const availableTools = Object.values(ToolRegistry).map(tool => tool.schema);

    try {
        console.log("[Agent] 第一次請求 (檢查是否需要工具)...");
        let response = await fetch(`${config.apiUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({
                model: config.modelId,
                messages: currentMessages,
                tools: availableTools.length > 0 ? availableTools : undefined, // 避免空陣列報錯
                stream: false // 非串流以方便攔截 Tool Call
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`API 請求失敗: ${response.status} ${errorData.message || ''}`);
        }

        let result = await response.json();
        let message = result.choices[0].message;

        if (message.tool_calls && message.tool_calls.length > 0) {
            console.log("[Agent] AI 要求呼叫工具數量:", message.tool_calls.length);

            // 1. 將 AI 的 tool_calls 請求加進對話紀錄
            currentMessages.push(message);

            // 2. ✨ 動態處理每個工具請求 ✨
            for (const toolCall of message.tool_calls) {
                const toolName = toolCall.function.name;
                const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
                console.log(`[Agent] 準備執行技能: ${toolName}`, toolArgs);

                let resultString = `工具 ${toolName} 未找到或尚未註冊。`;

                // 從 Registry 找出對應的工具並執行
                if (ToolRegistry[toolName]) {
                    try {
                        resultString = await ToolRegistry[toolName].execute(toolArgs);
                    } catch (e) {
                        console.error(`[Agent] 工具執行發生未預期錯誤:`, e);
                        resultString = `執行錯誤: ${e.message}`;
                    }
                } else {
                    console.warn(`[Agent] AI 試圖呼叫未知工具: ${toolName}`);
                }

                // 3. 將每個工具執行結果以 Role: "tool" 加進對話紀錄
                currentMessages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: resultString
                });
            }

            // 4. 第二次請求 (遞迴或是改用串流送出最終請求)
            // 如果我們想支援 AI 連續呼叫工具 (例如先 Google 再看網頁)，這裡應該寫成 `return await runAgentLoop(config, currentMessages, ...)`
            // 但為了體驗流暢，假設執行完一次工具就能回答，我們就跳到串流函式發送最終請求：
            console.log("[Agent] 工具執行完畢，發送最終請求 (使用串流)...");
            setInterfaceLoading(false); // sendRequestToAPIWithThinkHandling 會再次開啟 Loading
            await sendRequestToAPIWithThinkHandling(config, currentMessages, conversationKey);

        } else {
            console.log("[Agent] AI 沒有使用工具，直接回答了。");
            // 直接儲存非串流的回應
            await parseAndStoreFinalAssistantResponse(message.content, conversationKey);
            loadSelectedConfig();
        }
    } catch (error) {
        console.error('Agent Loop 錯誤:', error);
        throw error;
    } finally {
        setInterfaceLoading(false);
    }
}


async function sendMessage() {
    const userInputElement = document.getElementById('userInput'); // Renamed from userInput to avoid conflict with variable
    const userInputText = userInputElement ? userInputElement.value.trim() : ""; // MODIFIED: use userInputText
    if (!userInputText) return;

    if (!selectedConfig || !selectedConfig.apiUrl || !selectedConfig.modelId) { // MODIFIED: check modelId too
        alert("請先完整設定 API (網址、金鑰、模型)。");
        return;
    }

    const conversationKey = `${selectedConfig.apiUrl}-${selectedConfig.modelId}`;
    const userMessage = { role: 'user', content: userInputText }; // No isThinking for user

    await addConversation(conversationKey, userMessage);
    // ORIGINAL: const deleteIndex = await updateConversationItem(userMessage);
    // MODIFICATION: We'll call loadSelectedConfig at the end of sendRequestToAPI to refresh the whole list
    // For now, just display the user message.
    await updateConversationItem(userMessage); // Display user message immediately

    if (userInputElement) userInputElement.value = '';

    const conversationsHistory = await getConversations(conversationKey);
    const messagesForAPI = conversationsHistory
        .filter(conv => !conv.isThinking) // Exclude thinking processes from API history
        .map(conv => ({ role: conv.role, content: conv.content }));
    // messagesForAPI already includes the latest user message due to await addConversation

    try {
        // MODIFICATION START: Call the Agent Loop instead of direct streaming
        await runAgentLoop(selectedConfig, messagesForAPI, conversationKey);
        // MODIFICATION END
    } catch (error) {
        console.error('Error sending message or processing response:', error);
        // Display error as a message in the UI
        const errorResponseMessage = { role: 'assistant', content: `錯誤: ${error.message}`, isThinking: false };
        await addConversation(conversationKey, errorResponseMessage);
        loadSelectedConfig(); // Reload to show the error message
    }
}


// NEW FUNCTION: sendRequestToAPI with <think> tag handling
async function sendRequestToAPIWithThinkHandling(config, messages, conversationKey) {
    setInterfaceLoading(true);
    accumulatedResponse = ''; // Reset accumulated parsed content tokens
    streamingDOMs.main = null;
    streamingDOMs.think = null;
    currentStreamIsThinking = false;
    let currentAccumulatedTextForDOM = ""; // Text for the current DOM block being streamed

    // Store a reference to the conversation list
    const conversationList = document.getElementById('conversationList');

    // Create temporary DOM elements for streaming AI response
    // These will be removed and replaced by proper rendering from storage after stream ends
    let tempMainResponseDiv = null;
    let tempThinkDetailsDiv = null;
    let tempThinkContentDiv = null;

    try {
        const response = await fetch(`${config.apiUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({
                model: config.modelId,
                messages: messages,
                stream: true
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`API 請求失敗: ${response.status} ${errorData.message || ''}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const rawChunk = decoder.decode(value, { stream: true });
            const contentTokens = parseAndStreamResponse(rawChunk); // Use original parsing function for tokens

            if (contentTokens) {
                accumulatedResponse += contentTokens; // Accumulate parsed tokens for final processing

                let processableTokenStream = contentTokens;
                while (processableTokenStream.length > 0) {
                    if (!currentStreamIsThinking) { // Handling main response content
                        const thinkStartIndex = processableTokenStream.indexOf('<think>');
                        if (thinkStartIndex !== -1) { // Found <think>
                            const beforeThinkText = processableTokenStream.substring(0, thinkStartIndex);
                            if (beforeThinkText) {
                                currentAccumulatedTextForDOM += beforeThinkText;
                                if (!tempMainResponseDiv) {
                                    const itemDiv = document.createElement('div'); itemDiv.className = 'conversation-item assistant-message streaming';
                                    tempMainResponseDiv = document.createElement('div'); tempMainResponseDiv.className = 'conversation-content';
                                    itemDiv.appendChild(tempMainResponseDiv);
                                    conversationList.appendChild(itemDiv);
                                }
                                tempMainResponseDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(currentAccumulatedTextForDOM + "▍") : escapeHtml(currentAccumulatedTextForDOM + "▍");
                            }
                            currentStreamIsThinking = true;
                            currentAccumulatedTextForDOM = ""; // Reset for think block
                            // tempMainResponseDiv remains until </think> or end of stream
                            processableTokenStream = processableTokenStream.substring(thinkStartIndex + '<think>'.length);
                        } else { // No <think> in this token part, all main response
                            currentAccumulatedTextForDOM += processableTokenStream;
                            if (!tempMainResponseDiv) {
                                const itemDiv = document.createElement('div'); itemDiv.className = 'conversation-item assistant-message streaming';
                                tempMainResponseDiv = document.createElement('div'); tempMainResponseDiv.className = 'conversation-content';
                                itemDiv.appendChild(tempMainResponseDiv);
                                conversationList.appendChild(itemDiv);
                            }
                            tempMainResponseDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(currentAccumulatedTextForDOM + "▍") : escapeHtml(currentAccumulatedTextForDOM + "▍");
                            processableTokenStream = "";
                        }
                    } else { // Handling <think> content (currentStreamIsThinking is true)
                        const thinkEndIndex = processableTokenStream.indexOf('</think>');
                        if (thinkEndIndex !== -1) { // Found </think>
                            const inThinkText = processableTokenStream.substring(0, thinkEndIndex);
                            if (inThinkText) {
                                currentAccumulatedTextForDOM += inThinkText;
                                if (!tempThinkDetailsDiv) {
                                    const itemDiv = document.createElement('div'); itemDiv.className = 'conversation-item assistant-message thinking-process streaming';
                                    tempThinkDetailsDiv = document.createElement('details');
                                    const summary = document.createElement('summary'); summary.textContent = 'AI 思考中...';
                                    tempThinkDetailsDiv.appendChild(summary);
                                    tempThinkContentDiv = document.createElement('div'); tempThinkContentDiv.className = 'thinking-content-inner';
                                    tempThinkDetailsDiv.appendChild(tempThinkContentDiv);
                                    itemDiv.appendChild(tempThinkDetailsDiv);
                                    conversationList.appendChild(itemDiv);
                                    tempThinkDetailsDiv.open = true; // Expand while streaming
                                }
                                tempThinkContentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(currentAccumulatedTextForDOM + "▍") : escapeHtml(currentAccumulatedTextForDOM + "▍");
                            }
                            currentStreamIsThinking = false;
                            currentAccumulatedTextForDOM = ""; // Reset for main response block
                            // tempThinkDetailsDiv remains until new <think> or end of stream
                            processableTokenStream = processableTokenStream.substring(thinkEndIndex + '</think>'.length);
                        } else { // No </think> in this token part, all think content
                            currentAccumulatedTextForDOM += processableTokenStream;
                            if (!tempThinkDetailsDiv) {
                                const itemDiv = document.createElement('div'); itemDiv.className = 'conversation-item assistant-message thinking-process streaming';
                                tempThinkDetailsDiv = document.createElement('details');
                                const summary = document.createElement('summary'); summary.textContent = 'AI 思考中...';
                                tempThinkDetailsDiv.appendChild(summary);
                                tempThinkContentDiv = document.createElement('div'); tempThinkContentDiv.className = 'thinking-content-inner';
                                tempThinkDetailsDiv.appendChild(tempThinkContentDiv);
                                itemDiv.appendChild(tempThinkDetailsDiv);
                                conversationList.appendChild(itemDiv);
                                tempThinkDetailsDiv.open = true;
                            }
                            tempThinkContentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(currentAccumulatedTextForDOM + "▍") : escapeHtml(currentAccumulatedTextForDOM + "▍");
                            processableTokenStream = "";
                        }
                    }
                } // end while (processableTokenStream)
            } // end if (contentTokens)
            scrollToBottom();
        } // end while (reader.read())

        // Streaming finished, remove cursor from last updated temp DOM
        if (currentStreamIsThinking && tempThinkContentDiv && tempThinkContentDiv.innerHTML.endsWith("▍")) {
            tempThinkContentDiv.innerHTML = tempThinkContentDiv.innerHTML.slice(0, -1);
        } else if (!currentStreamIsThinking && tempMainResponseDiv && tempMainResponseDiv.innerHTML.endsWith("▍")) {
            tempMainResponseDiv.innerHTML = tempMainResponseDiv.innerHTML.slice(0, -1);
        }

        // Now, process the complete 'accumulatedResponse' to split and store correctly.
        // The temporary streaming DOMs will be cleared by loadSelectedConfig -> loadConversations.
        await parseAndStoreFinalAssistantResponse(accumulatedResponse, conversationKey);

    } catch (error) {
        console.error('API request or streaming failed:', error);
        await addConversation(conversationKey, { role: 'assistant', content: `錯誤: ${error.message}`, isThinking: false });
        // throw error; // Re-throw if an outer handler needs it, or handle fully here.
    } finally {
        setInterfaceLoading(false);
        // Crucially, reload conversations from storage to get the final, correctly-indexed items
        loadSelectedConfig();
        accumulatedResponse = ''; // Clear for next message
        // Reset streaming state variables
        streamingDOMs.main = null;
        streamingDOMs.think = null;
        currentStreamIsThinking = false;
    }
}
// END NEW FUNCTION

// NEW FUNCTION to parse the final accumulated response and store parts
async function parseAndStoreFinalAssistantResponse(finalFullResponse, conversationKey) {
    const thinkTagRegex = /(?:<think>([\s\S]*?)<\/think>)/; // Non-global for iterative splitting
    let remainingText = finalFullResponse;

    if (remainingText.trim() === "") return; // Nothing to store

    while (remainingText.length > 0) {
        const match = remainingText.match(thinkTagRegex);
        if (match) {
            // Text before the <think> block
            const beforeText = remainingText.substring(0, match.index);
            if (beforeText.trim()) {
                await addConversation(conversationKey, {
                    role: 'assistant',
                    content: beforeText.trim(),
                    isThinking: false
                });
            }
            // The <think> block content
            if (match[1] && match[1].trim()) {
                await addConversation(conversationKey, {
                    role: 'assistant',
                    content: match[1].trim(),
                    isThinking: true
                });
            }
            // Update remaining text
            remainingText = remainingText.substring(match.index + match[0].length);
        } else {
            // No more <think> blocks, store the rest of the text
            if (remainingText.trim()) {
                await addConversation(conversationKey, {
                    role: 'assistant',
                    content: remainingText.trim(),
                    isThinking: false
                });
            }
            break; // Exit loop
        }
    }
}
// END NEW FUNCTION


// Helper function to escape HTML, if not already present
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ORIGINAL getConversations and setConversations are kept
function getConversations(key) {
    return new Promise((resolve) => {
        chrome.storage.local.get({ conversations: {} }, (result) => {
            resolve(result.conversations[key] || []);
        });
    });
}

function setConversations(key, conversations) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get({ conversations: {} }, (result) => {
            const currentStorage = result.conversations || {};
            currentStorage[key] = conversations;
            chrome.storage.local.set({ conversations: currentStorage }, () => { // Ensure we set the whole conversations object
                if (chrome.runtime.lastError) {
                    console.error("Error setting conversations:", chrome.runtime.lastError.message);
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    });
}


// ORIGINAL getConversationIndex
async function getConversationIndex(message) { // message is {role, content, timestamp}
    if (!selectedConfig) return -1; // Guard clause
    const conversationKey = `${selectedConfig.apiUrl}-${selectedConfig.modelId}`;
    return new Promise((resolve) => {
        chrome.storage.local.get({ conversations: {} }, (result) => {
            const conversations = result.conversations[conversationKey] || [];
            // Match by timestamp if possible for accuracy, fallback to content
            let index = -1;
            if (message.timestamp) {
                index = conversations.findIndex(conv => conv.timestamp === message.timestamp);
            }
            if (index === -1) {
                // Fallback for older messages without timestamp
                index = conversations.findIndex(conv => conv.content === message.content && conv.role === message.role);
            }
            resolve(index);
        });
    });
}

// ORIGINAL deleteConversation and confirmDeleteConversation are kept
function deleteConversation(key, index) {
    getConversations(key).then(async (conversations) => {
        if (index >= 0 && index < conversations.length) { // NEW: Check index bounds
            conversations.splice(index, 1);
            await setConversations(key, conversations);
            console.log(`[DEBUG] Successfully deleted conversation at index ${index} for key ${key}`);

            // Important: Let's completely reload the UI from storage now to guarantee sync
            loadConversations(selectedConfig);
        } else {
            console.warn("Attempted to delete conversation with invalid index:", index);
            // Even if index was bad, UI might be desynced, force a reload
            loadConversations(selectedConfig);
        }
    }).catch(error => {
        console.error('Error deleting conversation:', error);
    });
}

async function confirmDeleteConversation(key, index) {
    if (confirm('確定要刪除這則對話嗎？')) {
        deleteConversation(key, index);
    }
}

// ORIGINAL copyConversation IS REPLACED by copySingleConversationContent called directly

// ORIGINAL deleteAllConversations is kept
async function deleteAllConversations() {
    if (!selectedConfig) {
        alert("請先設定 API 網址和 API 金鑰");
        return;
    }
    const conversationKey = `${selectedConfig.apiUrl}-${selectedConfig.modelId}`;
    if (confirm('確定要刪除所有對話嗎？')) {
        try {
            await setConversations(conversationKey, []);
            console.log("[DEBUG] Successfully cleared all conversations for key:", conversationKey);
            loadConversations(selectedConfig); // Reload directly to show empty list
        } catch (e) {
            console.error("Failed to clear conversations", e)
        }
    }
}

// ORIGINAL summarizeTextFromContent and related functions are kept
async function summarizeTextFromContent(text) {
    if (!text) {
        alert("無資料");
        return;
    }
    if (!selectedConfig) {
        alert("請先設定 API 網址和 API 金鑰");
        return;
    }
    const conversationKey = `${selectedConfig.apiUrl}-${selectedConfig.modelId}`;
    const messageContent = `Please summarize the following text:\n${text}\n\nUsing local language: ${navigator.language}`;
    const userMessage = { role: 'user', content: messageContent };

    await addConversation(conversationKey, userMessage);
    // ORIGINAL: const deleteIndex = await updateConversationItem(userMessage);
    await updateConversationItem(userMessage); // Just display user message

    try {
        // MODIFIED: Call the new sendRequestToAPI which handles think tags
        await sendRequestToAPIWithThinkHandling(selectedConfig, [{ role: 'user', content: messageContent }], conversationKey);
    } catch (error) {
        console.error('Error summarizing text:', error);
        const errorResponseMessage = { role: 'assistant', content: `摘要錯誤: ${error.message}`, isThinking: false };
        await addConversation(conversationKey, errorResponseMessage);
        loadSelectedConfig();
    }
}

// ORIGINAL languageRegex and calculateLocalRatio are kept (assuming they are correct for your needs)
const languageRegex = {
    'en-US': /\p{Script=Latin}|[\u0041-\u005A\u0061-\u007A]|[\u00C0-\u00D6\u00DC-\u00DD\u00DF\u00E0-\u00E6\u00EC-\u00ED\u00F6-\u00F8\u00FC-\u00FD]|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]/gu,
    'fr-FR': /\p{Script=Latin}|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]|[\u00C4-\u00D6\u00DC-\u00DD\u00DF\u00E4-\u00E6\u00EC-\u00ED\u00F6-\u00F8\u00FC-\u00FD]|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]/gu,
    'de-DE': /\p{Script=Latin}|[\u00C4-\u00D6\u00DC-\u00DD\u00DF\u00E4-\u00E6\u00EC-\u00ED\u00F6-\u00F8\u00FC-\u00FD]|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]/gu,
    'es-ES': /\p{Script=Latin}|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]|[\u00C4-\u00D6\u00DC-\u00DD\u00DF\u00E4-\u00E6\u00EC-\u00ED\u00F6-\u00F8\u00FC-\u00FD]|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]/gu,
    'it-IT': /\p{Script=Latin}|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]|[\u00C4-\u00D6\u00DC-\u00DD\u00DF\u00E4-\u00E6\u00EC-\u00ED\u00F6-\u00F8\u00FC-\u00FD]|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]/gu,
    'pt-PT': /\p{Script=Latin}|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]|[\u00C4-\u00D6\u00DC-\u00DD\u00DF\u00E4-\u00E6\u00EC-\u00ED\u00F6-\u00F8\u00FC-\u00FD]|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]/gu,
    'ru-RU': /\p{Script=Latin}|[\u0400-\u04FF]|[\u0500-\u052F]|[\u2DE0-\u2DFF]|[\uA640-\uA69F]|[\uFE20-\uFE2F]|[\uFE30-\uFE6F]|[\uFE70-\uFEFF]|[\uFF00-\uFFFD]|[\u10000-\u10FFFF]|[\u00C4-\u00D6\u00DC-\u00DD\u00DF\u00E4-\u00E6\u00EC-\u00ED\u00F6-\u00F8\u00FC-\u00FD]|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]/gu, // Added Latin for mixed content
    'tr-TR': /\p{Script=Latin}|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]|[\u00C4-\u00D6\u00DC-\u00DD\u00DF\u00E4-\u00E6\u00EC-\u00ED\u00F6-\u00F8\u00FC-\u00FD]|[\u00C0-\u00C5\u00C7-\u00D1\u00D6-\u00D9\u00DC-\u00DD\u00DF\u00E0-\u00E5\u00E7-\u00E9\u00EA-\u00EB\u00EE-\u00EF\u00F0-\u00F4\u00F6-\u00F8\u00FA-\u00FC\u00FE-\u00FF]/gu, // Added Latin for mixed content
    'zh-TW': /\p{Script=Han}|[\u3005\u3007\u3030-\u303F\u31C0-\u31FF\u3200-\u32FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE10-\uFE1F\uFE30-\uFE4F\uFF00-\uFF60\uFF65-\uFFDC]/gu,
    'ja-JP': /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\u3200-\u32FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFF9F]/gu, // Added Hiragana/Katakana
    'ko-KR': /\p{Script=Han}|\p{Script=Hangul}|[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\uA000-\uA48F\uA490-\uA4CF]/gu, // Added Hangul
    'zh-CN': /\p{Script=Han}|[\u3005\u3007\u3030-\u303F\u31C0-\u31FF\u3200-\u32FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE10-\uFE1F\uFE30-\uFE4F\uFF00-\uFF60\uFF65-\uFFDC]/gu,
    'zh-HK': /\p{Script=Han}|[\u3005\u3007\u3030-\u303F\u31C0-\u31FF\u3200-\u32FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE10-\uFE1F\uFE30-\uFE4F\uFF00-\uFF60\uFF65-\uFFDC]/gu,
    'zh-MO': /\p{Script=Han}|[\u3005\u3007\u3030-\u303F\u31C0-\u31FF\u3200-\u32FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE10-\uFE1F\uFE30-\uFE4F\uFF00-\uFF60\uFF65-\uFFDC]/gu,
    'zh-SG': /\p{Script=Han}|[\u3005\u3007\u3030-\u303F\u31C0-\u31FF\u3200-\u32FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE10-\uFE1F\uFE30-\uFE4F\uFF00-\uFF60\uFF65-\uFFDC]/gu,
    'vi-VN': /\p{Script=Han}|\p{Script=Latin}|[\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u1F00-\u1FFF\u2C60-\u2C7F\uA700-\uA71F\uA720-\uA7FF]/gu, // Added Latin
};

function calculateLocalRatio(text) { // MODIFIED: Simplified and more robust
    if (!text) return 0;
    const browserLang = navigator.language || 'en'; // Default to 'en' if undefined
    let langKey = browserLang;
    if (!languageRegex[langKey]) { // Try primary language code if full code (e.g., en-US) not found
        langKey = browserLang.split('-')[0];
    }
    const localCharRegex = languageRegex[langKey] || languageRegex['en']; // Fallback to 'en' regex

    let localCharCount = 0;
    const matches = text.matchAll(localCharRegex);
    for (const match of matches) {
        localCharCount += match[0].length; // Sum lengths of all matched parts
    }
    return text.length > 0 ? localCharCount / text.length : 0;
}

async function translateTextFromContent(text) {
    if (!text) { alert("無資料"); return; }
    if (!selectedConfig) { alert("請先設定 API 網址和 API 金鑰"); return; }

    const conversationKey = `${selectedConfig.apiUrl}-${selectedConfig.modelId}`;
    const localRatio = calculateLocalRatio(text);
    const browserLang = navigator.language || 'en';
    // MODIFICATION START: Define targetLanguage based on localRatio
    const targetLanguage = localRatio > 0.5 ? 'English' : getLanguageNameForPrompt(browserLang);
    // MODIFICATION END
    const messageContent = `請將以下文字翻譯成 ${targetLanguage}:\n${text}`; // Use targetLanguage
    const userMessage = { role: 'user', content: messageContent };

    await addConversation(conversationKey, userMessage);
    // ORIGINAL: const deleteIndex = await updateConversationItem(userMessage);
    await updateConversationItem(userMessage); // Just display user message

    try {
        // MODIFIED: Call the new sendRequestToAPI which handles think tags
        await sendRequestToAPIWithThinkHandling(selectedConfig, [{ role: 'user', content: messageContent }], conversationKey);
    } catch (error) {
        console.error('Error translating text:', error);
        const errorResponseMessage = { role: 'assistant', content: `翻譯錯誤: ${error.message}`, isThinking: false };
        await addConversation(conversationKey, errorResponseMessage);
        loadSelectedConfig();
    }
}

// NEW HELPER for getting language name suitable for a prompt
function getLanguageNameForPrompt(langCode) {
    const langMap = {
        'en': 'English', 'zh': 'Traditional Chinese (繁體中文)', 'ja': 'Japanese (日本語)', 'ko': 'Korean (한국어)',
        'fr': 'French (Français)', 'de': 'German (Deutsch)', 'es': 'Spanish (Español)',
    };
    const mainLang = langCode.split('-')[0];
    if (mainLang === 'zh' && (langCode.toLowerCase().includes('tw') || langCode.toLowerCase().includes('hk'))) {
        return 'Traditional Chinese (繁體中文)';
    } else if (mainLang === 'zh') { return 'Simplified Chinese (简体中文)'; }
    return langMap[mainLang] || langCode; // Fallback to langCode itself if not in map
}


// ORIGINAL summarizeText and translateText are kept but will call the modified summarizeTextFromContent/translateTextFromContent
async function summarizeText() {
    const text = await getTextFromSelectionOrClipboard();
    if (!text) { alert("無資料"); return; }
    await summarizeTextFromContent(text); // Calls the modified version
}

async function translateText() {
    const text = await getTextFromSelectionOrClipboard();
    if (!text) { alert("無資料"); return; }
    await translateTextFromContent(text); // Calls the modified version
}

// ORIGINAL getTextFromSelectionOrClipboard is kept
async function getTextFromSelectionOrClipboard() {
    let text = '';
    try {
        text = window.getSelection().toString().trim();
        if (!text && navigator.clipboard && navigator.clipboard.readText) { // MODIFIED: check navigator.clipboard exists
            text = await navigator.clipboard.readText().then(clipText => clipText.trim()).catch(() => '');
        }
    } catch (error) {
        console.error('無法讀取選取文字或剪貼簿:', error);
    }
    return text;
}

// ORIGINAL calculateEnglishRatio (Note: This is not used by calculateLocalRatio. Keep if used elsewhere, otherwise can be removed)
function calculateEnglishRatio(text) {
    const englishCharRegex = /[a-zA-Z]/g;
    const matches = text.match(englishCharRegex);
    if (!matches) return 0;
    return matches.length / text.length;
}

// ORIGINAL setInterfaceLoading is kept
function setInterfaceLoading(isLoading) {
    const elements = [
        document.getElementById('userInput'),
        document.getElementById('sendMessageButton'),
        document.getElementById('summaryButton'),
        document.getElementById('translateButton'),
        document.getElementById('configSelect'),
        document.getElementById('deleteAllConversationsButton')
    ];
    elements.forEach(element => {
        if (element) {
            element.disabled = isLoading;
            element.classList.toggle('loading', isLoading);
        }
    });
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.classList.toggle('show', isLoading);
    }
}

// ORIGINAL parseAndStreamResponse (extracts content from SSE chunk) is kept
function parseAndStreamResponse(chunk) {
    const lines = chunk.split('\n').filter(line => line.trim() !== '');
    let accumulatedContent = '';
    lines.forEach(line => {
        if (line.startsWith('data: ')) {
            const data = line.substring('data: '.length);
            if (data.trim().toUpperCase() === '[DONE]') { // MODIFIED: Case-insensitive [DONE]
                return;
            }
            try {
                const parsedData = JSON.parse(data);
                if (parsedData.choices && parsedData.choices[0] && parsedData.choices[0].delta) {
                    if (parsedData.choices[0].delta.content) {
                        accumulatedContent += parsedData.choices[0].delta.content;
                    }
                }
            } catch (error) {
                // console.warn('Error parsing JSON in stream (can be ignored if partial):', error, data);
            }
        }
    });
    return accumulatedContent;
}

// ORIGINAL loadConfigsAndCheckStorage, checkAndAddStoredConfig, fetchModels, populateModelSelect, setSavedModelAsDefault, saveConfig, deleteConfig, loadConfigList
// These are primarily for the settings page part of sidepanel.html and should largely remain unchanged in their core logic.
// Small modifications were made inside the DOMContentLoaded for configList click listener.
async function loadConfigsAndCheckStorage() {
    console.warn("[DEBUG] loadConfigsAndCheckStorage called - this should be part of initialLoadAndDisplayConfigs now.");
    // The logic of this function is now mostly integrated into initialLoadAndDisplayConfigs
    // to prevent re-entrant calls.
    // If it *must* be called separately, it needs to be very careful.
    // For now, let's assume it's handled by the new init sequence.
}

function checkAndAddStoredConfig(urlKey, apiKeyKey, currentConfigsFromCaller, callback) {
    chrome.storage.local.get([urlKey, apiKeyKey], (result) => {
        const apiUrl = result[urlKey];
        const apiKey = result[apiKeyKey];
        let configsModified = false;
        // Create a new array to avoid modifying the caller's reference directly if not needed
        let updatedConfigs = [...currentConfigsFromCaller];

        if (apiUrl && apiKey) {
            const existingConfig = updatedConfigs.find(config => config.apiUrl === apiUrl && config.apiKey === apiKey);
            if (!existingConfig) {
                const newConfig = { apiUrl, apiKey, modelId: '' };
                updatedConfigs.push(newConfig);
                configsModified = true;
            }
        }

        if (configsModified) {
            chrome.storage.local.set({ configs: updatedConfigs }, () => {
                console.log(`[DEBUG] Configs updated by checkAndAddStoredConfig for ${urlKey}, new count: ${updatedConfigs.length}`);
                if (callback) callback(updatedConfigs); // Pass back the modified array
            });
        } else {
            if (callback) callback(updatedConfigs); // Pass back the original (or non-modified) array
        }
    });
}

async function fetchModels() {
    const apiUrlInput = document.getElementById('apiUrl'); // Use distinct var name
    const apiKeyInput = document.getElementById('apiKey'); // Use distinct var name
    const apiUrl = apiUrlInput ? apiUrlInput.value : "";
    const apiKey = apiKeyInput ? apiKeyInput.value : "";

    if (!apiUrl || !apiKey) {
        alert('請填寫 API 網址和 API 金鑰');
        return;
    }
    try {
        setInterfaceLoading(true);
        const response = await fetch(`${apiUrl}/v1/models`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'ngrok-skip-browser-warning': 'true' // Kept for extension context
            },
        });
        if (!response.ok) { // NEW: Check response.ok
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }
        const data = await response.json();
        populateModelSelect(data.data || []); // MODIFIED: Handle case where data.data might be undefined
    } catch (error) {
        console.error('無法取得模型列表:', error);
        alert(`無法取得模型列表，請檢查 API 網址和金鑰: ${error.message}`);
        const modelSelectElement = document.getElementById('modelSelect');
        if (modelSelectElement) modelSelectElement.innerHTML = '<option value="">載入失敗</option>'; // Provide feedback
    } finally {
        setInterfaceLoading(false);
    }
}

function populateModelSelect(models) {
    const modelSelectElement = document.getElementById('modelSelect');
    if (!modelSelectElement) return;
    modelSelectElement.innerHTML = '';
    if (!models || models.length === 0) { // NEW: Handle empty or null models array
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "無可用模型";
        modelSelectElement.appendChild(option);
        return;
    }
    models.forEach(model => {
        if (model && model.id) { // NEW: Check model and model.id
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            modelSelectElement.appendChild(option);
        }
    });
}

function setSavedModelAsDefault(savedModelId) {
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect || !savedModelId) return; // NEW: Guard clauses

    const modelOption = Array.from(modelSelect.options).find(option => option.value === savedModelId);
    if (modelOption) {
        modelSelect.value = savedModelId;
    } else if (modelSelect.options.length > 0) {
        // If saved model not in list, select first available (or none if list is empty and placeholder shown)
        // modelSelect.selectedIndex = 0; // Optional: select first if saved one not found
    }
}

function saveConfig() {
    const apiUrlInput = document.getElementById('apiUrl');
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');

    const apiUrl = apiUrlInput ? apiUrlInput.value.trim() : "";
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
    const modelId = modelSelect ? modelSelect.value : ""; // Can be empty if no model selected/available

    if (!apiUrl || !apiKey) {
        alert('請填寫 API 網址和 API 金鑰。模型可稍後選擇。');
        return;
    }

    chrome.storage.local.get({ configs: [] }, (result) => {
        let configs = result.configs || [];
        const newConfig = { apiUrl, apiKey, modelId };

        // Optional: Prevent exact duplicates or update existing
        const existingIndex = configs.findIndex(c => c.apiUrl === apiUrl && c.apiKey === apiKey);
        if (existingIndex !== -1) {
            configs[existingIndex] = newConfig; // Update if exists
            alert('設定已更新。');
        } else {
            configs.push(newConfig);
            alert('設定已儲存。');
        }

        chrome.storage.local.set({ configs: configs }, () => {
            loadConfigs(); // Reload to update dropdown and settings list
        });
    });
}

function deleteConfig(index) { // This is for the settings page list
    chrome.storage.local.get({ configs: [], selectedConfigIndex: 0 }, (result) => {
        let configs = result.configs || [];
        let currentSelectedIdx = result.selectedConfigIndex;

        if (index >= 0 && index < configs.length) {
            configs.splice(index, 1);
            // Adjust selectedConfigIndex if the deleted item affects it
            if (index === currentSelectedIdx) {
                currentSelectedIdx = 0; // Reset to first or handle no configs
            } else if (index < currentSelectedIdx) {
                currentSelectedIdx--;
            }
            if (configs.length === 0) { // If all configs deleted
                currentSelectedIdx = 0; // or -1 to indicate no selection
            }


            chrome.storage.local.set({ configs: configs, selectedConfigIndex: currentSelectedIdx }, () => {
                loadConfigs(); // Refresh both configSelect dropdown and settings page list
            });
        }
    });
}


function loadConfigList(configs) { // This populates the list on the settings page part
    const configListDiv = document.getElementById('configList');
    if (!configListDiv) return;
    configListDiv.innerHTML = '';

    if (!configs || configs.length === 0) {
        configListDiv.innerHTML = '<p>尚無設定。</p>';
        return;
    }

    configs.forEach((config, index) => {
        const div = document.createElement('div');
        div.className = 'config-item';
        div.dataset.index = index; // For loading the config into form

        // MODIFICATION START: Create a span for text content to make it clickable for loading
        const textSpan = document.createElement('span');
        textSpan.className = 'config-item-text'; // Add a class for potential styling/event handling
        textSpan.textContent = `${config.apiUrl ? config.apiUrl.substring(0, 25) : 'N/A'}... - ${config.modelId || '(未選模型)'}`;
        textSpan.title = "點擊以載入此設定至表單";
        div.appendChild(textSpan);
        // MODIFICATION END

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-config-button'; // NEW class for specific targeting
        deleteButton.textContent = 'X';
        deleteButton.title = "刪除此設定";
        deleteButton.onclick = (e) => { // MODIFIED: Stop propagation to prevent config item click
            e.stopPropagation();
            if (confirm(`確定要刪除設定 "${config.apiUrl} - ${config.modelId || ''}" 嗎？`)) {
                deleteConfig(index);
            }
        };
        div.appendChild(deleteButton);
        configListDiv.appendChild(div);
    });
}


// ORIGINAL addCopyButtonIfCodeExists is kept
function addCopyButtonIfCodeExists(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return; // NEW: Guard against null container
    const codeElements = container.querySelectorAll('pre > code, code[class*="language-"]'); // MODIFIED: More specific selector from PWA
    codeElements.forEach(codeElement => {
        const parentPre = codeElement.closest('pre');
        if (parentPre && !parentPre.querySelector('button.copy-button.copy-code-button')) { // MODIFIED: Class check from PWA
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button copy-code-button'; // Use class from PWA for consistency
            copyButton.innerHTML = '&#128203;';
            copyButton.title = "複製程式碼"; // NEW: Add title
            // Styles for copy-code-button should be in sidepanel.html's CSS

            parentPre.style.position = 'relative'; // Ensure parent <pre> is relative for positioning
            parentPre.appendChild(copyButton);

            copyButton.onclick = function (event) {
                event.stopPropagation(); // Prevent any parent handlers
                const codeToCopy = codeElement.innerText;
                navigator.clipboard.writeText(codeToCopy).then(() => {
                    console.log('Code copied to clipboard');
                    // Optional: Show a temporary "Copied!" message
                }).catch(err => {
                    console.error('Could not copy code: ', err);
                });
            };
        }
    });
}

// NEW: Helper to scroll conversation list to bottom
function scrollToBottom() {
    const conversationList = document.getElementById('conversationList');
    if (conversationList) {
        conversationList.scrollTop = conversationList.scrollHeight;
    }
}


