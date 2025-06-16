// Background player functionality

// Log levels: 0=off, 1=errors only, 2=warnings, 3=info, 4=debug
const LOG_LEVEL = 0; // Disabled for production performance

function debugLog(level, ...args) {
    if (LOG_LEVEL === 0 || level > LOG_LEVEL) return; // Fixed logic: 0=off, or level higher than allowed
    
    const timestamp = new Date().toLocaleTimeString();
    const levelNames = ['', 'ERROR', 'WARN', 'INFO', 'DEBUG'];
    console.log(`[${timestamp}] [Background-${levelNames[level]}]`, ...args);
}

let isAutoBackgroundEnabled = true; // Always enabled by default
let originalRequestAnimationFrame = null;
let originalVisibilityState = null;
let originalHidden = null;

// Override visibility APIs
function overrideVisibilityAPIs() {
    if (!originalVisibilityState) {
        originalVisibilityState = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
        originalHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
        originalRequestAnimationFrame = window.requestAnimationFrame;

        // Override visibilityState
        Object.defineProperty(document, 'visibilityState', {
            get: function() {
                return 'visible'; // Always return visible
            }
        });

        // Override hidden
        Object.defineProperty(document, 'hidden', {
            get: function() {
                return false; // Always return false (not hidden)
            }
        });

        // Override requestAnimationFrame to keep running in background
        window.requestAnimationFrame = function(callback) {
            return setTimeout(function() {
                callback(performance.now());
            }, 1000 / 60); // Always simulate 60fps
        };
    }
}

// Handle visibility change
function handleVisibilityChange() {
    debugLog(3, 'Visibility changed, keeping video playing');
    const video = document.querySelector('video');
    if (video) {
        debugLog(3, 'Found video, ensuring playback');
        video.play().catch(e => {
            debugLog(1, 'Auto-play prevented:', e);
        });
        
        // Ensure video doesn't pause
        video.addEventListener('pause', () => {
            debugLog(3, 'Video paused, resuming playback');
            video.play().catch(e => {
                debugLog(1, 'Auto-play prevented:', e);
            });
        });

        // Keep video playing by preventing pause
        video.addEventListener('pause', (e) => {
            e.preventDefault();
            video.play().catch(() => {});
        }, true);
    } else {
        debugLog(3, 'No video element found');
    }
}

// Export functions
export function setAutoBackgroundEnabled(enabled) {
    // Function kept for compatibility, but it won't disable the feature
    debugLog(3, 'Background feature is permanently enabled');
    return true;
}

// Initialize module
overrideVisibilityAPIs();
document.addEventListener('visibilitychange', handleVisibilityChange);
handleVisibilityChange(); 