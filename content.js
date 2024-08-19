

console.log("content.js");

let shadow = null;
let llmUrl = 'localhost';

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
 // console.log("content.js Message listened"+request);
  if (request.action === "getSelectedText") {


    let selectedText = window.getSelection().toString();
    sendResponse({selectedText: selectedText});
	

  }

  if (request.type === "showPopup") {

    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length > 0) {
      // 獲取選取的文字範圍和位置
      const range = window.getSelection().getRangeAt(0);
      const rect = range.getBoundingClientRect();
	  console.log("rect.bottom:"+rect.bottom);
	  console.log("rect.right:"+rect.right);
      // 作為確認
   //   const existingPopup = shadow;//document.getElementById('my-shadow-container');
//	console.log(existingPopup);
//	if(existingPopup){console.log('existingPopup:'+existingPopup.querySelector('.popup'))};
  //    const popup = existingPopup.querySelector('.popup') || document.createElement('div');
	  
	  
      // 確保只有一個小視窗存在
      //const existingPopup = document.getElementById('popup');
      //if (existingPopup) {
      //  popup = existingPopup;
       // document.body.removeChild(existingPopup);
      //} else {
      //  popup = document.createElement('div');
      //}
	  
	  
console.log("小視窗");


      if(shadow == null) {

    // 創建容器元素
    const container = document.createElement('div');
    container.id = 'my-shadow-container';
    // 將容器元素附加到 body
    document.body.appendChild(container);
    // 附加 Shadow DOM
	shadow = container.attachShadow({ mode: 'open' });	
	
      // 創建小視窗
      const popup = document.createElement('div');
	  
      popup.id = 'popup';
      popup.style.position = 'absolute';
	  popup.classList.add('popup'); // 使用CSS樣式類別
		// 將小視窗添加到 Shadow DOM
		shadow.appendChild(popup);
	  
      //popup.style.border = '1px solid #ccc';
      //popup.style.background = '#fff';
      //popup.style.padding = '10px';
      //popup.style.zIndex = 1000;
	  //popup.style.maxWidth  = '50vw';
	//	const h2Element = popup.querySelector('h2');
	//	if (h2Element) {
	//	  h2Element.style.fontSize = '20px'; // 設定文字大小為20px
	//	}

	
    // 添加樣式和內容到 Shadow DOM
    const style = document.createElement('style');
    style.textContent = `
    .popup {

	  font-size: 12px;
      line-height: 1.2; /* 調整行距，數值越小行距越緊密 */
      border-radius: 12px;
      background-color: rgba(255, 255, 255, 0.8); /* 半透明背景 */
      backdrop-filter: blur(10px); /* 背景模糊效果 */
	  
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
      padding: 20px;
      max-width: 30vw;
      width: 100%;
      z-index: 9999;
	  border: 1px solid black; /* 增加外框以更容易調試 */
    }

/* 只影響 .popup 類別內的元素 */
.popup h2 {
  color: #007bff;
  font-size: 12px;
  margin: 0;
  padding-bottom: 10px;
  border-bottom: 2px solid #007bff;
  font-weight: bold;
}

.popup #translationResult, .popup #summaryResult, .popup #chatResult {
  background-color: #e9f5ff;
  border: 1px solid #cce5ff;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
}

.popup textarea {
  width: 100%;
  height: 120px;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 15px;
  box-sizing: border-box;
  font-size: 12px;
}

.popup button {
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 20px;
  cursor: pointer;
  font-size: 12px;
  margin-right: 10px;
  transition: background-color 0.3s ease, transform 0.2s ease;
}

.popup button:hover {
  background-color: #218838;
  transform: scale(1.05);
}

.popup #closeBtn {
  background-color: #dc3545;
}

.popup #closeBtn:hover {
  background-color: #c82333;
}



        * {
            margin: 0;
        }
        .popup  {
            background: linear-gradient(to right, #7BC6CC, #BE93C5);
        }
        .popup h1 {
            color: white;
            font-family: 'Oswald', sans-serif;
            padding-right: 1em;
        }
        .popup h1 div {
            display: inline-block;
            text-shadow: 2px 2px 3px #3D6366;
        }
		.aiTextBox {
            color: black;
		}
		.humanText {
            color: black;
		}
        .animate div {
            animation-duration: 3s;
            animation-iteration-count: infinite;
            animation-timing-function: ease-in-out;
        }
        @keyframes example-1 { 0% { transform: translateY(0); } 50% { transform: translateY(9px); opacity: 0.0625; } }
        @keyframes example-2 { 0% { transform: translateY(0); } 50% { transform: translateY(10px); opacity: 0.125; } }
        @keyframes example-3 { 0% { transform: translateY(0); } 50% { transform: translateY(11px); opacity: 0.1875; } }
        @keyframes example-4 { 0% { transform: translateY(0); } 50% { transform: translateY(12px); opacity: 0.25; } }
        @keyframes example-5 { 0% { transform: translateY(0); } 50% { transform: translateY(13px); opacity: 0.3125; } }
        @keyframes example-6 { 0% { transform: translateY(0); } 50% { transform: translateY(14px); opacity: 0.375; } }
        @keyframes example-7 { 0% { transform: translateY(0); } 50% { transform: translateY(15px); opacity: 0.4375; } }
        @keyframes example-8 { 0% { transform: translateY(0); } 50% { transform: translateY(16px); opacity: 0.5; } }
        @keyframes example-9 { 0% { transform: translateY(0); } 50% { transform: translateY(17px); opacity: 0.5625; } }
        @keyframes example-10 { 0% { transform: translateY(0); } 50% { transform: translateY(18px); opacity: 0.625; } }
        @keyframes example-11 { 0% { transform: translateY(0); } 50% { transform: translateY(19px); opacity: 0.6875; } }
        .animate div:nth-child(1) { animation-name: example-1; animation-delay: 0.2s; }
        .animate div:nth-child(2) { animation-name: example-2; animation-delay: 0.4s; }
        .animate div:nth-child(3) { animation-name: example-3; animation-delay: 0.6s; }
        .animate div:nth-child(4) { animation-name: example-4; animation-delay: 0.8s; }
        .animate div:nth-child(5) { animation-name: example-5; animation-delay: 1s; }
        .animate div:nth-child(6) { animation-name: example-6; animation-delay: 1.2s; }
        .animate div:nth-child(7) { animation-name: example-7; animation-delay: 1.4s; }
        .animate div:nth-child(8) { animation-name: example-8; animation-delay: 1.6s; }
        .animate div:nth-child(9) { animation-name: example-9; animation-delay: 1.8s; }
        .animate div:nth-child(10) { animation-name: example-10; animation-delay: 2s; }
        .animate div:nth-child(11) { animation-name: example-11; animation-delay: 2.2s; }
        .popup button {
            margin-top: 20px;
            padding: 10px 20px;
            font-size: 16px;
            cursor: pointer;
        }
	
	
	`
	
	shadow.appendChild(style);
	
    // 插入小視窗的內容
    const content = document.createElement('div');
    content.classList.add('popup-content');
    content.innerHTML = `


    <h1 id="animatedText"><div>B</div><div>a</div><div>r</div><div>b</div><div>a</div><div>r</div><div>a</div></h1>
    <div class="loader" id="circle" hidden></div>
    <h2>Translation</h2>
    <div class="aiTextBox" id="translationResult"></div>

    <h2>Summary</h2>
    <div class="aiTextBox" id="summaryResult"></div>

    <h2>Chat</h2>
	<div class="aiTextBox" id="oldChatResult"></div>
    <div class="aiTextBox" id="chatResult"></div>

    <textarea id="humanText"></textarea><br>
    <button id="chatBtn">聊天</button>
    <button id="closeBtn">關閉</button>

      `;
	 popup.appendChild(content);
	 
    // 將小視窗內容添加到 popup 中
   // const popupContent = shadow.querySelector('.popup-content');
   // popup.appendChild(popupContent);

      // 插入小視窗到頁面中
      //document.body.appendChild(popup);

      // 添加關閉按鈕的事件處理
      popup.querySelector('#closeBtn').addEventListener('click', () => {
        document.body.removeChild(container);
		shadow = null;
      });

	  //
      popup.querySelector('#chatBtn').addEventListener('click', () => {
        processChat();
      });

      // 捕捉文字框按下Enter
      popup.querySelector('#humanText').addEventListener('keypress', async (message, sender) => {
      //
        var key = window.event.keyCode;

        // If the user has pressed enter
        if (key === 13) {

		  processChat();

          return false;
        } // enter key pressed 
        else {
          return true;
        }
  

      }); // keypress



     
	} // shadow != null
	
      // 更新 popup 的位置和內容
      const popupElement = shadow.querySelector('.popup');
		  popupElement.style.left = `${(rect.right/8) + window.scrollX}px`;
		  popupElement.style.top = `${rect.bottom + window.scrollY}px`;
		  
  } // text length > 0
  }
  if (request.action === 'updatePopup') {
    const { elementId, result, targetLang } = request.data;
 // console.log("request.data: "+{ elementId, result, targetLang });
    // 更新 popup 中的內容
    const targetElement = shadow.getElementById(elementId);
    if (targetElement ) {

      let existingText = targetElement.innerHTML || "";
      let convertedResult = markdownToHtml(result);
	  
      if (targetLang === "en") {
        existingText = `<p><strong></strong> ${convertedResult}</p>`;
		localStorage.setItem('translation', JSON.stringify(convertedResult));
      } else if (targetLang === "zh") {
        existingText = `<p><strong></strong> ${convertedResult}</p>`;
		localStorage.setItem('translation', JSON.stringify(convertedResult));
      } else if (elementId === "circle"){
		//targetElement.hidden = convertedResult;
		if (result == false){
            const text = shadow.getElementById('animatedText');
            text.classList.add('animate');
		}else{
            const text = shadow.getElementById('animatedText');
            text.classList.remove('animate');
		}
		localStorage.setItem('circle', JSON.stringify(convertedResult));
      } else if (elementId === "chatResult") {
        existingText = `<p><strong></strong> ${convertedResult}</p>`;
		localStorage.setItem('chat', JSON.stringify(convertedResult));
      } else {
        existingText = `<p><strong></strong> ${convertedResult}</p>`;
		localStorage.setItem('summary', JSON.stringify(convertedResult));
      }

      targetElement.innerHTML = convertedResult;
    }
	
  } //

  if (request.action === 'sync') {
	  console.log("sync received");

	  console.log("sync received");
	  if (typeof localStorage !== 'undefined') {
		  console.log("localStorage is defined.")
		  syncPopup(JSON.parse(localStorage.getItem('translation')) ,"translationResult");
		  syncPopup(JSON.parse(localStorage.getItem('summary')) ,"summaryResult");
		  syncPopup(JSON.parse(localStorage.getItem('oldchat')) ,"oldChatResult");
		  syncPopup(JSON.parse(localStorage.getItem('chat')) ,"chatResult");
		  syncPopup(JSON.parse(localStorage.getItem('circle')) ,"circle");
		  syncPopup(JSON.parse(localStorage.getItem('humanText')) ,"humanText");
	  } else {
		  console.log("localStorage is not defined.")
		  syncPopup(shadow.getElementById("translationResult").innerHTML ,"translationResult");
		  syncPopup(shadow.getElementById("summaryResult").innerHTML ,"summaryResult");
		  syncPopup(shadow.getElementById("oldChatResult").innerHTML ,"oldChatResult");
		  syncPopup(shadow.getElementById("chatResult").innerHTML ,"chatResult");
		  //syncPopup(JSON.parse(localStorage.getItem('circle')) ,"circle");
		  syncPopup(shadow.getElementById("humanText").innerText ,"humanText");
	  }
  


  }
  
 // const llmUrl = localStorage.getItem('llmUrl');
	chrome.storage.local.get(['llmUrl'],  function (result) {
		sendResponse({ llmUrl: result.llmUrl });
		llmUrl = result.llmUrl;
	});
	return true;
});

function markdownToHtml(markdown) {
    if (markdown == null || typeof markdown !== 'string') {
        return ''; // 或者返回一个默认值
    }
	//console.log(markdown);
    // 将标题转换为 HTML
    markdown = markdown.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    markdown = markdown.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    // 将段落转换为 HTML
    markdown = markdown.replace(/^(.*$)/gim, '<p>$1</p>');
    // 将列表转换为 HTML
    markdown = markdown.replace(/^\* (.*$)/gim, '<li>$1</li>');
    // 将粗体转换为 HTML
    markdown = markdown.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 将换行符转换为 <br>
    markdown = markdown.replace(/\n/g, '<br>');
    return markdown;
}

  function processChat() {
	  console.log(shadow);
	  var current_language = navigator.language.toLowerCase() || navigator.browserLanguage.toLowerCase(); //for IE
      const humanText = shadow.getElementById("humanText").value + "，以"+current_language+"回答" + "\n";
       
	  const translationText = shadow.getElementById("translationResult").innerText + " ";
  	  const summaryText = shadow.getElementById("summaryResult").innerText + " ";
	  const chatText = shadow.getElementById("chatResult").innerText + " ";
	  
	  shadow.getElementById("oldChatResult").innerText = shadow.getElementById("chatResult").innerText + "\n\n" + humanText;
	  localStorage.setItem('oldchat', JSON.stringify(shadow.getElementById("oldChatResult").innerText));
	  //console.log(translationText, summaryText, chatText);
          const context = translationText + summaryText;
		  shadow.getElementById("chatResult").innerText = "";
          shadow.getElementById("humanText").value = "";

const chat = [
    {
        role : 'assistant',
        content : context + chatText
    },
    {
        role: 'user',
		content : humanText
        
    },
];
          // promptText = "### Assistant: " + context + chatText + "\n### Human: " + humanText + "\n### Assistant:";

//		const llmUrl = localStorage.getItem('llmUrl');
			console.log(chat);

			  chrome.runtime.sendMessage( {
				action: 'chat',
				data: chat,
				llmUrl: llmUrl
			  }, () => {
				// 發送消息後的回調
				if (chrome.runtime.lastError) {
				//  console.error('Error sending message to popup:', chrome.runtime.lastError);
				} else {
				//  console.log('Message sent to popup');
				}
			  });		
  }


// 檢查浮動小視窗是否存在
function checkFloatingWindow() {
    return shadow.querySelector('.popup') !== null;
}

// 監聽來自 background.js 的訊息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "ping") {
        sendResponse({ status: "ok" });
    }
    if (message.action === "checkWindow") {
        const exists = checkFloatingWindow();
        sendResponse({ exists: exists });
    }
    if (message.action === "getData" && checkFloatingWindow()) {
        // 假設你的資料保存在這裡
		//console.log('getData');
        const translation = shadow.getElementById("translationResult").innerHTML ;
        const summary = shadow.getElementById("summaryResult").innerHTML ;
        const oldChat = shadow.getElementById("oldChatResult").innerHTML ;
        const chat = shadow.getElementById("chatResult").innerHTML ;
        sendResponse({ translation: translation , summary: summary , oldChat: oldChat , chat: chat });
    }
});
