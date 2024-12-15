chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "summarizeContext",
        title: "摘要",
        contexts: ["selection"]
    });

    chrome.contextMenus.create({
        id: "translateContext",
        title: "翻譯",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    let text = info.selectionText;

    if (!text || text.trim() === "") {
        try {
            // Attempt to copy the current selection to clipboard
            document.oncopy = function(event) {
                event.clipboardData.setData('text/plain', window.getSelection().toString());
                event.preventDefault();
            };
            document.execCommand('copy');
            document.oncopy = null;

            // Read the clipboard content
            navigator.clipboard.readText()
                .then(clippedText => {
                    text = clippedText;
                    processText(info, tab, text);
                })
                .catch(error => {
                    console.error("Failed to copy or read clipboard content:", error);
                    processText(info, tab, text);
                });
        } catch (error) {
            console.error("Failed to copy or read clipboard content:", error);
            processText(info, tab, text);
        }
    } else {
        processText(info, tab, text);
    }
});

function processText(info, tab, text) {
    let windowId;
    let tabId;

    if (tab && tab.id !== -1) {
        windowId = tab.windowId;
        tabId = tab.id;
    } else {
        // Fallback to the currently active tab in the current window
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                windowId = tabs[0].windowId;
                tabId = tabs[0].id;
                openSidePanelAndSendMessage(info, windowId, tabId, text);
            } else {
                console.error("No active tab found.");
            }
        });
        return;
    }

    openSidePanelAndSendMessage(info, windowId, tabId, text);
}

function openSidePanelAndSendMessage(info, windowId, tabId, text) {
    chrome.sidePanel.open({ windowId: windowId })
        .then(() => {
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { action: info.menuItemId === "summarizeContext" ? "summarizeFromContextMenu" : "translateFromContextMenu", text: text });
            }, 500);
        })
        .catch((error) => console.error("Failed to open side panel or send message:", error));
}