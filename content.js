chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "summarizeFromContextMenu") {
        chrome.runtime.sendMessage({ action: "summarizeFromContent", text: request.text });
    } else if (request.action === "translateFromContextMenu") {
        chrome.runtime.sendMessage({ action: "translateFromContent", text: request.text });
    } else if (request.action === "getPageContent") {
        const pageTitle = document.title;

        // 樹狀萃取網頁的主要文字內容
        function extractText(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                return text ? text + ' ' : '';
            }
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return '';
            }

            const tag = node.tagName.toLowerCase();
            const id = (node.id || '').toLowerCase();
            const className = (typeof node.className === 'string' ? node.className : '').toLowerCase();

            // 跳過不重要的標籤
            const ignoreTags = ['script', 'style', 'noscript', 'nav', 'footer', 'aside', 'header', 'svg', 'canvas', 'video', 'audio', 'iframe'];
            if (ignoreTags.includes(tag)) {
                return '';
            }

            // 透過 class/id 進行簡單過濾，跳過選單、廣告、側邊欄、留言區
            const ignoreKeywords = ['menu', 'nav', 'sidebar', 'footer', 'header', 'advert', 'promo', 'comment', 'widget', 'cookie'];
            for (let kw of ignoreKeywords) {
                if (id.includes(kw) || className.includes(kw)) {
                    return '';
                }
            }

            // 特殊排版處理：區塊級元素前後加換行
            const blockTags = ['p', 'div', 'section', 'article', 'main', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'br', 'hr', 'ul', 'ol'];
            const isBlock = blockTags.includes(tag);

            let result = '';

            // 為了保留結構與語義，加入簡單的 Markdown 前綴
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
                const level = parseInt(tag.charAt(1));
                result += '\n' + '#'.repeat(level) + ' ';
            } else if (tag === 'li') {
                result += '\n- ';
            } else if (isBlock && tag !== 'br' && tag !== 'hr') {
                result += '\n';
            }

            for (let child of node.childNodes) {
                result += extractText(child);
            }

            if (isBlock) {
                result += '\n';
            }

            return result;
        }

        // 優先尋找 <article> 或 <main> 作為起點，若沒找到就降級拿 <body>
        let rootNode = document.querySelector('article') || document.querySelector('main') || document.body;

        // 如果 rootNode 裡的文字太少（比如有的網站 <main> 反而沒包住內文），退回 <body>
        if (rootNode !== document.body && rootNode.innerText && rootNode.innerText.length < 500) {
            rootNode = document.body;
        }

        let pageText = extractText(rootNode);

        // 清理多餘的空白與過多換行
        pageText = pageText.replace(/\n\s*\n/g, '\n\n').replace(/ {2,}/g, ' ').trim();

        // 避免抽出空白 (例如完全被規則擋掉)，提供 fallback
        if (!pageText || pageText.length < 50) {
            pageText = document.body.innerText;
        }

        sendResponse({
            title: pageTitle,
            content: pageText
        });
    } else if (request.action === "getYoutubeTranscript") {
        try {
            // 從所有 script 標籤中尋找 ytInitialPlayerResponse
            let captionsJson = null;
            const scripts = document.getElementsByTagName('script');
            for (let script of scripts) {
                if (script.textContent.includes('var ytInitialPlayerResponse = ')) {
                    const match = script.textContent.match(/var ytInitialPlayerResponse = ({.+?});/);
                    if (match && match[1]) {
                        try {
                            const fullResponse = JSON.parse(match[1]);
                            captionsJson = fullResponse.captions;
                            break;
                        } catch (e) { }
                    }
                }
            }

            if (!captionsJson || !captionsJson.playerCaptionsTracklistRenderer || !captionsJson.playerCaptlistRenderer.captionTracks) {
                sendResponse({ error: "影片沒有啟用的字幕軌道 (Caption Tracks) 或非 YouTube 影片頁面。" });
                return true;
            }

            const tracks = captionsJson.playerCaptionsTracklistRenderer.captionTracks;

            // 挑選語言 (優先嘗試繁體中文 -> 瀏覽器語言 -> 第一個可用語言)
            const browserLang = navigator.language.split('-')[0];
            let targetTrack = tracks.find(t => t.languageCode === 'zh-TW') ||
                tracks.find(t => t.languageCode && t.languageCode.startsWith(browserLang)) ||
                tracks[0];

            // 下載 XML 並解析
            fetch(targetTrack.baseUrl)
                .then(resp => resp.text())
                .then(text => {
                    const textRegex = /<text[^>]*>(.*?)<\/text>/gi;
                    let textMatch;
                    let transcript = '';
                    while ((textMatch = textRegex.exec(text)) !== null) {
                        let decodedText = textMatch[1]
                            .replace(/&amp;/g, '&')
                            .replace(/&#39;/g, "'")
                            .replace(/&quot;/g, '"')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>');
                        transcript += decodedText + ' ';
                    }
                    sendResponse({ transcript: transcript, language: targetTrack.languageCode });
                })
                .catch(e => {
                    sendResponse({ error: "下載或解析字幕 XML 失敗: " + e.message });
                });

        } catch (e) {
            sendResponse({ error: "擷取 YouTube 資料發生崩潰: " + e.message });
        }
    }
    return true; // Keep channel open for asynchronous sendResponse
});