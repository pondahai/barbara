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
    loadConfigs();

    // Listen for messages from content script to reload conversations
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "reloadConversations") {
            loadSelectedConfig();
        } else if (request.action === "summarizeFromContent") {
            summarizeTextFromContent(request.text);
        } else if (request.action === "translateFromContent") {
            translateTextFromContent(request.text);
        }
    });
});

let selectedConfigIndex = 0;
let selectedConfig = null;
let currentConversationItem = null;
let accumulatedResponse = '';

function loadConfigs() {
    chrome.storage.local.get({ configs: [] }, (result) => {
        const configSelect = document.getElementById('configSelect');
        configSelect.innerHTML = '';
        result.configs.forEach((config, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${config.apiUrl} - ${config.modelId}`;
            configSelect.appendChild(option);
        });
        if (configSelect.options.length > 0) {
            chrome.storage.local.get({ selectedConfigIndex: 0 }, (result) => {
                configSelect.selectedIndex = result.selectedConfigIndex;
                loadSelectedConfig();
            });
        }
    });
}

function handleConfigChange(event) {
    const selectedIndex = parseInt(event.target.value, 10);
    chrome.storage.local.set({ selectedConfigIndex: selectedIndex }, () => {
        loadSelectedConfig();
    });
}

function loadSelectedConfig() {
    const configSelect = document.getElementById('configSelect');
    const selectedIndex = configSelect.selectedIndex;
    if (selectedIndex === -1) return;
    selectedConfigIndex = selectedIndex;
    chrome.storage.local.get({ configs: [] }, (result) => {
        selectedConfig = result.configs[selectedIndex];
        loadConversations(selectedConfig);
    });
}

function loadConversations(config) {
    if (!config) return;
    const conversationKey = `${config.apiUrl}-${config.modelId}`;
    chrome.storage.local.get({ conversations: {} }, (result) => {
        const conversations = result.conversations[conversationKey] || [];
        const conversationList = document.getElementById('conversationList');
        conversationList.innerHTML = '';
        conversations.forEach((conversation, index) => {
            const div = document.createElement('div');
            div.className = 'conversation-item';
            div.innerHTML = marked.parse(conversation.content);

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'X';
            deleteButton.onclick = () => confirmDeleteConversation(conversationKey, index);
            div.appendChild(deleteButton);

            conversationList.appendChild(div);
        });
    });
}

async function sendMessage() {
    const userInput = document.getElementById('userInput').value.trim();
    if (!userInput) return;
    if (!selectedConfig) {
        alert("請先設定 API 網址和 API 金鑰");
        return;
    }
    const conversationKey = `${selectedConfig.apiUrl}-${selectedConfig.modelId}`;
    const conversations = await getConversations(conversationKey);
    const messages = conversations.map(conv => ({ role: conv.role, content: conv.content }));
    messages.push({ role: 'user', content: userInput });
    await addConversation(conversationKey, { role: 'user', content: userInput });
    updateConversationItem({ role: 'user', content: userInput });
    try {
        await sendRequestToAPI(selectedConfig, messages);
    } catch (error) {
        console.error('Error sending message:', error);
    }
    document.getElementById('userInput').value = ''; // Clear input field
}

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
            result.conversations[key] = conversations;
            chrome.storage.local.set({ conversations: result.conversations }, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    });
}

async function addConversation(key, message) {
    const conversations = await getConversations(key);
    conversations.push({ role: message.role, content: message.content });
    await setConversations(key, conversations);
}

function updateConversationItem(message) {
    const conversationList = document.getElementById('conversationList');
    const div = document.createElement('div');
    div.className = 'conversation-item';
    div.innerHTML = marked.parse(message.content);

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'X';
    deleteButton.onclick = () => confirmDeleteConversation(`${selectedConfig.apiUrl}-${selectedConfig.modelId}`, getConversationIndex(message));
    div.appendChild(deleteButton);

    conversationList.appendChild(div);
}

function getConversationIndex(message) {
    const conversationKey = `${selectedConfig.apiUrl}-${selectedConfig.modelId}`;
    return new Promise((resolve, reject) => {
        chrome.storage.local.get({ conversations: {} }, (result) => {
            const conversations = result.conversations[conversationKey] || [];
            const index = conversations.findIndex(conv => conv.content === message.content);
            if (index === -1) {
                reject(new Error('Conversation not found'));
            } else {
                resolve(index);
            }
        });
    });
}

function deleteConversation(key, index) {
    getConversations(key).then(async (conversations) => {
        conversations.splice(index, 1);
        await setConversations(key, conversations);
        loadSelectedConfig();
    }).catch(error => {
        console.error('Error deleting conversation:', error);
    });
}

function confirmDeleteConversation(key, index) {
    if (confirm('確定要刪除這則對話嗎？')) {
        deleteConversation(key, index);
    }
}

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
    const message = `請為以下文字提供摘要:\n${text}`;
    await addConversation(conversationKey, { role: 'user', content: message });
    updateConversationItem({ role: 'user', content: message });
    try {
        await sendRequestToAPI(selectedConfig, [{ role: 'user', content: message }]);
    } catch (error) {
        console.error('Error summarizing text:', error);
    }
}

async function translateTextFromContent(text) {
    if (!text) {
        alert("無資料");
        return;
    }
    if (!selectedConfig) {
        alert("請先設定 API 網址和 API 金鑰");
        return;
    }
    const conversationKey = `${selectedConfig.apiUrl}-${selectedConfig.modelId}`;
    const englishRatio = calculateEnglishRatio(text);
    const targetLanguage = englishRatio > 0.5 ? navigator.language : 'en_US';
    const message = `請將以下文字翻譯成 ${targetLanguage}:\n${text}`;
    await addConversation(conversationKey, { role: 'user', content: message });
    updateConversationItem({ role: 'user', content: message });
    try {
        await sendRequestToAPI(selectedConfig, [{ role: 'user', content: message }]);
    } catch (error) {
        console.error('Error translating text:', error);
    }
}

async function summarizeText() {
    const text = await getTextFromSelectionOrClipboard();
    if (!text) {
        alert("無資料");
        return;
    }
    await summarizeTextFromContent(text);
}

async function translateText() {
    const text = await getTextFromSelectionOrClipboard();
    if (!text) {
        alert("無資料");
        return;
    }
    await translateTextFromContent(text);
}

async function getTextFromSelectionOrClipboard() {
    let text = '';
    try {
        text = window.getSelection().toString().trim();
        if (!text) {
            text = await navigator.clipboard.readText().then(clipText => clipText.trim()).catch(() => '');
        }
    } catch (error) {
        console.error('無法讀取選取文字或剪貼簿:', error);
    }
    return text;
}

function calculateEnglishRatio(text) {
    const englishCharRegex = /[a-zA-Z]/g;
    const matches = text.match(englishCharRegex);
    if (!matches) return 0;
    return matches.length / text.length;
}

async function sendRequestToAPI(config, messages) {
    const response = await fetch(`${config.apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.modelId,
            messages: messages,
            stream: true
        })
    });

    if (!response.ok) {
        throw new Error('API request failed: ' + response.statusText);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const conversationKey = `${config.apiUrl}-${selectedConfig.modelId}`;
    accumulatedResponse = '';

    currentConversationItem = document.createElement('div');
    currentConversationItem.className = 'conversation-item';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'conversation-content';

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'X';
    deleteButton.onclick = () => confirmDeleteConversation(conversationKey, -1);

    currentConversationItem.appendChild(contentDiv);
    currentConversationItem.appendChild(deleteButton);

    const conversationList = document.getElementById('conversationList');
    conversationList.appendChild(currentConversationItem);

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulatedResponse += parseAndStreamResponse(chunk);
        contentDiv.innerHTML = marked.parse(accumulatedResponse);
    }

    await addConversation(conversationKey, { role: 'assistant', content: accumulatedResponse });
}

function parseAndStreamResponse(chunk) {
    const lines = chunk.split('\n').filter(line => line.trim() !== '');
    let accumulatedContent = '';
    lines.forEach(line => {
        if (line.startsWith('data: ')) {
            const data = line.substring('data: '.length);
            if (data === '[DONE]') {
                return;
            }
            try {
                const parsedData = JSON.parse(data);
                if (parsedData.choices && parsedData.choices[0] && parsedData.choices[0].delta && parsedData.choices[0].delta.content) {
                    const token = parsedData.choices[0].delta.content;
                    accumulatedContent += token;
                }
            } catch (error) {
                console.error('Error parsing JSON:', error);
            }
        }
    });
    return accumulatedContent;
}