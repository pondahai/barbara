// 右鍵選單項目定義。註冊是持久化的（存在 profile，不在 service worker 記憶體裡），
// 所以新增項目時必須先 removeAll 再重建，否則舊的註冊會一直留著、新項目不會出現。
const CONTEXT_MENU_ITEMS = [
    { id: "summarizeContext", title: "摘要" },
    { id: "translateContext", title: "翻譯" },
    // 這兩項文字、圖片都吃：對圖片使用時會先做一次 OCR 再走原本的流程
    { id: "factCheckContext", title: "真的假的", contexts: ["selection", "image"] },
    { id: "soWhatContext", title: "所以呢？", contexts: ["selection", "image"] },
    // 圖片類選單：contexts 是 "image"，右鍵點圖片才會出現，info.srcUrl 帶圖片網址
    { id: "ocrImageContext", title: "讀取圖片文字", contexts: ["image"] },
    { id: "translateImageContext", title: "翻譯圖片", contexts: ["image"] }
];

// 這些選單只走圖片路徑（用 info.srcUrl），不需要選取文字，也不要去讀剪貼簿
const IMAGE_MENU_IDS = new Set(["ocrImageContext", "translateImageContext"]);

// 判斷這次點擊該不該走圖片路徑：純圖片選單一定是；文字/圖片兼用的選單則看
// 使用者是不是在「沒有選取文字的情況下」對圖片按右鍵。有選文字就以文字優先。
function shouldUseImagePath(info) {
    if (IMAGE_MENU_IDS.has(info.menuItemId)) return true;
    const hasSelection = info.selectionText && info.selectionText.trim() !== "";
    return !!info.srcUrl && !hasSelection;
}

function registerContextMenus() {
    chrome.contextMenus.removeAll(() => {
        CONTEXT_MENU_ITEMS.forEach(item => {
            chrome.contextMenus.create({
                id: item.id,
                title: item.title,
                contexts: item.contexts || ["selection"]
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
    soWhatContext: "soWhatFromContent",
    ocrImageContext: "ocrImageFromContent",
    translateImageContext: "translateImageFromContent"
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

    // 圖片路徑不依賴選取文字，直接把 srcUrl 送出去
    if (shouldUseImagePath(info)) {
        processPayload(info, tab, { text: "", imageUrl: info.srcUrl || "" });
        return;
    }

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
                    processPayload(info, tab, { text: text, imageUrl: "" });
                })
                .catch(error => {
                    console.error("Failed to copy or read clipboard content:", error);
                    processPayload(info, tab, { text: text, imageUrl: "" });
                });
        } catch (error) {
            console.error("Failed to copy or read clipboard content:", error);
            processPayload(info, tab, { text: text, imageUrl: "" });
        }
    } else {
        processPayload(info, tab, { text: text, imageUrl: "" });
    }
});

function processPayload(info, tab, payload) {
    console.log("[processPayload] Triggered with payload:", payload);
    let windowId = tab ? tab.windowId : null;
    let tabId = tab ? tab.id : null;
    console.log("[processPayload] Initial windowId:", windowId, "tabId:", tabId);

    if (windowId !== null) {
        console.log("[processPayload] Proceeding with current windowId:", windowId);
        openSidePanelAndSendMessage(info, windowId, tabId, payload);
    } else {
        console.log("[processPayload] windowId is null, querying active tab...");
        // Fallback to the currently active tab in the current window
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                windowId = tabs[0].windowId;
                tabId = tabs[0].id;
                console.log("[processPayload] Found active tab - windowId:", windowId, "tabId:", tabId);
                openSidePanelAndSendMessage(info, windowId, tabId, payload);
            } else {
                console.error("[processPayload] No active tab found during fallback query.");
            }
        });
    }
}

function openSidePanelAndSendMessage(info, targetWindowId, targetTabId, payload) {
    console.log("[openSidePanel] Checking windowType for targetWindowId:", targetWindowId);
    const action = CONTEXT_MENU_ACTIONS[info.menuItemId] || "translateFromContent";

    // 1. Verify if the target window is actually a "normal" browser window.
    // PWAs are usually type "app" or "popup", and sidePanel.open silently "succeeds"
    // but doesn't actually show anything.
    chrome.windows.get(targetWindowId, (win) => {
        if (chrome.runtime.lastError) {
            console.error("[openSidePanel] Error getting window:", chrome.runtime.lastError);
            return fallbackToOtherWindowOrPopup(action, payload);
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
                        chrome.runtime.sendMessage({ action: mappedAction, text: payload.text, imageUrl: payload.imageUrl })
                            .catch(e => console.warn("[openSidePanel] Send message error (may mean no sidepanel listener ready):", e));
                    }, 500);
                })
                .catch((error) => {
                    console.warn("[openSidePanel] sidePanel.open failed in normal window. Error:", error);
                    fallbackToOtherWindowOrPopup(action, payload);
                });
        } else {
            // It's a PWA or popup window. sidePanel won't work here. Trigger fallback immediately.
            console.warn("[openSidePanel] Target window is not 'normal' (it is '" + win.type + "'). Triggering fallback.");
            fallbackToOtherWindowOrPopup(action, payload);
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

function fallbackToOtherWindowOrPopup(action, payload) {
    console.warn("[fallback] PWA context menu clicked. Bypassing other windows due to user gesture limits. Opening popup.");

    const mappedAction = action;

    if (fallbackPopupWindowId !== null) {
        // Check if the window is still actually open
        chrome.windows.get(fallbackPopupWindowId, { populate: true }, (win) => {
            if (chrome.runtime.lastError || !win) {
                console.log("[fallback] Stored popup window no longer exists. Creating new one.");
                fallbackPopupWindowId = null;
                createPopupAndSendMessage(mappedAction, payload);
            } else {
                console.log("[fallback] Popup window already exists. Focusing and sending message.");
                chrome.windows.update(fallbackPopupWindowId, { focused: true });

                // Find the active tab in the popup to send the message
                if (win.tabs && win.tabs.length > 0) {
                    const existingTabId = win.tabs[0].id;
                    chrome.tabs.sendMessage(existingTabId, {
                        action: mappedAction,
                        text: payload.text,
                        imageUrl: payload.imageUrl,
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
        createPopupAndSendMessage(mappedAction, payload);
    }
}

function createPopupAndSendMessage(mappedAction, payload) {
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
                            text: payload.text,
                            imageUrl: payload.imageUrl,
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
                    text: payload.text,
                    imageUrl: payload.imageUrl,
                    bypassFocusCheck: true
                }).catch(() => { }); // Suppress error here to avoid console spam
            }
        }, 3000);
    });
}