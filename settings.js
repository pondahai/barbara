let llmUrl = "";
let modelId = "";

// function fetchUrl(url) {
  // return new Promise((resolve, reject) => {
	// const xhr = new XMLHttpRequest();
	// xhr.open('GET', url);
	// xhr.onload = () => resolve(xhr.responseText);
	// xhr.onerror = () => reject(new Error('Network Error'));
	// xhr.send();
  // });
// }

	async function fetchAndCompare(urls) {
	  const promises = urls.map(item  =>  fetch(item.url+"/v1/models", {
		headers: {
		  'Authorization': `Bearer ${item.apikey}`,
		  'Content-Type': 'application/json'
		}
	  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
		return response.json().then(data => ({
		  url: item.url,
		  apikey: item.apikey,
		  data: data
		}));
    })
    .catch(error => {
      console.error   
(`Error fetching ${item.url}:`, error);
      return null; // 或拋出一個自定义的错误
    })
	);

	  try {
		const responses = await Promise.all(promises);
		const firstResponse = responses.find(response => response); // 只要有回應就認為成功

		if (firstResponse) {
		  firstResponseUrl = firstResponse.url;
		  firstResponseApiKey = firstResponse.apikey;
		  // llmUrl = firstResponseUrl.split('//')[1];
		  // llmUrl = firstResponseUrl.split('/')[0] + "//" + firstResponseUrl.split('/')[2];
		  llmUrl = firstResponseUrl;
		  apikey = firstResponseApiKey;
		  // console.log(firstResponseUrl);
		  // llmUrl = llmUrl.split('/')[0];
		  console.log('最快回應的網址：', llmUrl);
		  // localStorage.setItem('llmUrl', llmUrl);
		   chrome.storage.local.set({llmUrl: llmUrl}, function () {alert('LLM URL 已保存');});
		   chrome.storage.local.set({apiKey: apikey}, function () {alert('LLM URL 已保存');});
		  //const data = await firstResponse.text();
		  //console.log('回應內容：', data);
		  // 發出新的請求
		  const modelsResponse = await fetch(`${llmUrl}/v1/models`, {
			headers: {
			  'Authorization': `Bearer ${apikey}`,
			  'Content-Type': 'application/json'
			}
		  });
		  if (!modelsResponse.ok) {
			throw new Error(`Network response was not ok: ${modelsResponse.statusText}`);
		  }
		  const modelsData = await modelsResponse.json();

      // 生成模型選項
      const modelSelect = document.getElementById('modelSelect');
      modelSelect.innerHTML = ''; // 清空選項
      modelsData.data.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.id;
        modelSelect.appendChild(option);
      });

		  // // 捕捉 data 陣列的第一筆資料中的 id
		  const firstModelId = modelsData.data[0].id;
		  // console.log('第一個模型的 ID：', firstModelId);

		  // // 存儲在一個變數中
		  modelId = firstModelId;
		  // // localStorage.setItem('modelId', modelId);
		  chrome.storage.local.set({modelId: modelId}, function () {alert('LLM URL 已保存');});
		  // update status
		  document.getElementById('status_box').style.borderWidth="1px";
		  document.getElementById('status_box').style.borderStyle="solid";
		  document.getElementById('status_title').innerHTML="<h2>狀態</h2>";
		  document.getElementById('llmurl').innerHTML="<p>找到的伺服器:"+llmUrl+"</p>";
		  document.getElementById('modelname').innerHTML="<p>模型名稱:"+modelId+"</p>";
		  //
      // 監聽選擇變更
      modelSelect.addEventListener('change', (event) => {
        const selectedModelId = event.target.value;
        modelId = selectedModelId;
        chrome.storage.local.set({ modelId: modelId }, function () { alert('模型 ID 已保存'); });
        document.getElementById('modelname').innerHTML = "<p>模型名稱:" + modelId + "</p>";
      });

		} else {
		  console.error('所有請求都失敗了');
		}
	  } catch (error) {
		console.error('發生錯誤：', error);
	  }
	}
	
	
document.addEventListener('load', function() {
	// const llmUrlInput1 = document.getElementById('llm-url-1');
	// const llmUrlInput2 = document.getElementById('llm-url-2');
	// const llmUrlInput3 = document.getElementById('llm-url-3');

	// const urls = [llmUrlInput1.value, llmUrlInput2.value, llmUrlInput3.value];
	// fetchAndCompare(urls);	
});


function getStorageWhenDOMLoad(storageVarKey, defaultVarValue, elementVar) {
	chrome.storage.local.get([storageVarKey], async function (result) {
		console.log(result);
		let storageVar = result[storageVarKey] || defaultVarValue;
		 elementVar.value = storageVar;
		chrome.storage.local.set({storageVarKey: storageVar}, function () {});
	});
}
document.addEventListener('DOMContentLoaded', function() {
    const saveButton = document.getElementById('save');
    const resetButton = document.getElementById('reset');
	const llmUrlInput1 = document.getElementById('llm-url-1');
	const llmUrlInput2 = document.getElementById('llm-url-2');
	const llmUrlInput3 = document.getElementById('llm-url-3');
	const llmUrlInput1apiKey = document.getElementById('llm-url-1-apikey');
	const llmUrlInput2apiKey = document.getElementById('llm-url-2-apikey');
	const llmUrlInput3apiKey = document.getElementById('llm-url-3-apikey');

	getStorageWhenDOMLoad('llmUrl1', 'http://localhost:1234', llmUrlInput1);
	getStorageWhenDOMLoad('llmUrl2', 'http://localhost:11434', llmUrlInput2);
	getStorageWhenDOMLoad('llmUrl3', 'http://raspberrypi.local:1234', llmUrlInput3);

	getStorageWhenDOMLoad('llmUrl1apiKey', '', llmUrlInput1apiKey);
	getStorageWhenDOMLoad('llmUrl2apiKey', '', llmUrlInput2apiKey);
	getStorageWhenDOMLoad('llmUrl3apiKey', '', llmUrlInput3apiKey);
	
	// chrome.storage.local.get(['llmUrl1'], async function (result) {
		// let llmUrl1 = result.llmUrl1 || 'http://localhost:1234';
		 // llmUrlInput1.value = llmUrl1;
		// localStorage.setItem('llmUrl1', llmUrl1);
		 // chrome.storage.local.set({llmUrl1: llmUrl1}, function () {alert('LLM URL 已保存');});
		// //const urls = [llmUrlInput1.value];
		// //fetchAndCompare(urls);
	// });
	// chrome.storage.local.get(['llmUrl2'], async function (result) {
		// let llmUrl2 = result.llmUrl2 || 'http://localhost:11434';
		 // llmUrlInput2.value = llmUrl2;
		// localStorage.setItem('llmUrl2', llmUrl2);
		 // chrome.storage.local.set({llmUrl2: llmUrl2}, function () {alert('LLM URL 已保存');});
		// //const urls = [llmUrlInput2.value];
		// //fetchAndCompare(urls);
	// });
	// chrome.storage.local.get(['llmUrl3'], async function (result) {
		// let llmUrl3 = result.llmUrl3 || 'http://raspberrypi.local:1234';
		 // llmUrlInput3.value = llmUrl3;
		// localStorage.setItem('llmUrl3', llmUrl3);
		 // chrome.storage.local.set({llmUrl3: llmUrl3}, function () {alert('LLM URL 已保存');});
		// //const urls = [llmUrlInput3.value];
		// //fetchAndCompare(urls);
	// });

	setTimeout(function () {
		const urls = [
		  {url: llmUrlInput1.value, apikey: llmUrlInput1apiKey.value}, 
		  {url: llmUrlInput2.value, apikey: llmUrlInput2apiKey.value}, 
		  {url: llmUrlInput3.value, apikey: llmUrlInput3apiKey.value}
		];
		fetchAndCompare(urls);	
	}, 1000)

    // 保存新的 LLM URL 設定
    saveButton.addEventListener('click', function() {
        const llmUrl1 = llmUrlInput1.value;
		// localStorage.setItem('llmUrl1', llmUrl1);
		 chrome.storage.local.set({llmUrl1: llmUrl1}, function () {alert('LLM URL 已保存');});
        const llmUrl2 = llmUrlInput2.value;
		// localStorage.setItem('llmUrl2', llmUrl2);
		 chrome.storage.local.set({llmUrl2: llmUrl2}, function () {alert('LLM URL 已保存');});
        const llmUrl3 = llmUrlInput3.value;
		// localStorage.setItem('llmUrl3', llmUrl3);
		 chrome.storage.local.set({llmUrl3: llmUrl3}, function () {alert('LLM URL 已保存');});

        const llmUrl1apiKey = llmUrlInput1apiKey.value;
		 chrome.storage.local.set({llmUrl1apiKey: llmUrl1apiKey}, function () {});
        const llmUrl2apiKey = llmUrlInput2apiKey.value;
		 chrome.storage.local.set({llmUrl2apiKey: llmUrl2apiKey}, function () {});
        const llmUrl3apiKey = llmUrlInput3apiKey.value;
		 chrome.storage.local.set({llmUrl3apiKey: llmUrl3apiKey}, function () {});

		const urls = [
		  {url: llmUrlInput1.value, apikey: llmUrlInput1apiKey.value}, 
		  {url: llmUrlInput2.value, apikey: llmUrlInput2apiKey.value}, 
		  {url: llmUrlInput3.value, apikey: llmUrlInput3apiKey.value}
		];
		fetchAndCompare(urls);

    });

    // 重置 LLM URL 設定為 localhost
    resetButton.addEventListener('click', function() {
        llmUrlInput1.value = 'http://localhost:1234';
		// localStorage.setItem('llmUrl1', llmUrlInput2.value);
		chrome.storage.local.set({llmUrl1: llmUrlInput1.value}, function () {});
        llmUrlInput2.value = 'http://localhost:11434';
		// localStorage.setItem('llmUrl2', llmUrlInput2.value);
		chrome.storage.local.set({llmUrl2: llmUrlInput2.value}, function () {});
        llmUrlInput3.value = 'http://raspberrypi.local:1234';
		// localStorage.setItem('llmUrl3', llmUrlInput3.value);
		chrome.storage.local.set({llmUrl3: llmUrlInput3.value}, function () {});

        llmUrlInput1apiKey.value = '';
		chrome.storage.local.set({llmUrl1apiKey: llmUrlInput1apiKey.value}, function () {});
        llmUrlInput2apiKey.value = '';
		chrome.storage.local.set({llmUrl2apiKey: llmUrlInput2apiKey.value}, function () {});
        llmUrlInput3apiKey.value = '';
		chrome.storage.local.set({llmUrl3apiKey: llmUrlInput3apiKey.value}, function () {});
        
		alert('LLM URLs 已重置');

    });
		
	
});