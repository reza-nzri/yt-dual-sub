const LOG_PREFIX = '[YT Dual Sub][bg]';

console.log(`${LOG_PREFIX} service worker loaded`, {
  time: new Date().toISOString(),
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`${LOG_PREFIX} onInstalled`, details);
});

chrome.runtime.onStartup.addListener(() => {
  console.log(`${LOG_PREFIX} onStartup fired`);
});

function isYouTubeUrl(url: string | undefined): boolean {
  return Boolean(url && url.startsWith('https://www.youtube.com/'));
}

async function injectLoader(tabId: number, reason: string): Promise<void> {
  try {
    console.log(`${LOG_PREFIX} injectLoader:start`, { tabId, reason });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-loader.js'],
    });
    console.log(`${LOG_PREFIX} injectLoader:done`, { tabId, reason });
  } catch (error) {
    console.error(`${LOG_PREFIX} injectLoader:failed`, { tabId, reason, error });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!isYouTubeUrl(tab.url)) return;
  void injectLoader(tabId, 'tabs.onUpdated complete');
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!isYouTubeUrl(tab.url)) return;
    void injectLoader(activeInfo.tabId, 'tabs.onActivated');
  } catch (error) {
    console.error(`${LOG_PREFIX} tabs.onActivated failed`, error);
  }
});