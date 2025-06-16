import { getCurrentLanguage, setLanguage, updateUI } from './i18n.js';

// Debug flag - set to false to disable all logging for better performance
const DEBUG_MODE = false; // Disabled for production performance

function debugLog(...args) {
    if (!DEBUG_MODE) return;
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [Popup]`, ...args);
}

// Global variable to store all lessons
let allLessons = [];

// Event listener cleanup tracking
const eventListeners = {
    chrome: {
        runtime: null,
        storage: null
    },
    dom: []
};

// Cleanup function to remove all event listeners
function cleanupEventListeners() {
    debugLog('Cleaning up popup event listeners');
    
    // Clean up Chrome API listeners
    if (eventListeners.chrome.runtime) {
        chrome.runtime.onMessage.removeListener(eventListeners.chrome.runtime);
        eventListeners.chrome.runtime = null;
    }
    
    if (eventListeners.chrome.storage) {
        chrome.storage.onChanged.removeListener(eventListeners.chrome.storage);
        eventListeners.chrome.storage = null;
    }
    
    // Clean up DOM event listeners
    eventListeners.dom.forEach(({ element, event, handler }) => {
        if (element && element.removeEventListener) {
            element.removeEventListener(event, handler);
        }
    });
    eventListeners.dom = [];
    
    debugLog('Popup event listeners cleaned up');
}

// Helper function to add tracked event listeners
function addTrackedEventListener(element, event, handler) {
    element.addEventListener(event, handler);
    eventListeners.dom.push({ element, event, handler });
}

// Helper function to add tracked Chrome listeners
function addTrackedChromeListener(type, listener) {
    if (type === 'runtime') {
        chrome.runtime.onMessage.addListener(listener);
        eventListeners.chrome.runtime = listener;
    } else if (type === 'storage') {
        chrome.storage.onChanged.addListener(listener);
        eventListeners.chrome.storage = listener;
    }
}

// Function to collect lesson statistics from the website
function collectLessonStats() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTab = tabs[0];
        // Check if we have a valid tab and it's on yunxuetang
        if (!currentTab || !currentTab.url || !currentTab.url.includes('yunxuetang.cn')) {
            debugLog('Not on yunxuetang site, skipping lesson stats collection');
            return;
        }
        // Inject script to collect data from the website
        chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            function: () => {
                // Get all lesson elements from the website
                const lessonElements = document.querySelectorAll('.lesson-item, .course-item'); // Adjust selectors based on website structure
                let stats = {
                    video: { total: 0, completed: 0 },
                    test: { total: 0, completed: 0 }
                };
                lessonElements.forEach(element => {
                    // Adjust these conditions based on the website's HTML structure
                    const isVideo = element.querySelector('.video-icon, .video-type') !== null;
                    const isTest = element.querySelector('.test-icon, .quiz-type') !== null;
                    const isCompleted = element.classList.contains('completed') || 
                                      element.querySelector('.completed-status') !== null;
                    if (isVideo) {
                        stats.video.total++;
                        if (isCompleted) stats.video.completed++;
                    } else if (isTest) {
                        stats.test.total++;
                        if (isCompleted) stats.test.completed++;
                    }
                });
                return stats;
            }
        }, (results) => {
            if (chrome.runtime.lastError) {
                debugLog('Error executing script:', chrome.runtime.lastError.message);
                return;
            }
            if (results && results[0] && results[0].result) {
                const stats = results[0].result;
                const statsElement = document.getElementById('lessonTypeStats');
                if (statsElement) {
                    // Format: Video: X/Y • Test: A/B
                    statsElement.textContent = `Video: ${stats.video.completed}/${stats.video.total} • Test: ${stats.test.completed}/${stats.test.total}`;
                }
            }
        });
    });
}

// Popup script for Course Assistant
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize language first
    await initializeLanguageSelector();
    
    // Check current tab's domain status
    chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
        const currentTab = tabs[0];
        const isValid = currentTab && currentTab.url && currentTab.url.toLowerCase().includes('yunxuetang.cn');
        
        // First update UI with current language
        await updateUI();
        
        if (!isValid) {
            // Don't proceed with other initializations
            return;
        }
        
        // Only initialize features if we're on a valid domain
        initializePopup();
        
        // Request initial lesson data
        requestLessons();
    });

    // Function to request lessons from content script
    function requestLessons() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (!tabs[0] || !tabs[0].url.toLowerCase().includes('yunxuetang.cn')) {
                debugLog('Not on yunxuetang.cn');
                updateLessonTable([]); // Show empty table
                return;
            }

            debugLog('Requesting lessons from content script...');
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "getLessons"
            }, function(response) {
                if (chrome.runtime.lastError) {
                    debugLog('Failed to get lessons:', chrome.runtime.lastError);
                    // Show empty table with error message
                    updateLessonTable([]);
                    return;
                }
                
                debugLog('Received lessons response:', response);
                if (response && response.lessons) {
                    allLessons = response.lessons;
                    updateLessonTable(allLessons);
                    updateStats(allLessons);
                } else {
                    debugLog('No lessons in response');
                    updateLessonTable([]); // Show empty table
                }
            });
        });
    }

    // Listen for messages from content script
    const messageHandler = (message, sender, sendResponse) => {
        if (message.action === 'contentChanged' && message.lessons) {
            allLessons = message.lessons;
            updateLessonTable(allLessons);
            updateStats(allLessons);
        }
    };
    addTrackedChromeListener('runtime', messageHandler);

    // Dark mode toggle functionality
    const themeToggle = document.querySelector('.theme-toggle');
    const body = document.body;

    // Check if dark mode was previously enabled
    chrome.storage.sync.get('darkMode', ({ darkMode }) => {
        if (darkMode) {
            body.classList.add('dark-mode');
            updateThemeIcon(true);
        }
    });

    const themeToggleHandler = () => {
        const isDarkMode = body.classList.toggle('dark-mode');
        chrome.storage.sync.set({ darkMode: isDarkMode });
        updateThemeIcon(isDarkMode);
    };
    addTrackedEventListener(themeToggle, 'click', themeToggleHandler);

    function updateThemeIcon(isDarkMode) {
        if (themeToggle) {
            themeToggle.innerHTML = isDarkMode 
                ? '<svg class="theme-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
                : '<svg class="theme-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        }
    }

    // Function to initialize all features
    function initializeFeatures() {
        // This function is now consolidated into initializePopup()
        // Keeping this as a placeholder for any future feature initialization
        debugLog('Features initialization handled by initializePopup()');
    }

    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // Function to handle tab switching
    function switchTab(targetTab) {
        // Update active states
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        
        // Activate the target tab
        const targetButton = document.querySelector(`.tab-button[data-tab="${targetTab}"]`);
        if (targetButton) {
            targetButton.classList.add('active');
        }
        
        const targetPane = document.getElementById(`${targetTab}-tab`);
        if (targetPane) {
            targetPane.classList.add('active');
        }
        
        // Request lessons when on lessons tab
        if (targetTab === 'lessons') {
            requestLessons();
        }
    }
    
    // Add click handlers for tab buttons
    const tabButtonHandler = (button) => {
        const targetTab = button.getAttribute('data-tab');
        switchTab(targetTab);
        // Store last active tab
        chrome.storage.sync.set({ lastActiveTab: targetTab });
    };
    
    tabButtons.forEach(button => {
        addTrackedEventListener(button, 'click', () => tabButtonHandler(button));
    });

    // Check if we should start on lessons tab (from storage)
    chrome.storage.sync.get(['lastActiveTab'], (result) => {
        if (result.lastActiveTab === 'lessons') {
            switchTab('lessons');
        }
    });

    // Request lessons immediately if we're starting on the lessons tab
    const lessonsTab = document.getElementById('lessons-tab');
    if (lessonsTab && lessonsTab.classList.contains('active')) {
        requestLessons();
    }

    // Initialize lesson stats collection
    collectLessonStats();
    
    // Function to format lesson type
    function formatLessonType(type) {
        // Generate a consistent class name based on the type
        const className = `type-${type.toLowerCase().replace(/\s+/g, '-')}`;
        
        // Get icon based on type - using a more flexible approach
        let icon = '';
        if (type.toLowerCase().includes('video')) {
            icon = '<svg style="width: 14px; height: 14px; margin-right: 6px;" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
        } else if (type.toLowerCase().includes('exam') || type.toLowerCase().includes('test') || type.toLowerCase().includes('quiz')) {
            icon = '<svg style="width: 14px; height: 14px; margin-right: 6px;" viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        } else {
            // Default document icon for other types
            icon = '<svg style="width: 14px; height: 14px; margin-right: 6px;" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>';
        }
        
        return `<span class="type-tag ${className}">${icon}${type}</span>`;
    }

    // Function to get status icon HTML
    function getStatusIcon(status) {
        switch(status) {
            case 'complete':
                return `<svg class="status-icon" style="width: 20px; height: 20px;" viewBox="0 0 20 20">
                    <g fill="none" fill-rule="evenodd">
                        <path d="M0 0h20v20H0z"></path>
                        <path fill="currentColor" stroke="currentColor" stroke-width="1.5" d="M10 2.25c2.14 0 4.078.867 5.48 2.27A7.726 7.726 0 0117.75 10c0 2.14-.867 4.078-2.27 5.48A7.726 7.726 0 0110 17.75a7.726 7.726 0 01-5.48-2.27A7.726 7.726 0 012.25 10c0-2.14.867-4.078 2.27-5.48A7.726 7.726 0 0110 2.25zm3.636 4.012c-.407 0-.845.142-1.244.474h0l-3.697 3.696-1.581-1.573-.136-.101a1.748 1.748 0 00-2.725 1.34c-.025.401.065.82.485 1.324h0l2.507 2.496.16.124c.387.271.84.407 1.292.407.491 0 .993-.144 1.57-.638h0l4.685-4.697.102-.136a1.748 1.748 0 00-.214-2.215 1.683 1.683 0 00-1.204-.501z"></path>
                    </g>
                </svg>`;
            case 'in-progress':
                return `<svg class="status-icon" style="width: 20px; height: 20px;" viewBox="0 0 20 20">
                    <g fill="none" fill-rule="evenodd">
                        <path fill="currentColor" d="M10 2c4.418 0 8 3.582 8 8s-3.582 8-8 8-8-3.582-8-8 3.582-8 8-8zm-1.5 4a1 1 0 00-1 1v6a1 1 0 001 1h4a1 1 0 001-1V7a1 1 0 00-1-1h-4z"/>
                    </g>
                </svg>`;
            case 'locked':
                return `<svg class="status-icon" style="width: 20px; height: 20px;" viewBox="0 0 20 20">
                    <g fill="none" fill-rule="evenodd">
                        <path d="M0 0h20v20H0z"></path>
                        <path fill="currentColor" d="M15 7h-1V5c0-2.2-1.8-4-4-4S6 2.8 6 5v2H5c-.6 0-1 .4-1 1v8c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V8c0-.6-.4-1-1-1zM8 5c0-1.1.9-2 2-2s2 .9 2 2v2H8V5z"/>
                    </g>
                </svg>`;
            default: // not-started
                return `<svg class="status-icon" style="width: 20px; height: 20px;" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" fill="none"/>
                </svg>`;
        }
    }

    // Function to check if we're on the correct domain - more permissive check
    function isValidDomain(url) {
        return url && url.includes('yunxuetang.cn');
    }

    // Function to handle lesson click
    function handleLessonClick(lesson) {
        debugLog('Handling lesson click:', lesson);
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (!tabs[0] || !isValidDomain(tabs[0].url)) {
                debugLog('Not on yunxuetang.cn or no active tab');
                return;
            }

            debugLog('Sending clickLesson message to content script');
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "clickLesson",
                lesson: lesson // Send the entire lesson object
            }, function(response) {
                if (chrome.runtime.lastError) {
                    debugLog('Click message failed:', chrome.runtime.lastError.message);
                    return;
                }
                debugLog('Click response:', response);
            });
        });
    }

    // Function to create a table row for a lesson
    function createLessonRow(lesson) {
        const row = document.createElement('tr');
        row.classList.add('lesson-row');
        row.setAttribute('data-status', lesson.status);
        
        // Add highlighted class if the lesson is highlighted
        if (lesson.isHighlighted) {
            row.classList.add('highlighted-lesson');
            debugLog(`Lesson "${lesson.displayName}" is highlighted - adding highlighted-lesson class`);
        } else {
            debugLog(`Lesson "${lesson.displayName}" is NOT highlighted - isHighlighted: ${lesson.isHighlighted}`);
        }
        
        // Create cells individually for better control
        const typeCell = document.createElement('td');
        typeCell.innerHTML = formatLessonType(lesson.type);
        
        const nameCell = document.createElement('td');
        nameCell.textContent = lesson.displayName;
        nameCell.setAttribute('title', lesson.displayName);
        
        const timeCell = document.createElement('td');
        timeCell.textContent = lesson.studyTime || '';
        
        const statusCell = document.createElement('td');
        statusCell.className = 'status-cell';
        statusCell.innerHTML = getStatusIcon(lesson.status);
        
        // Append cells to row
        row.appendChild(typeCell);
        row.appendChild(nameCell);
        row.appendChild(timeCell);
        row.appendChild(statusCell);
        
        // Add click handler
        addTrackedEventListener(row, 'click', (e) => {
            e.preventDefault();
            // Add click animation
            row.style.transform = 'scale(0.98)';
            setTimeout(() => {
                row.style.transform = '';
                handleLessonClick(lesson);
            }, 150);
        });
        
        return row;
    }

    // Function to update the lesson table
    function updateLessonTable(lessons) {
        debugLog('updateLessonTable called with', lessons ? lessons.length : 0, 'lessons');
        const lessonList = document.getElementById('lessonList');
        
        // Check if lessonList exists before proceeding
        if (!lessonList) {
            debugLog('Lesson list element not found');
            return;
        }
        
        debugLog('Updating lesson table with', lessons ? lessons.length : 0, 'lessons');
        
        // Debug: Log the first few lessons to see their properties
        if (lessons && lessons.length > 0) {
            debugLog('First 3 lessons data:');
            lessons.slice(0, 3).forEach((lesson, index) => {
                debugLog(`  Lesson ${index + 1}:`, {
                    displayName: lesson.displayName,
                    type: lesson.type,
                    status: lesson.status,
                    isHighlighted: lesson.isHighlighted,
                    isCurrent: lesson.isCurrent,
                    hasOwnProperty_isHighlighted: lesson.hasOwnProperty('isHighlighted')
                });
            });
        }
        
        // Always create table structure
        lessonList.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th style="width: 100px;" data-i18n="type">Type</th>
                        <th style="width: 380px;" data-i18n="lessonName">Lesson Name</th>
                        <th style="width: 100px;" data-i18n="studyTime">Study Time</th>
                        <th style="width: 80px;" data-i18n="status">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${!lessons || lessons.length === 0 ? `
                        <tr>
                            <td colspan="4" class="empty-message">
                                <div class="no-lessons-message">
                                    <svg class="no-data-icon" viewBox="0 0 24 24" width="48" height="48">
                                        <path fill="currentColor" d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5.17l2 2H20v10zm-2-6H6v-2h12v2zm-4 4H6v-2h8v2z"/>
                                    </svg>
                                    <span data-i18n="noLessons">No lessons found</span>
                                    <span class="no-lessons-hint" data-i18n="noLessonsHint">Please visit a course page to view lessons</span>
                                </div>
                            </td>
                        </tr>
                    ` : ''}
                </tbody>
            </table>
        `;

        if (lessons && lessons.length > 0) {
            const tbody = lessonList.querySelector('tbody');
            if (tbody) {
                lessons.forEach(lesson => {
                    tbody.appendChild(createLessonRow(lesson));
                });
                debugLog('Added', lessons.length, 'lesson rows to table');
            }
        }
        
        // Update translations after updating the table
        updateUI();
    }

    // Search functionality
    const searchInput = document.getElementById('lessonSearch');

    function filterLessons(searchTerm) {
        if (!searchTerm) {
            return allLessons;
        }
        
        searchTerm = searchTerm.toLowerCase();
        return allLessons.filter(lesson => 
            lesson.displayName.toLowerCase().includes(searchTerm) ||
            lesson.type.toLowerCase().includes(searchTerm)
        );
    }

    // Search input event
    if (searchInput) {
        addTrackedEventListener(searchInput, 'input', (e) => {
            const filteredLessons = filterLessons(e.target.value);
            updateLessonTable(filteredLessons);
        });
    }

    // Function to update statistics based on lessons
    function updateStats(lessons) {
        // Object to store stats for each type
        const typeStats = {};
        let totalLessons = 0;
        let totalCompleted = 0;

        // Count lessons by type and completion
        lessons.forEach(lesson => {
            const type = lesson.type;
            if (!typeStats[type]) {
                typeStats[type] = { total: 0, completed: 0 };
            }
            
            typeStats[type].total++;
            totalLessons++;
            
            if (lesson.status === 'complete') {
                typeStats[type].completed++;
                totalCompleted++;
            }
        });

        // Update total stats
        const totalStatsElement = document.getElementById('totalStats');
        const totalProgressElement = document.getElementById('totalProgress');
        if (totalStatsElement && totalProgressElement) {
            totalStatsElement.textContent = `${totalCompleted}/${totalLessons}`;
            const progressPercent = totalLessons ? (totalCompleted / totalLessons * 100) : 0;
            totalProgressElement.style.width = `${progressPercent}%`;
        }

        // Update lesson type stats
        const lessonTypeStatsContainer = document.getElementById('lessonTypeStats');
        if (lessonTypeStatsContainer) {
            lessonTypeStatsContainer.innerHTML = ''; // Clear existing stats
            
            Object.entries(typeStats).forEach(([type, stats]) => {
                // Get appropriate icon based on type
                let icon = '';
                if (type.toLowerCase().includes('video')) {
                    icon = '<path fill="currentColor" d="M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.11-.9-2-2-2zm0 14H3V5h18v12zm-5-6l-7 4V7z"/>';
                } else if (type.toLowerCase().includes('quiz') || type.toLowerCase().includes('test') || type.toLowerCase().includes('exam')) {
                    icon = '<path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>';
                } else {
                    icon = '<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>';
                }
                
                const typeClass = type.toLowerCase().replace(/\s+/g, '-');
                const html = `
                    <div class="stats-divider"></div>
                    <div class="stats-group">
                        <div class="stats-label">
                            <svg class="stats-icon" viewBox="0 0 24 24" width="16" height="16">
                                ${icon}
                            </svg>
                            ${type}
                        </div>
                        <div class="stats-value ${typeClass}-stats">${stats.completed}/${stats.total}</div>
                    </div>
                `;
                
                lessonTypeStatsContainer.insertAdjacentHTML('beforeend', html);
            });
        }

        // Update completion rate in stats tab
        const completionRateElement = document.getElementById('completionRate');
        const completionBarElement = document.getElementById('completionBar');
        const completedCountElement = document.getElementById('completedCount');
        const totalCourseCountElement = document.getElementById('totalCourseCount');
        
        if (completionRateElement) {
            const completionRate = totalLessons ? Math.round((totalCompleted / totalLessons) * 100) : 0;
            completionRateElement.textContent = `${completionRate}%`;
        }
        if (completionBarElement) {
            const completionRate = totalLessons ? (totalCompleted / totalLessons) * 100 : 0;
            completionBarElement.style.width = `${completionRate}%`;
        }
        if (completedCountElement) {
            completedCountElement.textContent = totalCompleted;
        }
        if (totalCourseCountElement) {
            totalCourseCountElement.textContent = totalLessons;
        }

        // Update videos watched count based on video type stats
        const videoStats = typeStats['video'] || { completed: 0 };
        const videosWatchedElement = document.getElementById('videosWatchedCount');
        if (videosWatchedElement) {
            videosWatchedElement.textContent = videoStats.completed;
        }

        // Update time saved calculation based on completed videos
        const timeSavedElement = document.getElementById('timeSavedCount');
        if (timeSavedElement) {
            const averageVideoLength = 10; // minutes
            const timesSaved = Math.round((videoStats.completed * averageVideoLength) / 2);
            timeSavedElement.textContent = `${timesSaved}m`;
        }
    }

    // Chrome storage change listener
    const storageHandler = (changes, namespace) => {
        if (namespace === 'local' && changes.lessons) {
            collectLessonStats();
        }
    };
    addTrackedChromeListener('storage', storageHandler);

    // Cleanup on popup unload
    window.addEventListener('unload', cleanupEventListeners);

    // Function to update feature state
    async function updateFeatureState(feature, enabled) {
        debugLog(`Updating ${feature} state to ${enabled}`);
        try {
            // Update storage
            await chrome.storage.sync.set({ [feature]: enabled });
            
            // Send message to content script only if on yunxuetang
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0] && tabs[0].url && tabs[0].url.includes('yunxuetang.cn')) {
                try {
                    await chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'updateState',
                        feature,
                        enabled
                    });
                } catch (error) {
                    debugLog('Error sending message to content script:', error.message);
                }
            }
            
            debugLog(`${feature} state updated successfully`);
        } catch (error) {
            debugLog(`Failed to update ${feature} state:`, error);
        }
    }

    // Function to initialize popup
    function initializePopup() {
        // Check if we're on yunxuetang site
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const isYunxuetang = tabs[0]?.url?.includes('yunxuetang.cn');
            
            if (isYunxuetang) {
                debugLog('On yunxuetang site');
                
                // Get current state
                chrome.storage.sync.get(['autoLearn'], (state) => {
                    debugLog('Got state:', state);
                    
                    // Set up each toggle
                    const toggles = {
                        autoLearn: document.getElementById('autoLearn')
                    };

                    Object.entries(toggles).forEach(([feature, toggle]) => {
                        if (toggle) {
                            // Enable the checkbox
                            toggle.disabled = false;
                            
                            // Set initial state
                            toggle.checked = state[feature] || false;
                            
                            // Send initial state to content script if enabled
                            if (toggle.checked) {
                                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                                    if (tabs[0] && tabs[0].url.toLowerCase().includes('yunxuetang.cn')) {
                                        chrome.tabs.sendMessage(tabs[0].id, {
                                            action: 'updateState',
                                            feature: feature,
                                            enabled: true
                                        }).catch(error => {
                                            debugLog('Error sending initial state to content script:', error.message);
                                        });
                                    }
                                });
                            }
                            
                            // Remove existing listeners to prevent duplicates
                            const newToggle = toggle.cloneNode(true);
                            toggle.parentNode.replaceChild(newToggle, toggle);
                            
                            // Add new listener
                            addTrackedEventListener(newToggle, 'change', () => {
                                debugLog(`${feature} toggle changed to ${newToggle.checked}`);
                                updateFeatureState(feature, newToggle.checked);
                            });
                        }
                    });
                });
            } else {
                debugLog('Not on yunxuetang site');
                // Disable all toggles if not on yunxuetang
                ['autoLearn'].forEach(id => {
                    const toggle = document.getElementById(id);
                    if (toggle) {
                        toggle.disabled = true;
                        toggle.checked = false;
                    }
                });
            }
        });
    }

    // Initialize popup features
    initializePopup();

    // Function to update extension status
    function updateExtensionStatus() {
        const statusIndicator = document.getElementById('extensionStatus');
        if (!statusIndicator) return;
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const isYunxuetang = tabs[0]?.url?.includes('yunxuetang.cn');
            
            if (isYunxuetang) {
                statusIndicator.textContent = 'Active';
                statusIndicator.className = 'status-indicator active';
            } else {
                statusIndicator.textContent = 'Inactive';
                statusIndicator.className = 'status-indicator inactive';
            }
        });
    }

    // Function to show loading state
    function showLoadingState(isLoading) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = isLoading ? 'block' : 'none';
        }
        
        // Disable/enable toggles during loading
        const toggles = ['autoLearn'];
        toggles.forEach(id => {
            const toggle = document.getElementById(id);
            if (toggle) {
                toggle.disabled = isLoading;
            }
        });
    }
});

// Initialize language selector
async function initializeLanguageSelector() {
    const langEn = document.getElementById('langEn');
    const langVi = document.getElementById('langVi');
    
    // Get current language
    const currentLang = await getCurrentLanguage();
    
    // Set active state
    if (currentLang === 'vi') {
        langVi.classList.add('active');
        langEn.classList.remove('active');
    } else {
        langEn.classList.add('active');
        langVi.classList.remove('active');
    }
    
    // Add click handlers
    addTrackedEventListener(langEn, 'click', async () => {
        langEn.classList.add('active');
        langVi.classList.remove('active');
        await setLanguage('en');
        await updateUI();
    });
    
    addTrackedEventListener(langVi, 'click', async () => {
        langVi.classList.add('active');
        langEn.classList.remove('active');
        await setLanguage('vi');
        await updateUI();
    });
}
