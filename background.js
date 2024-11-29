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
    if (info.menuItemId === "summarizeContext") {
        chrome.tabs.sendMessage(tab.id, { action: "summarizeFromContextMenu", text: info.selectionText });
    } else if (info.menuItemId === "translateContext") {
        chrome.tabs.sendMessage(tab.id, { action: "translateFromContextMenu", text: info.selectionText });
    }
});