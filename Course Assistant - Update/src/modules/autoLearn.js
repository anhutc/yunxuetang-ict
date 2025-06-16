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

// Lesson progression tracking
let currentLessonIndex = -1;
let lastProcessedLessonName = '';
let sameLessonSelectionCount = 0;
const MAX_SAME_LESSON_SELECTIONS = 3; // Maximum times to select the same lesson before breaking

// Rotation tracking for completed lessons with study time
let completedStudyTimeLessonIndex = 0; // Track which completed lesson with study time to select next
let completedStudyTimeLessons = []; // Cache of the first completed lesson with study time for re-study

// Study time tracking for re-study mode
let isReStudyMode = false; // Whether we're in re-study mode (re-studying the first completed lesson with study time)
let currentReStudyLesson = null; // Current lesson being re-studied
let reStudyStartTime = null; // When we started studying the current lesson
let reStudyTargetTime = null; // Target study time for the current lesson
let hasExitedReStudyMode = false; // Flag to prevent immediately re-entering re-study mode

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
        debugLog(4, 'Starting findFirstUnfinishedLesson...');
        const lessons = await extractLessonsAsync(2000); // Reduced from 5 to 2 seconds
        debugLog(4, `Extracted ${lessons ? lessons.length : 0} lessons`);
        
        if (!lessons || lessons.length === 0) {
            debugLog(1, 'No lessons found');
            return null;
        }

        // Log all lessons for debugging
        debugLog(4, 'All lessons:', lessons.map(l => ({
            name: l.displayName,
            type: l.type,
            studyTime: l.studyTime,
            status: l.status,
            isCurrent: l.isCurrent
        })));

        // Find the current lesson index
        const currentLesson = lessons.find(lesson => lesson.isCurrent);
        if (currentLesson) {
            currentLessonIndex = lessons.findIndex(lesson => lesson.displayName === currentLesson.displayName);
            debugLog(4, `Current lesson index: ${currentLessonIndex}, lesson: "${currentLesson.displayName}"`);
        }

        // If we have a current lesson and it's not complete, continue with it
        if (currentLesson && !['complete', 'completed', 'finish', 'finished'].includes(currentLesson.status)) {
            debugLog(4, 'Current lesson is not complete, continuing with it:', currentLesson);
            return currentLesson;
        }

        // Find the next unfinished lesson starting from the current index + 1
        let startIndex = currentLessonIndex >= 0 ? currentLessonIndex + 1 : 0;
        debugLog(4, `Looking for next unfinished lesson starting from index: ${startIndex}`);

        // PRIORITY 1: Find unfinished lessons with study time from current position
        for (let i = startIndex; i < lessons.length; i++) {
            const lesson = lessons[i];
            if (lesson.studyTime && !['complete', 'completed', 'finish', 'finished'].includes(lesson.status)) {
                debugLog(4, `Found unfinished lesson with study time at index ${i}:`, lesson);
                currentLessonIndex = i;
                return lesson;
            }
        }

        // PRIORITY 2: If no unfinished lessons with study time found from current position, 
        // look for first UNFINISHED lesson with study time from the beginning
        debugLog(1, 'No unfinished lessons with study time found from current position, looking for first unfinished lesson with study time from beginning');
        debugLog(4, 'Lessons with study time:', lessons.filter(l => l.studyTime).map(l => ({
            name: l.displayName,
            type: l.type,
            studyTime: l.studyTime,
            status: l.status
        })));
        
        const firstUnfinishedLessonWithStudyTime = lessons.find(lesson => 
            lesson.studyTime && 
            !['complete', 'completed', 'finish', 'finished'].includes(lesson.status)
        );
        
        if (firstUnfinishedLessonWithStudyTime) {
            debugLog(1, 'Found first unfinished lesson with study time to relearn from beginning:', firstUnfinishedLessonWithStudyTime);
            currentLessonIndex = lessons.findIndex(lesson => lesson.displayName === firstUnfinishedLessonWithStudyTime.displayName);
            return firstUnfinishedLessonWithStudyTime;
        }
        
        // PRIORITY 3: If no unfinished lessons with study time found at all, 
        // enter re-study mode for the FIRST completed lesson with study time
        debugLog(1, 'No unfinished lessons with study time found at all, entering re-study mode for the FIRST completed lesson with study time');
        
        // Check if we just exited re-study mode to prevent immediate re-entry
        if (hasExitedReStudyMode) {
            debugLog(1, 'Just exited re-study mode, continuing with first lesson without re-entering re-study mode');
            // Instead of stopping auto-learn, continue with the first lesson
            const firstLessonWithStudyTime = completedLessonsWithStudyTime[0];
            if (firstLessonWithStudyTime) {
                debugLog(1, `Continuing with first lesson: "${firstLessonWithStudyTime.displayName}"`);
                currentLessonIndex = lessons.findIndex(lesson => lesson.displayName === firstLessonWithStudyTime.displayName);
                return firstLessonWithStudyTime;
            }
            return null;
        }
        
        // Get all completed lessons with study time
        const completedLessonsWithStudyTime = lessons.filter(lesson => 
            lesson.studyTime && 
            ['complete', 'completed', 'finish', 'finished'].includes(lesson.status)
        );
        
        debugLog(4, `Found ${completedLessonsWithStudyTime.length} completed lessons with study time for re-study:`, 
            completedLessonsWithStudyTime.map(l => l.displayName));
        
        if (completedLessonsWithStudyTime.length > 0) {
            // Enter re-study mode
            isReStudyMode = true;
            
            // Select the FIRST lesson with study time (lowest index in the array)
            const firstLessonWithStudyTime = completedLessonsWithStudyTime[0];
            
            // Update the cache to only contain the first lesson
            completedStudyTimeLessons = [firstLessonWithStudyTime];
            completedStudyTimeLessonIndex = 0;
            debugLog(4, 'Updated completed study time lessons cache for re-study mode to only include the first lesson');
            
            // Select the first lesson for re-study
            const selectedLesson = firstLessonWithStudyTime;
            debugLog(1, `Selected FIRST completed lesson for re-study: "${selectedLesson.displayName}"`);
            
            // Set up study time tracking for this lesson
            currentReStudyLesson = selectedLesson;
            reStudyStartTime = Date.now();
            reStudyTargetTime = selectedLesson.studyTime * 1000; // Convert to milliseconds
            
            debugLog(1, `Starting re-study of FIRST lesson "${selectedLesson.displayName}" with target study time: ${selectedLesson.studyTime} seconds`);
            
            // Find the index in the original lessons array
            currentLessonIndex = lessons.findIndex(lesson => lesson.displayName === selectedLesson.displayName);
            return selectedLesson;
        }
        
        // PRIORITY 4: Only as a last resort, fall back to any unfinished lesson from current position
        debugLog(1, 'No lessons with study time found at all, falling back to any unfinished lesson from current position (LAST RESORT)');
        for (let i = startIndex; i < lessons.length; i++) {
            const lesson = lessons[i];
            if (!['complete', 'completed', 'finish', 'finished'].includes(lesson.status)) {
                debugLog(1, `Found unfinished lesson without study time at index ${i} as last resort:`, lesson);
                currentLessonIndex = i;
                return lesson;
            }
        }

        // PRIORITY 5: If all lessons from current position are complete, find the first UNFINISHED lesson to relearn from beginning
        debugLog(1, 'All lessons from current position are complete, finding first unfinished lesson to relearn from beginning');
        const firstUnfinishedLesson = lessons.find(lesson => 
            !['complete', 'completed', 'finish', 'finished'].includes(lesson.status)
        );
        
        if (firstUnfinishedLesson) {
            debugLog(1, 'Found first unfinished lesson to relearn from beginning:', firstUnfinishedLesson);
            currentLessonIndex = lessons.findIndex(lesson => lesson.displayName === firstUnfinishedLesson.displayName);
            return firstUnfinishedLesson;
        }
        
        // PRIORITY 6: If ALL lessons are complete, then start from the first lesson
        debugLog(1, 'ALL lessons are complete, starting from the first lesson');
        const firstLesson = lessons[0];
        if (firstLesson) {
            debugLog(1, 'Found first lesson to relearn from beginning:', firstLesson);
            currentLessonIndex = 0;
            return firstLesson;
        }

        debugLog(1, 'No lessons found at all');
        return null;
    } catch (error) {
        debugLog(1, 'Error finding unfinished lesson:', error);
        debugLog(4, 'Error stack:', error.stack);
        return null;
    }
}

// Find first lesson with study time (regardless of status) for relearning from beginning
async function findFirstLessonWithStudyTime() {
    try {
        debugLog(4, 'Starting findFirstLessonWithStudyTime...');
        const lessons = await extractLessonsAsync(2000);
        debugLog(4, `Extracted ${lessons ? lessons.length : 0} lessons for study time search`);
        
        if (!lessons || lessons.length === 0) {
            debugLog(1, 'No lessons found for study time search');
            return null;
        }

        // Log lessons with study time for debugging
        const lessonsWithStudyTime = lessons.filter(lesson => lesson.studyTime);
        debugLog(4, `Found ${lessonsWithStudyTime.length} lessons with study time:`, lessonsWithStudyTime.map(l => ({
            name: l.displayName,
            type: l.type,
            studyTime: l.studyTime,
            status: l.status
        })));

        // Find first lesson with study time (regardless of completion status)
        const firstLessonWithStudyTime = lessons.find(lesson => lesson.studyTime);

        if (firstLessonWithStudyTime) {
            debugLog(1, 'Found first lesson with study time:', firstLessonWithStudyTime);
            return firstLessonWithStudyTime;
        }

        debugLog(1, 'No lessons with study time found');
        return null;
    } catch (error) {
        debugLog(1, 'Error finding first lesson with study time:', error);
        debugLog(4, 'Error stack:', error.stack);
        return null;
    }
}

// Check if current re-study lesson time is fulfilled
function checkReStudyTimeFulfilled() {
    if (!isReStudyMode || !currentReStudyLesson || !reStudyStartTime || !reStudyTargetTime) {
        return false;
    }
    
    const elapsedTime = Date.now() - reStudyStartTime;
    const remainingTime = reStudyTargetTime - elapsedTime;
    
    debugLog(4, `Re-study time check: ${Math.round(elapsedTime / 1000)}s elapsed, ${Math.round(remainingTime / 1000)}s remaining of ${Math.round(reStudyTargetTime / 1000)}s target`);
    
    if (remainingTime <= 0) {
        debugLog(1, `Study time fulfilled for lesson "${currentReStudyLesson.displayName}" (${Math.round(elapsedTime / 1000)}s studied)`);
        return true;
    }
    
    return false;
}

// Advance to next lesson in re-study mode
function advanceReStudyLesson() {
    if (!isReStudyMode || completedStudyTimeLessons.length === 0) {
        return null;
    }
    
    // Since we only have the first lesson in re-study mode, 
    // when study time is fulfilled, we should exit re-study mode
    if (completedStudyTimeLessons.length === 1) {
        debugLog(1, 'Study time fulfilled for the first lesson, exiting re-study mode');
        isReStudyMode = false;
        currentReStudyLesson = null;
        reStudyStartTime = null;
        reStudyTargetTime = null;
        hasExitedReStudyMode = true; // Set flag to prevent immediate re-entry
        return null;
    }
    
    // This code path should not be reached since we only have one lesson,
    // but keeping it for safety in case the logic changes in the future
    completedStudyTimeLessonIndex = (completedStudyTimeLessonIndex + 1) % completedStudyTimeLessons.length;
    const nextLesson = completedStudyTimeLessons[completedStudyTimeLessonIndex];
    
    // Set up study time tracking for the next lesson
    currentReStudyLesson = nextLesson;
    reStudyStartTime = Date.now();
    reStudyTargetTime = nextLesson.studyTime * 1000; // Convert to milliseconds
    
    debugLog(1, `Advanced to next re-study lesson (${completedStudyTimeLessonIndex + 1}/${completedStudyTimeLessons.length}): "${nextLesson.displayName}" with target study time: ${nextLesson.studyTime} seconds`);
    
    return nextLesson;
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
            // Hide tooltips before navigating
            try {
                chrome.runtime.sendMessage({
                    action: "hideTooltips"
                });
            } catch (error) {
                // Ignore errors if popup is not open
                debugLog(4, 'Could not send hideTooltips message (popup may be closed)');
            }
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
        
        // Check if we're in re-learning state (after exiting re-study mode) and switch back to first lesson if needed
        if (hasExitedReStudyMode && currentLesson) {
            // Get the first lesson with study time
            const firstLessonWithStudyTime = lessons.find(lesson => lesson.studyTime);
            if (firstLessonWithStudyTime && currentLesson.displayName !== firstLessonWithStudyTime.displayName) {
                debugLog(1, `In re-learning state but on different lesson. Switching back to first lesson: "${firstLessonWithStudyTime.displayName}"`);
                // Hide tooltips before navigating
                try {
                    chrome.runtime.sendMessage({
                        action: "hideTooltips"
                    });
                } catch (error) {
                    // Ignore errors if popup is not open
                    debugLog(4, 'Could not send hideTooltips message (popup may be closed)');
                }
                await findAndClickLesson(firstLessonWithStudyTime);
                return;
            }
        }
        
        // Check if we're in re-study mode and if study time is fulfilled
        if (isReStudyMode && currentReStudyLesson) {
            debugLog(4, 'In re-study mode, checking study time fulfillment');
            
            // Check if we're still on the same lesson we're tracking
            if (currentLesson && currentLesson.displayName === currentReStudyLesson.displayName) {
                // Check if study time is fulfilled
                if (checkReStudyTimeFulfilled()) {
                    debugLog(1, `Study time fulfilled for "${currentReStudyLesson.displayName}", advancing to next re-study lesson`);
                    
                    // Advance to next lesson in re-study mode
                    const nextReStudyLesson = advanceReStudyLesson();
                    if (nextReStudyLesson) {
                        debugLog(1, 'Moving to next re-study lesson:', nextReStudyLesson);
                        lastProcessedLessonName = nextReStudyLesson.displayName;
                        // Hide tooltips before navigating
                        try {
                            chrome.runtime.sendMessage({
                                action: "hideTooltips"
                            });
                        } catch (error) {
                            // Ignore errors if popup is not open
                            debugLog(4, 'Could not send hideTooltips message (popup may be closed)');
                        }
                        await findAndClickLesson(nextReStudyLesson);
                        return;
                    } else {
                        debugLog(1, 'No more lessons in re-study rotation, exiting re-study mode');
                        isReStudyMode = false;
                        currentReStudyLesson = null;
                        reStudyStartTime = null;
                        reStudyTargetTime = null;
                        hasExitedReStudyMode = true; // Set flag to prevent immediate re-entry
                    }
                } else {
                    // Study time not yet fulfilled, continue with current lesson
                    debugLog(4, 'Study time not yet fulfilled, continuing with current re-study lesson');
                    
                    if (currentLesson.type === 'video') {
                        handleVideoPlayback();
                    }
                    return; // Stay on current lesson until study time is fulfilled
                }
            } else {
                // We're not on the expected lesson, try to navigate to it
                debugLog(4, 'Not on expected re-study lesson, navigating to it');
                await findAndClickLesson(currentReStudyLesson);
                return;
            }
        }
        
        // If current lesson is complete or no current lesson, find first unfinished
        if (!currentLesson || ['complete', 'completed', 'finish', 'finished'].includes(currentLesson.status)) {
            // If current lesson is complete, reset the last processed lesson name
            if (currentLesson && ['complete', 'completed', 'finish', 'finished'].includes(currentLesson.status)) {
                debugLog(4, 'Current lesson is complete, resetting last processed lesson name');
                lastProcessedLessonName = '';
            }
            
            // Handle video playback for the first lesson after exiting re-study mode
            if (hasExitedReStudyMode && currentLesson && currentLesson.type === 'video') {
                debugLog(4, 'Handling video playback for first lesson (complete) after exiting re-study mode');
                handleVideoPlayback();
                return;
            }
            
            // Check if we're not repeating the same lesson
            if (currentLesson && currentLesson.displayName === lastProcessedLessonName) {
                debugLog(4, 'Current lesson is the same as last processed, checking if it needs interaction');
                
                // For lessons without study time (like documents/quizzes), we might need to interact
                if (!currentLesson.studyTime && currentLesson.type !== 'video') {
                    debugLog(4, 'Lesson without study time detected, allowing interaction');
                    // Continue with button clicking logic below
                } else {
                    debugLog(4, 'Waiting for status change on lesson with study time');
                    return;
                }
            }
            
            const nextLesson = await findFirstUnfinishedLesson();
            if (nextLesson) {
                debugLog(1, 'Moving to next unfinished lesson:', nextLesson);
                lastProcessedLessonName = nextLesson.displayName;
                // Hide tooltips before navigating
                try {
                    chrome.runtime.sendMessage({
                        action: "hideTooltips"
                    });
                } catch (error) {
                    // Ignore errors if popup is not open
                    debugLog(4, 'Could not send hideTooltips message (popup may be closed)');
                }
                await findAndClickLesson(nextLesson);
            } else {
                debugLog(1, 'No more lessons available for autolearn, all lessons with study time are completed');
                // Check if there are any lessons with study time at all
                const lessonsWithStudyTime = lessons.filter(lesson => lesson.studyTime);
                if (lessonsWithStudyTime.length === 0) {
                    debugLog(1, 'No lessons with study time found at all, stopping autolearn process');
                    await setAutoLearningEnabled(false);
                } else {
                    debugLog(1, 'All lessons with study time are completed, re-study mode will be activated in next iteration');
                    // The re-study mode will be activated in the next iteration by findFirstUnfinishedLesson
                }
            }
        }
        // If current lesson is not complete, handle based on type and study time
        else {
            debugLog(4, 'Current lesson is not complete, handling based on type and study time:', currentLesson);
            
            // Handle video playback for the first lesson after exiting re-study mode
            if (hasExitedReStudyMode && currentLesson.type === 'video') {
                debugLog(4, 'Handling video playback for first lesson after exiting re-study mode');
                handleVideoPlayback();
                return;
            }
            
            // If current lesson doesn't have study time, try to move to a lesson with study time
            if (!currentLesson.studyTime) {
                debugLog(4, 'Current lesson does not have study time, looking for lesson with study time');
                const lessonWithStudyTime = await findFirstUnfinishedLesson();
                if (lessonWithStudyTime && lessonWithStudyTime.studyTime) {
                    debugLog(1, 'Found lesson with study time, moving to it:', lessonWithStudyTime);
                    lastProcessedLessonName = lessonWithStudyTime.displayName;
                    // Hide tooltips before navigating
                    try {
                        chrome.runtime.sendMessage({
                            action: "hideTooltips"
                        });
                    } catch (error) {
                        // Ignore errors if popup is not open
                        debugLog(4, 'Could not send hideTooltips message (popup may be closed)');
                    }
                    await findAndClickLesson(lessonWithStudyTime);
                    return;
                } else {
                    debugLog(4, 'No lessons with study time found, all lessons with study time are completed');
                    // Check if there are any lessons with study time at all
                    const lessonsWithStudyTime = lessons.filter(lesson => lesson.studyTime);
                    if (lessonsWithStudyTime.length === 0) {
                        debugLog(1, 'No lessons with study time found at all, stopping autolearn process');
                        await setAutoLearningEnabled(false);
                    } else {
                        debugLog(1, 'All lessons with study time are completed, re-study mode will be activated in next iteration');
                        // The re-study mode will be activated in the next iteration by findFirstUnfinishedLesson
                    }
                    return;
                }
            }
            
            if (currentLesson.type === 'video') {
                handleVideoPlayback();
            }
            // For document/quiz types, we might need to click buttons or interact
            // This will be handled by the button clicking logic above
            else if (currentLesson.type === 'document' || currentLesson.type === 'quiz') {
                debugLog(4, 'Current lesson is document/quiz type, checking for interaction needed:', currentLesson);
                // The button clicking logic above should handle any needed interactions
                // If no buttons are found, the lesson might be complete or need manual interaction
            }
        }
    } catch (error) {
        if (!handleError(error, 'auto-learn loop')) {
            return; // Stop if too many errors
        }
    }
}

// Function to reset lesson progression tracking
function resetLessonProgression() {
    debugLog(4, 'Resetting lesson progression tracking');
    currentLessonIndex = -1;
    lastProcessedLessonName = '';
    sameLessonSelectionCount = 0;
    completedStudyTimeLessonIndex = 0;
    completedStudyTimeLessons = [];
    // Reset re-study mode
    isReStudyMode = false;
    currentReStudyLesson = null;
    reStudyStartTime = null;
    reStudyTargetTime = null;
    hasExitedReStudyMode = false; // Reset the flag
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
            
            // Reset the re-study exit flag when manually enabling
            hasExitedReStudyMode = false;
            
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
    resetLessonProgression();
    // Reset rotation tracking
    completedStudyTimeLessonIndex = 0;
    completedStudyTimeLessons = [];
    // Reset re-study mode
    isReStudyMode = false;
    currentReStudyLesson = null;
    reStudyStartTime = null;
    reStudyTargetTime = null;
    hasExitedReStudyMode = false; // Reset the flag
}

// Initialize on module load
// Wait a bit before initial load to ensure page is ready
setTimeout(initializeFromStorage, 1000); 