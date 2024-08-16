let llmUrl = 'localhost';


chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translateToEnglish",
    title: "Translate to English",
    contexts: ["selection"]
  });
  
var current_language = navigator.language.toLowerCase() || navigator.browserLanguage.toLowerCase(); //for IE
  chrome.contextMenus.create({
    id: "translateToChinese",
    title: "Translate to "+current_language,
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "summarize",
    title: "Summarize",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	//
		//
		tab.id = (tab.id <0)?0:tab.id;
		console.log("tab.id: "+tab.id);
		  if (info.menuItemId === "translateToEnglish") {
			//
			chrome.tabs.sendMessage(tab.id, { type: "showPopup" }, (response) => {if(chrome.runtime.lastError){}else{
			llmUrl = response.llmUrl;
			translateSelectedText(info.selectionText, "en", tab.id);
			}
			});
		  } else if (info.menuItemId === "translateToChinese") {
			//
			chrome.tabs.sendMessage(tab.id, { type: "showPopup" }, (response) => {if(chrome.runtime.lastError){}else{
			llmUrl = response.llmUrl;
			translateSelectedText(info.selectionText, "zh", tab.id);
			}
			});
		  } else if (info.menuItemId === "summarize") {
			//
			chrome.tabs.sendMessage(tab.id, { type: "showPopup" }, (response) => {if(chrome.runtime.lastError){}else{
			llmUrl = response.llmUrl;
			console.log("llmUrl:"+llmUrl);
			summarizeSelectedText(info.selectionText, tab.id);
			}
			});
		  }
  
   
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



async function translateSelectedText(selectedText, targetLang, tabid) {
    // 加載現有的 LLM URL 設定，並預設為 localhost
    
  var current_language = navigator.language.toLowerCase() || navigator.browserLanguage.toLowerCase(); //for IE
  langCode = targetLang == "zh" ? "translate to "+current_language : "translate to en_US:"
  promptText = format_prompt(""+ langCode + " " + selectedText)
  console.log(promptText);
const result = await fetch('http://'+llmUrl+':1234/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages: promptText, stream: true, stop: ["## Step", "### Assistant:", "### Human:", "\n### Human:"], max_tokens: 2048})
  })

  console.log(promptText)

  if(!result.ok){
    return
  }

  // 發送消息到 popup.js 轉圈圈
 displayResult(false, 'circle', '', tabid);

  let answer = ''
  const decoder = new TextDecoder('utf-8');

  for await (const chunk of result.body) {
    const decodedText = decoder.decode(chunk, { stream: true });
    // console.log(decodedText);

    if (decodedText.startsWith('data: ')) {
      const messages = decodedText.split('\n').filter(line => line.trim().startsWith('data: '));
      for (const message of messages) {
        if (message.trim() === 'data: [DONE]') break;
        try {
          const parsedMessage = JSON.parse(message.trim().substring(6));
          const { choices } = parsedMessage;
          if (choices && choices.length > 0) {
            const content = choices[0].text || choices[0].delta?.content || '';
            answer += content;
            displayResult(answer, "translationResult", targetLang, tabid);
          }
	  if(parsedMessage.content) {
            answer += parsedMessage.content;
            displayResult(answer, "translationResult", targetLang, tabid);
          }
        } catch (err) {
          console.error("Error parsing message:", err);
        }
      }
    }
  }


  // 發送消息到 popup.js 關閉圈圈
 displayResult(true, 'circle', '', tabid);

}

async function summarizeSelectedText(selectedText, tabid) {
var current_language = navigator.language.toLowerCase() || navigator.browserLanguage.toLowerCase(); //for IE
promptText = format_prompt("將以下文字做總結，以"+current_language+"回答: " + selectedText)
  const result = await fetch('http://'+llmUrl+':1234/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages: promptText, stream: true, stop: ["## Step", "### Assistant:", "### Human:", "\n### Human:"], max_tokens: 2048})
  })
  console.log(promptText)

  if(!result.ok){
    return
  }
//
  // 發送消息到 popup.js 轉圈圈
 displayResult(false, 'circle', '', tabid);

  let answer = ''
  const decoder = new TextDecoder('utf-8');

  for await (const chunk of result.body) {
    const decodedText = decoder.decode(chunk, { stream: true });
    //console.log(decodedText);

    if (decodedText.startsWith('data: ')) {
      const messages = decodedText.split('\n').filter(line => line.trim().startsWith('data: '));
      for (const message of messages) {
        if (message.trim() === 'data: [DONE]') break;
        try {
          const parsedMessage = JSON.parse(message.trim().substring(6));
          const { choices } = parsedMessage;
          if (choices && choices.length > 0) {
            const content = choices[0].text || choices[0].delta?.content || '';
            answer += content;
            displayResult(answer, "summaryResult", '', tabid);
          }
	  if(parsedMessage.content) {
            answer += parsedMessage.content;
            displayResult(answer, "summaryResult", '', tabid);
          }
        } catch (err) {
          console.error("Error parsing message:", err);
        }
      }
    }
  }

  // 發送消息到 popup.js 關閉圈圈
 displayResult(true, 'circle', '', tabid);


// answer += decoder.decode(); 
// console.log(answer)

//      console.log("result:", answer)
//      displayResult(answer, "summaryResult")
  
}

chrome.runtime.onMessage.addListener(async function(request, sender, sendResponse) {
    // 加載現有的 LLM URL 設定，並預設為 localhost
	
// console.log("");
  if (request.action === 'chat') {
	  console.log("chat");
	  console.log(request);
	const promptText = request.data;
	llmUrl = request.llmUrl;
	console.log('http://'+llmUrl+':1234/v1/chat/completions');
          const result = await fetch('http://'+llmUrl+':1234/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ messages: promptText, stream: true, stop: ["## Step", "### Assistant:", "### Human:", "\n### Human:"], max_tokens: 2048})
          })
          console.log(promptText)

          if(!result.ok){
            return
          }
          //
          // 發送消息到 popup.js 轉圈圈
          displayResult(false, 'circle', '', (sender.tab)?sender.tab.id:0);

          let answer = ''
          const decoder = new TextDecoder('utf-8');

          for await (const chunk of result.body) {
            const decodedText = decoder.decode(chunk, { stream: true });
            //console.log(decodedText);

            if (decodedText.startsWith('data: ')) {
              const messages = decodedText.split('\n').filter(line => line.trim().startsWith('data: '));
              for (const message of messages) {
                if (message.trim() === 'data: [DONE]') break;
                try {
                const parsedMessage = JSON.parse(message.trim().substring(6));
                const { choices } = parsedMessage;
                if (choices && choices.length > 0) {
                  const content = choices[0].text || choices[0].delta?.content || '';
                  answer += content;
                  displayResult(answer, "chatResult", '', (sender.tab)?sender.tab.id:0);
                }
	              if(parsedMessage.content) {
                    answer += parsedMessage.content;
                    displayResult(answer, "chatResult", '', (sender.tab)?sender.tab.id:0);
                  }
               } catch (err) {
                 console.error("Error parsing message:", err);
               }
             } // for message
           } // start with data:
         } // for chunk

          // 發送消息到 popup.js 關閉圈圈
          displayResult(true, 'circle', '', (sender.tab)?sender.tab.id:0);
	  
  }

	
	
});

function syncPopup(result, elementId) {
  // console.log(result +","+ elementId +","+ targetLang +","+ tabid);

  // 構造要發送的數據
  const data = {
    elementId: elementId,
    result: result,
    targetLang: "zh"
  };

  // 廣播消息 popup.js 跟 content.js 都會接收
  chrome.runtime.sendMessage( {
    action: 'updatePopup',
    data: data
  }, () => {
    // 發送消息後的回調
    if (chrome.runtime.lastError) {
    //  console.error('Error sending message to popup:', chrome.runtime.lastError);
    } else {
    //  console.log('Message sent to popup');
    }
  });

  
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "checkWindow" || message.action === "getData") {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, message, sendResponse);
        });
        return true; // 表示將進行非同步回應
    }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log(message.action);
    if (message.action === "checkContentScript") {
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
		console.log(response);
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
