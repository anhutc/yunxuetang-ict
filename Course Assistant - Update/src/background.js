// Background script for Course Assistant

// Debug flag - set to false to disable all logging for better performance
const DEBUG_MODE = false; // Disabled for production performance

// Debug logging function
function debugLog(...args) {
    if (DEBUG_MODE) {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timestamp = `${hours}:${minutes}:${seconds}`;
        console.log(`[${timestamp}] [BackgroundScript]`, ...args);
    }
}

debugLog('Background script loaded');

// Track initialization state to prevent duplicates
const initializationTracker = new Map(); // tabId -> { isInitializing: boolean, lastAttempt: number }
const INITIALIZATION_COOLDOWN = 5000; // 5 seconds between initialization attempts

// Helper function to check if initialization is needed
function shouldInitializeTab(tabId) {
    const tracker = initializationTracker.get(tabId);
    const now = Date.now();
    
    if (!tracker) {
        return true; // First time initializing this tab
    }
    
    // Check if we're already initializing
    if (tracker.isInitializing) {
        debugLog(`Tab ${tabId} is already being initialized, skipping`);
        return false;
    }
    
    // Check if enough time has passed since last attempt
    if (now - tracker.lastAttempt < INITIALIZATION_COOLDOWN) {
        debugLog(`Tab ${tabId} was recently initialized, skipping (cooldown)`);
        return false;
    }
    
    return true;
}

// Helper function to mark initialization start
function markInitializationStart(tabId) {
    initializationTracker.set(tabId, {
        isInitializing: true,
        lastAttempt: Date.now()
    });
}

// Helper function to mark initialization complete
function markInitializationComplete(tabId) {
    const tracker = initializationTracker.get(tabId);
    if (tracker) {
        tracker.isInitializing = false;
        tracker.lastAttempt = Date.now();
    }
}

// Helper function to clean up tracker for closed tabs
function cleanupTabTracker(tabId) {
    if (initializationTracker.has(tabId)) {
        debugLog(`Cleaning up tracker for tab ${tabId}`);
        initializationTracker.delete(tabId);
    }
}

// Initialize default state
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(['autoLearn'], (result) => {
        const defaultState = {
            autoLearn: result.autoLearn !== undefined ? result.autoLearn : false
        };
        
        chrome.storage.sync.set(defaultState, () => {
            debugLog('Initial state set:', defaultState);
        });
    });
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.autoLearn) {
        debugLog('autoLearn state changed:', changes.autoLearn);
    }
});

// Single consolidated message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    debugLog('Message received:', request);
    
    try {
        switch (request.action) {
            case 'getState':
                chrome.storage.sync.get(['autoLearn'], (result) => {
                    const state = {
                        autoLearn: result.autoLearn !== undefined ? result.autoLearn : false
                    };
                    debugLog('Sending state:', state);
                    sendResponse(state);
                });
                return true;
                
            case 'setState':
                if (request.feature === 'autoLearn') {
                    chrome.storage.sync.set({ autoLearn: request.enabled }, () => {
                        debugLog('autoLearn state updated:', request.enabled);
                        sendResponse({ success: true });
                    });
                    return true;
                }
                break;
                
            case 'updateLessons':
                chrome.storage.local.set({ lessons: request.lessons }, () => {
                    if (chrome.runtime.lastError) {
                        debugLog('Storage set failed:', chrome.runtime.lastError.message);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                        return;
                    }
                    // Notify the popup to update if it's open
                    chrome.runtime.sendMessage({
                        action: 'lessonsUpdated',
                        lessons: request.lessons
                    }).catch(error => {
                        debugLog('Error sending update message:', error);
                    });
                    sendResponse({ success: true });
                });
                return true;
                
            case 'keepAlive':
                sendResponse({ status: 'alive' });
                return true;
                
            case 'contentScriptReady':
                // Content script is ready and initialized
                if (sender.tab && sender.tab.id) {
                    debugLog(`Content script in tab ${sender.tab.id} reports ready`);
                    markInitializationComplete(sender.tab.id);
                }
                sendResponse({ success: true });
                return true;
                
            case 'contentScriptInitialized':
                // Content script has completed initialization
                if (sender.tab && sender.tab.id) {
                    debugLog(`Content script in tab ${sender.tab.id} reports initialized`);
                    markInitializationComplete(sender.tab.id);
                }
                sendResponse({ success: true });
                return true;
        }
    } catch (error) {
        debugLog('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    }
    
    return false;
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('yunxuetang.cn')) {
        debugLog(`Tab ${tabId} updated, checking if initialization is needed`);
        
        // Check if we should initialize this tab
        if (!shouldInitializeTab(tabId)) {
            return; // Skip initialization
        }
        
        // Mark initialization as started
        markInitializationStart(tabId);
        
        debugLog(`Tab ${tabId} updated, initializing state`);
        chrome.storage.sync.get(['autoLearn'], (result) => {
            const state = {
                autoLearn: result.autoLearn !== undefined ? result.autoLearn : false
            };
            debugLog('Sending initializeState to updated tab:', state);
            
            // Send initialization message
            chrome.tabs.sendMessage(tabId, { 
                action: 'initializeState',
                state: state
            }).then(() => {
                debugLog(`Initialization message sent successfully to tab ${tabId}`);
                markInitializationComplete(tabId);
            }).catch(error => {
                debugLog('Error sending initializeState:', error);
                markInitializationComplete(tabId);
                
                // Retry after a short delay if content script might not be ready
                setTimeout(() => {
                    if (shouldInitializeTab(tabId)) {
                        debugLog(`Retrying initialization for tab ${tabId}`);
                        markInitializationStart(tabId);
                        chrome.tabs.sendMessage(tabId, { 
                            action: 'initializeState',
                            state: state
                        }).then(() => {
                            debugLog(`Retry successful for tab ${tabId}`);
                            markInitializationComplete(tabId);
                        }).catch(retryError => {
                            debugLog(`Retry failed for tab ${tabId}:`, retryError);
                            markInitializationComplete(tabId);
                        });
                    }
                }, 1000);
            });
        });
    }
});

// Listen for tab removal to clean up tracker
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    cleanupTabTracker(tabId);
});

// Periodic cleanup of stale trackers (every 10 minutes)
let cleanupInterval = setInterval(() => {
    const now = Date.now();
    const staleThreshold = 30 * 60 * 1000; // 30 minutes
    
    for (const [tabId, tracker] of initializationTracker.entries()) {
        if (now - tracker.lastAttempt > staleThreshold) {
            debugLog(`Cleaning up stale tracker for tab ${tabId}`);
            initializationTracker.delete(tabId);
        }
    }
}, 10 * 60 * 1000); // Check every 10 minutes

// Listen for extension unload to clean up all trackers and intervals
chrome.runtime.onSuspend.addListener(() => {
    debugLog('Extension suspending, cleaning up all trackers and intervals');
    initializationTracker.clear();
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
});
