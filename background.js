let llmUrl = 'localhost';
let modelId = '';
let apiKey = '';

//
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translateToEnglish",
    title: "Translate to English",
    contexts: ["selection"]
  });
  
var current_language = navigator.language || navigator.browserLanguage; //for IE
  chrome.contextMenus.create({
    id: "translateToCurrent",
    title: "Translate to "+current_language,
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "summarize",
    title: "Summarize",
    contexts: ["selection"]
  });

  // chrome.contextMenus.create({
    // id: "openSidePanel",
    // title: "Side Panel",
    // contexts: ["selection"]
  // });

});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	//
		//
		tab.id = (tab.id <0)?0:tab.id;
		console.log("tab.id: "+tab.id);

	chrome.storage.local.get(['llmUrl', 'modelId', 'apiKey'],  function (result) {
		llmUrl = result.llmUrl;
		modelId = result.modelId;
		apiKey = result.apiKey;
		
		  if (info.menuItemId === "translateToEnglish") {
			//
            chrome.sidePanel.open({ windowId: tab.windowId });

	langCode = "translate to en_US, please:";  
	promptText = format_prompt(""+ langCode + " " + info.selectionText)
	llamaProcess(promptText, tab.id, "translationResult");
					// translateSelectedText(info.selectionText, "en", tab.id);

					
		  } else if (info.menuItemId === "translateToCurrent") {
			//
            chrome.sidePanel.open({ windowId: tab.windowId });


	var current_language = navigator.language || navigator.browserLanguage; //for IE
	langCode = "translate to "+current_language+ ", please :";  
	promptText = format_prompt(""+ langCode + " " + info.selectionText)
	llamaProcess(promptText, tab.id, "translationResult");
					// translateSelectedText(info.selectionText, "zh", tab.id);

					
		  } else if (info.menuItemId === "summarize") {
			//
            chrome.sidePanel.open({ windowId: tab.windowId });

			
			var current_language = navigator.language.toLowerCase() || navigator.browserLanguage.toLowerCase(); //for IE
			promptText = format_prompt("將以下文字做總結，以"+current_language+"回答: " + info.selectionText)
			llamaProcess(promptText, tab.id, "summaryResult");  
					// summarizeSelectedText(info.selectionText, tab.id);
					
		  } else if (info.menuItemId === 'openSidePanel') {
            // This will open the panel in all the pages on the current window.
            chrome.sidePanel.open({ windowId: tab.windowId });

			
          }

  	}); // 

   

});

// const chat = [
    // {
        // human: "你好，小幫手",
        // assistant: "你好，請問需要什麼幫助?"
    // },
    // {
        // human: "可能要請你翻譯或是總結文章，請根據接下來的指示做反應",
        // assistant: "好的，請說"
    // },
// ]

// const instruction = `### System: 這是一段好奇的人類與人工智慧助手之間的對話。助手對人類的問題提供有幫助且禮貌的回答。`

// function format_prompt(question) {
    // return `${instruction}\n${
        // chat.map(m =>`### Human: ${m.human}\n### Assistant: ${m.assistant}`).join("\n")
    // }\n### Human: ${question}\n### Assistant:`
// }

const chat = [
    {
        human: "你好，小幫手",
        assistant: "你好，請問需要什麼幫助?"
    },
    {
        human: "可能要請你翻譯或是總結文章，請根據接下來的指示做反應,一律用中文回答",
        assistant: "好的，請說"
    },
];
  
  
var current_language = navigator.language.toLowerCase() || navigator.browserLanguage.toLowerCase(); //for IE
const instruction = "I am a general-purpose AI assistant. If you ask me a question that is rooted in truth. Follow the user's instructions with precision and attention to detail. Minimize any additional text. Reply in "+current_language+".";
// const instruction = "我是一位通用型人工智慧助理。如果您的問題基於真實性，我會按照使用者的指示精確地回應並注重細節。提供的程式碼會放在單一區塊中，盡量減少額外的文字。";

function format_prompt(question) {
    const message = [
        {
            role: "system",
            content: instruction
        },
        ...chat.flatMap(entry => [
            { role: "user", content: entry.human },
            { role: "assistant", content: entry.assistant }
        ]),
        {
            role: "user",
            content: question
        }
    ];

    return message;
}



chrome.runtime.onMessage.addListener(async function(request, sender, sendResponse) {

  if (request.action === 'translate') {
	var current_language = navigator.language || navigator.browserLanguage; //for IE
	langCode = request.isEn ?  "translate to "+current_language : "translate to en_US:";
	promptText = format_prompt(""+ langCode + " " + request.data)
	  
	llmUrl = request.llmUrl;
	modelId = request.modelId;
	apiKey = request.apiKey;
    chrome.sidePanel.open({ windowId: sender.tab.windowId });
	
	llamaProcess(promptText, sender.tab.id, "translationResult");
  }
  
  if (request.action === 'summary') {
	var current_language = navigator.language.toLowerCase() || navigator.browserLanguage.toLowerCase(); //for IE
	promptText = format_prompt("將以下文字做總結，以"+current_language+"回答: " + request.data);
	
	llmUrl = request.llmUrl;
	modelId = request.modelId;
	apiKey = request.apiKey;
    chrome.sidePanel.open({ windowId: sender.tab.windowId });
	llamaProcess(promptText, sender.tab.id, "summaryResult");  
  }
  
// console.log("");
  if (request.action === 'chat') {
	  // console.log("chat");
	  // console.log(request);
		llmUrl = request.llmUrl;
		modelId = request.modelId;
		apiKey = request.apiKey;
		
		const promptText = request.data;

		llamaProcess(promptText, (sender.tab)?sender.tab.id:0, "chatResult");    
  }

  if (request.action === 'getClipboard') {
    navigator.clipboard.readText()
      .then(text => {
        sendResponse({ text });
      })
      .catch(err => {
        console.error('Failed to read clipboard: ', err);
        sendResponse({ error: 'Clipboard read error' });
      });
    return true; // Indicate asynchronous response
  }
	
	
});

async function* readAll(reader, tabId, objElement) {	  
		  let answer = '';
		// if (response.ok) {		
			// const reader = body.getReader();
			const decoder = new TextDecoder('utf-8');
			// let done = false;

  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const decodedText = decoder.decode(value, { stream: !done });

    // 將新的資料加入 buffer
    buffer += decodedText;

    // 嘗試分離完整的 JSON 封包
    while (buffer.length > 0) {
      try {
        // 檢查是否有完整的 JSON 封包
        const lineEndIndex = buffer.indexOf('\n');
        if (lineEndIndex !== -1) {
          const line = buffer.slice(0, lineEndIndex).trim();
          buffer = buffer.slice(lineEndIndex + 1); // 去除已解析的部分

          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6); // 去除 'data: ' 前綴

            // 檢查是否是結束標誌
            if (jsonStr === '[DONE]') {
              // yield { done: true };
              break;
            }

            // 嘗試解析 JSON
            const jsonObj = JSON.parse(jsonStr);

            // 處理 choices
            const { choices } = jsonObj;
            if (choices && choices.length > 0) {
              const content = choices[0].text || choices[0].delta?.content || '';
              answer += content;
              yield answer;
            }

            // 處理 parsedMessage.content
            const parsedMessage = jsonObj;
            if (parsedMessage.content) {
              answer += parsedMessage.content;
              yield answer;
            }
          }
        } else {
          // 如果沒有找到換行符，說明資料不完整，等待下一次讀取
          break;
        }
      } catch (e) {
        // 如果解析失敗，說明資料不完整，等待下一次讀取
        break;
      }
    }
  }
			
			// while (true) {
				// const {  done, value } = await reader.read();
				// // done = readerDone;
				// if (done) break;
				// // console.log('Received chunk:', decoder.decode(value, { stream: !done }));
				// const decodedText = decoder.decode(value, { stream: !done });
				// if (decodedText.startsWith('data: ')) {
				  // const messages = decodedText.split('\n').filter(line => line.trim().startsWith('data: '));
				  // for (const message of messages) {
					// if (message.trim() === 'data: [DONE]') break;
					
					// const parsedMessage = JSON.parse(message.trim().substring(6));
					// const { choices } = parsedMessage;
					// if (choices && choices.length > 0) {
					  // const content = choices[0].text || choices[0].delta?.content || '';
					  // answer += content;
					  // // displayResult(answer, objElement, '', tabId);
					  // yield answer;
					// }
					// if(parsedMessage.content) {
					  // answer += parsedMessage.content;
					  // // displayResult(answer, objElement, '', tabId);
					  // yield answer;
					// }

				  // } // for message
				// } // start with data:


			// } // while(!done)		
		// } else {
			// console.error('Response error:', response.statusText);
		// }
		return answer;
}	


async function llamaProcess(promptText, tabId, objElement) {
	  
		
	try {
		////
		let promptString = '';
		promptText.forEach(item => {
        // 將物件的 role 和 content 組合起來，並添加到結果字串中
          promptString += `${item.role}:' ${item.content} `;
        });
		////
		const jsonData = JSON.stringify({
			model: modelId,
			// cache_prompt: true,
			stop: ["</s>", "Llama:", "User:"],
			stream: true,
			messages: promptText,
			max_tokens: 8000
		});
		////
		const blob = new Blob([jsonData], { type: 'application/json' });
		////
		// Use a custom TransformStream to track upload progress
		const progressTrackingStream = new TransformStream({
			transform(chunk, controller) {
			  controller.enqueue(chunk);
			  bytesUploaded += chunk.byteLength;
			  console.log("upload progress:", bytesUploaded / totalBytes);
			  // uploadProgress.value = bytesUploaded / totalBytes;
			},
			flush(controller) {
			  console.log("completed stream");
			},
		});
		////
	// (async ()=> {
         const response =  await fetch(llmUrl+'/v1/chat/completions', {
          // await fetch('http://'+llmUrl+'/completion', {
            // signal: controller.signal,
            method: 'POST',
            headers: {
			  'Authorization': `Bearer ${apiKey}`,
			  'Connection': 'keep-alive',
              'Content-Type': 'application/json',
			  'Accept': 'text/event-stream'
            },
			// body: JSON.stringify({ model: modelId, messages: promptText, stream: true, stop: ["## Step", "### Assistant:", "### Human:", "\n### Human:", "User:"], max_tokens: 8192, cache_prompt: true, slot_id: undefined})
			
            // body: JSON.stringify({stop: ["</s>", "Llama:", "User:"], repeat_penalty: 1.18, frequency_penalty: 0, penalize_nl: false, presence_penalty: 0, stream: true, prompt: promptString }),

			body: jsonData,
			
            // body: blob.stream().pipeThrough(progressTrackingStream),
			duplex: "half"
			
			

			// body: bodyStream, // 使用 ReadableStream 作为请求体
            // duplex: 'full' // 添加 duplex 选项

          })
		  .then(response => {
			if (!response.ok) {
			  throw new Error('Network response was not ok');
			}
			return response.body; // 返回一個 ReadableStream
		  })
		  .then(body => {
			console.log('call readAll');
			  // 發送消息到 popup.js 轉圈圈
			  displayResult(false, 'circle', '', tabId);
			const reader = body.getReader();
			// return readAll(reader, tabId, objElement); // 輔助函數，用於讀取所有數據
			(async ()=> {
			  for await (const answer of readAll(reader, tabId, objElement)) {
				  displayResult(answer, objElement, '', tabId);
			  }
			  // 發送消息到 popup.js 關閉圈圈
			  displayResult(true, 'circle', '', tabId);
			
			})();
			return "";
		  })
		  .then(result => {
			console.log('所有數據：', result);
		  })
		  .catch(error => {
			console.error('發生錯誤：', error);
		  });

		// })();
		
    } catch (err) {

	 console.error("Error parsing message:", err);
    } finally {
      // controller.abort();
    }
}

function displayResult(result, elementId, targetLang, tabid) {
  // console.log(result +","+ elementId +","+ targetLang +","+ tabid);

  // 構造要發送的數據
  const data = {
    elementId: elementId,
    result: result,
    targetLang: targetLang
  };

  // 廣播消息 popup.js 跟 content.js 都會接收
  chrome.tabs.sendMessage(tabid, {
    action: 'updatePopup',
    data: data
  }, () => {
    // 發送消息後的回調
    if (chrome.runtime.lastError) {
      // console.error('Error sending message to popup:', chrome.runtime.lastError);
    } else {
    //  console.log('Message sent to popup');
    }
  });

  chrome.runtime.sendMessage( {
	action: 'updatePopup',
	data: data
  }, () => {
	// 發送消息後的回調
	if (chrome.runtime.lastError) {
	  // console.error('Error sending message to popup:', chrome.runtime.lastError);
	} else {
	//  console.log('Message sent to popup');
	}
  });	  
}



///////
let answer = '';
function llamaProcess_xxx(promptText, tabId, objElement){
	const xhr = new XMLHttpRequest();
    answer = '';
	// 初始化請求
	xhr.open('POST', 'http://'+llmUrl+'/v1/chat/completions', true);
	xhr.setRequestHeader('Content-Type', 'application/json');
	xhr.setRequestHeader('Authorization', 'Bearer YOUR_OPENAI_API_KEY');

	// 處理流式回應
	xhr.onprogress = function () {
		// 將目前收到的回應片段處理
		if (xhr.readyState === 3) {
			const responseText = xhr.responseText;
			// 分段處理收到的資料
			processStreamData(responseText, tabId, objElement);
		}
	};

	// 處理完成的請求
	xhr.onload = function () {
		if (xhr.status === 200) {
			console.log('Request completed successfully');
			const response = xhr.responseText;
			// 處理最終完整的回應
			handleCompleteResponse(response, tabId, objElement);
		} else {
			console.error('Error: ', xhr.statusText);
		}
	};

	// 發送請求
	const data = {
		model: 'gpt-3.5-turbo',
		messages: promptText,
		stream: true // 啟用流式回應
	};
	xhr.send(JSON.stringify(data));
}
// 處理流式回應的函數
function processStreamData(data, tabId, objElement) {
    console.log('Streaming data:', data);
    // 可在此處做即時處理，像是更新 UI 或追加訊息
	answer += data;
	displayResult(answer, objElement, '', tabId);
}

// 處理完整回應的函數
function handleCompleteResponse(response, tabId, objElement) {
    console.log('Final response:', response);
	answer += data;
	displayResult(answer, objElement, '', tabId);
}

//////

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "checkWindow" || message.action === "getData") {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, message, sendResponse);
        });
        return true; // 表示將進行非同步回應
    }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// console.log("background.js:"+message.action);
    if (message.action === "checkContentScript") {
		// Send a message to the content script
		chrome.runtime.sendMessage({ action: 'sidePanelOpen' });
		
        chrome.tabs.sendMessage(message.tabId, { action: "ping" }, function(response) {
            if (chrome.runtime.lastError) {
                sendResponse({ injected: false });
            } else {
                sendResponse({ injected: true });
            }
        });
        return true; // 表示將進行非同步回應
    }
});



// 初始化，設置擴展第一次安裝時的初始值
chrome.runtime.onInstalled.addListener(() => {
    // 加載現有的 LLM URL 設定，並預設為 localhost

	chrome.runtime.sendMessage({ action: "getLlmUrl"}, function(response) {
	if (chrome.runtime.lastError) {
	}else{
		console.log("background.js onInstalled:"+response);
		if (response && response.llmUrl) {
			llmUrl = llmUrl;
		}

		console.log('LLM URL:' + llmUrl);
	}
	});
});



// 處理來自其他腳本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getLLMUrl") {
		// 加載現有的 LLM URL 設定，並預設為 localhost
		
        sendResponse({ llmUrl: llmUrl });
        return true; // 表示將進行非同步回應
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sidePanelOpen') {
  // Send a message to the content script
  console.log("background.js sidePanelOpen and showToolbar");
  chrome.runtime.sendMessage({ action: 'showToolbar' });
  }
});
