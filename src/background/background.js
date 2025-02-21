import * as tf from '@tensorflow/tfjs';

let tfInitialized = false;

async function initializeTensorFlow() {
  if (tfInitialized) return;
  try {
    await tf.setBackend('webgl');
    console.log('TensorFlow.js initialized with WebGL backend');
    tfInitialized = true;
  } catch (error) {
    console.error('Failed to initialize TensorFlow.js:', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  initializeTensorFlow(); // Initialize on install
});

// Ensure TF.js is ready before any content script injection
chrome.webNavigation.onCompleted.addListener(
  async (details) => {
    if (details.url.toLowerCase().endsWith('.pdf')) {
      await initializeTensorFlow();
      try {
        // First attempt: Inject into MAIN world
        await chrome.scripting.executeScript({
          target: { tabId: details.tabId },
          files: ['content.bundle.js'],
          world: 'MAIN'
        });
        console.log('Content script injected into PDF tab (MAIN world):', details.tabId);
      } catch (mainError) {
        console.warn('MAIN world injection failed, trying ISOLATED world:', mainError);
        try {
          // Fallback: Inject into ISOLATED world
          await chrome.scripting.executeScript({
            target: { tabId: details.tabId },
            files: ['content.bundle.js'],
            world: 'ISOLATED'
          });
          console.log('Content script injected into PDF tab (ISOLATED world):', details.tabId);
        } catch (isolatedError) {
          console.error('Failed to inject content script for PDF in both worlds:', isolatedError);
          chrome.tabs.sendMessage(details.tabId, {
            type: 'PDF_INJECTION_FAILED',
            message: 'PDF search unavailable. Ensure this is a downloadable PDF and try again.'
          });
        }
      }
    }
  },
  { url: [{ urlMatches: '.*\\.pdf$' }] }
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'INIT_SEARCH') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        const activeTab = tabs[0];
        await initializeTensorFlow();
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.bundle.js']
          });
        } catch (error) {
          console.warn('Content script already loaded or failed to load:', error);
        }
        chrome.tabs.sendMessage(activeTab.id, {
          type: 'START_SEARCH',
          query: request.query
        }, (response) => {
          sendResponse(response);
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    });
    return true;
  } else if (request.type === 'GET_TF_STATUS') {
    sendResponse({ initialized: tfInitialized });
    return true;
  }
});