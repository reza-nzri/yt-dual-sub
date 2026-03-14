const LOG_PREFIX = "[YT Dual Sub][bg]";

console.log(`${LOG_PREFIX} service worker loaded`, {
  time: new Date().toISOString(),
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`${LOG_PREFIX} onInstalled`, details);
});

chrome.runtime.onStartup.addListener(() => {
  console.log(`${LOG_PREFIX} onStartup fired`);
});