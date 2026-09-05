// 右鍵選單項目定義。註冊是持久化的（存在 profile，不在 service worker 記憶體裡），
// 所以新增項目時必須先 removeAll 再重建，否則舊的註冊會一直留著、新項目不會出現。
const CONTEXT_MENU_ITEMS = [
    { id: "summarizeContext", title: "摘要" },
    { id: "translateContext", title: "翻譯" },
    { id: "factCheckContext", title: "真的假的" },
    { id: "soWhatContext", title: "所以呢？" }
];

function registerContextMenus() {
    chrome.contextMenus.removeAll(() => {
        CONTEXT_MENU_ITEMS.forEach(item => {
            chrome.contextMenus.create({
                id: item.id,
                title: item.title,
                contexts: ["selection"]
            });
        });
        if (chrome.runtime.lastError) {
            console.error("[contextMenus] 註冊失敗:", chrome.runtime.lastError);
        } else {
            console.log("[contextMenus] 已註冊", CONTEXT_MENU_ITEMS.length, "個選單項目");
        }
    });
}

// onInstalled 只在安裝／更新時觸發，「載入未封裝」重載時不保證會跑；
// onStartup 補瀏覽器重啟；最後在 service worker 每次啟動時也跑一次，確保選單一定在。
chrome.runtime.onInstalled.addListener(registerContextMenus);
chrome.runtime.onStartup.addListener(registerContextMenus);
registerContextMenus();

// 右鍵選單項目 -> 側邊欄動作對照表
const CONTEXT_MENU_ACTIONS = {
    summarizeContext: "summarizeFromContent",
    translateContext: "translateFromContent",
    factCheckContext: "factCheckFromContent",
    soWhatContext: "soWhatFromContent"
};

chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.storage.local.get(['currentTabId'], (result) => {
        const prevTabId = result.currentTabId || null;
        if (prevTabId !== activeInfo.tabId) {
            chrome.storage.local.set({
                previousTabId: prevTabId,
                currentTabId: activeInfo.tabId
            });
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPreviousTabId") {
        chrome.storage.local.get(['previousTabId'], (result) => {
            sendResponse({ previousTabId: result.previousTabId });
        });
        return true; // Keeps the message channel open for async response
    }
});

let lastContextMenuClickTime = 0;

chrome.contextMenus.onClicked.addListener((info, tab) => {
    const now = Date.now();
    // 1-second debounce to prevent double-clicks or duplicate browser events
    if (now - lastContextMenuClickTime < 1000) {
        console.warn("[contextMenus] Debouncing context menu action to prevent duplicates.");
        return;
    }
    lastContextMenuClickTime = now;

    let text = info.selectionText;

    if (!text || text.trim() === "") {
        try {
            // Attempt to copy the current selection to clipboard
            document.oncopy = function (event) {
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
    console.log("[processText] Triggered with text:", text);
    let windowId = tab ? tab.windowId : null;
    let tabId = tab ? tab.id : null;
    console.log("[processText] Initial windowId:", windowId, "tabId:", tabId);

    if (windowId !== null) {
        console.log("[processText] Proceeding with current windowId:", windowId);
        openSidePanelAndSendMessage(info, windowId, tabId, text);
    } else {
        console.log("[processText] windowId is null, querying active tab...");
        // Fallback to the currently active tab in the current window
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                windowId = tabs[0].windowId;
                tabId = tabs[0].id;
                console.log("[processText] Found active tab - windowId:", windowId, "tabId:", tabId);
                openSidePanelAndSendMessage(info, windowId, tabId, text);
            } else {
                console.error("[processText] No active tab found during fallback query.");
            }
        });
    }
}

function openSidePanelAndSendMessage(info, targetWindowId, targetTabId, text) {
    console.log("[openSidePanel] Checking windowType for targetWindowId:", targetWindowId);
    const action = CONTEXT_MENU_ACTIONS[info.menuItemId] || "translateFromContent";

    // 1. Verify if the target window is actually a "normal" browser window.
    // PWAs are usually type "app" or "popup", and sidePanel.open silently "succeeds"
    // but doesn't actually show anything.
    chrome.windows.get(targetWindowId, (win) => {
        if (chrome.runtime.lastError) {
            console.error("[openSidePanel] Error getting window:", chrome.runtime.lastError);
            return fallbackToOtherWindowOrPopup(action, text);
        }

        console.log("[openSidePanel] Window type is:", win.type);
        if (win.type === 'normal') {
            // It's a normal window, safe to open side panel
            chrome.sidePanel.open({ windowId: targetWindowId })
                .then(() => {
                    console.log("[openSidePanel] Successfully opened sidePanel in targetWindowId:", targetWindowId);
                    const mappedAction = action;

                    setTimeout(() => {
                        console.log("[openSidePanel] Broadcasting message to side panel. Action:", mappedAction);
                        // Send globally so the side panel receives it
                        chrome.runtime.sendMessage({ action: mappedAction, text: text })
                            .catch(e => console.warn("[openSidePanel] Send message error (may mean no sidepanel listener ready):", e));
                    }, 500);
                })
                .catch((error) => {
                    console.warn("[openSidePanel] sidePanel.open failed in normal window. Error:", error);
                    fallbackToOtherWindowOrPopup(action, text);
                });
        } else {
            // It's a PWA or popup window. sidePanel won't work here. Trigger fallback immediately.
            console.warn("[openSidePanel] Target window is not 'normal' (it is '" + win.type + "'). Triggering fallback.");
            fallbackToOtherWindowOrPopup(action, text);
        }
    });
}

let fallbackPopupWindowId = null;

chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === fallbackPopupWindowId) {
        console.log("[fallback] Popup window closed, clearing reference.");
        fallbackPopupWindowId = null;
    }
});

function fallbackToOtherWindowOrPopup(action, text) {
    console.warn("[fallback] PWA context menu clicked. Bypassing other windows due to user gesture limits. Opening popup.");

    const mappedAction = action;

    if (fallbackPopupWindowId !== null) {
        // Check if the window is still actually open
        chrome.windows.get(fallbackPopupWindowId, { populate: true }, (win) => {
            if (chrome.runtime.lastError || !win) {
                console.log("[fallback] Stored popup window no longer exists. Creating new one.");
                fallbackPopupWindowId = null;
                createPopupAndSendMessage(mappedAction, text);
            } else {
                console.log("[fallback] Popup window already exists. Focusing and sending message.");
                chrome.windows.update(fallbackPopupWindowId, { focused: true });

                // Find the active tab in the popup to send the message
                if (win.tabs && win.tabs.length > 0) {
                    const existingTabId = win.tabs[0].id;
                    chrome.tabs.sendMessage(existingTabId, {
                        action: mappedAction,
                        text: text,
                        bypassFocusCheck: true
                    }).catch(e => {
                        console.error("[fallback] Send message error to existing popup:", e);
                        // If we can't connect, the window might be dead or crashed.
                        fallbackPopupWindowId = null;
                    });
                }
            }
        });
    } else {
        createPopupAndSendMessage(mappedAction, text);
    }
}

function createPopupAndSendMessage(mappedAction, text) {
    // Ultimate Fallback: Open a dedicated popup window
    chrome.windows.create({
        url: chrome.runtime.getURL("sidepanel.html"),
        type: "popup",
        width: 400,
        height: 600
    }, (newWindow) => {
        console.log("[fallback] Popup window created:", newWindow.id);
        fallbackPopupWindowId = newWindow.id;
        const newTabId = newWindow.tabs[0].id;

        let messageSent = false;

        // Wait for the popup's tab to fully load before sending the message
        // This avoids the "Receiving end does not exist" console spam.
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === newTabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener); // Clean up listener
                if (!messageSent) {
                    messageSent = true;
                    // Slight delay to ensure DOMContentLoaded inside the popup has fired
                    setTimeout(() => {
                        console.log(`[fallback] Popup tab loaded. Sending message. Action: ${mappedAction}`);
                        chrome.tabs.sendMessage(newTabId, {
                            action: mappedAction,
                            text: text,
                            bypassFocusCheck: true
                        }).catch(e => console.error("[fallback] Final send message error:", e));
                    }, 200);
                }
            }
        });

        // Fallback safety timeout just in case onUpdated doesn't fire as expected
        setTimeout(() => {
            if (!messageSent) {
                // Not strictly possible to remove anonymous fallback here easily, but the boolean protects it
                console.log(`[fallback] Safety timeout reached, attempting send anyway.`);
                chrome.tabs.sendMessage(newTabId, {
                    action: mappedAction,
                    text: text,
                    bypassFocusCheck: true
                }).catch(() => { }); // Suppress error here to avoid console spam
            }
        }, 3000);
    });
}