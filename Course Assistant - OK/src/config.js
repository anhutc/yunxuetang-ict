// Configuration file for Course Assistant extension
// Centralized settings for logging and performance

// Log levels: 0=off, 1=errors only, 2=warnings, 3=info, 4=debug
// Set this to control logging across all modules
export const LOG_LEVEL = 0; // Production: 0 for no logging, Development: 4 for full debugging

// Performance settings
export const PERFORMANCE_CONFIG = {
    // Module loading timeouts (in milliseconds)
    MODULE_LOAD_TIMEOUT: 5000,
    
    // Lesson extraction timeouts
    LESSON_EXTRACTION_TIMEOUT: 5000,
    PAGE_READINESS_TIMEOUT: 3000,
    
    // Retry intervals
    INITIALIZATION_RETRY_DELAY: 1000,
    AUTO_LEARN_CHECK_INTERVAL: 2000,
    
    // Observer debounce time
    OBSERVER_DEBOUNCE: 500,
    
    // Maximum retry attempts
    MAX_INITIALIZATION_ATTEMPTS: 5,
    MAX_INIT_RETRIES: 3
};

// Feature flags
export const FEATURES = {
    // Enable/disable specific features
    AUTO_LEARN: true,
    BACKGROUND_PLAYBACK: true,
    NEXT_CHAPTER_AUTO_CLICK: true,
    
    // Debug features
    ENABLE_DEBUG_FUNCTIONS: false, // Set to true to expose debug functions to console
    ENABLE_PERFORMANCE_MONITORING: false
};

// Selectors and constants
export const SELECTORS = {
    // Page indicators
    PAGE_INDICATORS: [
        '.yxtf-layout',
        '.yxtf-header',
        '.yxtf-content'
    ],
    
    // Loading indicators
    LOADING_INDICATORS: [
        '.yxtf-loading',
        '.loading',
        '.spinner'
    ],
    
    // Lesson containers
    LESSON_CONTAINERS: [
        '.yxtf-lesson-item',
        '.lesson-item',
        '.chapter-item'
    ]
}; 