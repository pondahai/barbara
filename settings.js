document.addEventListener('DOMContentLoaded', function() {
    const saveButton = document.getElementById('save');
    const resetButton = document.getElementById('reset');
    const llmUrlInput = document.getElementById('llm-url');

    // 加載現有的 LLM URL 設定，並預設為 localhost
chrome.storage.local.get(['llmUrl'], async function (result) {
	let llmUrl = result.llmUrl || 'localhost';
	 llmUrlInput.value = llmUrl;
      //  llmUrlInput.value = localStorage.getItem('llmUrl') || 'localhost';


    // 保存新的 LLM URL 設定
    saveButton.addEventListener('click', function() {
        const llmUrl = llmUrlInput.value;
		localStorage.setItem('llmUrl', llmUrl);
		 chrome.storage.local.set({llmUrl: llmUrl}, function () {});
            alert('LLM URL 已保存');

    });

    // 重置 LLM URL 設定為 localhost
    resetButton.addEventListener('click', function() {
        llmUrlInput.value = 'localhost';
		localStorage.setItem('llmUrl', 'localhost');
		chrome.storage.local.set({llmUrl: llmUrl}, function () {});
            alert('LLM URL 已重置為 localhost');

    });
});

});