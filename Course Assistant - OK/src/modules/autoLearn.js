// Auto-learning functionality
import { extractLessons, findAndClickLesson, findAndClickNextChapterButton, extractLessonsAsync } from './lessonManager.js';

// Log levels: 0=off, 1=errors only, 2=warnings, 3=info, 4=debug
const LOG_LEVEL = 0; // Disabled for production performance

function debugLog(level, ...args) {
    if (LOG_LEVEL === 0 || level > LOG_LEVEL) return; // Fixed logic: 0=off, or level higher than allowed
    
    const timestamp = new Date().toLocaleTimeString();
    const levelNames = ['', 'ERROR', 'WARN', 'INFO', 'DEBUG'];
    console.log(`[${timestamp}] [Auto-learning-${levelNames[level]}]`, ...args);
}

// Check if extension context is valid
function isExtensionContextValid() {
    try {
        return chrome.runtime && chrome.runtime.id;
    } catch (error) {
        return false;
    }
}

let isEnabled = false;
let autoLearnInterval = null;
let initializeRetryCount = 0;
const CHECK_INTERVAL = 2000; // Time between checks (2 seconds)
const MAX_INIT_RETRIES = 5;
const INIT_RETRY_DELAY = 2000;

// Error recovery and retry mechanism
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;
const ERROR_RECOVERY_DELAY = 5000; // 5 seconds

// Function to handle errors with recovery
function handleError(error, context) {
    consecutiveErrors++;
    debugLog(1, `Error in ${context}:`, error);
    debugLog(1, `Consecutive errors: ${consecutiveErrors}`);
    
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        debugLog(1, 'Too many consecutive errors, pausing auto-learning temporarily');
        // Pause auto-learning for a while
        setTimeout(() => {
            consecutiveErrors = 0;
            debugLog(1, 'Resuming auto-learning after error recovery');
            if (isEnabled) {
                startAutoLearn();
            }
        }, ERROR_RECOVERY_DELAY);
        return false;
    }
    
    return true; // Continue despite error
}

// Function to reset error counter on success
function resetErrorCounter() {
    if (consecutiveErrors > 0) {
        debugLog(3, `Resetting error counter from ${consecutiveErrors} to 0`);
        consecutiveErrors = 0;
    }
}

// Function to extract lessons with retry mechanism
async function extractLessonsWithRetry(maxRetries = 2, retryDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            debugLog(4, `Lesson extraction attempt ${attempt}/${maxRetries}`);
            
            // Import the lesson manager function dynamically
            const lessonManager = await import('./lessonManager.js');
            const lessons = lessonManager.extractLessons();
            
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

// Wait for lessons to be available
async function waitForLessons(timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        try {
            const lessons = await extractLessonsAsync(1500); // Reduced from 3 to 1.5 seconds
            if (lessons && lessons.length > 0) {
                return true;
            }
        } catch (error) {
            debugLog(1, 'Error checking for lessons:', error);
        }
        await new Promise(resolve => setTimeout(resolve, 300)); // Reduced from 500 to 300ms
    }
    return false;
}

// Initialize module state from storage
async function initializeFromStorage() {
    try {
        // Wait for lessons to be available first
        const lessonsAvailable = await waitForLessons();
        if (!lessonsAvailable) {
            debugLog(1, 'Lessons not available yet, will retry initialization');
            if (initializeRetryCount < MAX_INIT_RETRIES) {
                initializeRetryCount++;
                setTimeout(initializeFromStorage, INIT_RETRY_DELAY);
            }
            return;
        }

        const result = await chrome.storage.sync.get(['autoLearn']);
        if (result.autoLearn) {
            debugLog(1, 'Auto-learn was enabled in storage, starting...');
            await setAutoLearningEnabled(true);
        }
    } catch (error) {
        debugLog(1, 'Error initializing from storage:', error);
        if (initializeRetryCount < MAX_INIT_RETRIES) {
            initializeRetryCount++;
            setTimeout(initializeFromStorage, INIT_RETRY_DELAY);
        }
    }
}

// Find first unfinished lesson with study time
async function findFirstUnfinishedLesson() {
    try {
        const lessons = await extractLessonsAsync(2000); // Reduced from 5 to 2 seconds
        if (!lessons || lessons.length === 0) {
            debugLog(1, 'No lessons found');
            return null;
        }

        // Find first unfinished lesson with study time
        const unfinishedLesson = lessons.find(lesson => 
            lesson.studyTime && // Must have study time
            !['complete', 'completed', 'finish', 'finished'].includes(lesson.status)
        );

        if (unfinishedLesson) {
            debugLog(1, 'Found first unfinished lesson:', unfinishedLesson);
            return unfinishedLesson;
        }

        debugLog(1, 'No unfinished lessons found');
        return null;
    } catch (error) {
        debugLog(1, 'Error finding unfinished lesson:', error);
        return null;
    }
}

// Handle video playback
function handleVideoPlayback() {
    try {
        const video = document.querySelector('#videocontainer-vjs');
        if (!video) {
            return;
        }

        // If video is paused, play it
        if (video.paused && video.readyState === 4) {
            debugLog(1, 'Video is paused, resuming playback');
            video.play();
        }

        // Set speed to 2x if not already
        const currentSpeed = document.querySelector('.jw-playrate-label')?.textContent?.trim();
        if (currentSpeed !== '×2') {
            const speedButton = document.querySelector('.jw-icon-playrate');
            if (speedButton) {
                speedButton.click();
                setTimeout(() => {
                    const speedOptions = document.querySelectorAll('.jw-menu.jw-menu-playrate li');
                    speedOptions.forEach(option => {
                        if (option.textContent.trim() === '×2') {
                            option.click();
                        }
                    });
                }, 100);
            }
        }
    } catch (error) {
        debugLog(1, 'Error handling video playback:', error);
    }
}

// Start auto-learn process
async function startAutoLearn() {
    debugLog(1, 'Starting auto-learn process');
    try {
        // Wait for lessons to be available
        const lessonsAvailable = await waitForLessons();
        if (!lessonsAvailable) {
            debugLog(1, 'Could not start auto-learn - lessons not available');
            return;
        }

        // Always try to find and move to first unfinished lesson
        const firstUnfinished = await findFirstUnfinishedLesson();
        if (firstUnfinished) {
            debugLog(1, 'Moving to first unfinished lesson:', firstUnfinished);
            await findAndClickLesson(firstUnfinished);
            // Start checking for video after a short delay to allow page to load
            setTimeout(() => {
                if (firstUnfinished.type === 'video') {
                    handleVideoPlayback();
                }
            }, 1000);
        } else {
            debugLog(1, 'No unfinished lessons found to start with');
        }
    } catch (error) {
        debugLog(1, 'Error starting auto-learn:', error);
    }
}

// Main auto-learn loop
async function autoLearnLoop() {
    try {
        if (!isEnabled) return;
        
        if (!isExtensionContextValid()) {
            throw new Error('Extension context invalidated');
        }

        // Check if we're on a valid page
        if (!window.location.hostname.includes('yunxuetang.cn')) {
            debugLog(3, 'Not on yunxuetang.cn, skipping auto-learn loop');
            return;
        }

        // Extract lessons with error handling
        let lessons;
        try {
            // Try to get lessons with retry mechanism
            lessons = await extractLessonsWithRetry(2, 1000);
        } catch (error) {
            if (!handleError(error, 'lesson extraction')) {
                return; // Stop if too many errors
            }
            return; // Skip this iteration
        }

        if (!lessons || lessons.length === 0) {
            debugLog(3, 'No lessons found, skipping auto-learn loop');
            return;
        }

        // Reset error counter on successful lesson extraction
        resetErrorCounter();

        // Check for next chapter button first
        await findAndClickNextChapterButton();
        
        // Check for primary button first
        const primaryButtons = document.querySelectorAll('.yxtf-button.yxtf-button--primary.yxtf-button--large, .yxtf-button.yxtf-button--primary.yxtf-button--larger');
        debugLog(1, `Found ${primaryButtons.length} primary buttons`);
        
        for (const button of primaryButtons) {
            // Skip if button is disabled or not visible
            if (button.disabled || !button.offsetParent || getComputedStyle(button).display === 'none') {
                debugLog(1, 'Skipping button - disabled or not visible:', {
                    text: button.textContent.trim(),
                    disabled: button.disabled,
                    hidden: !button.offsetParent,
                    display: getComputedStyle(button).display
                });
                continue;
            }

            // Log button details
            debugLog(1, 'Examining button:', {
                text: button.textContent.trim(),
                classes: button.className,
                parentElement: button.parentElement?.className
            });

            // Check if button is inside a dialog
            const dialogWrapper = button.closest('.yxtf-dialog__wrapper, .yxt-dialog__wrapper');
            
            // If button is not in a dialog, it's safe to click
            if (!dialogWrapper) {
                debugLog(1, 'CLICKING - Button is outside any dialog', {
                    buttonText: button.textContent.trim(),
                    buttonClasses: button.className
                });
                button.click();
                return;
            }

            // If dialog is hidden, skip this button
            if (dialogWrapper.style.display === 'none') {
                debugLog(1, 'Skipping button - dialog is hidden', {
                    buttonText: button.textContent.trim(),
                    dialogClasses: dialogWrapper.className
                });
                continue;
            }

            // Check dialog structure to determine if we should click
            const dialog = dialogWrapper.querySelector('.yxtf-dialog, .yxt-dialog');
            if (!dialog) {
                debugLog(1, 'Skipping button - no dialog element found');
                continue;
            }

            // Log dialog details
            debugLog(1, 'Examining dialog:', {
                classes: dialog.className,
                childCount: dialog.children.length,
                buttonCount: dialog.querySelectorAll('.yxtf-button, .yxt-button').length,
                hasForm: !!dialog.querySelector('form, input, select, textarea')
            });

            // Check if this is a simple confirmation dialog
            const isSimpleDialog = (
                // Dialog has a simple structure (just header + body + footer)
                dialog.children.length <= 4 &&
                // Has only one or two buttons
                dialog.querySelectorAll('.yxtf-button, .yxt-button').length <= 2 &&
                // Is not a complex form dialog
                !dialog.querySelector('form, input, select, textarea')
            );

            // Check if this is a center-aligned dialog (usually important notifications)
            const isCenterDialog = (
                dialog.classList.contains('yxtf-dialog--center') ||
                dialog.classList.contains('yxt-dialog--center')
            );

            // Check if this is a system dialog (usually needs auto-confirmation)
            const isSystemDialog = (
                dialog.classList.contains('yxtf-dialog--small') ||
                dialog.classList.contains('yxt-dialog--small') ||
                dialog.classList.contains('yxtf-dialog--cutline') ||
                dialog.classList.contains('yxt-dialog--cutline')
            );

            // Log dialog type analysis
            debugLog(1, 'Dialog type analysis:', {
                isSimpleDialog,
                isCenterDialog,
                isSystemDialog,
                buttonCount: dialog.querySelectorAll('.yxtf-button, .yxt-button').length
            });

            // Determine if we should click based on dialog type
            const shouldClick = (
                // Simple confirmation dialogs
                isSimpleDialog ||
                // System notifications that need confirmation
                (isSystemDialog && isCenterDialog) ||
                // Dialog has only one button (usually means it's a simple action)
                dialog.querySelectorAll('.yxtf-button, .yxt-button').length === 1
            );

            if (shouldClick) {
                debugLog(1, 'CLICKING - Button in auto-clickable dialog', {
                    buttonText: button.textContent.trim(),
                    reason: isSimpleDialog ? 'simple dialog' : 
                           (isSystemDialog && isCenterDialog) ? 'system notification' : 
                           'single button dialog',
                    dialogClasses: dialog.className
                });
                button.click();
                // Wait a bit after clicking to let the UI update
                await new Promise(resolve => setTimeout(resolve, 1000));
                return;
            } else {
                debugLog(1, 'NOT clicking - Dialog requires user attention', {
                    buttonText: button.textContent.trim(),
                    dialogClasses: dialog.className,
                    reason: !isSimpleDialog ? 'complex dialog' :
                           !isSystemDialog ? 'not a system dialog' :
                           !isCenterDialog ? 'not a center dialog' :
                           'multiple buttons present'
                });
            }
        }

        const currentLesson = lessons.find(lesson => lesson.isCurrent);
        
        // If current lesson is complete or no current lesson, find first unfinished
        if (!currentLesson || ['complete', 'completed', 'finish', 'finished'].includes(currentLesson.status)) {
            const nextLesson = await findFirstUnfinishedLesson();
            if (nextLesson) {
                debugLog(1, 'Moving to next unfinished lesson:', nextLesson);
                await findAndClickLesson(nextLesson);
            }
        }
        // If current lesson is not complete, handle video if present
        else if (currentLesson.type === 'video') {
            handleVideoPlayback();
        }
    } catch (error) {
        if (!handleError(error, 'auto-learn loop')) {
            return; // Stop if too many errors
        }
    }
}

// Export setAutoLearningEnabled function
export async function setAutoLearningEnabled(enabled) {
    debugLog(1, `Setting auto-learning to ${enabled}`);
    
    try {
        if (!isExtensionContextValid()) {
            throw new Error('Extension context invalidated');
        }

        // Only proceed if state is actually changing
        if (enabled === isEnabled) {
            debugLog(1, 'Auto-learning state unchanged');
            return;
        }

        if (enabled) {
            debugLog(1, 'Enabling auto-learning');
            isEnabled = true;
            
            // Always start with first unfinished lesson
            await startAutoLearn();
            
            // Set up interval for continuous checking
            if (!autoLearnInterval) {
                autoLearnInterval = setInterval(autoLearnLoop, CHECK_INTERVAL);
            }
            
        } else {
            debugLog(1, 'Disabling auto-learning');
            if (autoLearnInterval) {
                clearInterval(autoLearnInterval);
                autoLearnInterval = null;
            }
            isEnabled = false;
        }

        // Update storage
        await chrome.storage.sync.set({ autoLearn: enabled });
        debugLog(1, `Auto-learning ${enabled ? 'enabled' : 'disabled'}`);
        
    } catch (error) {
        debugLog(1, 'Error in setAutoLearningEnabled:', error);
        if (error.message.includes('Extension context invalidated')) {
            cleanup();
            throw error;
        }
    }
}

// Export cleanup function
export function cleanup() {
    debugLog(1, 'Cleaning up auto-learn module');
    if (autoLearnInterval) {
        clearInterval(autoLearnInterval);
        autoLearnInterval = null;
    }
    isEnabled = false;
    initializeRetryCount = 0;
}

// Initialize on module load
// Wait a bit before initial load to ensure page is ready
setTimeout(initializeFromStorage, 1000); 