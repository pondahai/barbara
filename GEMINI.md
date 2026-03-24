# Barbara: Local AI Assistant - Project Context

Barbara is a Chrome Extension designed to bring the power of Local LLMs (Large Language Models) directly into the browser. It provides features like bilingual translation, article summarization, and an interactive AI Agent capable of interacting with the browser environment.

## Project Overview

*   **Type:** Chrome Extension (Manifest V3)
*   **Main Technologies:** JavaScript (Vanilla), HTML/CSS, Chrome Extension APIs, OpenAI-compatible Streaming APIs (local servers like LMStudio or llama.cpp).
*   **Architecture:**
    *   **Background Service Worker (`background.js`):** Manages context menus, tracks tab history for switching, and orchestrates the opening of the side panel or fallback popups.
    *   **Side Panel (`sidepanel.js` / `sidepanel.html`):** The primary UI and logic engine. It handles LLM configuration, conversation history (stored in `chrome.storage.local`), and the core Agent execution loop.
    *   **Content Scripts (`content.js`):** Injected into web pages to extract content (title, text, transcripts) or execute JavaScript requested by the AI Agent.
    *   **Agent System:** Uses a modular `ToolRegistry` to define capabilities like `read_current_webpage`, `execute_javascript_on_page`, and `open_new_tab`.

## Core Features & Design Principles

### 1. AI Agent & Tool Calling
The assistant includes a "Recursive Thinking Loop" (`runAgentStreamLoop`) that allows the LLM to call multiple tools sequentially. It supports:
*   **Streaming Responses:** Real-time UI updates during generation.
*   **Reasoning Support:** Parsing and displaying `<think>` tags to show the AI's internal thought process.

### 2. Human-in-the-loop (HITL) Security
A foundational design principle documented in `AGENT_ARCHITECTURE_NOTES.md`. Before the Agent executes any tool (especially risky ones like `execute_javascript_on_page`), it pauses for user confirmation:
*   **Approve:** Proceed with execution.
*   **Stop & Answer:** Interrupt data collection and force the AI to answer with currently available info.
*   **Deny:** Explicitly reject the action, sending a structured error back to the LLM to prevent "Action Hallucination."

### 3. UI Stability
*   **Precise Scrolling:** Uses `scrollIntoView` to snap to the start of new AI responses instead of just jumping to the bottom.
*   **No-Flicker Rendering:** Avoids full DOM reloads after streaming to maintain scroll position and user context.

## Building and Running

### Prerequisites
*   A local LLM server running (e.g., **LMStudio**, **llama.cpp**, or **Ollama**).
*   The server must provide an OpenAI-compatible API endpoint (typically `http://localhost:1234/v1`).

### Installation
1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** (top right toggle).
3.  Click **Load unpacked**.
4.  Select the root directory of this project.

### Testing/Validation
*   **Configuration:** Open the extension's **Options** (via the side panel or extension settings) and configure your API URL, Key, and select a Model.
*   **Basic Usage:** Select text on a webpage, right-click, and choose "Barbara: 摘要" (Summarize) or "翻譯" (Translate).
*   **Agent Testing:** Ask the assistant "What is this page about?" or "Can you make the background of this page dark?" to trigger tool calling.

## Development Conventions

*   **Modular Tools:** Add new capabilities by extending the `ToolRegistry` object in `sidepanel.js`. Each tool requires a `schema` (JSON Schema for the LLM) and an `execute` function.
*   **State Management:** All configuration and conversation history is persisted using `chrome.storage.local`.
*   **Message Passing:** Uses `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage` for communication between the side panel, background script, and content scripts.
*   **Styling:** Follow the styles defined in `styles.css`. The UI supports light/dark mode based on the user's system preferences.

## Key Files

*   `manifest.json`: Extension permissions and entry points.
*   `background.js`: Context menu and window management.
*   `sidepanel.js`: The "brain" of the extension; contains the Agent loop and tool registry.
*   `content.js`: Interaction layer with the active tab.
*   `AGENT_ARCHITECTURE_NOTES.md`: Important design notes on safety and UI logic.
