let llmUrl = "";
let modelId = "";

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
	const xhr = new XMLHttpRequest();
	xhr.open('GET', url);
	xhr.onload = () => resolve(xhr.responseText);
	xhr.onerror = () => reject(new Error('Network Error'));
	xhr.send();
  });
}

	async function fetchAndCompare(urls) {

	  const promises = urls.map(url =>  fetch('http://'+url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      return response;
    })
    .catch(error => {
      console.error   
(`Error fetching ${url}:`, error);
      return null; // 或拋出一個自定义的错误
    })
	);

	  try {
		const responses = await Promise.all(promises);
		const firstResponse = responses.find(response => response); // 只要有回應就認為成功

		if (firstResponse) {
		  firstResponseUrl = firstResponse.url;
		  llmUrl = firstResponseUrl.split('//')[1];
		  llmUrl = llmUrl.split('/')[0];
		  console.log('最快回應的網址：', llmUrl);
		  localStorage.setItem('llmUrl', llmUrl);
		   chrome.storage.local.set({llmUrl: llmUrl}, function () {alert('LLM URL 已保存');});
		  //const data = await firstResponse.text();
		  //console.log('回應內容：', data);
		  // 發出新的請求
		  const modelsResponse = await fetch(`http://${llmUrl}/v1/models`);
		  if (!modelsResponse.ok) {
			throw new Error(`Network response was not ok: ${modelsResponse.statusText}`);
		  }
		  const modelsData = await modelsResponse.json();

		  // 捕捉 data 陣列的第一筆資料中的 id
		  const firstModelId = modelsData.data[0].id;
		  console.log('第一個模型的 ID：', firstModelId);

		  // 存儲在一個變數中
		  modelId = firstModelId;
		  localStorage.setItem('modelId', modelId);
		  chrome.storage.local.set({modelId: modelId}, function () {alert('LLM URL 已保存');});
		} else {
		  console.error('所有請求都失敗了');
		}
	  } catch (error) {
		console.error('發生錯誤：', error);
	  }
	}

document.addEventListener('DOMContentLoaded', function() {
    const saveButton = document.getElementById('save');
    const resetButton = document.getElementById('reset');
	const llmUrlInput1 = document.getElementById('llm-url-1');
	const llmUrlInput2 = document.getElementById('llm-url-2');
	const llmUrlInput3 = document.getElementById('llm-url-3');
	

	chrome.storage.local.get(['llmUrl1'], async function (result) {
		let llmUrl1 = result.llmUrl1 || 'localhost:1234';
		 llmUrlInput1.value = llmUrl1;
		localStorage.setItem('llmUrl1', llmUrl1);
		 chrome.storage.local.set({llmUrl1: llmUrl1}, function () {alert('LLM URL 已保存');});
		const urls = [llmUrlInput1.value];
		fetchAndCompare(urls);
	});
	chrome.storage.local.get(['llmUrl2'], async function (result) {
		let llmUrl2 = result.llmUrl2 || 'ubuntu:1234';
		 llmUrlInput2.value = llmUrl2;
		localStorage.setItem('llmUrl2', llmUrl2);
		 chrome.storage.local.set({llmUrl2: llmUrl2}, function () {alert('LLM URL 已保存');});
		const urls = [llmUrlInput2.value];
		fetchAndCompare(urls);
	});
	chrome.storage.local.get(['llmUrl3'], async function (result) {
		let llmUrl3 = result.llmUrl3 || 'raspberrypi.local:1234';
		 llmUrlInput3.value = llmUrl3;
		localStorage.setItem('llmUrl3', llmUrl3);
		 chrome.storage.local.set({llmUrl3: llmUrl3}, function () {alert('LLM URL 已保存');});
		const urls = [llmUrlInput3.value];
		fetchAndCompare(urls);
	});


    // 保存新的 LLM URL 設定
    saveButton.addEventListener('click', function() {
        const llmUrl1 = llmUrlInput1.value;
		localStorage.setItem('llmUrl1', llmUrl1);
		 chrome.storage.local.set({llmUrl1: llmUrl1}, function () {alert('LLM URL 已保存');});
        const llmUrl2 = llmUrlInput2.value;
		localStorage.setItem('llmUrl2', llmUrl2);
		 chrome.storage.local.set({llmUrl2: llmUrl2}, function () {alert('LLM URL 已保存');});
        const llmUrl3 = llmUrlInput3.value;
		localStorage.setItem('llmUrl3', llmUrl3);
		 chrome.storage.local.set({llmUrl3: llmUrl3}, function () {alert('LLM URL 已保存');});


		const urls = [llmUrlInput1.value, llmUrlInput2.value, llmUrlInput3.value];
		fetchAndCompare(urls);

    });

    // 重置 LLM URL 設定為 localhost
    resetButton.addEventListener('click', function() {
        llmUrlInput1.value = 'localhost:1234';
		localStorage.setItem('llmUrl1', llmUrlInput2.value);
		chrome.storage.local.set({llmUrl1: llmUrlInput1.value}, function () {});
        llmUrlInput2.value = 'ubuntu:1234';
		localStorage.setItem('llmUrl2', llmUrlInput2.value);
		chrome.storage.local.set({llmUrl2: llmUrlInput2.value}, function () {});
        llmUrlInput3.value = 'raspberrypi.local:1234';
		localStorage.setItem('llmUrl3', llmUrlInput3.value);
		chrome.storage.local.set({llmUrl3: llmUrlInput3.value}, function () {});
        
		alert('LLM URLs 已重置');

    });
		
	
});