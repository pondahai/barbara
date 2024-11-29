chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "summarizeFromContextMenu") {
        chrome.runtime.sendMessage({ action: "summarizeFromContent", text: request.text });
    } else if (request.action === "translateFromContextMenu") {
        chrome.runtime.sendMessage({ action: "translateFromContent", text: request.text });
    }
});