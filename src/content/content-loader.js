(() => {
  const LOG_PREFIX = '[YT Dual Sub][content-loader]';

  if (window.__ytDualSubLoaderInjected) {
    console.log(`${LOG_PREFIX} already injected, skipping`);
    return;
  }

  window.__ytDualSubLoaderInjected = true;
  const moduleUrl = chrome.runtime.getURL('content.js');

  console.log(`${LOG_PREFIX} importing module`, { moduleUrl });

  import(moduleUrl)
    .then(() => {
      console.log(`${LOG_PREFIX} module imported`);
    })
    .catch((error) => {
      console.error(`${LOG_PREFIX} failed to import content module`, error);
    });
})();
