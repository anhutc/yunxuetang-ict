// Content script for Course Assistant

// Log levels: 0=off, 1=errors only, 2=warnings, 3=info, 4=debug
const LOG_LEVEL = 0; // Disabled for production performance

function debugLog(level, ...args) {
    if (LOG_LEVEL === 0 || level > LOG_LEVEL) return; // Fixed logic: 0=off, or level higher than allowed
    
    const timestamp = new Date().toLocaleTimeString();
    const levelNames = ['', 'ERROR', 'WARN', 'INFO', 'DEBUG'];
    console.log(`[${timestamp}] [Content-${levelNames[level]}]`, ...args);
}

debugLog(4, 'Content script loaded');

// Module URLs
const lessonManagerURL = chrome.runtime.getURL('src/modules/lessonManager.js');
const autoLearningURL = chrome.runtime.getURL('src/modules/autoLearn.js');
const autoBackgroundURL = chrome.runtime.getURL('src/modules/autoBackground.js');

// Module functions and state
let modules = {
    lessonManager: null,
    autoLearning: null,
    autoBackground: null,
    loaded: false
};

// Module loading synchronization
let moduleLoadingPromise = null;
let isModuleLoading = false;

// Track initialization state
let isInitialized = false;
let initializationAttempts = 0;
let isInitializing = false;
const MAX_INITIALIZATION_ATTEMPTS = 3;
const INITIALIZATION_RETRY_DELAY = 2000;

// Initialize default state
let currentState = {
    autoLearn: false,
    backgroundBrowser: false
};

// Performance monitoring
const performanceMetrics = {
    initializationTime: 0,
    moduleLoadTime: 0,
    lessonExtractionTime: 0,
    lastOperationTime: 0
};

// Function to measure performance
function measurePerformance(operation, callback) {
    const startTime = performance.now();
    try {
        const result = callback();
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        performanceMetrics.lastOperationTime = duration;
        
        if (operation === 'initialization') {
            performanceMetrics.initializationTime = duration;
        } else if (operation === 'moduleLoad') {
            performanceMetrics.moduleLoadTime = duration;
        } else if (operation === 'lessonExtraction') {
            performanceMetrics.lessonExtractionTime = duration;
        }
        
        debugLog(4, `${operation} took ${duration.toFixed(2)}ms`);
        return result;
    } catch (error) {
        const endTime = performance.now();
        debugLog(1, `${operation} failed after ${(endTime - startTime).toFixed(2)}ms:`, error);
        throw error;
    }
}

// Export performance metrics for debugging
window.courseAssistantMetrics = performanceMetrics;

// Cleanup function
function cleanup() {
    debugLog(4, 'Cleaning up content script');
    try {
        // Stop any running intervals or timeouts
        if (window._stateCheckInterval) {
            clearInterval(window._stateCheckInterval);
            window._stateCheckInterval = null;
        }
        
        // Reset state
        currentState = {
            autoLearn: false,
            backgroundBrowser: false
        };
        
        // Reset module loading state
        isModuleLoading = false;
        moduleLoadingPromise = null;
        
        // Reset modules
        modules = {
            lessonManager: null,
            autoLearning: null,
            autoBackground: null,
            loaded: false
        };
        
        isInitialized = false;
        
    } catch (error) {
        debugLog(1, 'Error during cleanup:', error);
    }
}

// Check if extension context is valid
function isExtensionContextValid() {
    try {
        // Try to access chrome.runtime
        return chrome.runtime && chrome.runtime.id;
    } catch (error) {
        return false;
    }
}

// Load modules
async function loadModules() {
    if (!isExtensionContextValid()) {
        throw new Error('Extension context invalidated');
    }

    // If modules are already loaded, return immediately
    if (modules.loaded && modules.lessonManager && modules.autoLearning && modules.autoBackground) {
        debugLog(4, 'Modules already loaded, returning immediately');
        return true;
    }

    // If modules are currently being loaded, wait for the existing promise
    if (isModuleLoading && moduleLoadingPromise) {
        debugLog(4, 'Modules are currently being loaded, waiting for existing operation');
        try {
            await moduleLoadingPromise;
            return true;
        } catch (error) {
            debugLog(1, 'Waited for module loading but it failed:', error);
            throw error;
        }
    }

    // Start new module loading operation
    isModuleLoading = true;
    debugLog(4, 'Starting new module loading operation');

    // Create the loading promise
    moduleLoadingPromise = (async () => {
        try {
            debugLog(4, 'Loading modules...');
            
            // Load lessonManager first since others depend on it
            try {
                modules.lessonManager = await import(lessonManagerURL);
                if (!modules.lessonManager || !modules.lessonManager.extractLessons) {
                    throw new Error('Failed to load lessonManager module or missing extractLessons function');
                }
                debugLog(4, 'lessonManager module loaded successfully');
            } catch (error) {
                debugLog(1, 'Error loading lessonManager module:', error);
                throw new Error(`lessonManager module failed to load: ${error.message}`);
            }
            
            // Then load other modules
            try {
                [modules.autoLearning, modules.autoBackground] = await Promise.all([
                    import(autoLearningURL),
                    import(autoBackgroundURL)
                ]);
                
                if (!modules.autoLearning || !modules.autoLearning.setAutoLearningEnabled) {
                    throw new Error('Failed to load autoLearning module or missing setAutoLearningEnabled function');
                }
                if (!modules.autoBackground || !modules.autoBackground.setAutoBackgroundEnabled) {
                    throw new Error('Failed to load autoBackground module or missing setAutoBackgroundEnabled function');
                }
                
                debugLog(4, 'autoLearning and autoBackground modules loaded successfully');
            } catch (error) {
                debugLog(1, 'Error loading autoLearning/autoBackground modules:', error);
                throw new Error(`Auto modules failed to load: ${error.message}`);
            }
            
            modules.loaded = true;
            debugLog(4, 'All modules loaded successfully');

            // Notify background script that modules are loaded
            try {
                await chrome.runtime.sendMessage({
                    action: 'contentScriptReady'
                });
            } catch (error) {
                debugLog(1, 'Failed to notify background script:', error);
                // Don't throw here, modules are still loaded successfully
            }

            return true;
        } catch (error) {
            debugLog(1, 'Module loading failed:', error);
            // Reset module loading state on failure
            modules = {
                lessonManager: null,
                autoLearning: null,
                autoBackground: null,
                loaded: false
            };
            throw error;
        } finally {
            isModuleLoading = false;
            moduleLoadingPromise = null;
        }
    })();

    return moduleLoadingPromise;
}

// Function to ensure modules are loaded
async function ensureModulesLoaded() {
    if (!isExtensionContextValid()) {
        throw new Error('Extension context invalidated');
    }

    // Check if modules are already loaded
    if (modules.loaded && modules.lessonManager && modules.autoLearning && modules.autoBackground) {
        debugLog(4, 'Modules already loaded');
        return true;
    }

    // Check if modules are currently being loaded
    if (isModuleLoading && moduleLoadingPromise) {
        debugLog(4, 'Modules are currently being loaded, waiting for completion');
        try {
            await moduleLoadingPromise;
            return true;
        } catch (error) {
            debugLog(1, 'Module loading failed:', error);
            throw error;
        }
    }

    debugLog(4, 'Modules not loaded, attempting to load...');
    
    try {
        const result = await loadModules();
        if (!result) {
            throw new Error('Module loading returned false');
        }
        return true;
    } catch (error) {
        debugLog(1, 'Failed to ensure modules are loaded:', error);
        throw error;
    }
}

// Function to initialize state with retries
async function initializeState() {
    if (!isExtensionContextValid()) {
        debugLog(1, 'Extension context invalidated, aborting initialization');
        cleanup();
        return;
    }

    // Prevent multiple concurrent initializations
    if (isInitializing) {
        debugLog(4, 'Already initializing, skipping duplicate initialization');
        return;
    }

    // Don't reinitialize if already initialized successfully
    if (isInitialized) {
        debugLog(4, 'Already initialized successfully, skipping initialization');
        return;
    }

    isInitializing = true;
    debugLog(4, 'Initializing state, attempt:', initializationAttempts + 1);
    
    // Declare state variable at the beginning to prevent ReferenceError
    let state = {
        autoLearn: false,
        backgroundBrowser: false
    };
    
    // Declare lessons variable to prevent scope issues
    let lessons = [];
    
    try {
        // Load modules first
        debugLog(4, 'Loading modules...');
        try {
            const modulesLoaded = await loadModules();
            if (!modulesLoaded) {
                throw new Error('Module loading failed');
            }
        } catch (moduleError) {
            debugLog(1, 'Module loading failed:', moduleError);
            throw new Error(`Module loading failed: ${moduleError.message}`);
        }
        debugLog(4, 'All modules loaded successfully');

        // Get initial state from storage FIRST
        try {
            const result = await chrome.storage.sync.get(['autoLearn', 'backgroundBrowser']);
            debugLog(4, 'Got initial state from storage:', result);
            
            state = {
                autoLearn: result.autoLearn || false,
                backgroundBrowser: result.backgroundBrowser || false
            };
            
            currentState = { ...state };  // Set current state early
        } catch (storageError) {
            debugLog(1, 'Storage access failed:', storageError);
            // Continue with default state (already set above)
            currentState = { autoLearn: false, backgroundBrowser: false };
        }

        // Wait for lesson list before proceeding
        debugLog(4, 'Waiting for lesson list');
        try {
            const hasLessonList = await waitForLessonList();
            if (!hasLessonList) {
                debugLog(4, 'No lesson list found, will retry');
                if (initializationAttempts < MAX_INITIALIZATION_ATTEMPTS) {
                    initializationAttempts++;
                    setTimeout(initializeState, INITIALIZATION_RETRY_DELAY);
                } else {
                    debugLog(4, 'Max initialization attempts reached');
                }
                isInitializing = false;
                return;
            }
        } catch (lessonError) {
            debugLog(1, 'Error waiting for lesson list:', lessonError);
            if (initializationAttempts < MAX_INITIALIZATION_ATTEMPTS) {
                initializationAttempts++;
                setTimeout(initializeState, INITIALIZATION_RETRY_DELAY);
            }
            isInitializing = false;
            return;
        }

        // Extract lessons immediately
        try {
            lessons = await modules.lessonManager.extractLessonsAsync(5000); // Reduced from 15 to 5 seconds
            if (!lessons || lessons.length === 0) {
                debugLog(4, 'No lessons found after waiting, will retry');
                if (initializationAttempts < MAX_INITIALIZATION_ATTEMPTS) {
                    initializationAttempts++;
                    setTimeout(initializeState, INITIALIZATION_RETRY_DELAY);
                }
                isInitializing = false;
                return;
            }
        } catch (extractError) {
            debugLog(1, 'Error extracting lessons:', extractError);
            if (initializationAttempts < MAX_INITIALIZATION_ATTEMPTS) {
                initializationAttempts++;
                setTimeout(initializeState, INITIALIZATION_RETRY_DELAY);
            }
            isInitializing = false;
            return;
        }

        // Send initial lessons to background
        if (isExtensionContextValid()) {
            try {
                lessons = modules.lessonManager.extractLessons();
                debugLog(4, 'Sending initial lessons:', lessons);
                await chrome.runtime.sendMessage({
                    action: 'contentChanged',
                    lessons: lessons
                });
            } catch (messageError) {
                debugLog(1, 'Error sending initial lessons:', messageError);
                // Continue anyway, this is not critical
            }
        }
        
        // If auto-learn was enabled, start it immediately
        if (state.autoLearn) {
            debugLog(4, 'Auto-learn was previously enabled, starting immediately...');
            try {
                // First enable auto-learn
                await modules.autoLearning.setAutoLearningEnabled(true);
                
                // Then explicitly start auto-learn process
                if (typeof modules.autoLearning.startAutoLearn === 'function') {
                    debugLog(4, 'Starting auto-learn process');
                    await modules.autoLearning.startAutoLearn();
                    
                    // Find and click first unfinished lesson if needed
                    debugLog(4, 'Searching for unfinished lessons with study time...');
                    debugLog(4, 'All lessons:', lessons.map(l => ({
                        name: l.displayName,
                        type: l.type,
                        studyTime: l.studyTime,
                        status: l.status,
                        isCurrent: l.isCurrent
                    })));
                    
                    const unfinishedLesson = lessons.find(lesson => 
                        lesson.type !== 'cover' && 
                        lesson.studyTime && 
                        !['complete', 'completed', 'finish', 'finished'].includes(lesson.status)
                    );
                    
                    if (unfinishedLesson && !unfinishedLesson.isCurrent) {
                        debugLog(4, 'Found unfinished lesson to start with:', unfinishedLesson);
                        await modules.lessonManager.findAndClickLesson(unfinishedLesson);
                    } else if (unfinishedLesson) {
                        debugLog(4, 'Current lesson is already the first unfinished one');
                    } else {
                        // If no unfinished lessons with study time found, find the first lesson with study time to relearn from beginning
                        debugLog(4, 'No unfinished lessons with study time found, looking for first lesson with study time to relearn');
                        debugLog(4, 'Lessons with study time:', lessons.filter(l => l.studyTime).map(l => ({
                            name: l.displayName,
                            type: l.type,
                            studyTime: l.studyTime,
                            status: l.status
                        })));
                        
                        const firstLessonWithStudyTime = lessons.find(lesson => 
                            lesson.type !== 'cover' && 
                            lesson.studyTime
                        );
                        
                        if (firstLessonWithStudyTime && !firstLessonWithStudyTime.isCurrent) {
                            debugLog(4, 'Found first lesson with study time to relearn from beginning:', firstLessonWithStudyTime);
                            await modules.lessonManager.findAndClickLesson(firstLessonWithStudyTime);
                        } else if (firstLessonWithStudyTime) {
                            debugLog(4, 'Current lesson is already the first lesson with study time');
                        } else {
                            // If no lessons with study time found at all, fall back to any unfinished lesson
                            debugLog(4, 'No lessons with study time found, falling back to any unfinished lesson');
                            const anyUnfinishedLesson = lessons.find(lesson => 
                                lesson.type !== 'cover' && 
                                !['complete', 'completed', 'finish', 'finished'].includes(lesson.status)
                            );
                            
                            if (anyUnfinishedLesson && !anyUnfinishedLesson.isCurrent) {
                                debugLog(4, 'Found unfinished lesson without study time as fallback:', anyUnfinishedLesson);
                                await modules.lessonManager.findAndClickLesson(anyUnfinishedLesson);
                            } else if (anyUnfinishedLesson) {
                                debugLog(4, 'Current lesson is already the unfinished lesson without study time');
                            } else {
                                // If all lessons are complete, find the first lesson to relearn from beginning
                                debugLog(4, 'All lessons are complete, finding first lesson to relearn from beginning');
                                const firstLesson = lessons.find(lesson => lesson.type !== 'cover');
                                if (firstLesson && !firstLesson.isCurrent) {
                                    debugLog(4, 'Found first lesson to relearn from beginning:', firstLesson);
                                    await modules.lessonManager.findAndClickLesson(firstLesson);
                                } else if (firstLesson) {
                                    debugLog(4, 'Current lesson is already the first lesson');
                                } else {
                                    debugLog(4, 'No lessons found at all');
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                debugLog(1, 'Error starting auto-learn:', error);
            }
        }
        
        // Apply other states
        if (state.backgroundBrowser !== undefined) {
            await modules.autoBackground.setAutoBackgroundEnabled(state.backgroundBrowser);
        }
        
        isInitialized = true;
        initializationAttempts = 0;
        
        // Start observing for changes
        startObserving();
        
        // Notify background script that initialization is complete
        try {
            await chrome.runtime.sendMessage({
                action: 'contentScriptInitialized'
            });
        } catch (error) {
            debugLog(1, 'Error notifying background script of initialization:', error);
        }
        
        debugLog(4, 'Initialization complete');
        
    } catch (error) {
        debugLog(1, 'Failed to initialize state:', error);
        
        if (error.message.includes('Extension context invalidated')) {
            cleanup();
            isInitializing = false;
            return;
        }
        
        if (initializationAttempts < MAX_INITIALIZATION_ATTEMPTS) {
            initializationAttempts++;
            setTimeout(initializeState, INITIALIZATION_RETRY_DELAY);
        } else {
            debugLog(4, 'Max initialization attempts reached');
        }
    } finally {
        isInitializing = false;
    }
}

// Function to wait for video element
async function waitForVideo(timeout = 10000) {
    if (!isExtensionContextValid()) return false;
    
    debugLog(4, 'Waiting for video element');
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const video = document.querySelector('#videocontainer-vjs');
        if (video) {
            debugLog(4, 'Video element found');
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!isExtensionContextValid()) return false;
    }
    
    debugLog(4, 'Video element not found after timeout');
    return false;
}

// Function to wait for lesson list
async function waitForLessonList(timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        try {
            if (!modules.loaded) {
                await ensureModulesLoaded();
            }
            const lessons = await modules.lessonManager.extractLessonsAsync(2000);
            if (lessons && lessons.length > 0) {
                return true;
            }
        } catch (error) {
            debugLog(1, 'Error waiting for lessons:', error);
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    return false;
}

// Function to check if we're on a valid page
function isValidPage() {
    // Check URL
    if (!window.location.hostname.toLowerCase().includes('yunxuetang.cn')) {
        debugLog(4, 'Not a yunxuetang.cn page');
        return false;
    }

    // Check if we're on a course/lesson page
    const isCoursePage = window.location.href.includes('/course/') || 
                        window.location.href.includes('/kng/') ||
                        window.location.href.includes('/play') ||
                        window.location.href.includes('/learn');
    
    debugLog(4, 'Page validity check:', {
        url: window.location.href,
        isCoursePage: isCoursePage
    });
    return isCoursePage;
}

// Function to apply state
async function applyState(state) {
    if (!isExtensionContextValid()) return;
    
    debugLog(4, 'Applying state:', state);
    try {
        // Handle auto-learn state
        if (state.autoLearn !== undefined) {
            debugLog(4, 'Setting auto-learn state to:', state.autoLearn);
            await modules.autoLearning.setAutoLearningEnabled(state.autoLearn);
        }
        
        // Handle background browser state
        if (state.backgroundBrowser !== undefined) {
            await modules.autoBackground.setAutoBackgroundEnabled(state.backgroundBrowser);
        }
        
        currentState = { ...state };
    } catch (error) {
        debugLog(1, 'Error applying state:', error);
        if (error.message.includes('Extension context invalidated')) {
            cleanup();
        }
    }
}

// Listen for extension unload
window.addEventListener('beforeunload', cleanup);

// Function to check if we're on a valid domain
function isValidDomain() {
    const isValid = window.location.hostname.toLowerCase().includes('yunxuetang.cn');
    debugLog(4, 'Domain validation:', window.location.hostname, isValid ? 'valid' : 'invalid');
    return isValid;
}

// Function to start observing page changes
function startObserving() {
    try {
        if (!document.body) {
            debugLog(4, 'Body not ready, waiting...');
            setTimeout(startObserving, 100);
            return;
        }

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    try {
                        if (!isExtensionContextValid()) {
                            debugLog(4, 'Extension context invalidated in observer');
                            observer.disconnect();
                            return;
                        }
                        
                        // Only send updates if we're on a valid domain
                        if (!isValidDomain()) {
                            return;
                        }
                        
                        // Debounce the message sending
                        if (observer.timeout) {
                            clearTimeout(observer.timeout);
                        }
                        
                        observer.timeout = setTimeout(async () => {
                            try {
                                // Check if modules are loaded and we're initialized
                                if (!isInitialized) {
                                    debugLog(4, 'Modules not initialized yet, loading...');
                                    const modulesLoaded = await loadModules();
                                    if (!modulesLoaded) {
                                        debugLog(4, 'Failed to load modules in observer');
                                        return;
                                    }
                                }
                                
                                // Use retry mechanism for more reliable extraction
                                const lessons = await extractLessonsWithRetry(2, 500); // Shorter retry for observer
                                if (lessons && lessons.length > 0) {
                                    debugLog(4, 'Sending content change with lessons:', lessons.length);
                                    chrome.runtime.sendMessage({
                                        action: 'contentChanged',
                                        lessons: lessons
                                    }, response => {
                                        if (chrome.runtime.lastError) {
                                            debugLog(1, 'Content change message failed:', chrome.runtime.lastError.message);
                                        }
                                    });
                                }
                            } catch (error) {
                                debugLog(1, 'Error in observer timeout:', error);
                            }
                        }, 500); // Debounce for 500ms
                        
                    } catch (error) {
                        debugLog(1, 'Error in mutation callback:', error);
                    }
                }
            });
        });

        // Start observing with error handling
        try {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            debugLog(4, 'Started observing page changes');
        } catch (error) {
            debugLog(1, 'Failed to start observer:', error);
        }
    } catch (error) {
        debugLog(1, 'Error in startObserving:', error);
    }
}

// Function to initialize on load
async function initOnLoad() {
    try {
        debugLog(4, 'Initializing on load');
        if (!isValidPage()) {
            debugLog(4, 'Not a valid page, skipping initialization');
            return;
        }

        // Initialize state (which will also handle lesson loading)
        await initializeState();
        
        debugLog(4, 'Initial load complete');
    } catch (error) {
        debugLog(1, 'Error in initOnLoad:', error);
    }
}

// Initialize as soon as possible
if (document.readyState === 'loading') {
    debugLog(4, 'Document still loading, waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', () => {
        debugLog(4, 'DOMContentLoaded fired, initializing...');
        initOnLoad();
    });
} else {
    debugLog(4, 'Document already loaded, initializing immediately');
    initOnLoad();
}

// Also initialize when the URL changes (for single-page apps)
let lastUrl = location.href;
new MutationObserver(() => {
    if (lastUrl !== location.href) {
        lastUrl = location.href;
        if (isValidPage()) {
            debugLog(4, 'URL changed, reinitializing...');
            // Reset initialization state for new URL
            isInitialized = false;
            initializationAttempts = 0;
            initOnLoad();
        }
    }
}).observe(document, { subtree: true, childList: true });

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    debugLog(4, 'Received message:', request);
    
    (async () => {
        try {
            // Validate request structure
            if (!request || !request.action) {
                debugLog(1, 'Invalid message: missing action');
                sendResponse({ success: false, error: 'Invalid message: missing action' });
                return;
            }

            // Check extension context validity first
            if (!isExtensionContextValid()) {
                debugLog(1, 'Extension context invalid, cleaning up');
                cleanup();
                sendResponse({ success: false, error: 'Extension context invalidated' });
                return;
            }

            // Ensure modules are loaded before handling any messages
            try {
                if (!await ensureModulesLoaded()) {
                    throw new Error('Failed to load required modules');
                }
            } catch (moduleError) {
                debugLog(1, 'Module loading failed:', moduleError);
                sendResponse({ success: false, error: `Module loading failed: ${moduleError.message}` });
                return;
            }

            // Validate that all required modules are available
            if (!modules.lessonManager || !modules.autoLearning || !modules.autoBackground) {
                debugLog(1, 'Required modules not available');
                sendResponse({ success: false, error: 'Required modules not available' });
                return;
            }

            switch (request.action) {
                case "getLessons":
                    debugLog(4, 'Handling getLessons request');
                    try {
                        // Validate that we're on a valid page
                        if (!isValidPage()) {
                            debugLog(4, 'Not on a valid page for lesson extraction');
                            sendResponse({ success: false, error: 'Not on a valid page for lesson extraction' });
                            return;
                        }

                        // Use retry mechanism for more reliable extraction
                        const lessons = await extractLessonsWithRetry(3, 1000);
                        if (lessons && Array.isArray(lessons) && lessons.length > 0) {
                            debugLog(4, 'Found lessons:', lessons.length);
                            sendResponse({ success: true, lessons });
                        } else {
                            debugLog(1, 'No lessons found after retry attempts');
                            sendResponse({ success: false, error: 'No lessons found after retry attempts' });
                        }
                    } catch (error) {
                        debugLog(1, 'Error extracting lessons:', error);
                        sendResponse({ success: false, error: `Lesson extraction failed: ${error.message}` });
                    }
                    break;

                case "setState":
                    debugLog(4, 'Handling setState:', request.state);
                    try {
                        if (request.state) {
                            const state = {
                                autoLearn: request.state.autoLearn || false,
                                backgroundBrowser: request.state.backgroundBrowser || false
                            };
                            currentState = { ...state };
                            
                            if (state.autoLearn) {
                                await modules.autoLearning.setAutoLearningEnabled(true);
                            }
                            if (state.backgroundBrowser !== undefined) {
                                await modules.autoBackground.setAutoBackgroundEnabled(state.backgroundBrowser);
                            }
                            sendResponse({ success: true });
                        } else {
                            sendResponse({ success: false, error: 'Invalid state data' });
                        }
                    } catch (error) {
                        debugLog(1, 'Error setting state:', error);
                        sendResponse({ success: false, error: `State setting failed: ${error.message}` });
                    }
                    break;

                case "initializeState":
                    debugLog(4, 'Handling initializeState:', request.state);
                    try {
                        if (request.state) {
                            const state = {
                                autoLearn: request.state.autoLearn || false,
                                backgroundBrowser: request.state.backgroundBrowser || false
                            };
                            currentState = { ...state };
                            
                            if (state.autoLearn) {
                                await modules.autoLearning.setAutoLearningEnabled(true);
                                if (typeof modules.autoLearning.startAutoLearn === 'function') {
                                    debugLog(4, 'Forcing immediate auto-learn start');
                                    await modules.autoLearning.startAutoLearn();
                                }
                            }
                            if (state.backgroundBrowser !== undefined) {
                                await modules.autoBackground.setAutoBackgroundEnabled(state.backgroundBrowser);
                            }
                            sendResponse({ success: true });
                        } else {
                            sendResponse({ success: false, error: 'Invalid state data' });
                        }
                    } catch (error) {
                        debugLog(1, 'Error initializing state:', error);
                        sendResponse({ success: false, error: `State initialization failed: ${error.message}` });
                    }
                    break;

                case "updateState":
                    debugLog(4, 'Handling updateState:', request);
                    try {
                        if (!request.feature) {
                            sendResponse({ success: false, error: 'Missing feature parameter' });
                            return;
                        }

                        if (request.enabled === undefined) {
                            sendResponse({ success: false, error: 'Missing enabled parameter' });
                            return;
                        }

                        if (request.feature === 'autoLearn') {
                            debugLog(4, 'Updating auto-learn:', request.enabled);
                            await modules.autoLearning.setAutoLearningEnabled(request.enabled);
                        } else if (request.feature === 'backgroundBrowser') {
                            debugLog(4, 'Updating background playback:', request.enabled);
                            await modules.autoBackground.setAutoBackgroundEnabled(request.enabled);
                        } else {
                            sendResponse({ success: false, error: `Unknown feature: ${request.feature}` });
                            return;
                        }
                        sendResponse({ success: true });
                    } catch (error) {
                        debugLog(1, 'Error updating state:', error);
                        sendResponse({ success: false, error: `State update failed: ${error.message}` });
                    }
                    break;

                case "clickLesson":
                    debugLog(4, 'Handling clickLesson request:', request.lesson);
                    try {
                        if (!request.lesson) {
                            sendResponse({ success: false, error: 'No lesson provided' });
                            return;
                        }

                        if (!request.lesson.displayName) {
                            sendResponse({ success: false, error: 'Invalid lesson data: missing displayName' });
                            return;
                        }

                        // Validate that we're on a valid page
                        if (!isValidPage()) {
                            debugLog(4, 'Not on a valid page for lesson clicking');
                            sendResponse({ success: false, error: 'Not on a valid page for lesson clicking' });
                            return;
                        }

                        const success = await modules.lessonManager.findAndClickLesson(request.lesson);
                        sendResponse({ success: success });
                    } catch (error) {
                        debugLog(1, 'Error clicking lesson:', error);
                        sendResponse({ success: false, error: `Lesson clicking failed: ${error.message}` });
                    }
                    break;

                default:
                    debugLog(1, 'Unknown action:', request.action);
                    sendResponse({ success: false, error: `Unknown action: ${request.action}` });
                    break;
            }
        } catch (error) {
            debugLog(1, 'Error handling message:', error);
            
            // Check if it's an extension context error
            if (error.message.includes('Extension context invalidated')) {
                cleanup();
                sendResponse({ success: false, error: 'Extension context invalidated' });
            } else {
                sendResponse({ success: false, error: `Message handling failed: ${error.message}` });
            }
        }
    })();
    
    return true; // Keep the message channel open for async response
});

// Expose debug function to global scope for console debugging
if (typeof window !== 'undefined') {
    window.debugCourseAssistant = async function() {
        try {
            if (!modules.loaded) {
                await ensureModulesLoaded();
            }
            return modules.lessonManager.debugLessonExtraction();
        } catch (error) {
            debugLog(1, 'Error in debug function:', error);
            return null;
        }
    };
    
    // Also expose a simple test function
    window.testLessonExtraction = async function() {
        try {
            if (!modules.loaded) {
                await ensureModulesLoaded();
            }
            const lessons = await extractLessonsWithRetry(3, 1000);
            debugLog(4, 'Test extraction result:', lessons);
            return lessons;
        } catch (error) {
            debugLog(1, 'Error in test function:', error);
            return null;
        }
    };
    
    // Expose lesson highlighting debug function
    window.debugLessonHighlighting = async function() {
        try {
            if (!modules.loaded) {
                await ensureModulesLoaded();
            }
            return modules.lessonManager.debugLessonHighlighting();
        } catch (error) {
            debugLog(1, 'Error in highlighting debug function:', error);
            return null;
        }
    };
    
    // Expose a quick debug function
    window.debug = function() {
        console.log('Course Assistant Debug Functions:');
        console.log('- debugCourseAssistant() - Comprehensive debug information');
        console.log('- testLessonExtraction() - Test lesson extraction with retry');
        console.log('- debugLessonHighlighting() - Debug lesson highlighting');
        console.log('Run any of these functions to get detailed information.');
    };
}

// Function to extract lessons with retry mechanism
async function extractLessonsWithRetry(maxRetries = 3, retryDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            debugLog(4, `Lesson extraction attempt ${attempt}/${maxRetries}`);
            
            const lessons = modules.lessonManager.extractLessons();
            
            if (lessons && lessons.length > 0) {
                debugLog(4, `Successfully extracted ${lessons.length} lessons on attempt ${attempt}`);
                return lessons;
            } else {
                debugLog(4, `No lessons found on attempt ${attempt}`);
                
                if (attempt < maxRetries) {
                    debugLog(4, `Waiting ${retryDelay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        } catch (error) {
            debugLog(1, `Error on lesson extraction attempt ${attempt}:`, error);
            
            if (attempt < maxRetries) {
                debugLog(4, `Waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }
    
    debugLog(1, `Failed to extract lessons after ${maxRetries} attempts`);
    return [];
}

