// content.js
const iconHead = chrome.runtime.getURL("icon.png");
const iconLang = chrome.runtime.getURL("lang.gif");
const iconSummary = chrome.runtime.getURL("summary.gif");

const toolbar = document.createElement('div');
var current_language = navigator.language || navigator.browserLanguage; //for IE

toolbar.id = 'chrome-extension-toolbar';
toolbar.innerHTML = `
  <div class="toolbar-icon">
    <img src="${iconHead}" alt="Icon" style="margin: 3px 12px" />
  </div>
  <div class="toolbar-content">
  
	
    <div id="tool_head"><img draggable="false" src="${iconHead}" alt="Icon" style="margin: 3px 12px" /></div>
    <div id="tool_translate"><button id="translate-btn"><img draggable="false" src="${iconLang}" alt="Icon"  /></button></div>
    <div id="tool_summary"><button id="summary-btn"><img draggable="false" src="${iconSummary}" alt="Icon" /></button></div>
	<div id="tool_handle"><button><img draggable="false" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="/></button></div>
	<div class="close-toolbar-container">
	<div id="close-toolbar"  class="gray-circle">X</div> <!-- Added close button -->
    </div>
  </div>
`;
document.body.appendChild(toolbar);

let isDragging = false;
let startY, startTop;

function sendMsgTranslate(sel_text, llmUrl, modelId) {
	    const textCount = sel_text.length;
		// 匹配中文
		const chineseRegex = /[\u4e00-\u9fa5]/g;
		const chineseCount = sel_text.match(chineseRegex) ? sel_text.match(chineseRegex).length : 0;
	    // 匹配英文、數字和部分標點符號
	    const englishRegex = /[a-zA-Z0-9]/g;
	    const englishCount = sel_text.match(englishRegex) ? sel_text.match(englishRegex).length : 0;
		// 檢查內容英文比例
		const isEn = (englishCount > (textCount/2))?true:((chineseCount > (textCount/2))?false:true);
	
		chrome.runtime.sendMessage( {
			action: 'translate',
			data: sel_text,
			llmUrl: llmUrl,
			modelId: modelId,
			isEn: isEn
		}, () => {
		// 發送消息後的回調
		if (chrome.runtime.lastError) {
			//  console.error('Error sending message to popup:', chrome.runtime.lastError);
		} else {
			//  console.log('Message sent to popup');
		}
		});
}
document.getElementById('translate-btn').addEventListener('click', () => {
	chrome.storage.local.get(['llmUrl', 'modelId'],  function (result) {
		llmUrl = result.llmUrl;
		modelId = result.modelId;
	    const sel_text = window.getSelection().toString();


  if (sel_text === '') {
    // 如果選取文字为空，则读取剪贴簿
    navigator.clipboard.readText()
      .then(clipboardText => {
        // 处理剪贴簿内容
        console.log('剪贴簿内容：', clipboardText);
		sendMsgTranslate(clipboardText, llmUrl, modelId);
        // ... 其他操作
		if (isDocumentFocused()) {
			navigator.clipboard.writeText('');
		}
      })
      .catch(err => {
        console.error('读取剪贴簿失败：', err);
		sendMsgTranslate("", llmUrl, modelId);
      });
  } else {
    // 处理选取文字
    console.log('选取文字：', sel_text);
	sendMsgTranslate(sel_text, llmUrl, modelId);
    // ... 其他操作
  }
		
	});	  
});

function sendMsgSummary(sel_text, llmUrl, modelId) {
			chrome.runtime.sendMessage( {
				action: 'summary',
				data: sel_text,
				llmUrl: llmUrl,
				modelId: modelId
			}, () => {
			// 發送消息後的回調
			if (chrome.runtime.lastError) {
				//  console.error('Error sending message to popup:', chrome.runtime.lastError);
			} else {
				//  console.log('Message sent to popup');
			}
			});
}

document.getElementById('summary-btn').addEventListener('click', () => {
	chrome.storage.local.get(['llmUrl', 'modelId'],  function (result) {
		llmUrl = result.llmUrl;
		modelId = result.modelId;
		
		const sel_text = window.getSelection().toString();		
			
  if (sel_text === '') {
    // 如果選取文字为空，则读取剪贴簿
    navigator.clipboard.readText()
      .then(clipboardText => {
        // 处理剪贴簿内容
        console.log('剪贴簿内容：', clipboardText);
		sendMsgSummary(clipboardText, llmUrl, modelId)
        // ... 其他操作
		if (isDocumentFocused()) {
			navigator.clipboard.writeText('');
		}
      })
      .catch(err => {
        console.error('读取剪贴簿失败：', err);
		sendMsgSummary("", llmUrl, modelId)
      });
  } else {
    // 处理选取文字
    console.log('选取文字：', sel_text);
	sendMsgSummary(sel_text, llmUrl, modelId)
    // ... 其他操作
  }


		
	});
});

// 顕示工具列
toolbar.addEventListener('mouseenter', () => {
  toolbar.classList.add('expanded');
});

// 隱藏工具列
toolbar.addEventListener('mouseleave', () => {
  toolbar.classList.remove('expanded');
});

// 控制工具列的顯示與隱藏
document.addEventListener('mousemove', (e) => {
  if (e.clientX > window.innerWidth - 50 && !isDragging) {
    toolbar.classList.add('visible');
  } else {
    toolbar.classList.remove('visible');
  }
});

// 工具列拖動開始
toolbar.addEventListener('mousedown', (e) => {
  isDragging = true;
  startY = e.clientY;
  startTop = toolbar.getBoundingClientRect().top +　toolbar.getBoundingClientRect().height/2;
  document.body.style.userSelect = 'none';  // 禁止選中文本，防止拖動時選中文字
});

// 工具列拖動中
document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const newTop = startTop + (e.clientY - startY);
    const minTop = 0;
    const maxTop = window.innerHeight - toolbar.offsetHeight;

    // 限制工具列只在頁面上下移動
    if (newTop >= minTop && newTop <= maxTop) {
      toolbar.style.top = `${newTop}px`;
    }
  }
});

// 工具列拖動結束
document.addEventListener('mouseup', () => {
  isDragging = false;
  document.body.style.userSelect = '';  // 恢復文本選擇功能
});

// Function to show the toolbar
function showToolbar() {
  toolbar.style.display = 'block'; // Make the toolbar visible
}


// Add event listener to hide the toolbar
document.getElementById('close-toolbar').addEventListener('click', () => {
  toolbar.style.display = 'none'; // Hide the toolbar
});


