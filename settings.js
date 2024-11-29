document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fetchModelsButton').addEventListener('click', fetchModels);
    document.getElementById('saveConfigButton').addEventListener('click', saveConfig);
    loadConfigsAndCheckStorage();
});

async function loadConfigsAndCheckStorage() {
    loadConfigs();
    checkAndAddStoredConfig('llmUrl1', 'llmUrl1apiKey');
    checkAndAddStoredConfig('llmUrl2', 'llmUrl2apiKey');
    checkAndAddStoredConfig('llmUrl3', 'llmUrl3apiKey');
}

function checkAndAddStoredConfig(urlKey, apiKeyKey) {
    chrome.storage.local.get([urlKey, apiKeyKey, 'configs'], (result) => {
        const apiUrl = result[urlKey];
        const apiKey = result[apiKeyKey];
        const configs = result.configs || [];

        if (apiUrl && apiKey) {
            const existingConfig = configs.find(config => config.apiUrl === apiUrl && config.apiKey === apiKey);
            if (!existingConfig) {
                const newConfig = { apiUrl, apiKey, modelId: '' };
                configs.push(newConfig);
                chrome.storage.local.set({ configs }, () => {
                    loadConfigs();
                });
            }
        }
    });
}

async function fetchModels() {
    const apiUrl = document.getElementById('apiUrl').value;
    const apiKey = document.getElementById('apiKey').value;
    if (!apiUrl || !apiKey) return alert('請填寫 API 網址和金鑰');
    try {
        const response = await fetch(`${apiUrl}/v1/models`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await response.json();
        populateModelSelect(data.data);
    } catch (error) {
        console.error('無法取得模型列表:', error);
        alert('無法取得模型列表，請檢查 API 網址和金鑰');
    }
}

function populateModelSelect(models) {
    const modelSelect = document.getElementById('modelSelect');
    modelSelect.innerHTML = '';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.id;
        modelSelect.appendChild(option);
    });
}

function setSavedModelAsDefault(savedModelId) {
    const modelSelect = document.getElementById('modelSelect');
    const modelOption = Array.from(modelSelect.options).find(option => option.value === savedModelId);
    if (modelOption) {
        modelSelect.value = savedModelId;
    }
}

function saveConfig() {
    const apiUrl = document.getElementById('apiUrl').value;
    const apiKey = document.getElementById('apiKey').value;
    const modelId = document.getElementById('modelSelect').value;
    if (!apiUrl || !apiKey || !modelId) return alert('請填寫所有欄位');
    chrome.storage.local.get({ configs: [] }, (result) => {
        const newConfig = { apiUrl, apiKey, modelId };
        result.configs.push(newConfig);
        chrome.storage.local.set({ configs: result.configs }, () => {
            loadConfigs();
        });
    });
}

function loadConfigs() {
    chrome.storage.local.get({ configs: [] }, (result) => {
        const configList = document.getElementById('configList');
        configList.innerHTML = '';
        result.configs.forEach((config, index) => {
            const div = document.createElement('div');
            div.className = 'config-item';
            div.textContent = `${config.apiUrl} - ${config.modelId}`;
            div.dataset.index = index;
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'X';
            deleteButton.onclick = () => deleteConfig(index);
            div.appendChild(deleteButton);
            configList.appendChild(div);
        });
    });
}

function deleteConfig(index) {
    chrome.storage.local.get({ configs: [] }, (result) => {
        result.configs.splice(index, 1);
        chrome.storage.local.set({ configs: result.configs }, () => {
            loadConfigs();
        });
    });
}

document.getElementById('configList').addEventListener('click', (event) => {
    if (event.target.tagName === 'DIV') {
        const index = event.target.dataset.index;
        chrome.storage.local.get({ configs: [] }, (result) => {
            const selectedConfig = result.configs[index];
            document.getElementById('apiUrl').value = selectedConfig.apiUrl;
            document.getElementById('apiKey').value = selectedConfig.apiKey;
            document.getElementById('modelSelect').value = selectedConfig.modelId;
            fetchModels().then(() => {
                setSavedModelAsDefault(selectedConfig.modelId);
            });
        });
    }
});