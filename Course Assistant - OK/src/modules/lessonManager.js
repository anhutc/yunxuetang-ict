// Lesson management functionality

// Log levels: 0=off, 1=errors only, 2=warnings, 3=info, 4=debug
const LOG_LEVEL = 0; // Disabled for production performance

function debugLog(level, ...args) {
    if (LOG_LEVEL === 0 || level > LOG_LEVEL) return; // Fixed logic: 0=off, or level higher than allowed
    
    const timestamp = new Date().toLocaleTimeString();
    const levelNames = ['', 'ERROR', 'WARN', 'INFO', 'DEBUG'];
    console.log(`[${timestamp}] [LessonManager-${levelNames[level]}]`, ...args);
}

// Check if extension context is valid
function isExtensionContextValid() {
    try {
        return chrome.runtime && chrome.runtime.id;
    } catch (error) {
        return false;
    }
}

// Helper function to determine lesson type
function determineType(container, svgIcon) {
    // Check for cover type first
    if (
        container.classList.toString().includes('cover') ||
        container.classList.toString().includes('chapter-header') ||
        container.classList.toString().includes('section-header') ||
        container.querySelector('[class*="cover"]') ||
        container.querySelector('[class*="chapter-header"]') ||
        container.querySelector('[class*="section-header"]') ||
        (svgIcon && svgIcon.classList.toString().includes('cover'))
    ) {
        return 'cover';
    }
    
    // Check for video type
    if (
        (svgIcon && (
            svgIcon.innerHTML.includes('survey-video-id-0') ||
            svgIcon.innerHTML.includes('video') ||
            svgIcon.classList.toString().includes('video')
        )) ||
        container.classList.toString().includes('video') ||
        container.querySelector('[class*="video"]')
    ) {
        return 'video';
    }
    
    // Check for quiz/test type
    if (
        container.classList.toString().includes('quiz') ||
        container.classList.toString().includes('test') ||
        container.querySelector('[class*="quiz"]') ||
        container.querySelector('[class*="test"]')
    ) {
        return 'quiz';
    }
    
    // Default to document type
    return 'document';
}

// Helper function to check if lesson is highlighted/active
function isLessonHighlighted(nameElement, container) {
    // More comprehensive detection of highlighted/active lessons
    const highlightedIndicators = [
        // Primary color classes
        nameElement.classList.contains('color-primary-6'),
        nameElement.classList.contains('color-primary'),
        nameElement.classList.contains('primary-color'),
        
        // Active state classes
        container.classList.contains('active'),
        container.classList.contains('current-lesson'),
        container.classList.contains('current'),
        container.classList.contains('selected'),
        container.classList.contains('playing'),
        container.classList.contains('current-playing'),
        
        // Name element active states
        nameElement.classList.contains('active'),
        nameElement.classList.contains('current'),
        nameElement.classList.contains('selected'),
        nameElement.classList.contains('playing'),
        
        // Check for active states in class strings
        container.classList.toString().includes('active'),
        container.classList.toString().includes('current'),
        container.classList.toString().includes('selected'),
        container.classList.toString().includes('playing'),
        nameElement.classList.toString().includes('active'),
        nameElement.classList.toString().includes('current'),
        nameElement.classList.toString().includes('selected'),
        nameElement.classList.toString().includes('playing'),
        
        // Check for specific yunxuetang classes
        container.classList.contains('yxtulcdsdk-course-player__chapter-item--active'),
        container.classList.contains('yxtulcdsdk-course-player__lesson-item--active'),
        container.classList.contains('yxtulcdsdk-course-page__chapter-item--active'),
        
        // Check for playing indicators
        container.querySelector('.playing-indicator'),
        container.querySelector('.current-indicator'),
        container.querySelector('.active-indicator'),
        
        // Check for specific attributes
        container.getAttribute('data-active') === 'true',
        container.getAttribute('data-current') === 'true',
        container.getAttribute('data-selected') === 'true',
        
        // Check for background color indicating active state
        (() => {
            const computedStyle = window.getComputedStyle(container);
            const bgColor = computedStyle.backgroundColor;
            // Check if background color indicates active state (blue tones)
            return bgColor.includes('rgb(24, 144, 255)') || 
                   bgColor.includes('rgb(64, 169, 255)') ||
                   bgColor.includes('rgba(24, 144, 255') ||
                   bgColor.includes('rgba(64, 169, 255');
        })()
    ];
    
    const isHighlighted = highlightedIndicators.some(indicator => indicator);
    
    // Debug logging for highlighted lessons
    if (isHighlighted) {
        debugLog(4, `Lesson "${nameElement.textContent.trim()}" is highlighted:`, {
            containerClasses: container.className,
            nameElementClasses: nameElement.className,
            containerAttributes: {
                'data-active': container.getAttribute('data-active'),
                'data-current': container.getAttribute('data-current'),
                'data-selected': container.getAttribute('data-selected')
            }
        });
    }
    
    return isHighlighted;
}

// Helper function to extract study time
function extractStudyTime(container) {
    const timeSelectors = [
        '.yxtulcdsdk-course-page__chapter-content .ml36.ellipsis:nth-child(2)',
        '.study-time',
        '.duration'
    ];
    
    for (const selector of timeSelectors) {
        const timeElement = container.querySelector(selector);
        if (timeElement) {
            return timeElement.textContent.replace(/[^0-9.]/g, '').trim();
        }
    }
    
    return '';
}

// Helper function to determine lesson status
function determineStatus(container) {
    // Check for status text in dedicated status elements
    const statusElements = container.querySelectorAll(
        '.status, .status-text, .completion-status, .lesson-status, .yxtulcdsdk-course-page__chapter-status, .yxtulcdsdk-course-player__chapter-status'
    );
    
    for (const element of statusElements) {
        const statusText = element.textContent.trim().toLowerCase();
        
        // Check for completion status
        if (statusText.includes('已完成') || 
            statusText.includes('完成') || 
            statusText.includes('complete') || 
            statusText.includes('completed') ||
            statusText.includes('100%')) {
            return 'complete';
        }
        
        // Check for in-progress status
        if (statusText.includes('进行中') || 
            statusText.includes('学习中') || 
            statusText.includes('in progress') || 
            statusText.includes('learning') ||
            (statusText.includes('%') && !statusText.includes('100%'))) {
            return 'in-progress';
        }
        
        // Check for locked status
        if (statusText.includes('锁定') || 
            statusText.includes('未解锁') || 
            statusText.includes('locked') || 
            statusText.includes('unavailable')) {
            return 'locked';
        }
    }
    
    // Check for completion status using icons and classes
    if (container.querySelector('.completed-icon, .icon-complete, .status-complete, .yxtulcdsdk-course-player__chapter-status--completed') ||
        container.classList.contains('completed') ||
        container.querySelector('.yxt-svg-icon.color-gray-6')?.innerHTML.includes('M10 2.25c2.14 0 4.078.867 5.48 2.27') ||
        container.querySelector('[class*="completed"]')) {
        return 'complete';
    }
    
    // Check for in-progress status using icons and classes
    if (container.querySelector('button.yxtf-button--primary, .in-progress-icon, .icon-learning, .yxtulcdsdk-course-player__chapter-status--learning') ||
        container.classList.contains('in-progress') ||
        container.querySelector('.progress-indicator, .progress-bar') ||
        container.querySelector('[class*="progress"]')) {
        return 'in-progress';
    }
    
    // Check for locked status using icons and classes
    if (container.querySelector('.yxtulcdsdk-course-page__chapter-lock, .lock-icon, .icon-locked') ||
        container.classList.contains('locked') ||
        container.querySelector('.status-locked, .locked-indicator') ||
        container.querySelector('[class*="lock"]')) {
        return 'locked';
    }

    // Check for progress percentage
    const progressElements = container.querySelectorAll('[class*="progress"], [class*="percent"]');
    for (const element of progressElements) {
        const text = element.textContent.trim();
        if (text.includes('%')) {
            const percentage = parseInt(text.match(/\d+/)?.[0] || '0');
            if (percentage === 100) {
                return 'complete';
            } else if (percentage > 0) {
                return 'in-progress';
            }
        }
    }
    
    // Default to not-started
    return 'not-started';
}

// Click lesson function
export async function findAndClickLesson(lesson) {
    if (!isExtensionContextValid()) {
        throw new Error('Extension context invalidated');
    }

    if (!lesson || !lesson.displayName) {
        debugLog(1, 'Invalid lesson object provided:', lesson);
        return false;
    }

    debugLog(4, 'Attempting to find and click lesson:', lesson.displayName);

    try {
        // Find the lesson element by name and type
        const lessonElements = document.querySelectorAll([
            '.yxtulcdsdk-course-page__chapter-item',
            '.yxtulcdsdk-course-player__chapter-item',
            '.chapter-item',
            '.lesson-item',
            '.yxtulcdsdk-course-player__chapter-item',
            '.yxtulcdsdk-course-player__lesson-item',
            '[class*="chapter-item"]',
            '[class*="lesson-item"]',
            '.yxtulcdsdk-course-player__chapter-list-item',
            '.yxtulcdsdk-course-player__lesson-list-item',
            '[class*="chapter-list-item"]',
            '[class*="lesson-list-item"]'
        ].join(', '));

        debugLog(4, `Found ${lessonElements.length} lesson elements to search through`);

        let targetElement = null;
        for (const element of lessonElements) {
            const nameElement = element.querySelector([
                '.yxtulcdsdk-flex-1.ml12.ellipsis',
                '.lesson-name',
                '.title',
                '.yxtulcdsdk-course-player__chapter-title',
                '.yxtulcdsdk-course-player__lesson-title',
                '[class*="title"]',
                '[class*="name"]',
                '[class*="text"]'
            ].join(', '));

            if (nameElement && nameElement.textContent.trim() === lesson.displayName) {
                // Verify type matches if provided
                if (lesson.type) {
                    const svgIcon = element.querySelector([
                        '.yxtulcdsdk-flex-shrink-0.yxtf-svg-icon',
                        '.icon-video',
                        '.icon-quiz',
                        '.yxtulcdsdk-course-player__chapter-icon',
                        '.yxtulcdsdk-course-player__lesson-icon',
                        '[class*="icon-"]',
                        '[class*="video"]',
                        '[class*="quiz"]'
                    ].join(', '));
                    const elementType = determineType(element, svgIcon);
                    if (elementType === lesson.type) {
                        targetElement = element;
                        break;
                    }
                } else {
                    targetElement = element;
                    break;
                }
            }
        }

        if (!targetElement) {
            return false;
        }

        // Try to click the found element
        const clicked = await clickLessonElement(targetElement);
        if (clicked) {
            // Wait a bit to let any animations/transitions complete
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Check for and click next chapter button if present
            await findAndClickNextChapterButton();
            
            // Verify the lesson was actually selected
            const lessons = extractLessons();
            const clickedLesson = lessons.find(l => l.displayName === lesson.displayName);
            if (clickedLesson && clickedLesson.isCurrent) {
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
            throw error;
        }
        return false;
    }
}

// Helper function to click lesson element
async function clickLessonElement(element) {
    if (!isExtensionContextValid()) {
        throw new Error('Extension context invalidated');
    }

    // Try clicking parent elements first
    let current = element;
    let maxAttempts = 3;
    let clicked = false;

    // First try the element itself and its children
    const clickableElements = [
        element,
        ...element.querySelectorAll('a, button, [role="button"], [tabindex], [class*="clickable"], [class*="selectable"], [class*="title"], [class*="name"]')
    ];

    for (const clickable of clickableElements) {
        if (await simulateClick(clickable)) {
            clicked = true;
            // Wait a bit to see if the click had an effect
            await new Promise(resolve => setTimeout(resolve, 100));
            break;
        }
    }

    // If that didn't work, try parent elements
    if (!clicked) {
        while (current && maxAttempts > 0) {
            if (await simulateClick(current)) {
                clicked = true;
                // Wait a bit to see if the click had an effect
                await new Promise(resolve => setTimeout(resolve, 100));
                break;
            }
            current = current.parentElement;
            maxAttempts--;
        }
    }

    // If still not clicked, try force click on any element with a click-like class
    if (!clicked) {
        const potentialClickables = element.querySelectorAll('[class*="click"], [class*="select"], [class*="lesson"], [class*="chapter"]');
        for (const clickable of potentialClickables) {
            if (await simulateClick(clickable)) {
                clicked = true;
                // Wait a bit to see if the click had an effect
                await new Promise(resolve => setTimeout(resolve, 100));
                break;
            }
        }
    }

    return clicked;
}

// Helper function to simulate click
async function simulateClick(element) {
    try {
        // Try direct click first
        element.click();
        return true;
    } catch (error) {
        try {
            // Try MouseEvent click
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(clickEvent);

            // Also try mousedown/mouseup events
            const mouseDownEvent = new MouseEvent('mousedown', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            const mouseUpEvent = new MouseEvent('mouseup', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            
            element.dispatchEvent(mouseDownEvent);
            element.dispatchEvent(mouseUpEvent);
            
            return true;
        } catch (error) {
            return false;
        }
    }
}

// Helper function to check if page is ready for lesson extraction
function isPageReadyForLessonExtraction() {
    try {
        // Check if document is ready
        if (document.readyState !== 'complete') {
            debugLog(4, 'Document not ready, current state:', document.readyState);
            return false;
        }

        // Check if body exists and has content
        if (!document.body || document.body.children.length === 0) {
            debugLog(1, 'Body not ready or empty');
            return false;
        }

        // Check if we're on a valid yunxuetang page
        if (!window.location.hostname.includes('yunxuetang.cn')) {
            debugLog(1, 'Not on yunxuetang.cn domain');
            return false;
        }

        // Check for common yunxuetang page indicators (more flexible)
        const pageIndicators = [
            '.yxtulcdsdk-course-page',
            '.yxtulcdsdk-course-player',
            '.course-content',
            '.lesson-list',
            '.chapter-list',
            '[class*="course"]',
            '[class*="lesson"]',
            '[class*="chapter"]',
            '.yxtulcdsdk', // More general yunxuetang indicator
            '.yxtf-' // Another common prefix
        ];

        const hasPageIndicator = pageIndicators.some(selector => {
            try {
                return document.querySelector(selector) !== null;
            } catch (error) {
                return false;
            }
        });

        if (!hasPageIndicator) {
            debugLog(4, 'No yunxuetang page indicators found');
            return false;
        }

        // More flexible loading check - only block if there are obvious loading indicators
        const blockingLoadingIndicators = [
            '.yxtf-loading',
            '.yxt-loading',
            '.loading-spinner',
            '.page-loading',
            '[class*="loading-spinner"]',
            '[class*="page-loading"]'
        ];

        const hasBlockingLoadingIndicator = blockingLoadingIndicators.some(selector => {
            try {
                const element = document.querySelector(selector);
                return element && (
                    element.style.display !== 'none' && 
                    element.style.visibility !== 'hidden' &&
                    getComputedStyle(element).display !== 'none'
                );
            } catch (error) {
                return false;
            }
        });

        if (hasBlockingLoadingIndicator) {
            debugLog(4, 'Page has blocking loading indicators, waiting...');
            return false;
        }

        debugLog(4, 'Page is ready for lesson extraction');
        return true;
    } catch (error) {
        debugLog(1, 'Error checking page readiness:', error);
        return false;
    }
}

// Cache for lesson extraction to improve performance
let lessonCache = {
    data: null,
    timestamp: 0,
    cacheDuration: 2000 // 2 seconds cache
};

// Function to check if cache is valid
function isCacheValid() {
    return lessonCache.data && 
           (Date.now() - lessonCache.timestamp) < lessonCache.cacheDuration;
}

// Function to clear cache
function clearLessonCache() {
    lessonCache.data = null;
    lessonCache.timestamp = 0;
}

// Export function to extract lessons with caching
export function extractLessons() {
    try {
        // Check cache first
        if (isCacheValid()) {
            debugLog(4, 'Returning cached lessons');
            return lessonCache.data;
        }

        debugLog(4, 'Extracting lessons from DOM...');
        
        // Check if page is ready, but don't fail immediately if not
        const isPageReady = isPageReadyForLessonExtraction();
        if (!isPageReady) {
            debugLog(4, 'Page readiness check failed, but attempting extraction anyway');
        }

        const lessons = [];
        // Updated selector to match more variations of lesson items
        let lessonElements = document.querySelectorAll([
            '.yxtulcdsdk-course-page__chapter-item',
            '.yxtulcdsdk-course-player__chapter-item',
            '.chapter-item',
            '.lesson-item',
            '.yxtulcdsdk-course-player__chapter-item',
            '.yxtulcdsdk-course-player__lesson-item',
            '[class*="chapter-item"]',
            '[class*="lesson-item"]',
            '.yxtulcdsdk-course-player__chapter-list-item',
            '.yxtulcdsdk-course-player__lesson-list-item',
            '[class*="chapter-list-item"]',
            '[class*="lesson-list-item"]'
        ].join(', '));
        
        debugLog(4, `Found ${lessonElements.length} lesson elements`);
        
        // If no lesson elements found, try alternative selectors
        if (lessonElements.length === 0) {
            debugLog(4, 'No lesson elements found with primary selectors, trying alternatives...');
            
            // Try more general selectors
            const alternativeSelectors = [
                '[class*="course"]',
                '[class*="lesson"]',
                '[class*="chapter"]',
                '.yxtulcdsdk-course-player *',
                '.yxtulcdsdk-course-page *'
            ];
            
            for (const selector of alternativeSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0 && elements.length < 100) {
                        debugLog(4, `Found ${elements.length} elements with alternative selector: ${selector}`);
                        // Use these elements instead
                        lessonElements = elements;
                        break;
                    }
                } catch (error) {
                    debugLog(4, `Alternative selector failed: ${selector}`, error);
                }
            }
        }
        
        // Additional validation: ensure we have a reasonable number of lessons
        if (lessonElements.length === 0) {
            debugLog(1, 'No lesson elements found with any selector');
            // Log page state for debugging
            debugLog(4, 'Page state for debugging:', {
                readyState: document.readyState,
                bodyChildren: document.body ? document.body.children.length : 0,
                hostname: window.location.hostname,
                url: window.location.href,
                pageReady: isPageReady
            });
            return [];
        }

        // If we have too many elements, it might indicate a selector issue
        if (lessonElements.length > 1000) {
            debugLog(1, 'Suspiciously high number of lesson elements found:', lessonElements.length);
            return [];
        }
        
        lessonElements.forEach((container, index) => {
            if (!isExtensionContextValid()) {
                throw new Error('Extension context invalidated');
            }

            // Validate container element
            if (!container || !container.nodeType || container.nodeType !== Node.ELEMENT_NODE) {
                debugLog(1, `Lesson ${index}: Invalid container element, skipping`);
                return;
            }

            // Get the type based on the SVG icon or class names
            const svgIcon = container.querySelector([
                '.yxtulcdsdk-flex-shrink-0.yxtf-svg-icon',
                '.icon-video',
                '.icon-quiz',
                '.yxtulcdsdk-course-player__chapter-icon',
                '.yxtulcdsdk-course-player__lesson-icon',
                '[class*="icon-"]',
                '[class*="video"]',
                '[class*="quiz"]'
            ].join(', '));
            const type = determineType(container, svgIcon);
            
            // Get the lesson name from various possible elements
            const nameElement = container.querySelector([
                '.yxtulcdsdk-flex-1.ml12.ellipsis',
                '.lesson-name',
                '.title',
                '.yxtulcdsdk-course-player__chapter-title',
                '.yxtulcdsdk-course-player__lesson-title',
                '[class*="title"]',
                '[class*="name"]',
                '[class*="text"]'
            ].join(', '));
            
            if (!nameElement) {
                debugLog(1, `Lesson ${index}: No name element found, skipping`);
                return;
            }

            const name = nameElement.textContent.trim();
            
            // Validate lesson name
            if (!name || name.length === 0) {
                debugLog(1, `Lesson ${index}: Empty lesson name, skipping`);
                return;
            }

            if (name.length > 500) {
                debugLog(1, `Lesson ${index}: Lesson name too long (${name.length} chars), skipping`);
                return;
            }
            
            // Check if the lesson is highlighted/active
            const isHighlighted = isLessonHighlighted(nameElement, container);
            
            // Get study time from various possible elements
            const studyTime = extractStudyTime(container);
            
            // Determine status based on multiple indicators
            const status = determineStatus(container);
            
            lessons.push({
                type,
                displayName: name,
                studyTime,
                status,
                isHighlighted,
                element: container,
                isCurrent: isHighlighted
            });
        });
        
        debugLog(4, `Successfully extracted ${lessons.length} lessons`);
        
        // Final validation: ensure we extracted at least some lessons
        if (lessons.length === 0) {
            debugLog(1, 'No valid lessons extracted despite finding lesson elements');
        }
        
        // Cache the result
        lessonCache.data = lessons;
        lessonCache.timestamp = Date.now();
        
        return lessons;
    } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
            debugLog(1, 'Extension context invalidated during lesson extraction');
            throw error;
        }
        debugLog(1, 'Error extracting lessons:', error);
        return [];
    }
}

// Helper function to find and click next chapter button
async function findAndClickNextChapterButton() {
    if (!isExtensionContextValid()) {
        throw new Error('Extension context invalidated');
    }

    debugLog(4, 'Looking for next chapter button');

    try {
        // Find the next chapter button
        const nextChapterButton = document.querySelector('.ulcdsdk-nextchapterbutton');
        
        if (nextChapterButton) {
            debugLog(4, 'Found next chapter button, attempting to click');
            // Try to click the button
            try {
                nextChapterButton.click();
                debugLog(4, 'Successfully clicked next chapter button');
                return true;
            } catch (error) {
                debugLog(1, 'Error clicking next chapter button:', error);
                return false;
            }
        } else {
            debugLog(4, 'Next chapter button not found');
            return false;
        }
    } catch (error) {
        debugLog(1, 'Error finding next chapter button:', error);
        return false;
    }
}

// Async version of extractLessons that waits for page readiness
export async function extractLessonsAsync(timeout = 3000) {
    if (!isExtensionContextValid()) {
        throw new Error('Extension context invalidated');
    }

    debugLog(4, 'Starting fast async lesson extraction');
    
    // First try: Immediate extraction (fastest)
    debugLog(4, 'Trying immediate extraction');
    const immediateLessons = extractLessons();
    if (immediateLessons && immediateLessons.length > 0) {
        debugLog(4, 'Immediate extraction successful');
        return immediateLessons;
    }
    
    // Second try: Quick page readiness check (faster timeout)
    debugLog(4, 'Immediate extraction failed, trying quick page readiness check');
    const isReady = await waitForPageReady(Math.min(timeout, 2000)); // Max 2 seconds for readiness
    if (isReady) {
        debugLog(4, 'Page is ready, extracting lessons');
        const lessons = extractLessons();
        if (lessons && lessons.length > 0) {
            return lessons;
        }
    }
    
    // Third try: Short delay and try again (only if we have time left)
    const remainingTime = timeout - 2000;
    if (remainingTime > 500) {
        debugLog(4, 'Quick retry after short delay');
        await new Promise(resolve => setTimeout(resolve, 500));
        const delayedLessons = extractLessons();
        if (delayedLessons && delayedLessons.length > 0) {
            debugLog(4, 'Delayed extraction successful');
            return delayedLessons;
        }
    }
    
    debugLog(4, 'All extraction attempts failed');
    return [];
}

// Export the function so it can be used by other modules
export { findAndClickNextChapterButton };

// Helper function to wait for page readiness with timeout
export async function waitForPageReady(timeout = 3000) {
    const startTime = Date.now();
    const checkInterval = 200; // Check every 200ms (faster than 500ms)
    
    debugLog(4, 'Waiting for page to be ready for lesson extraction');
    
    while (Date.now() - startTime < timeout) {
        if (isPageReadyForLessonExtraction()) {
            debugLog(4, 'Page is ready for lesson extraction');
            return true;
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    debugLog(4, 'Timeout waiting for page readiness');
    return false;
}

// Debug function to help diagnose lesson extraction issues
export function debugLessonExtraction() {
    console.log('=== Course Assistant Debug Information ===');
    console.log('Page URL:', window.location.href);
    console.log('Document ready state:', document.readyState);
    console.log('Body children count:', document.body ? document.body.children.length : 'No body');
    console.log('Hostname:', window.location.hostname);
    
    // Check page indicators
    const pageIndicators = [
        '.yxtulcdsdk-course-page',
        '.yxtulcdsdk-course-player',
        '.course-content',
        '.lesson-list',
        '.chapter-list',
        '[class*="course"]',
        '[class*="lesson"]',
        '[class*="chapter"]',
        '.yxtulcdsdk',
        '.yxtf-'
    ];
    
    console.log('=== Page Indicators ===');
    pageIndicators.forEach(selector => {
        const element = document.querySelector(selector);
        console.log(`${selector}: ${element ? 'FOUND' : 'NOT FOUND'}`);
    });
    
    // Check loading indicators
    const loadingIndicators = [
        '.yxtf-loading',
        '.yxt-loading',
        '.loading-spinner',
        '.page-loading',
        '[class*="loading-spinner"]',
        '[class*="page-loading"]',
        '.loading',
        '.spinner',
        '.progress'
    ];
    
    console.log('=== Loading Indicators ===');
    loadingIndicators.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) {
            const style = getComputedStyle(element);
            console.log(`${selector}: FOUND (display: ${style.display}, visibility: ${style.visibility})`);
        } else {
            console.log(`${selector}: NOT FOUND`);
        }
    });
    
    // Check lesson selectors
    const lessonSelectors = [
        '.yxtulcdsdk-course-page__chapter-item',
        '.yxtulcdsdk-course-player__chapter-item',
        '.chapter-item',
        '.lesson-item',
        '.yxtulcdsdk-course-player__chapter-item',
        '.yxtulcdsdk-course-player__lesson-item',
        '[class*="chapter-item"]',
        '[class*="lesson-item"]',
        '.yxtulcdsdk-course-player__chapter-list-item',
        '.yxtulcdsdk-course-player__lesson-list-item',
        '[class*="chapter-list-item"]',
        '[class*="lesson-list-item"]'
    ];
    
    console.log('=== Lesson Selectors ===');
    lessonSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        console.log(`${selector}: ${elements.length} elements`);
    });
    
    // Try alternative selectors
    console.log('=== Alternative Selectors ===');
    const alternativeSelectors = [
        '[class*="course"]',
        '[class*="lesson"]',
        '[class*="chapter"]',
        '.yxtulcdsdk-course-player *',
        '.yxtulcdsdk-course-page *'
    ];
    
    alternativeSelectors.forEach(selector => {
        try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0 && elements.length < 100) {
                console.log(`${selector}: ${elements.length} elements`);
            }
        } catch (error) {
            console.log(`${selector}: ERROR - ${error.message}`);
        }
    });
    
    // Check page readiness
    console.log('=== Page Readiness Check ===');
    console.log('isPageReadyForLessonExtraction():', isPageReadyForLessonExtraction());
    
    // Try actual extraction
    console.log('=== Actual Extraction Test ===');
    try {
        const lessons = extractLessons();
        console.log('ExtractLessons result:', lessons);
        console.log('Number of lessons:', lessons ? lessons.length : 0);
    } catch (error) {
        console.log('ExtractLessons error:', error);
    }
    
    console.log('=== End Debug Information ===');
    return {
        url: window.location.href,
        readyState: document.readyState,
        bodyChildren: document.body ? document.body.children.length : 0,
        hostname: window.location.hostname,
        pageReady: isPageReadyForLessonExtraction()
    };
}

// Debug function specifically for lesson highlighting
export function debugLessonHighlighting() {
    debugLog(4, '=== DEBUGGING LESSON HIGHLIGHTING ===');
    
    const lessonSelectors = [
        '.yxtulcdsdk-course-page__chapter-item',
        '.yxtulcdsdk-course-player__chapter-item',
        '.chapter-item',
        '.lesson-item',
        '[class*="chapter-item"]',
        '[class*="lesson-item"]'
    ];
    
    let totalLessons = 0;
    let highlightedLessons = 0;
    
    lessonSelectors.forEach(selector => {
        try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                debugLog(4, `Checking ${selector}: ${elements.length} elements`);
                
                elements.forEach((container, index) => {
                    totalLessons++;
                    
                    const nameElement = container.querySelector([
                        '.yxtulcdsdk-flex-1.ml12.ellipsis',
                        '.lesson-name',
                        '.title',
                        '.yxtulcdsdk-course-player__chapter-title',
                        '.yxtulcdsdk-course-player__lesson-title',
                        '[class*="title"]',
                        '[class*="name"]',
                        '[class*="text"]'
                    ].join(', '));
                    
                    if (nameElement) {
                        const name = nameElement.textContent.trim();
                        const isHighlighted = isLessonHighlighted(nameElement, container);
                        
                        if (isHighlighted) {
                            highlightedLessons++;
                            debugLog(4, `  ✓ HIGHLIGHTED: "${name}"`);
                        } else {
                            debugLog(4, `  - Not highlighted: "${name}"`);
                        }
                        
                        // Log detailed information for the first few lessons
                        if (index < 3) {
                            debugLog(4, `    Container classes: ${container.className}`);
                            debugLog(4, `    Name element classes: ${nameElement.className}`);
                            debugLog(4, `    Container attributes:`, {
                                'data-active': container.getAttribute('data-active'),
                                'data-current': container.getAttribute('data-current'),
                                'data-selected': container.getAttribute('data-selected')
                            });
                            
                            const computedStyle = window.getComputedStyle(container);
                            debugLog(4, `    Background color: ${computedStyle.backgroundColor}`);
                        }
                    }
                });
            }
        } catch (error) {
            debugLog(1, `Error checking ${selector}:`, error);
        }
    });
    
    debugLog(4, `=== HIGHLIGHTING SUMMARY ===`);
    debugLog(4, `Total lessons found: ${totalLessons}`);
    debugLog(4, `Highlighted lessons: ${highlightedLessons}`);
    debugLog(4, `Highlighting rate: ${totalLessons > 0 ? ((highlightedLessons / totalLessons) * 100).toFixed(1) : 0}%`);
    debugLog(4, '=== END HIGHLIGHTING DEBUG ===');
    
    return {
        totalLessons,
        highlightedLessons,
        highlightingRate: totalLessons > 0 ? (highlightedLessons / totalLessons) * 100 : 0
    };
}

// Export function to clear cache (for external use)
export function clearCache() {
    clearLessonCache();
}

// Monitor URL changes to clear cache
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
    if (lastUrl !== window.location.href) {
        lastUrl = window.location.href;
        debugLog(4, 'URL changed, clearing lesson cache');
        clearLessonCache();
    }
});

// Start observing URL changes
if (document.body) {
    urlObserver.observe(document.body, { subtree: true, childList: true });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        urlObserver.observe(document.body, { subtree: true, childList: true });
    });
} 