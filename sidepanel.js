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

// === NEW: 智慧型跟隨捲動 (Smart Follow Scroll) ===
// 串流回答時自動跟隨捲動到最新內容；使用者手動往上捲時暫停跟隨，
// 捲回接近底部時自動恢復跟隨。
let autoFollowScroll = true;          // 是否處於「跟隨」狀態
let userScrollIntent = false;         // 使用者是否正在用滑鼠/觸控操作捲動
const FOLLOW_BOTTOM_THRESHOLD = 100;  // 距離底部多少 px 內視為「在底部」

function isNearBottom() {
    const el = document.scrollingElement || document.documentElement;
    return el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_BOTTOM_THRESHOLD;
}

// 只在「跟隨」狀態下才捲到底（串流期間使用，instant 避免和快速更新打架）
function smartFollowScroll() {
    if (!autoFollowScroll) return;
    const el = document.scrollingElement || document.documentElement;
    el.scrollTop = el.scrollHeight;
}

// 滾輪往上 = 使用者想看前文，立即暫停跟隨
window.addEventListener('wheel', (event) => {
    if (event.deltaY < 0) autoFollowScroll = false;
}, { passive: true });

// 觸控 / 拖曳捲軸期間，若離開底部就暫停跟隨
window.addEventListener('touchstart', () => { userScrollIntent = true; }, { passive: true });
window.addEventListener('touchend', () => { userScrollIntent = false; }, { passive: true });
window.addEventListener('mousedown', () => { userScrollIntent = true; });
window.addEventListener('mouseup', () => { userScrollIntent = false; });

window.addEventListener('keydown', (event) => {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (activeTag === 'TEXTAREA' || activeTag === 'INPUT') return;
    if (['PageUp', 'ArrowUp', 'Home'].includes(event.key)) autoFollowScroll = false;
});

// 捲回接近底部時恢復跟隨；使用者操作中離開底部則暫停
window.addEventListener('scroll', () => {
    if (isNearBottom()) {
        autoFollowScroll = true;
    } else if (userScrollIntent) {
        autoFollowScroll = false;
    }
}, { passive: true });
// === END 智慧型跟隨捲動 ===

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
            if (conversation.isStep) div.classList.add('agent-step'); // NEW: Style for agent steps

            const contentDiv = document.createElement('div');
            contentDiv.className = 'conversation-content';

            if (conversation.isThinking || conversation.isStep) { // MODIFIED: Handle steps as details too
                const details = document.createElement('details');
                const summary = document.createElement('summary');
                summary.textContent = conversation.isStep ? '⚙️ 查看代理執行步驟' : '顯示/隱藏 AI 思考過程';
                details.appendChild(summary);
                const innerDiv = document.createElement('div');
                innerDiv.className = conversation.isStep ? 'step-content-inner' : 'thinking-content-inner';
                innerDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(conversation.content) : escapeHtml(conversation.content);
                addCopyButtonIfCodeExists(innerDiv);
                details.appendChild(innerDiv);
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


// MODIFIED FUNCTION to handle 'isThinking' and 'isStep' property when adding to storage
async function addConversation(key, messageObject) { // messageObject can now have {role, content, isThinking, isStep}
    const conversations = await getConversations(key);
    const newConversationEntry = {
        role: messageObject.role,
        content: messageObject.content,
        isThinking: messageObject.isThinking || false, // Default to false if not provided
        isStep: messageObject.isStep || false, // NEW: For agent action summaries
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
                            const script = document.createElement('script');
                            script.textContent = codeString;
                            document.documentElement.appendChild(script);
                            script.remove();
                            return "腳本已注入執行";
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

// Helper: escape HTML special characters to prevent XSS in UI descriptions
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ✨ NEW: Tool Registry (模組化技能庫) ✨
// === NEW: 本次對話工具授權（以工具為單位的 first-use 授權）===
// 每個工具在一次對話中「第一次」被呼叫時都會詢問；使用者按「本次對話都允許」後，
// 該工具在本對話的後續輪次自動放行。存於記憶體（重開側邊欄即重置，屬安全預設）。
const conversationToolGrants = new Map(); // conversationKey -> Set<toolName>
// 硬上限：每連續自動放行 N 輪，強制跳出一次人工確認（避免小模型空轉刷迴圈）
const AUTO_APPROVE_CHECKPOINT_ROUNDS = 8;

function getGrantedTools(conversationKey) {
    if (!conversationToolGrants.has(conversationKey)) {
        conversationToolGrants.set(conversationKey, new Set());
    }
    return conversationToolGrants.get(conversationKey);
}
// === END 本次對話工具授權 ===

const ToolRegistry = {
    // 技能 1: 讀網頁
    read_current_webpage: {
        getDisplayName: () => "📄 讀取當前網頁",
        getUiDescription: () => "代理想要讀取你目前正在瀏覽的網頁內容（包含標題與內文），以便回答你的問題。",
        schema: {
            type: "function",
            function: {
                name: "read_current_webpage",
                description: "當使用者要求摘要、總結、翻譯當前網頁，或詢問了需要看網頁內容（例如『這篇文章』、『這個網頁寫什麼』）才能回答的問題時，呼叫此工具。"
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
        getDisplayName: () => "⚡ 執行網頁腳本 (動態修改畫面)",
        getUiDescription: (args) => `代理想要在當前網頁執行一段腳本。這通常用來改變網頁外觀或操作畫面。<br><strong>預計執行的腳本:</strong><br><code style="background-color: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 3px; word-break: break-all;">${escapeHtml(args.code || '(空)')}</code>`,
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
    },
    // ✨ 技能 3: 開啟新分頁
    open_new_tab: {
        getDisplayName: () => "🌐 開啟新分頁",
        getUiDescription: (args) => {
            const safeUrl = (args.url && /^https?:\/\//i.test(args.url)) ? args.url : '#';
            const displayUrl = escapeHtml(args.url || '');
            return `代理想要為你開啟一個新分頁並前往: <a href="${escapeHtml(safeUrl)}" target="_blank" style="color: #4CAF50;">${displayUrl}</a>`;
        },
        schema: {
            type: "function",
            function: {
                name: "open_new_tab",
                description: "當使用者要求開啟一個新分頁、開啟網頁、前往某個網址或搜尋某個關鍵字時，呼叫此工具。如果是直接搜尋，請將搜尋關鍵字轉換為搜尋引擎網址 (如 https://www.google.com/search?q=關鍵字)。",
                parameters: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "要開啟的完整網址 (需包含 https:// 等協議)。例如: 'https://www.google.com/search?q=apple'"
                        }
                    },
                    required: ["url"]
                }
            }
        },
        execute: async (args) => {
            console.log("[Tool] 正在執行 open_new_tab...", args.url);
            try {
                return await new Promise((resolve) => {
                    chrome.tabs.create({ url: args.url }, (tab) => {
                        if (chrome.runtime.lastError) {
                            resolve(`開啟失敗: ${chrome.runtime.lastError.message}`);
                        } else {
                            resolve(`已成功開啟新分頁: ${args.url}`);
                        }
                    });
                });
            } catch (error) {
                return `工具執行失敗: ${error.message}`;
            }
        }
    },
    // ✨ 技能 4: 切換到上一個分頁
    switch_to_previous_tab: {
        getDisplayName: () => "⏪ 切換回上一個分頁",
        getUiDescription: () => "代理想要幫你切換回剛剛瀏覽的分頁。",
        schema: {
            type: "function",
            function: {
                name: "switch_to_previous_tab",
                description: "當使用者要求回到上一個分頁、切換回剛剛的分頁時，呼叫此工具。"
            }
        },
        execute: async (args) => {
            console.log("[Tool] 正在執行 switch_to_previous_tab...");
            try {
                return await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: "getPreviousTabId" }, (response) => {
                        if (chrome.runtime.lastError || !response || !response.previousTabId) {
                            resolve("無法取得上一個分頁，可能是沒有紀錄或該分頁已關閉。");
                            return;
                        }
                        chrome.tabs.update(response.previousTabId, { active: true }, (tab) => {
                            if (chrome.runtime.lastError) {
                                resolve(`切換失敗: ${chrome.runtime.lastError.message}`);
                            } else {
                                chrome.windows.update(tab.windowId, { focused: true }, () => {
                                    resolve(`已成功切換回上一個分頁。`);
                                });
                            }
                        });
                    });
                });
            } catch (error) {
                return `工具執行失敗: ${error.message}`;
            }
        }
    },
    // ✨ 技能 5: 切換到特定分頁
    switch_to_tab: {
        getDisplayName: () => "🔍 切換到特定分頁",
        getUiDescription: (args) => `代理想要幫你尋找並切換到包含關鍵字「<strong>${escapeHtml(args.keyword)}</strong>」的分頁。`,
        schema: {
            type: "function",
            function: {
                name: "switch_to_tab",
                description: "當使用者要求切換到某個特定標題或網址的分頁時 (例如切換到 YouTube、切換到 Google)，呼叫此工具。",
                parameters: {
                    type: "object",
                    properties: {
                        keyword: {
                            type: "string",
                            description: "使用者想要切換到的分頁名稱或網址關鍵字"
                        }
                    },
                    required: ["keyword"]
                }
            }
        },
        execute: async (args) => {
            console.log("[Tool] 正在執行 switch_to_tab...", args.keyword);
            try {
                return await new Promise((resolve) => {
                    chrome.tabs.query({}, (tabs) => {
                        if (chrome.runtime.lastError) {
                            resolve(`查詢分頁失敗: ${chrome.runtime.lastError.message}`);
                            return;
                        }
                        const keyword = args.keyword.toLowerCase();
                        let targetTab = null;

                        targetTab = tabs.find(tab => tab.title && tab.title.toLowerCase().includes(keyword));
                        if (!targetTab) {
                            targetTab = tabs.find(tab => tab.url && tab.url.toLowerCase().includes(keyword));
                        }

                        if (targetTab) {
                            chrome.tabs.update(targetTab.id, { active: true }, () => {
                                chrome.windows.update(targetTab.windowId, { focused: true }, () => {
                                    resolve(`已成功切換到分頁: ${targetTab.title}`);
                                });
                            });
                        } else {
                            resolve(`找不到包含關鍵字 "${args.keyword}" 的分頁。`);
                        }
                    });
                });
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

// NEW: 括號配對式 JSON 物件抽取。
// 取代先前的非貪婪 regex /\{[\s\S]*?\}/（遇巢狀物件會在第一個 } 截斷），
// 正確處理巢狀大括號與字串值內的大括號/跳脫字元。回傳第一個可成功 JSON.parse 的物件字串。
function extractFirstJsonObject(text) {
    let i = 0;
    while (i < text.length) {
        const start = text.indexOf('{', i);
        if (start === -1) return null;
        let depth = 0, inString = false, escaped = false, end = -1;
        for (let j = start; j < text.length; j++) {
            const ch = text[j];
            if (inString) {
                if (escaped) escaped = false;
                else if (ch === '\\') escaped = true;
                else if (ch === '"') inString = false;
            } else {
                if (ch === '"') inString = true;
                else if (ch === '{') depth++;
                else if (ch === '}') {
                    depth--;
                    if (depth === 0) { end = j; break; }
                }
            }
        }
        if (end === -1) return null; // 括號不平衡（可能是被截斷的輸出）
        const candidate = text.slice(start, end + 1);
        try {
            JSON.parse(candidate);
            return candidate;
        } catch (e) {
            i = start + 1; // 這段不是合法 JSON，從下一個 { 繼續找
        }
    }
    return null;
}

// === NEW: 第二階段「反芻抽取」(Two-Phase Extraction, v1) ===
// 第一階段讓模型自由推理輸出（不套格式）；若未觸發原生 tool_calls，串流結束後由
// 同一顆模型對自己的輸出做一次非串流的「純抽取」呼叫，把文字中的工具呼叫意圖轉為
// 結構化 JSON。設計依據見 TWO_PHASE_EXTRACTION_NOTES.md。
// 重試上限 2 次，徹底失敗則降級到 regex 文字備援解析器。
const EXTRACTION_MAX_ATTEMPTS = 2;

// 便宜的前置過濾：全文完全沒提到任何已註冊工具名，就不花一次 API 呼叫去反芻
function textMentionsAnyTool(text) {
    return Object.keys(ToolRegistry).some(name => text.includes(name));
}

// 驗證抽取結果（schema 驗證放 harness，不信任模型輸出）
// 回傳: {noTool:true} | tool_call 物件 | null(驗證失敗)
function validateExtractedToolCall(parsed) {
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.name === null) return { noTool: true };
    if (typeof parsed.name !== 'string' || !ToolRegistry[parsed.name]) return null;
    const args = (parsed.arguments && typeof parsed.arguments === 'object') ? parsed.arguments : {};
    const fnSchema = ToolRegistry[parsed.name].schema.function;
    const required = (fnSchema.parameters && fnSchema.parameters.required) || [];
    for (const key of required) {
        if (args[key] === undefined || args[key] === null || args[key] === '') return null;
    }
    return {
        id: "call_" + Math.random().toString(36).substring(2, 9),
        type: "function",
        function: { name: parsed.name, arguments: JSON.stringify(args) }
    };
}

async function extractToolCallViaModel(config, phase1Text) {
    const toolList = Object.values(ToolRegistry).map(t => {
        const fn = t.schema.function;
        const paramNames = fn.parameters ? Object.keys(fn.parameters.properties || {}).join(', ') : '';
        return `- ${fn.name}${paramNames ? ` (參數: ${paramNames})` : ' (無參數)'}`;
    }).join('\n');

    const extractionMessages = [
        {
            role: 'system',
            content: '你是一個純抽取器。閱讀使用者提供的 AI 助理輸出文本，判斷其中是否嘗試呼叫工具。只從文本中抽取，不得新增、改寫或自行推理。只輸出一個 JSON 物件，不要輸出任何其他文字。'
        },
        {
            role: 'user',
            content: `可用工具:\n${toolList}\n\n助理輸出文本:\n"""\n${phase1Text}\n"""\n\n若文本中嘗試呼叫上述工具，輸出 {"name": "工具名", "arguments": {參數物件}}；參數值必須來自文本本身，不得自行編造。若文本沒有嘗試呼叫任何工具，輸出 {"name": null}。`
        }
    ];

    for (let attempt = 1; attempt <= EXTRACTION_MAX_ATTEMPTS; attempt++) {
        try {
            console.log(`[Extractor] 第二階段反芻抽取，嘗試 ${attempt}/${EXTRACTION_MAX_ATTEMPTS}...`);
            const response = await fetch(`${config.apiUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`,
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify({
                    model: config.modelId,
                    messages: extractionMessages,
                    stream: false,
                    temperature: 0,
                    max_tokens: 1024
                })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const rawText = (data.choices && data.choices[0] && data.choices[0].message)
                ? (data.choices[0].message.content || '') : '';
            const jsonStr = extractFirstJsonObject(rawText);
            if (!jsonStr) throw new Error('回應中沒有可解析的 JSON');
            const result = validateExtractedToolCall(JSON.parse(jsonStr));
            if (result) return result; // {noTool:true} 或 tool_call 物件
            throw new Error('抽取結果未通過 schema 驗證');
        } catch (error) {
            console.warn(`[Extractor] 抽取失敗 (${attempt}/${EXTRACTION_MAX_ATTEMPTS}): ${error.message}`);
        }
    }
    return null; // 徹底失敗 → 呼叫端降級到 regex 備援解析器
}
// === END 第二階段反芻抽取 ===

// NEW FUNCTION: Unified Agent Stream Loop
async function runAgentStreamLoop(config, messages, conversationKey, recursionDepth = 0) {
    setInterfaceLoading(true);
    if (recursionDepth === 0) autoFollowScroll = true; // 新回答開始時重置為跟隨模式
    let currentMessages = [...messages];

    if (currentMessages.length > 0 && currentMessages[0].role !== 'system') {
        currentMessages.unshift({
            role: 'system',
            content: 'You are a helpful AI assistant. You have access to various tools (functions). If the user asks you to perform an action that requires a tool (such as reading the current webpage, executing javascript, or opening a new tab), YOU MUST USE THE PROVIDED TOOL. Do not simply describe that you need to use a tool, but actually output the proper JSON function call.'
        });
    }

    const availableTools = Object.values(ToolRegistry).map(tool => tool.schema);
    accumulatedResponse = '';
    streamingDOMs.main = null;
    streamingDOMs.think = null;
    currentStreamIsThinking = false;
    let currentAccumulatedTextForDOM = "";

    const conversationList = document.getElementById('conversationList');
    let tempMainResponseDiv = null;
    let tempThinkDetailsDiv = null;
    let tempThinkContentDiv = null;

    let responseToolCalls = [];

    try {
        const payload = {
            model: config.modelId,
            messages: currentMessages,
            stream: true
        };
        if (availableTools.length > 0) {
            payload.tools = availableTools;
            payload.tool_choice = "auto";
        }

        const response = await fetch(`${config.apiUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`API 請求失敗: ${response.status} ${errorData.message || ''}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let streamBuffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            streamBuffer += decoder.decode(value, { stream: true });
            let newlineIndex;
            while ((newlineIndex = streamBuffer.indexOf('\n')) >= 0) {
                const line = streamBuffer.slice(0, newlineIndex).trim();
                streamBuffer = streamBuffer.slice(newlineIndex + 1);

                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data.toUpperCase() === '[DONE]') continue;
                    try {
                        const parsedData = JSON.parse(data);
                        const delta = parsedData.choices && parsedData.choices[0] && parsedData.choices[0].delta;
                        if (!delta) continue;

                        if (delta.tool_calls) {
                            for (const tc of delta.tool_calls) {
                                if (!responseToolCalls[tc.index]) {
                                    responseToolCalls[tc.index] = {
                                        id: tc.id || "",
                                        type: "function",
                                        function: { name: tc.function.name || "", arguments: tc.function.arguments || "" }
                                    };
                                } else {
                                    if (tc.function.name) responseToolCalls[tc.index].function.name += tc.function.name;
                                    if (tc.function.arguments) responseToolCalls[tc.index].function.arguments += tc.function.arguments;
                                }
                            }
                        }

                        if (delta.content) {
                            const contentTokens = delta.content;
                            accumulatedResponse += contentTokens;

                            let processableTokenStream = contentTokens;
                            while (processableTokenStream.length > 0) {
                                if (!currentStreamIsThinking) {
                                    let thinkStartIndex = processableTokenStream.indexOf('<think>');
                                    let thinkStartLen = 7;
                                    const gemmaStart = processableTokenStream.indexOf('<|channel>thought');
                                    const altStart = processableTokenStream.indexOf('<thought>');
                                    if (gemmaStart !== -1 && (thinkStartIndex === -1 || gemmaStart < thinkStartIndex)) {
                                        thinkStartIndex = gemmaStart;
                                        thinkStartLen = processableTokenStream.startsWith('\n', gemmaStart + 17) ? 18 : 17;
                                    }
                                    if (altStart !== -1 && (thinkStartIndex === -1 || altStart < thinkStartIndex)) {
                                        thinkStartIndex = altStart;
                                        thinkStartLen = 9;
                                    }

                                    if (thinkStartIndex !== -1) {
                                        const beforeThinkText = processableTokenStream.substring(0, thinkStartIndex);
                                        if (beforeThinkText) {
                                            currentAccumulatedTextForDOM += beforeThinkText;
                                            if (!tempMainResponseDiv) {
                                                const itemDiv = document.createElement('div'); itemDiv.className = 'conversation-item assistant-message streaming';
                                                const contentDiv = document.createElement('div'); contentDiv.className = 'conversation-content';
                                                tempMainResponseDiv = contentDiv;
                                                itemDiv.appendChild(contentDiv);
                                                conversationList.appendChild(itemDiv);
                                                if (autoFollowScroll) scrollToBottom(itemDiv); // 自動聚焦到回覆區塊起點
                                            }
                                            tempMainResponseDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(currentAccumulatedTextForDOM + "▍") : escapeHtml(currentAccumulatedTextForDOM + "▍");
                                        }
                                        currentStreamIsThinking = true;
                                        currentAccumulatedTextForDOM = "";
                                        processableTokenStream = processableTokenStream.substring(thinkStartIndex + thinkStartLen);
                                    } else {
                                        currentAccumulatedTextForDOM += processableTokenStream;
                                        if (!tempMainResponseDiv) {
                                            const itemDiv = document.createElement('div'); itemDiv.className = 'conversation-item assistant-message streaming';
                                            const contentDiv = document.createElement('div'); contentDiv.className = 'conversation-content';
                                            tempMainResponseDiv = contentDiv;
                                            itemDiv.appendChild(contentDiv);
                                            conversationList.appendChild(itemDiv);
                                            if (autoFollowScroll) scrollToBottom(itemDiv); // 自動聚焦到回覆區塊起點
                                        }
                                        tempMainResponseDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(currentAccumulatedTextForDOM + "▍") : escapeHtml(currentAccumulatedTextForDOM + "▍");
                                        processableTokenStream = "";
                                    }
                                } else {
                                    let thinkEndIndex = processableTokenStream.indexOf('</think>');
                                    let thinkEndLen = 8;
                                    const gemmaEnd = processableTokenStream.indexOf('<channel|>');
                                    const altEnd = processableTokenStream.indexOf('</thought>');
                                    if (gemmaEnd !== -1 && (thinkEndIndex === -1 || gemmaEnd < thinkEndIndex)) {
                                        thinkEndIndex = gemmaEnd;
                                        thinkEndLen = 10;
                                    }
                                    if (altEnd !== -1 && (thinkEndIndex === -1 || altEnd < thinkEndIndex)) {
                                        thinkEndIndex = altEnd;
                                        thinkEndLen = 10;
                                    }

                                    if (thinkEndIndex !== -1) {
                                        const inThinkText = processableTokenStream.substring(0, thinkEndIndex);
                                        if (inThinkText) {
                                            currentAccumulatedTextForDOM += inThinkText;
                                            if (!tempThinkDetailsDiv) {
                                                const itemDiv = document.createElement('div'); itemDiv.className = 'conversation-item assistant-message thinking-process streaming';
                                                const contentDiv = document.createElement('div'); contentDiv.className = 'conversation-content';
                                                tempThinkDetailsDiv = document.createElement('details');
                                                const summary = document.createElement('summary'); summary.textContent = 'AI 思考中...';
                                                tempThinkDetailsDiv.appendChild(summary);
                                                tempThinkContentDiv = document.createElement('div'); tempThinkContentDiv.className = 'thinking-content-inner';
                                                tempThinkDetailsDiv.appendChild(tempThinkContentDiv);
                                                contentDiv.appendChild(tempThinkDetailsDiv);
                                                itemDiv.appendChild(contentDiv);
                                                conversationList.appendChild(itemDiv);
                                                tempThinkDetailsDiv.open = true;
                                            }
                                            tempThinkContentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(currentAccumulatedTextForDOM + "▍") : escapeHtml(currentAccumulatedTextForDOM + "▍");
                                        }
                                        // 偵測到結束標籤，移除游標並摺疊
                                        if (tempThinkContentDiv && tempThinkContentDiv.innerHTML.endsWith("▍")) {
                                            tempThinkContentDiv.innerHTML = tempThinkContentDiv.innerHTML.slice(0, -1);
                                        }
                                        if (tempThinkDetailsDiv) {
                                            tempThinkDetailsDiv.open = false;
                                            const summary = tempThinkDetailsDiv.querySelector('summary');
                                            if (summary) summary.textContent = '顯示/隱藏 AI 思考過程';
                                            
                                            // [新增] 完成思考時，如果已經有主回覆區塊，聚焦到它（僅在跟隨模式下）
                                            if (tempMainResponseDiv && autoFollowScroll) {
                                                scrollToBottom(tempMainResponseDiv.parentElement);
                                            }
                                        }
                                        currentStreamIsThinking = false;
                                        currentAccumulatedTextForDOM = "";
                                        processableTokenStream = processableTokenStream.substring(thinkEndIndex + thinkEndLen);
                                    } else {
                                        currentAccumulatedTextForDOM += processableTokenStream;
                                        if (!tempThinkDetailsDiv) {
                                            const itemDiv = document.createElement('div'); itemDiv.className = 'conversation-item assistant-message thinking-process streaming';
                                            const contentDiv = document.createElement('div'); contentDiv.className = 'conversation-content';
                                            tempThinkDetailsDiv = document.createElement('details');
                                            const summary = document.createElement('summary'); summary.textContent = 'AI 思考中...';
                                            tempThinkDetailsDiv.appendChild(summary);
                                            tempThinkContentDiv = document.createElement('div'); tempThinkContentDiv.className = 'thinking-content-inner';
                                            tempThinkDetailsDiv.appendChild(tempThinkContentDiv);
                                            contentDiv.appendChild(tempThinkDetailsDiv);
                                            itemDiv.appendChild(contentDiv);
                                            conversationList.appendChild(itemDiv);
                                            tempThinkDetailsDiv.open = true;
                                        }
                                        tempThinkContentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(currentAccumulatedTextForDOM + "▍") : escapeHtml(currentAccumulatedTextForDOM + "▍");
                                        processableTokenStream = "";
                                    }
                                }
                            }
                        }
                    } catch (error) {
                    }
                }
            }
            smartFollowScroll(); // MODIFIED: 智慧型跟隨捲動（使用者往上捲時暫停）
        }

        if (currentStreamIsThinking && tempThinkContentDiv && tempThinkContentDiv.innerHTML.endsWith("▍")) {
            tempThinkContentDiv.innerHTML = tempThinkContentDiv.innerHTML.slice(0, -1);
        } else if (!currentStreamIsThinking && tempMainResponseDiv && tempMainResponseDiv.innerHTML.endsWith("▍")) {
            tempMainResponseDiv.innerHTML = tempMainResponseDiv.innerHTML.slice(0, -1);
        }

        let validToolCalls = responseToolCalls.filter(tc => tc !== null && tc !== undefined);

        // NEW: 第二階段反芻抽取（優先路徑）— 見 TWO_PHASE_EXTRACTION_NOTES.md
        let extractorSaidNoTool = false;
        if (validToolCalls.length === 0 && accumulatedResponse && textMentionsAnyTool(accumulatedResponse)) {
            const extracted = await extractToolCallViaModel(config, accumulatedResponse);
            if (extracted) {
                if (extracted.noTool) {
                    // 抽取器明確判定沒有工具呼叫意圖 → 信任它，跳過 regex（避免 regex 假陽性）
                    extractorSaidNoTool = true;
                    console.log("[Extractor] 判定文本中沒有工具呼叫意圖。");
                } else {
                    console.log(`[Extractor] 成功抽取工具呼叫: ${extracted.function.name}`);
                    validToolCalls.push(extracted);
                }
            }
        }

        // [新增] 文字備援解析器 (Text Fallback Parser) — 反芻抽取失敗時的降級路徑
        if (validToolCalls.length === 0 && !extractorSaidNoTool && accumulatedResponse) {
            let extractedToolName = null;
            let extractedArgs = "{}";
            
            // [修正] 為了支援 Gemma 4 (將呼叫意圖寫在思考過程中)，我們不再去除思考標籤，而是直接掃描全文
            let textToAnalyze = accumulatedResponse;

            // 模式 1: Gemma 2 常用引導語 "Therefore, I should call [tool_name]"
            const callPattern1 = /Therefore,\s*I\s*should\s*call\s*`?([a-zA-Z_0-9]+)`?/i;
            const match1 = textToAnalyze.match(callPattern1);
            
            // 模式 2: Markdown JSON 區塊
            const callPattern2 = /```json\s*(\{[\s\S]*?"name"\s*:\s*"([a-zA-Z_0-9]+)"[\s\S]*?\})\s*```/;
            const match2 = textToAnalyze.match(callPattern2);
            
            // 模式 3: 特殊的 Gemma/Llama 呼叫標籤 `<|tool_call>call:func{...}<tool_call|>`
            const callPattern3 = /(?:<\|tool_call>|<tool_call>)\s*call:([a-zA-Z_0-9]+)\{([\s\S]*?)\}/;
            const match3 = textToAnalyze.match(callPattern3);
            
            if (match3 && ToolRegistry[match3[1]]) {
                 extractedToolName = match3[1];
                 extractedArgs = "{" + match3[2] + "}";
            } else if (match2 && ToolRegistry[match2[2]]) {
                 extractedToolName = match2[2];
                 try {
                     const parsedObj = JSON.parse(match2[1]);
                     if (parsedObj.parameters) extractedArgs = JSON.stringify(parsedObj.parameters);
                     else if (parsedObj.arguments) extractedArgs = JSON.stringify(parsedObj.arguments);
                 } catch(e) {}
            } else if (match1 && ToolRegistry[match1[1]]) {
                 extractedToolName = match1[1];
                 // MODIFIED: 改用括號配對抽取，修正巢狀 JSON 被非貪婪 regex 截斷的問題
                 const jsonStr = extractFirstJsonObject(textToAnalyze);
                 if (jsonStr) extractedArgs = jsonStr;
            } else {
                 // 模式 4: 暴力掃描所有註冊工具的名稱是否被直接當作指令提及
                 for (const tName of Object.keys(ToolRegistry)) {
                     const actionRegex = new RegExp(`(?:call|use|execute|run)\\s+(?:the\\s+)?(?:tool\\s+)?(?:function\\s+)?\`?${tName}\`?`, 'i');
                     if (actionRegex.test(textToAnalyze) || new RegExp(`^\\s*${tName}\\s*$`, 'm').test(textToAnalyze)) {
                         extractedToolName = tName;
                         // MODIFIED: 改用括號配對抽取，修正巢狀 JSON 被非貪婪 regex 截斷的問題
                         const jsonStr = extractFirstJsonObject(textToAnalyze);
                         if (jsonStr) extractedArgs = jsonStr;
                         break;
                     }
                 }
            }

            if (extractedToolName) {
                // [修正] 檢查該工具是否需要參數
                const toolSchema = ToolRegistry[extractedToolName].schema.function;
                const requiresArgs = toolSchema.parameters && toolSchema.parameters.required && toolSchema.parameters.required.length > 0;
                
                // 解析擷取到的參數
                let parsedArgs = {};
                try { parsedArgs = JSON.parse(extractedArgs); } catch(e) {}
                const isArgsEmpty = Object.keys(parsedArgs).length === 0;

                // 如果需要參數但我們擷取到的是空物件 (通常代表模型只講了名字沒給 JSON)
                if (requiresArgs && isArgsEmpty) {
                    console.log(`[Fallback Parser] 攔截到工具 ${extractedToolName}，但缺乏必要參數，放棄攔截，交由遞迴提示處理。`);
                } else {
                    console.log(`[Fallback Parser] 成功攔截到模型在文字中嘗試呼叫工具: ${extractedToolName}`);
                    validToolCalls.push({
                        id: "call_" + Math.random().toString(36).substring(2, 9),
                        type: "function",
                        function: {
                            name: extractedToolName,
                            arguments: extractedArgs
                        }
                    });
                }
            }
        }

        if (validToolCalls.length > 0) {
            console.log("[Agent] AI 要求呼叫工具數量:", validToolCalls.length);

            const assistMsg = {
                role: "assistant",
                content: accumulatedResponse || null,
                tool_calls: validToolCalls
            };
            currentMessages.push(assistMsg);

            // [新增] 產生使用者確認 UI
            const confirmationDiv = document.createElement('div');
            confirmationDiv.className = 'conversation-item assistant-message thinking-process';
            confirmationDiv.style.border = "1px solid #ffcc00";
            confirmationDiv.style.borderRadius = "5px";
            confirmationDiv.style.padding = "5px";
            // 讓背景色可以適應淺色/深色，這裡使用透明度較高的黃色
            confirmationDiv.style.backgroundColor = "rgba(255, 204, 0, 0.1)";

            let toolsHtml = "";
            for (const tc of validToolCalls) {
                const tName = tc.function.name;
                let tArgs = {};
                try { tArgs = JSON.parse(tc.function.arguments || "{}"); } catch(e){ /* ignore parse errors, use empty args */ }

                if (ToolRegistry[tName] && ToolRegistry[tName].getDisplayName && ToolRegistry[tName].getUiDescription) {
                    toolsHtml += `<strong>${ToolRegistry[tName].getDisplayName()}</strong><br>`;
                    toolsHtml += `${ToolRegistry[tName].getUiDescription(tArgs)}<br><br>`;
                } else {
                    toolsHtml += `<strong>⚙️ ${tName}</strong><br><code style="background-color: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 3px;">${tc.function.arguments}</code><br><br>`;
                }
            }
            const confSummary = document.createElement('div');
            confSummary.innerHTML = `<strong>⚠️ 代理請求執行以下操作:</strong><br><br>${toolsHtml}請確認是否允許執行？`;
            confSummary.style.padding = "10px";

            const btnContainer = document.createElement('div');
            btnContainer.style.padding = "0 10px 10px 10px";
            btnContainer.style.display = "flex";
            btnContainer.style.flexWrap = "wrap";
            btnContainer.style.gap = "10px";

            const approveBtn = document.createElement('button');
            approveBtn.textContent = '允許執行 (Approve)';
            approveBtn.style.backgroundColor = "#4CAF50";
            approveBtn.style.color = "white";
            approveBtn.style.border = "none";
            approveBtn.style.padding = "6px 12px";
            approveBtn.style.cursor = "pointer";
            approveBtn.style.borderRadius = "4px";

            const stopBtn = document.createElement('button');
            stopBtn.textContent = '到此為止 (Stop & Answer)';
            stopBtn.style.backgroundColor = "#ff9800";
            stopBtn.style.color = "white";
            stopBtn.style.border = "none";
            stopBtn.style.padding = "6px 12px";
            stopBtn.style.cursor = "pointer";
            stopBtn.style.borderRadius = "4px";

            const denyBtn = document.createElement('button');
            denyBtn.textContent = '拒絕執行 (Deny)';
            denyBtn.style.backgroundColor = "#f44336";
            denyBtn.style.color = "white";
            denyBtn.style.border = "none";
            denyBtn.style.padding = "6px 12px";
            denyBtn.style.cursor = "pointer";
            denyBtn.style.borderRadius = "4px";

            btnContainer.appendChild(approveBtn);
            btnContainer.appendChild(stopBtn);
            btnContainer.appendChild(denyBtn);
            confirmationDiv.appendChild(confSummary);
            confirmationDiv.appendChild(btnContainer);
            conversationList.appendChild(confirmationDiv);

            // NEW: 「本次對話都允許」判斷（以工具為單位的 first-use 授權）
            const grantedTools = getGrantedTools(conversationKey);
            const batchToolNames = [...new Set(validToolCalls.map(tc => tc.function.name))];
            const allGranted = batchToolNames.every(name => grantedTools.has(name));
            // 硬上限檢查點：連續自動放行 N 輪後，強制人工確認一次
            const checkpointReached = recursionDepth > 0 && recursionDepth % AUTO_APPROVE_CHECKPOINT_ROUNDS === 0;

            // 需要人工決策時強制聚焦到授權對話框；自動放行則只是紀錄，走智慧跟隨不打擾使用者
            if (allGranted && !checkpointReached) {
                smartFollowScroll();
            } else {
                scrollToBottom(confirmationDiv); // 自動聚焦到授權對話框
            }

            // [新增] 等待使用者決策
            let userDecision = 'approve';
            let autoApprovedByGrant = false; // 本輪是否依授權清單自動放行
            let grantedThisRound = false;    // 本輪使用者是否按下「本次對話都允許」

            if (allGranted && !checkpointReached) {
                console.log("[Agent] 依「本次對話都允許」授權自動放行:", batchToolNames.join(', '));
                autoApprovedByGrant = true;
                confirmationDiv.style.opacity = "0.5";
                approveBtn.disabled = true;
                stopBtn.disabled = true;
                denyBtn.disabled = true;
                approveBtn.textContent = '自動允許 (已授權)';
                userDecision = 'approve';
            } else {
                // 檢查點提示：授權齊全但已連續自動執行多輪，強制回來確認一次
                if (checkpointReached && allGranted) {
                    const checkpointNote = document.createElement('div');
                    checkpointNote.style.padding = "0 10px 8px 10px";
                    checkpointNote.style.fontSize = "0.85em";
                    checkpointNote.style.color = "#ff9800";
                    checkpointNote.textContent = `⚠️ 已連續自動執行 ${AUTO_APPROVE_CHECKPOINT_ROUNDS} 輪，請確認是否繼續。`;
                    confirmationDiv.insertBefore(checkpointNote, btnContainer);
                }

                // NEW: 「本次對話都允許」按鈕（授權本輪出現的工具，本對話後續不再詢問）
                const alwaysBtn = document.createElement('button');
                alwaysBtn.textContent = '本次對話都允許 (Always)';
                alwaysBtn.style.backgroundColor = "#2196F3";
                alwaysBtn.style.color = "white";
                alwaysBtn.style.border = "none";
                alwaysBtn.style.padding = "6px 12px";
                alwaysBtn.style.cursor = "pointer";
                alwaysBtn.style.borderRadius = "4px";
                btnContainer.insertBefore(alwaysBtn, stopBtn);

                userDecision = await new Promise((resolve) => {
                    const lockDialog = () => {
                        confirmationDiv.style.opacity = "0.5";
                        approveBtn.disabled = true;
                        alwaysBtn.disabled = true;
                        stopBtn.disabled = true;
                        denyBtn.disabled = true;
                    };
                    approveBtn.onclick = () => { lockDialog(); resolve('approve'); };
                    alwaysBtn.onclick = () => {
                        // 將本輪出現的工具加入本次對話的授權清單
                        batchToolNames.forEach(name => grantedTools.add(name));
                        grantedThisRound = true;
                        lockDialog();
                        resolve('approve');
                    };
                    stopBtn.onclick = () => { lockDialog(); resolve('stop'); };
                    denyBtn.onclick = () => { lockDialog(); resolve('deny'); };
                });
            }

            // [修正] 決策完成後，將互動對話框置換為動作描述 (包含動作標題)
            if (confirmationDiv) {
                let statusText = '';
                let statusColor = '';
                let borderColor = '';
                
                if (userDecision === 'approve') {
                    statusText = autoApprovedByGrant ? '✅ 已依「本次對話都允許」自動放行'
                        : grantedThisRound ? '✅ 使用者已授權（本次對話此類動作不再詢問）'
                        : '✅ 使用者已授權執行操作';
                    statusColor = 'rgba(76, 175, 80, 0.1)';
                    borderColor = '#4CAF50';
                } else if (userDecision === 'stop') {
                    statusText = '⚠️ 使用者已要求停止執行';
                    statusColor = 'rgba(255, 152, 0, 0.1)';
                    borderColor = '#ff9800';
                } else {
                    statusText = '❌ 使用者已拒絕執行操作';
                    statusColor = 'rgba(244, 67, 54, 0.1)';
                    borderColor = '#f44336';
                }
                
                // 取得所有工具的顯示名稱
                const toolNames = validToolCalls.map(tc => {
                    const tName = tc.function.name;
                    return (ToolRegistry[tName] && ToolRegistry[tName].getDisplayName) 
                        ? ToolRegistry[tName].getDisplayName() 
                        : `⚙️ ${tName}`;
                }).join(', ');

                confirmationDiv.style.backgroundColor = statusColor;
                confirmationDiv.style.border = `1px solid ${borderColor}`;
                confirmationDiv.style.opacity = "1";
                // NEW: 自動放行時保留完整動作紀錄（含執行腳本的程式碼），事後可審
                const autoDetailHtml = autoApprovedByGrant
                    ? `<details style="margin-top: 6px;"><summary style="cursor: pointer; font-size: 0.9em;">動作詳情（完整紀錄）</summary><div style="padding: 6px 0; font-size: 0.9em;">${toolsHtml}</div></details>`
                    : '';
                confirmationDiv.innerHTML = `
                    <div style="padding: 10px; font-size: 0.9em; color: var(--text-color);">
                        <strong>${statusText}</strong><br>
                        <span style="opacity: 0.8; font-size: 0.95em;">動作項目: ${toolNames}</span>
                        ${autoDetailHtml}
                    </div>`;
            }

            if (userDecision === 'approve') {
                for (const toolCall of validToolCalls) {
                    const toolName = toolCall.function.name;
                    const toolArgsString = toolCall.function.arguments || "{}";
                    console.log(`[Agent] 準備執行技能: ${toolName}`, toolArgsString);

                    const stepDiv = document.createElement('div'); stepDiv.className = 'conversation-item assistant-message thinking-process';
                    const stepDetails = document.createElement('details'); stepDetails.open = true;
                    const stepSummary = document.createElement('summary');
                    const displayName = (ToolRegistry[toolName] && ToolRegistry[toolName].getDisplayName)
                        ? ToolRegistry[toolName].getDisplayName()
                        : toolName;
                    stepSummary.textContent = `⚙️ 正在處理步驟: ${displayName}`;
                    stepDetails.appendChild(stepSummary);
                    const stepInner = document.createElement('div'); stepInner.className = 'thinking-content-inner';
                    stepInner.textContent = `參數: ${toolArgsString}`;
                    stepDetails.appendChild(stepInner);
                    stepDiv.appendChild(stepDetails);
                    conversationList.appendChild(stepDiv);
                    smartFollowScroll();

                    let toolArgs = {};
                    try { toolArgs = JSON.parse(toolArgsString); } catch (e) { }

                    let resultString = `工具 ${toolName} 未找到或尚未註冊。`;
                    if (ToolRegistry[toolName]) {
                        try {
                            resultString = await ToolRegistry[toolName].execute(toolArgs);
                        } catch (e) {
                            resultString = `執行錯誤: ${e.message}`;
                        }
                    }

                    stepInner.textContent += `\n\n[執行結果]\n${resultString}`;

                    // NEW: Persistent Action Summary
                    const summaryContent = `**執行工具:** ${displayName}\n**參數:** \`${toolArgsString}\`\n**結果摘要:** ${resultString.substring(0, 200)}${resultString.length > 200 ? '...' : ''}`;
                    const stepSummaryObj = {
                        role: 'assistant',
                        content: summaryContent,
                        isStep: true
                    };
                    await addConversation(conversationKey, stepSummaryObj);
                    
                    // NEW: Dynamically render the summary immediately in the UI
                    renderAndAppendConversationItem(stepSummaryObj, true);

                    currentMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolName,
                        content: resultString
                    });
                }

                console.log("[Agent] 工具執行完畢，停頓 2 秒以避免 API 速率限制 (Rate Limit)，進入下一輪迴圈...");
                // 新增延遲，避免免費 API (如 Groq, Cerebras) 觸發 429 Too Many Requests
                await new Promise(resolve => setTimeout(resolve, 2000));
                return await runAgentStreamLoop(config, currentMessages, conversationKey, recursionDepth + 1);
            } else if (userDecision === 'stop') {
                console.log("[Agent] 使用者要求停止並回答。");
                const stoppedDiv = document.createElement('div');
                stoppedDiv.className = 'conversation-item assistant-message';
                stoppedDiv.innerHTML = '<div class="conversation-content" style="color:#ff9800;"><i>(使用者認為資訊已足夠，終止後續工具執行，正在生成最終回覆...)</i></div>';
                conversationList.appendChild(stoppedDiv);
                smartFollowScroll();

                for (const toolCall of validToolCalls) {
                    currentMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        content: JSON.stringify({ status: "user_stopped", message: "系統提示: 使用者認為目前的資訊已經足夠，或提早中止了此工具的執行。請勿再呼叫任何工具，直接根據你目前已知的上下文來總結並回答使用者的問題。" })
                    });
                }

                await new Promise(resolve => setTimeout(resolve, 2000));
                return await runAgentStreamLoop(config, currentMessages, conversationKey, recursionDepth + 1);
            } else {
                console.log("[Agent] 使用者拒絕執行工具。");
                const declinedDiv = document.createElement('div');
                declinedDiv.className = 'conversation-item assistant-message';
                declinedDiv.innerHTML = '<div class="conversation-content" style="color:#f44336;"><i>(工具執行已被使用者拒絕，正在回報中斷狀態...)</i></div>';
                conversationList.appendChild(declinedDiv);
                smartFollowScroll();

                for (const toolCall of validToolCalls) {
                    currentMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        content: JSON.stringify({ status: "user_aborted", error_code: 403, message: "嚴重警告: 使用者已明確拒絕授權此動作（例如執行JS或其他危險操作）。你絕對不可假設動作已完成，也請勿再嘗試呼叫此工具。請向使用者解釋任務因為權限被拒絕而無法繼續。" })
                    });
                }

                await new Promise(resolve => setTimeout(resolve, 2000));
                return await runAgentStreamLoop(config, currentMessages, conversationKey, recursionDepth + 1);
            }
        } else {
            // [新增] 檢查是否模型「只有思考，沒有回答」，如果是，強迫它繼續
            const thinkRegexGlobal = /(?:<think>|<\|channel>thought\n?|<thought>)([\s\S]*?)(?:<\/think>|<channel\|>|<\/thought>)/g;
            const textWithoutThoughts = accumulatedResponse.replace(thinkRegexGlobal, "").trim();
            // 重置正則表達式的 lastIndex，否則 test() 可能會失敗
            thinkRegexGlobal.lastIndex = 0; 
            const hasThoughts = thinkRegexGlobal.test(accumulatedResponse);

            if (hasThoughts && textWithoutThoughts === "" && recursionDepth < 3) {
                console.log("[Agent] 發現模型僅輸出思考過程而中斷，啟動強制接續遞迴...");
                
                // 關閉目前畫面上的思考摺疊面板
                const allThinkingBlocks = conversationList.querySelectorAll('.thinking-process details[open]');
                allThinkingBlocks.forEach(details => {
                    details.open = false;
                    const summary = details.querySelector('summary');
                    if (summary) summary.textContent = '顯示/隱藏 AI 思考過程';
                });

                // 儲存這回合的思考紀錄
                await parseAndStoreFinalAssistantResponse(accumulatedResponse, conversationKey);
                
                // 把它的思考塞回歷史對話，並發送系統強制指令
                currentMessages.push({
                    role: "assistant",
                    content: accumulatedResponse
                });
                currentMessages.push({
                    role: "user",
                    content: "系統提示: 你剛剛輸出了包含多個步驟的思考過程，但沒有實際呼叫工具。請根據你的思考計畫，**現在立刻執行你的「下一個步驟」**。\n請一次只執行一個步驟。如果你決定呼叫工具，請嚴格且僅輸出 JSON 格式，例如：\n```json\n{\n  \"name\": \"工具名稱\",\n  \"arguments\": {\"參數名\": \"參數值\"}\n}\n```\n請不要再輸出任何 `<thought>` 思考過程，直接給我最終結果或這一步的工具呼叫指令。"
                });

                // 新增一條警告訊息在畫面上
                const warningDiv = document.createElement('div');
                warningDiv.className = 'conversation-item assistant-message';
                warningDiv.innerHTML = '<div class="conversation-content" style="color:#ff9800; font-size:0.9em;"><i>(代理僅完成思考，系統已自動要求其繼續執行後續動作...)</i></div>';
                conversationList.appendChild(warningDiv);
                smartFollowScroll();

                // 停頓 2 秒避免速率限制
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // 清理當前變數狀態以準備進入遞迴
                accumulatedResponse = '';
                streamingDOMs.main = null;
                streamingDOMs.think = null;
                currentStreamIsThinking = false;
                
                return await runAgentStreamLoop(config, currentMessages, conversationKey, recursionDepth + 1);
            }

            console.log("[Agent] 最終對話生成完畢。");

            // [新增] 搜尋並摺疊所有開啟中的思考區塊
            const allThinkingBlocks = conversationList.querySelectorAll('.thinking-process details[open]');
            allThinkingBlocks.forEach(details => {
                details.open = false;
                const summary = details.querySelector('summary');
                if (summary) summary.textContent = '顯示/隱藏 AI 思考過程';
            });

            await parseAndStoreFinalAssistantResponse(accumulatedResponse, conversationKey);
            // loadSelectedConfig(); // REMOVED: 避免回應完後重新載入導致畫面跳回頂部
            
            // 跳轉到最新回覆的起始位置（使用者已手動捲離時不打擾）
            const targetElement = tempThinkDetailsDiv ? tempThinkDetailsDiv.parentElement : (tempMainResponseDiv ? tempMainResponseDiv.parentElement : null);
            if (autoFollowScroll) scrollToBottom(targetElement);
        }

    } catch (error) {
        console.error('API request or streaming failed:', error);
        await addConversation(conversationKey, { role: 'assistant', content: `錯誤: ${error.message}`, isThinking: false });
        loadSelectedConfig();
    } finally {
        setInterfaceLoading(false);
        accumulatedResponse = '';
        streamingDOMs.main = null;
        streamingDOMs.think = null;
        currentStreamIsThinking = false;
    }
}

async function sendMessage() {
    const userInputElement = document.getElementById('userInput');
    const userInputText = userInputElement ? userInputElement.value.trim() : "";
    if (!userInputText) return;

    if (!selectedConfig || !selectedConfig.apiUrl || !selectedConfig.modelId) {
        alert("請先完整設定 API (網址、金鑰、模型)。");
        return;
    }

    const conversationKey = `${selectedConfig.apiUrl}-${selectedConfig.modelId}`;
    const userMessage = { role: 'user', content: userInputText };

    await addConversation(conversationKey, userMessage);
    await updateConversationItem(userMessage);

    if (userInputElement) userInputElement.value = '';

    const conversationsHistory = await getConversations(conversationKey);
    const messagesForAPI = conversationsHistory
        .filter(conv => !conv.isThinking && !conv.isStep) // MODIFIED: Filter out steps
        .map(conv => ({ role: conv.role, content: conv.content }));

    try {
        await runAgentStreamLoop(selectedConfig, messagesForAPI, conversationKey);
    } catch (error) {
        console.error('Error sending message or processing response:', error);
        const errorResponseMessage = { role: 'assistant', content: `錯誤: ${error.message}`, isThinking: false };
        await addConversation(conversationKey, errorResponseMessage);
        loadSelectedConfig();
    }
}
// END NEW FUNCTION

// NEW FUNCTION to parse the final accumulated response and store parts
async function parseAndStoreFinalAssistantResponse(finalFullResponse, conversationKey) {
    const thinkTagRegex = /(?:<think>|<\|channel>thought\n?|<thought>)([\s\S]*?)(?:<\/think>|<channel\|>|<\/thought>)/; // Non-global for iterative splitting
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
        await runAgentStreamLoop(selectedConfig, [{ role: 'user', content: messageContent }], conversationKey);
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
        await runAgentStreamLoop(selectedConfig, [{ role: 'user', content: messageContent }], conversationKey);
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
        document.getElementById('deleteAllConversationsButton'),
        document.getElementById('prevButton'),   // NEW: 回答期間鎖住換頁
        document.getElementById('nextButton')    // NEW: 回答期間鎖住換頁
    ];
    elements.forEach(element => {
        if (element) {
            element.disabled = isLoading;
            element.classList.toggle('loading', isLoading);
        }
    });
    // NEW: 回答期間鎖住對話項目上的刪除鈕（透過 CSS pointer-events）
    document.body.classList.toggle('answer-locked', isLoading);
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

// NEW: Helper to scroll conversation list to bottom or a specific element
function scrollToBottom(element = null) {
    setTimeout(() => {
        if (element) {
            // 如果有指定元素，直接捲動到該元素
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            // 否則捲動到整個頁面的底部
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth'
            });
            document.documentElement.scrollTop = document.documentElement.scrollHeight;
        }
    }, 50);
}


