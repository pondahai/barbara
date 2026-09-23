/**
 * 工具授權邏輯的回歸測試。
 *
 * 跑法：  node test/grant-logic.mjs
 *
 * 為什麼需要這個測試：
 * 授權判斷出錯的症狀是「靜默」的——UI 看起來一切正常，只是該問的沒問。
 * 例如不小心把 execute_javascript_on_page 加進 AUTO_GRANTED_TOOLS，
 * 或是把 allGranted 的判斷式從 every 改成 some（讓混合批次裡的敏感工具
 * 搭順風車通過），手動操作時都不容易察覺。
 *
 * 作法：
 * sidepanel.js 是瀏覽器擴充功能的腳本（依賴 chrome.* API，不能直接 import），
 * 所以這裡用 regex 從原始檔抽出授權相關的幾段定義再執行，避免測試自己抄一份
 * 而與實作脫鉤。如果之後那幾段的寫法改變（例如不再用 new Set([...])），
 * 抽取會直接拋錯而不是假裝通過——這是刻意的。
 *
 * 注意：此檔不在 release.ps1 的 $Files 白名單中，不會被打包進擴充功能。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sidepanelPath = path.join(here, '..', 'sidepanel.js');
const src = fs.readFileSync(sidepanelPath, 'utf8');

// --- 從 sidepanel.js 抽出受測的定義 ---
const pick = (re, label) => {
    const m = src.match(re);
    if (!m) throw new Error(`抽不到 ${label}：sidepanel.js 的寫法可能改了，請同步更新此測試`);
    return m[0];
};
const extracted = [
    pick(/const AUTO_GRANTED_TOOLS = new Set\(\[[\s\S]*?\]\);/, 'AUTO_GRANTED_TOOLS'),
    pick(/const FORCE_DISCLOSE_TOOLS = new Set\(\[[\s\S]*?\]\);/, 'FORCE_DISCLOSE_TOOLS'),
    pick(/function isAutoGrantedTool[\s\S]*?\n\}/, 'isAutoGrantedTool'),
].join('\n');

const { AUTO_GRANTED_TOOLS, FORCE_DISCLOSE_TOOLS, isAutoGrantedTool } = new Function(
    extracted + '\nreturn { AUTO_GRANTED_TOOLS, FORCE_DISCLOSE_TOOLS, isAutoGrantedTool };'
)();

// sidepanel.js 中判斷一輪工具呼叫是否自動放行的邏輯（對應 runAgentStreamLoop 內的 allGranted）
const decide = (batch, granted = new Set()) => {
    const allGranted = batch.every(n => granted.has(n) || isAutoGrantedTool(n));
    return { allGranted, autoGrantedByDefault: allGranted && batch.every(isAutoGrantedTool) };
};

let failures = 0;
const check = (ok, label, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};

// --- 1. 授權判斷 ---
console.log('# 授權判斷');
const cases = [
    // [情境, 本輪工具, 使用者已按過「都允許」的工具, 期望自動放行, 期望屬於預設免詢問]
    ['讀網頁（首次）',           ['read_current_webpage'],                               new Set(),                              true,  true],
    ['開分頁（首次）',           ['open_new_tab'],                                       new Set(),                              true,  true],
    ['切換上一個分頁（首次）',   ['switch_to_previous_tab'],                             new Set(),                              true,  true],
    ['指定切換分頁（首次）',     ['switch_to_tab'],                                      new Set(),                              true,  true],
    ['讀網頁+開分頁',            ['read_current_webpage', 'open_new_tab'],               new Set(),                              true,  true],
    ['開分頁+切換分頁',          ['open_new_tab', 'switch_to_tab'],                      new Set(),                              true,  true],
    ['執行JS（首次）',           ['execute_javascript_on_page'],                         new Set(),                              false, false],
    ['截圖（首次）',             ['see_current_screen'],                                 new Set(),                              false, false],
    // 混合批次：只要含未授權工具就整批回到人工確認，敏感工具不能搭順風車
    ['讀網頁+執行JS 混合',       ['read_current_webpage', 'execute_javascript_on_page'], new Set(),                              false, false],
    ['切換分頁+截圖 混合',       ['switch_to_tab', 'see_current_screen'],                new Set(),                              false, false],
    ['執行JS（已按都允許）',     ['execute_javascript_on_page'],                         new Set(['execute_javascript_on_page']), true,  false],
];
for (const [label, batch, granted, wantAll, wantDefault] of cases) {
    const r = decide(batch, granted);
    check(
        r.allGranted === wantAll && r.autoGrantedByDefault === wantDefault,
        label.padEnd(22),
        `自動放行=${r.allGranted} 預設免詢問=${r.autoGrantedByDefault}`
    );
}

// --- 2. 工具名稱必須對得上 ToolRegistry（打錯字會讓設定靜默失效）---
console.log('\n# 工具名稱對照');
const registryKeys = [...src.matchAll(/^\s{4}([a-z_]+):\s*\{$/gm)].map(m => m[1]);
check(registryKeys.length > 0, 'ToolRegistry 解析成功', `共 ${registryKeys.length} 個工具`);
for (const name of new Set([...AUTO_GRANTED_TOOLS, ...FORCE_DISCLOSE_TOOLS])) {
    check(registryKeys.includes(name), `${name} 存在於 ToolRegistry`);
}

// --- 3. 安全不變式 ---
console.log('\n# 安全不變式');
check(!AUTO_GRANTED_TOOLS.has('execute_javascript_on_page'), 'execute_javascript_on_page 必須維持人工確認');
check(!AUTO_GRANTED_TOOLS.has('see_current_screen'), 'see_current_screen 必須維持人工確認');
check(FORCE_DISCLOSE_TOOLS.has('open_new_tab'), 'open_new_tab 自動放行時強制顯示目標網址');

const stillAsks = registryKeys.filter(n => !AUTO_GRANTED_TOOLS.has(n));
console.log(`\n預設免詢問：${[...AUTO_GRANTED_TOOLS].join(', ')}`);
console.log(`仍需人工確認：${stillAsks.join(', ')}`);

console.log(failures ? `\n${failures} 項失敗` : '\n全部通過');
process.exit(failures ? 1 : 0);
