// ============================================================
// 1. Hằng số & Tiện ích
// Phần này định nghĩa tất cả các giá trị không đổi và các hàm tiện ích
// ============================================================
const CONSTANTS = {
    // Các khóa để lưu trữ cài đặt trong localStorage
    STORAGE_KEYS: {
        SPEED: 'yxt_speed',           // Lưu cài đặt tốc độ video
        AUTO_CLOSE: 'yxt_autoClose',  // Lưu cài đặt tự động đóng popup
        AUTO_NEXT: 'yxt_autoNext',    // Lưu cài đặt tự động chuyển video tiếp theo
        MENU_POSITION: 'yxt_menuPosition' // Lưu vị trí menu trên màn hình
    },
    
    // Các bộ chọn DOM để tìm các phần tử trong trang
    SELECTORS: {
        VIDEO_ITEMS: 'li.hand',       // Bộ chọn cho các phần tử video
        POPUP_WARNING: '.yxtf-dialog__body > *:first-child > *:last-child > *:first-child', // Bộ chọn cho cảnh báo popup
        MENU_ID: 'video-stats-menu'   // ID cho container menu chính
    },
};

// Biểu tượng SVG cho video đã hoàn thành
const finishedSVG = '<g fill="none" fill-rule="evenodd"><path d="M0 0h20v20H0z"></path><path fill="currentColor" stroke="#FFF" stroke-width="1.5" d="M10 2.75c2.002 0 3.815.811 5.127 2.123A7.227 7.227 0 0117.25 10a7.227 7.227 0 01-2.123 5.127A7.227 7.227 0 0110 17.25a7.227 7.227 0 01-5.127-2.123A7.227 7.227 0 012.75 10c0-2.002.811-3.815 2.123-5.127A7.227 7.227 0 0110 2.75zm3.636 3.512c-.407 0-.845.142-1.244.474h0l-3.697 3.696-1.581-1.573-.136-.101a1.748 1.748 0 00-2.725 1.34c-.025.401.065.82.485 1.324h0l2.507 2.496.16.124c.387.271.84.407 1.292.407.491 0 .993-.144 1.57-.638h0l4.685-4.697.102-.136a1.748 1.748 0 00-.214-2.215 1.683 1.683 0 00-1.204-.501z"></path></g>';

// Quản lý trạng thái toàn cục
const GLOBALS = {
    isRunning: false,                // Theo dõi xem tính năng có đang chạy không
    savedSettings: null,             // Lưu cache cài đặt người dùng
    styleSheet: null,                // Tham chiếu đến stylesheet toàn cục
    menu: null,                      // Tham chiếu đến phần tử menu DOM
    videoItemsCache: null,           // Cache các phần tử video đã tìm thấy
    videoItemsCacheTime: 0,          // Thời gian cập nhật cache lần cuối
    CACHE_DURATION: 1000,            // Thời gian cache có hiệu lực (1 giây)
    normalizedFinishedSVG: null      // Phiên bản chuẩn hóa của biểu tượng SVG
};

// Chuẩn hóa chuỗi SVG để so sánh nhất quán
GLOBALS.normalizedFinishedSVG = finishedSVG.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();

/**
 * Chuẩn hóa chuỗi SVG bằng cách xóa khoảng trắng thừa
 * @param {string} str - Chuỗi SVG cần chuẩn hóa
 * @returns {string} Chuỗi SVG đã chuẩn hóa
 */
function normalizeSVG(str) {
    return str.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
}

/**
 * Tạo một hàm debounce để trì hoãn việc gọi hàm
 * @param {Function} func - Hàm cần debounce
 * @param {number} wait - Thời gian chờ tính bằng mili giây
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================================
// 2. Quản lý Lưu trữ
// Xử lý việc lưu và tải cài đặt từ localStorage
// ============================================================
const Storage = {
    /**
     * Lấy giá trị từ localStorage
     * @param {string} key - Khóa lưu trữ
     * @param {any} defaultValue - Giá trị mặc định nếu không tìm thấy khóa
     */
    get(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            return value !== null ? JSON.parse(value) : defaultValue;
        } catch {
            return defaultValue;
        }
    },

    /**
     * Lưu giá trị vào localStorage
     * @param {string} key - Khóa lưu trữ
     * @param {any} value - Giá trị cần lưu
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Lấy tất cả cài đặt với giá trị mặc định
     * Tất cả cài đặt mặc định là true theo yêu cầu
     */
    getSettings() {
        return {
            speed: true,      // Tốc độ video 2x
            autoClose: true,  // Tự động đóng popup
            autoNext: true    // Tự động chuyển video tiếp theo
        };
    },

    /**
     * Cập nhật cài đặt trong bộ nhớ
     * @param {Object} newSettings - Cài đặt mới cần lưu
     */
    setSettings(newSettings) {
        const currentSettings = this.getSettings();
        const updatedSettings = { ...currentSettings, ...newSettings };
        
        // Lưu từng cài đặt riêng lẻ
        Object.entries(updatedSettings).forEach(([key, value]) => {
            const storageKey = CONSTANTS.STORAGE_KEYS[key.toUpperCase()];
            if (storageKey) {
                this.set(storageKey, value);
            }
        });

        return updatedSettings;
    },

    saveMenuPosition(left, top) {
        this.set(CONSTANTS.STORAGE_KEYS.MENU_POSITION, {
        left: typeof left === 'number' ? left : null,
        top: typeof top === 'number' ? top : null,
        right: null
        });
    },

    getMenuPosition() {
        return this.get(CONSTANTS.STORAGE_KEYS.MENU_POSITION);
    }
};

// ============================================================
// 3. Quản lý Video
// Xử lý việc tìm và quản lý các phần tử video trong DOM
// ============================================================

/**
 * Lấy tất cả các mục video từ trang với bộ nhớ đệm
 * @returns {Array} Mảng các phần tử DOM video
 */
function getVideoItems() {
    const now = Date.now();
    // Trả về kết quả đã lưu trong cache nếu còn hiệu lực
    if (GLOBALS.videoItemsCache && now - GLOBALS.videoItemsCacheTime < GLOBALS.CACHE_DURATION) {
        return GLOBALS.videoItemsCache;
    }

    // Tìm tất cả các phần tử video trong DOM
    const items = Array.from(document.querySelectorAll('li.hand')).filter(item => {
        // Duyệt cây DOM để tìm phần tử video
        const firstChild = item.firstChild;
        if (!firstChild) return false;
        const secondChild = firstChild.firstChild;
        if (!secondChild) return false;
        const thirdChild = secondChild.firstChild;
        return thirdChild && thirdChild.innerText === 'video';
    });

    // Cập nhật cache
    GLOBALS.videoItemsCache = items;
    GLOBALS.videoItemsCacheTime = now;
    return items;
}

/**
 * Kiểm tra xem một phần tử SVG có phải là video chưa hoàn thành không
 * @param {Element} svgElem - Phần tử SVG cần kiểm tra
 * @returns {boolean} True nếu video chưa hoàn thành
 */
function isFinishedSVG(svgElem) {
    if (!svgElem) return false;
    const gElem = svgElem.querySelector('g');
    return gElem && normalizeSVG(gElem.outerHTML) === GLOBALS.normalizedFinishedSVG;
}

/**
 * Lấy danh sách các video chưa hoàn thành
 * @param {Array} videoItems - Mảng các phần tử video
 * @returns {Array} Mảng các video chưa hoàn thành
 */
function getUnfinishedVideos(videoItems) {
    return videoItems.filter(item => {
        const svgElem = item.querySelector('svg');
        return isFinishedSVG(svgElem); // Trả về true nếu tìm thấy SVG chưa hoàn thành
    });
}

/**
 * Trích xuất tên video từ phần tử video
 * @param {Element} item - Phần tử DOM video
 * @returns {string} Tên video hoặc '(unknown)'
 */
function getVideoName(item) {
    // Thử tìm tên trong các vị trí thông thường
    let nameNode = item.querySelector('span, .video-title, .name, .title');
    if (nameNode?.innerText) {
        return nameNode.innerText.trim().replace(/video/gi, '').trim();
    }

    // Phương án dự phòng: duyệt cây DOM
    let c = item;
    for (let i = 0; i < 3 && c; i++) c = c.firstChild;
    if (!c) return '(unknown)';

    // Kiểm tra các node anh em để tìm nội dung văn bản
    const sibling = c.parentNode?.parentNode?.childNodes;
    if (sibling) {
        for (const node of sibling) {
            if (node.nodeType === 3 && node.textContent.trim()) {
                return node.textContent.trim().replace(/video/gi, '').trim();
            }
        }
    }
    return '(unknown)';
}

/**
 * Lấy danh sách đầy đủ các video với trạng thái
 * @returns {Array} Mảng các đối tượng video với tên, trạng thái hoàn thành và trạng thái hoạt động
 */
function getVideoList() {
    const videoItems = getVideoItems();
    return videoItems.map(item => ({
        name: getVideoName(item),
        finished: isFinishedSVG(item.querySelector('svg')),
        isActive: item.classList.contains('liactive')
    }));
}

// ============================================================
// 4. Thiết lập Tính năng
// Xử lý việc thiết lập và quản lý các tính năng tự động
// ============================================================
const Features = {
    _handlers: {
        popupObserver: null,
        speedObserver: null,
        speedInterval: null,
        videoObserver: null
    },

    /**
     * Kiểm tra xem video có hoàn thành bằng cách so sánh biểu tượng SVG
     * @param {Element} videoItem - Phần tử video cần kiểm tra
     * @returns {boolean} True nếu video đã hoàn thành
     */
    isVideoCompleted(videoItem) {
        const svgElement = videoItem.querySelector('svg');
        return isFinishedSVG(svgElement);
    },

    /**
     * Chọn video chưa hoàn thành đầu tiên
     */
    selectFirstUnfinishedVideo() {
        try {
            const items = getVideoItems();
            const list = getVideoList();
            const idx = list.findIndex(v => !v.finished);
            
            if (idx === -1 || !items?.[idx]) {
                if (GLOBALS.isRunning) {
                    this._showFeatureMessage('🎉 All videos completed! Great job! 🎉', 'success');
                } else {
                    this._showFeatureMessage('📺 No unfinished videos available', 'info');
                }
                return;
            }

            const targetVideo = items[idx];
            if (targetVideo) {
                const nameElement = targetVideo.querySelector('span, .video-title, .name, .title');
                if (nameElement) {
                    nameElement.click();
                    this._showFeatureMessage('▶️ Starting next unfinished video...', 'info');

                    // Wait 30 seconds before setting video time to 0
                    setTimeout(() => {
                        const video = document.getElementById("videocontainer-vjs");
                        if (video && video.readyState === 4) {
                            video.currentTime = 0;
                            this._showFeatureMessage('⏮️ Video time reset to beginning', 'info');
                        } else {
                            this._showFeatureMessage('⚠️ Could not reset video time', 'error');
                        }
                    }, 30000); // 30 seconds
                } else {
                    this._showFeatureMessage('⚠️ Could not find video element', 'error');
                }
            }
        } catch (e) {
            this._showFeatureMessage('❌ Error selecting video: ' + e.message, 'error');
        }
    },

    /**
     * Thiết lập tính năng tự động chuyển video tiếp theo
     * @param {boolean} enable - Có bật tính năng tự động chuyển không
     */
    setupAutoNextVideo(enable) {
        if (!enable || !GLOBALS.isRunning) return;

        // Clean up existing observer if any
        if (this._handlers.videoObserver) {
            this._handlers.videoObserver.disconnect();
            this._handlers.videoObserver = null;
        }

        // Create a mutation observer to watch for video completion
        this._handlers.videoObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                    const videoItems = getVideoItems();
                    const currentVideo = videoItems.find(item => item.classList.contains('liactive'));
                    
                    if (currentVideo && isFinishedSVG(currentVideo.querySelector('svg'))) {
                        const currentIndex = videoItems.indexOf(currentVideo);
                        const nextUnfinished = videoItems.slice(currentIndex + 1)
                            .find(item => !isFinishedSVG(item.querySelector('svg')));

                        if (nextUnfinished) {
                            setTimeout(() => {
                                if (GLOBALS.isRunning) {
                                    const nameElement = nextUnfinished.querySelector('span, .video-title, .name, .title');
                                    if (nameElement) {
                                        nameElement.click();
                                        this._showFeatureMessage('⏭️ Moving to next video automatically...', 'info');
                                    }
                                }
                            }, 1000);
                            
                            this._handlers.videoObserver.disconnect();
                            
                            setTimeout(() => {
                                if (GLOBALS.isRunning) {
                                    this._handlers.videoObserver.observe(document.body, {
                                        childList: true,
                                        subtree: true,
                                        attributes: true,
                                        attributeFilter: ['class']
                                    });
                                }
                            }, 2000);
                        } else {
                            this._showFeatureMessage('🎉 All remaining videos completed!', 'success');
                            GLOBALS.isRunning = !GLOBALS.isRunning;
                            runButton.style.background = 'linear-gradient(90deg, #ffd600 0%, #ff9000 100%)';
                
                                // Show stop message using UI.showMessage
                            UI.showMessage('⏸️ Program stopped! Auto-features disabled', 'warning');

                            // Clean up all features when stopping
                            Features.cleanup();
                        }
                    }
                }
            }
        });

        // Start observing
        this._handlers.videoObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    },

    /**
     * Thiết lập tính năng tốc độ video
     * @param {boolean} enable - Có bật tính năng tốc độ 2x không
     */
    setupSpeed(enable) {
        if (!enable || !GLOBALS.isRunning) return;

        // Clean up existing observer
        if (this._handlers.speedObserver) {
            this._handlers.speedObserver.disconnect();
            this._handlers.speedObserver = null;
        }

        // Function to check and set video speed once
        const setSpeedToX2 = () => {
            try {
                const video = document.getElementById("videocontainer-vjs");
                const speedLabel = document.getElementsByClassName('jw-playrate-label')[0];
                if (video.readyState === 4 && speedLabel && speedLabel.innerText !== 'x2') {
                    const speedOption = document.getElementsByClassName('jw-text jw-option jw-item-0')[4];
                    if (speedOption) {
                        speedOption.click();
                        this._showFeatureMessage('⚡ Video speed set to 2x! Learning at light speed! ⚡', 'warning');
                    }
                } else {
                    this._showFeatureMessage('✨ Speed already at 2x! Keep learning! ✨', 'purple');
                }
            } catch (error) {
                if (!error.message.includes('undefined') && !error.message.includes('null')) {
                    this._showFeatureMessage('⚠️ Could not change video speed. Please try again! ⚠️', 'error');
                }
            }
        };

        // Execute once with a 30 second delay
        setTimeout(() => {
            if (GLOBALS.isRunning) {
                setSpeedToX2();
            }
        }, 30000);
    },

    /**
     * Thiết lập tính năng tự động đóng popup
     * @param {boolean} enable - Có bật tính năng tự động đóng không
     */
    setupAutoClosePopup(enable) {
        if (this._handlers.popupObserver) {
            this._handlers.popupObserver.disconnect();
            this._handlers.popupObserver = null;
        }

        if (!enable || !GLOBALS.isRunning) return;

        let lastCloseTime = 0;
        const CLOSE_COOLDOWN = 1000;

        this._handlers.popupObserver = new MutationObserver((mutations) => {
            if (Date.now() - lastCloseTime < CLOSE_COOLDOWN) return;

            const popupWarning = document.querySelector(CONSTANTS.SELECTORS.POPUP_WARNING);
            if (popupWarning && popupWarning.isConnected) {
                lastCloseTime = Date.now();
                try {
                    popupWarning.click();
                    this._showFeatureMessage('🚀 Popup closed automatically! Keeping your learning smooth! 🚀', 'cyan');
                } catch (error) {
                    if (!error.message.includes('not found')) {
                        this._showFeatureMessage('⚠️ Could not close popup automatically. Please try manually! ⚠️', 'error');
                    }
                }
            }
        });

        this._handlers.popupObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    },

    /**
     * Thiết lập tất cả các tính năng dựa trên cài đặt
     * @param {Object} settings - Đối tượng chứa các cài đặt tính năng
     */
    setupAll(settings = {}) {
        const currentSettings = Storage.getSettings();
        const mergedSettings = { ...currentSettings, ...settings };
        
        if (GLOBALS.isRunning) {
            // Bật các tính năng dựa trên cài đặt
            this.setupSpeed(mergedSettings.speed);
            this.setupAutoClosePopup(mergedSettings.autoClose);
            this.setupAutoNextVideo(mergedSettings.autoNext);
        } else {
            // Tắt tất cả các tính năng
            this.cleanup();
        }
    },

    /**
     * Cleans up all features
     */
    cleanup() {
        if (this._handlers.popupObserver) {
            this._handlers.popupObserver.disconnect();
            this._handlers.popupObserver = null;
        }
        if (this._handlers.speedObserver) {
            this._handlers.speedObserver.disconnect();
            this._handlers.speedObserver = null;
        }
        if (this._handlers.speedInterval) {
            clearInterval(this._handlers.speedInterval);
            this._handlers.speedInterval = null;
        }
        if (this._handlers.videoObserver) {
            this._handlers.videoObserver.disconnect();
            this._handlers.videoObserver = null;
        }
    },

    // Add this at the top of the Features object
    _showFeatureMessage(message, type = 'info') {
        if (!GLOBALS.isRunning) return; // Only show messages when running
        UI.showMessage(message, type);
    },

    // Example usage in setSpeedToX2:
    setSpeedToX2() {
        try {
            const speedLabel = document.getElementsByClassName('jw-playrate-label')[0];
            if (speedLabel && speedLabel.innerText !== 'x2') {
                const speedOption = document.getElementsByClassName('jw-text jw-option jw-item-0')[4];
                if (speedOption) {
                    speedOption.click();
                    this._showFeatureMessage('⚡ Video speed set to 2x! Learning at light speed! ⚡', 'warning');
                }
            } else {
                this._showFeatureMessage('✨ Speed already at 2x! Keep learning! ✨', 'purple');
            }
        } catch (error) {
            if (!error.message.includes('undefined') && !error.message.includes('null')) {
                this._showFeatureMessage('⚠️ Could not change video speed. Please try again! ⚠️', 'error');
            }
        }
    },

    // Example usage in setupAutoClosePopup:
    setupAutoClosePopup(enable) {
        if (this._handlers.popupObserver) {
            this._handlers.popupObserver.disconnect();
            this._handlers.popupObserver = null;
        }

        if (!enable || !GLOBALS.isRunning) return;

        let lastCloseTime = 0;
        const CLOSE_COOLDOWN = 1000;

        this._handlers.popupObserver = new MutationObserver((mutations) => {
            if (Date.now() - lastCloseTime < CLOSE_COOLDOWN) return;

            const popupWarning = document.querySelector(CONSTANTS.SELECTORS.POPUP_WARNING);
            if (popupWarning && popupWarning.isConnected) {
                lastCloseTime = Date.now();
                try {
                    popupWarning.click();
                    this._showFeatureMessage('🚀 Popup closed automatically! Keeping your learning smooth! 🚀', 'cyan');
                } catch (error) {
                    if (!error.message.includes('not found')) {
                        this._showFeatureMessage('⚠️ Could not close popup automatically. Please try manually! ⚠️', 'error');
                    }
                }
            }
        });

        this._handlers.popupObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
};

// ============================================================
// 5. Thành phần Giao diện
// Xử lý việc tạo và quản lý các phần tử giao diện
// ============================================================
const UI = {
    /**
     * Các kiểu cơ bản cho thành phần giao diện
     */
    styles: {
        MENU: {
            BASE: `
                position: fixed !important;
                z-index: 999999 !important;
                transform: translateZ(0);
                -webkit-transform: translateZ(0);
                backface-visibility: hidden;
                -webkit-backface-visibility: hidden;
                will-change: transform;
                background: linear-gradient(165deg, rgba(35,37,38,0.98) 0%, rgba(45,47,48,0.98) 100%);
                color: #f5f5f7;
                padding: 0;
                border-radius: 28px;
                font-size: 16px;
                box-shadow: 0 20px 50px rgba(0,0,0,0.3), 0 10px 30px rgba(0,0,0,0.22);
                width: 420px;
                max-height: 75vh;
                display: flex;
                flex-direction: column;
                overflow-x: hidden;
                overflow-y: hidden;
                font-family: Segoe UI, Arial, sans-serif;
                user-select: none;
                border: 1px solid rgba(255,255,255,0.1);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

                &::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border-radius: 28px;
                    background: linear-gradient(165deg, rgba(255,255,255,0.03), transparent);
                    pointer-events: none;
                }
            `,
            HEADER: `
                cursor: move;
                background: linear-gradient(165deg, rgba(28,29,30,0.95) 0%, rgba(32,33,34,0.95) 100%);
                padding: 24px 32px;
                border-top-left-radius: 28px;
                border-top-right-radius: 28px;
                font-weight: 700;
                font-size: 19px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                position: sticky;
                top: 0;
                z-index: 1;
                border-bottom: 1px solid rgba(255,255,255,0.06);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);

                &::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
                }
            `,
            CONTENT: `
                padding: 24px;
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                min-height: 0;
                max-height: calc(70vh - 180px);
                position: relative;
                scrollbar-width: thin;
                scrollbar-color: rgba(255,214,0,0.3) rgba(0,0,0,0.2);
                scroll-behavior: smooth;

                &::-webkit-scrollbar {
                    width: 8px;
                }

                &::-webkit-scrollbar-track {
                    background: rgba(0,0,0,0.2);
                    border-radius: 4px;
                }

                &::-webkit-scrollbar-thumb {
                    background: rgba(255,214,0,0.3);
                    border-radius: 4px;
                    border: 2px solid transparent;
                    background-clip: padding-box;
                }

                &::-webkit-scrollbar-thumb:hover {
                    background: rgba(255,214,0,0.4);
                }
            `,
            FOOTER: `
                background: linear-gradient(165deg, rgba(28,29,30,0.98) 0%, rgba(32,33,34,0.98) 100%);
                border-top: 1px solid rgba(255,255,255,0.06);
                border-bottom-left-radius: 28px;
                border-bottom-right-radius: 28px;
                padding: 20px 32px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: sticky;
                bottom: 0;
                z-index: 1;
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                box-shadow: 0 -4px 20px rgba(0,0,0,0.15);

                &::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
                }
            `
        },
        SETTINGS: {
            ROW: `
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px 12px;
                border-radius: 10px;
                transition: all 0.2s ease;
                cursor: pointer;
            `,
            CHECKBOX: `
                position: relative;
                width: 20px;
                height: 20px;
                border: 2px solid rgba(255,214,0,0.5);
                border-radius: 4px;
                background: transparent;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            `,
            CHECKBOX_INPUT: `
                position: absolute;
                opacity: 0;
                cursor: pointer;
                height: 0;
                width: 0;
            `,
            CHECKMARK: `
                position: absolute;
                top: 0;
                left: 0;
                width: 20px;
                height: 20px;
                background: transparent;
                border-radius: 4px;
                pointer-events: none;
                display: none;
            `
        }
    },

    /**
     * Tạo một phần tử DOM với kiểu và thuộc tính
     * @param {string} tag - Tên thẻ HTML
     * @param {string} styles - Kiểu CSS
     * @param {Object} attributes - Thuộc tính HTML
     * @param {string} content - Nội dung HTML bên trong
     * @returns {Element} Phần tử DOM đã tạo
     */
    createElement(tag, styles = '', attributes = {}, content = '') {
        const element = document.createElement(tag);
        element.style.cssText = styles;
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else {
                element.setAttribute(key, value);
            }
        });
        if (content) {
            element.innerHTML = content;
        }
        return element;
    },

    /**
     * Tạo một hàng cài đặt với checkbox
     * @param {string} label - Nhãn cài đặt
     * @param {boolean} checked - Trạng thái ban đầu
     * @param {Function} onChange - Hàm xử lý khi thay đổi
     * @returns {Object} Các phần tử hàng và hàm cập nhật
     */
    createSettingRow(label, checked, onChange) {
        const row = this.createElement('div', this.styles.SETTINGS.ROW + `
            cursor: ${GLOBALS.isRunning ? 'not-allowed' : 'pointer'};
            opacity: ${GLOBALS.isRunning ? '0.7' : '1'};
            transition: all 0.2s ease;
        `);
        
        // Create checkbox container
        const checkboxContainer = this.createElement('div', this.styles.SETTINGS.CHECKBOX + `
            cursor: ${GLOBALS.isRunning ? 'not-allowed' : 'pointer'};
            opacity: ${GLOBALS.isRunning ? '0.7' : '1'};
            transition: all 0.2s ease;
        `);
        
        // Create hidden input
        const input = this.createElement('input', this.styles.SETTINGS.CHECKBOX_INPUT + `
            cursor: ${GLOBALS.isRunning ? 'not-allowed' : 'pointer'};
        `, {
            type: 'checkbox'
        });
        input.checked = checked;
        
        // Create checkmark
        const checkmark = this.createElement('span', this.styles.SETTINGS.CHECKMARK);
        checkmark.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">
                <path fill="white" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
            </svg>
        `;
        
        // Create label text
        const labelText = this.createElement('span', `
        color: #f5f5f7;
            font-size: 14px;
        user-select: none;
            cursor: ${GLOBALS.isRunning ? 'not-allowed' : 'pointer'};
            flex: 1;
            transition: all 0.2s ease;
        `, {}, label);

        // Update visual state based on checked status
        const updateVisualState = (isChecked) => {
            input.checked = isChecked;
            if (isChecked) {
                checkboxContainer.style.background = 'linear-gradient(90deg, #ffd600 0%, #ff9000 100%)';
                checkboxContainer.style.borderColor = 'transparent';
                checkmark.style.display = 'block';
            } else {
                checkboxContainer.style.background = 'transparent';
                checkboxContainer.style.borderColor = 'rgba(255,214,0,0.5)';
                checkmark.style.display = 'none';
            }

            // Update disabled state
            const isRunning = GLOBALS.isRunning;
            row.style.cursor = isRunning ? 'not-allowed' : 'pointer';
            row.style.opacity = isRunning ? '0.7' : '1';
            checkboxContainer.style.cursor = isRunning ? 'not-allowed' : 'pointer';
            checkboxContainer.style.opacity = isRunning ? '0.7' : '1';
            labelText.style.cursor = isRunning ? 'not-allowed' : 'pointer';
            input.style.cursor = isRunning ? 'not-allowed' : 'pointer';
        };

        // Initial state
        updateVisualState(checked);

        // Handle change event
        const handleChange = (e) => {
            if (GLOBALS.isRunning) return;
            const newValue = e.target.checked;
            updateVisualState(newValue);
            onChange(e);
        };

        // Handle click event
        const handleClick = (e) => {
            if (GLOBALS.isRunning) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            if (e.target !== input) {
                e.preventDefault();
                e.stopPropagation();
                const newValue = !input.checked;
                updateVisualState(newValue);
                const event = new Event('change', { bubbles: true });
                input.dispatchEvent(event);
            }
        };

        // Add event listeners
        input.addEventListener('change', handleChange);
        checkboxContainer.addEventListener('click', handleClick);
        labelText.addEventListener('click', handleClick);

        // Add hover effect
        const handleMouseEnter = () => {
            if (!GLOBALS.isRunning) {
                row.style.background = 'rgba(255,214,0,0.05)';
                checkboxContainer.style.borderColor = '#ffd600';
                checkboxContainer.style.boxShadow = '0 0 5px rgba(255,214,0,0.3)';
            }
        };

        const handleMouseLeave = () => {
            row.style.background = 'transparent';
            checkboxContainer.style.boxShadow = 'none';
            if (!input.checked) {
                checkboxContainer.style.borderColor = 'rgba(255,214,0,0.5)';
            }
        };

        row.addEventListener('mouseenter', handleMouseEnter);
        row.addEventListener('mouseleave', handleMouseLeave);
        checkboxContainer.addEventListener('mouseenter', handleMouseEnter);
        checkboxContainer.addEventListener('mouseleave', handleMouseLeave);
        labelText.addEventListener('mouseenter', handleMouseEnter);
        labelText.addEventListener('mouseleave', handleMouseLeave);

        // Assemble the components
        checkboxContainer.append(input, checkmark);
        row.append(checkboxContainer, labelText);

        return { 
            row, 
            input, 
            updateVisualState,
            // Add method to update running state
            updateRunningState: () => {
                updateVisualState(input.checked);
            }
        };
    },

    /**
     * Tạo phần đầu menu với tiêu đề và thống kê
     * @returns {Element} Phần tử phần đầu
     */
    createHeader() {
        const header = this.createElement('div', this.styles.MENU.HEADER + `
            cursor: grab;
            background: linear-gradient(165deg, rgba(28,29,30,0.95) 0%, rgba(32,33,34,0.95) 100%);
            border-top-left-radius: 28px;
            border-top-right-radius: 28px;
            font-weight: 700;
            font-size: 19px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
            top: 0;
            z-index: 1;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            backdrop-filter: blur(20px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            padding: 5px 32px;
        `, { className: 'menu-header' });
        
        // Left column with main content
        const leftColumn = this.createElement('div', `
            display: flex;
            flex-direction: column;
            gap: 20px;
            min-width: 0;
            position: relative;
        `);

        // Combined title and stats section
        const statsCard = this.createElement('div', `
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 14px 7px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.1);
            backdrop-filter: blur(12px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
            width: fit-content;
        `, { className: 'stats-badge' });

        const statsIcon = this.createElement('span', `
            font-size: 40px;
            opacity: 0.95;
            filter: drop-shadow(0 3px 6px rgba(255, 214, 0, 0.4));
            animation: statsIconPulse 2s ease-in-out infinite;
            color: #ffd700;
            text-shadow: 0 0 12px rgba(255, 214, 0, 0.6);
            padding: 2px;
        `, {}, '⭐');

        // Add pulse animation
        if (GLOBALS.styleSheet) {
            GLOBALS.styleSheet.textContent += `
                @keyframes statsIconPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
            `;
        }

        const statsInfo = this.createElement('div', `
            display: flex;
            flex-direction: column;
            gap: 4px;
        `);

        // Title text (primary)
        const titleText = this.createElement('div', `
            font-size: 26px;
            font-weight: 800;
            letter-spacing: 0.02em;
            background: linear-gradient(90deg, #f5f5f7 0%, #ffd600 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            white-space: nowrap;
            position: relative;
            padding-bottom: 6px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `, {}, 'Video Progress');

        // Stats count (secondary)
        const videoItems = getVideoItems();
        const unfinishedVideos = getUnfinishedVideos(videoItems);
        const statsText = this.createElement('div', `
            font-size: 20px;
            font-weight: 800;
            background: linear-gradient(90deg, #ffd600 0%, #ff9000 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        `, {}, `${videoItems.length - unfinishedVideos.length} / ${videoItems.length}`);

        statsInfo.append(titleText, statsText);
        statsCard.append(statsIcon, statsInfo);
        leftColumn.appendChild(statsCard);

        // Right column with close button
        const rightColumn = this.createElement('div', `
            display: flex;
            align-items: flex-start;
            justify-content: flex-end;
            padding-top: 8px;
        `);

        const closeButton = this.createElement('button', `
            background: rgba(255,82,82,0.1);
            border: none;
            width: 44px;
            height: 44px;
            border-radius: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ff5252;
            font-size: 28px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
            border: 1.5px solid rgba(255,82,82,0.2);

            &:hover {
                background: rgba(255,82,82,0.15);
                transform: translateY(-2px);
                border-color: rgba(255,82,82,0.3);
                box-shadow: 0 8px 24px rgba(255,82,82,0.2);
            }

            &:active {
                transform: scale(0.95);
            }

            &.disabled {
                cursor: not-allowed;
                opacity: 0.5;
                background: rgba(128,128,128,0.1);
                border-color: rgba(128,128,128,0.2);
                color: #888;
                transform: none;
                box-shadow: none;
            }

            &.disabled:hover {
                background: rgba(128,128,128,0.1);
                transform: none;
                border-color: rgba(128,128,128,0.2);
                box-shadow: none;
            }
        `, {
            title: 'Close Menu',
            'aria-label': 'Close Menu'
        });

        closeButton.innerHTML = '×';
        closeButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Prevent closing if running
            if (GLOBALS.isRunning) {
                UI.showMessage('Please stop the program before closing', 'error');
                return;
            }

            const menu = document.getElementById(CONSTANTS.SELECTORS.MENU_ID);
            if (menu) {
                menu.style.transform += ' scale(0.95)';
                menu.style.opacity = '0';
                menu.style.pointerEvents = 'none';
                
                setTimeout(() => {
                    MenuManager.cleanup();
                }, 300);
            } else {
                MenuManager.cleanup();
            }
        };

        // Update close button state when running state changes
        const updateCloseButtonState = () => {
            if (GLOBALS.isRunning) {
                closeButton.classList.add('disabled');
            } else {
                closeButton.classList.remove('disabled');
            }
        };

        // Initial state
        updateCloseButtonState();

        // Add observer to update button state when running state changes
        if (GLOBALS.styleSheet) {
            GLOBALS.styleSheet.textContent += `
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-2px); }
                    75% { transform: translateX(2px); }
                }
            `;
        }

        rightColumn.appendChild(closeButton);
        header.append(leftColumn, rightColumn);
        return header;
    },

    /**
     * Tạo khu vực nội dung menu
     * @returns {Element} Phần tử container nội dung
     */
    createContent() {
        const content = this.createElement('div', this.styles.MENU.CONTENT);
        content.id = 'video-stats-content';

        // Add stats section at the top of content
        const statsSection = this.createElement('div', `
            padding: 0 0 20px;
            margin-bottom: 20px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            display: flex;
            justify-content: center;
            align-items: center;
        `);

        const videoItems = getVideoItems();
        const unfinishedVideos = getUnfinishedVideos(videoItems);
        const statsCard = this.createElement('div', `
            display: flex;
            align-items: center;
            gap: 16px;
            background: linear-gradient(135deg, rgba(255,214,0,0.08) 0%, rgba(255,144,0,0.08) 100%);
            padding: 16px 24px;
            border-radius: 18px;
            border: 1.5px solid rgba(255,214,0,0.15);
            box-shadow: 0 8px 24px rgba(0,0,0,0.1);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
            width: fit-content;

            &::before {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(135deg, rgba(255,255,255,0.05), transparent);
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            &:hover {
                background: linear-gradient(135deg, rgba(255,214,0,0.12) 0%, rgba(255,144,0,0.12) 100%);
                border-color: rgba(255,214,0,0.25);
                transform: translateY(-2px);
                box-shadow: 0 12px 28px rgba(255,214,0,0.15);
            }

            &:hover::before {
                opacity: 1;
            }
        `, { className: 'stats-badge' });

        const statsIcon = this.createElement('span', `
            font-size: 28px;
            opacity: 0.95;
            filter: drop-shadow(0 3px 6px rgba(255, 214, 0, 0.4));
            animation: statsIconPulse 2s ease-in-out infinite;
            color: #ffd700;
            text-shadow: 0 0 12px rgba(255, 214, 0, 0.6);
            padding: 2px;
        `, {}, '⭐');

        // Add pulse animation
        if (GLOBALS.styleSheet) {
            GLOBALS.styleSheet.textContent += `
                @keyframes statsIconPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
            `;
        }

        const statsInfo = this.createElement('div', `
            display: flex;
            flex-direction: column;
            gap: 4px;
        `);

        const statsText = this.createElement('div', `
            font-size: 20px;
            font-weight: 800;
            background: linear-gradient(90deg, #ffd600 0%, #ff9000 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `, {}, `${videoItems.length - unfinishedVideos.length} / ${videoItems.length}`);

        const statsLabel = this.createElement('div', `
            font-size: 13px;
            color: rgba(255,255,255,0.6);
            font-weight: 500;
        `, {}, 'Videos Completed');

        statsInfo.append(statsText, statsLabel);
        statsCard.append(statsIcon, statsInfo);
        statsSection.appendChild(statsCard);
        content.appendChild(statsSection);

        return content;
    },

    /**
     * Tạo phần chân menu với cài đặt và điều khiển
     * @param {Object} settings - Cài đặt hiện tại
     * @returns {Element} Phần tử phần chân
     */
    createFooter(settings) {
        const footer = this.createElement('div', this.styles.MENU.FOOTER);
        
        // Create controls container
        const controlsContainer = this.createElement('div', `
            display: grid;
            grid-template-columns: 6fr 4fr;
            gap: 20px;
            width: 100%;
            padding: 16px 0;
        `);

        // Settings container
        const settingsContainer = this.createElement('div', `
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 4px;
        `);

        // Store references to checkbox elements
        const checkboxElements = {};

        // Feature setup mapping
        const featureSetup = {
            speed: (value) => Features.setupSpeed(value),
            autoClose: (value) => Features.setupAutoClosePopup(value),
            autoNext: (value) => Features.setupAutoNextVideo(value)
        };

        // Get current settings with defaults
        const currentSettings = Storage.getSettings();

        // Function to get current checkbox states
        const getCheckboxStates = () => {
            const states = {};
            Object.keys(checkboxElements).forEach(key => {
                states[key] = checkboxElements[key].input.checked;
            });
            return states;
        };

        // Function to apply feature states
        const applyFeatureStates = (states) => {
            if (!GLOBALS.isRunning) {
                // If not running, disable all features
                Features.cleanup();
                return;
            }

            // Enable/disable features based on checkbox states
            Object.entries(states).forEach(([key, value]) => {
                const setupFunction = featureSetup[key];
                if (setupFunction) {
                    setupFunction(value);
                }
            });
        };

        // Create settings rows
        const createSettingElement = (key, label, initialValue) => {
            const elements = this.createSettingRow(label, initialValue, (e) => {
                if (GLOBALS.isRunning) return;
                const newValue = e.target.checked;
                Storage.setSettings({ [key]: newValue });
                elements.updateVisualState(newValue);
                
                // const currentStates = getCheckboxStates();
                // console.log(`${key} setting changed:`, newValue, 'Current states:', currentStates);
            });
            checkboxElements[key] = elements;
            return elements.row;
        };

        // Add settings rows
        settingsContainer.append(
            createSettingElement('speed', 'Speed x2', currentSettings.speed),
            createSettingElement('autoClose', 'Auto-close popup', currentSettings.autoClose),
            createSettingElement('autoNext', 'Auto-next video', currentSettings.autoNext)
        );

        // Create run button
        const runButton = this.createElement('button', `
            background: linear-gradient(90deg, #ffd600 0%, #ff9000 100%);
            border: none;
            padding: 14px 36px;
            border-radius: 16px;
            color: #000;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 12px rgba(255,214,0,0.2);
            text-transform: uppercase;
            letter-spacing: 0.8px;
            position: relative;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 120px;
            margin-left: 24px;
            
            &:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(255,214,0,0.3);
            }
            
            &:active:not(:disabled) {
                transform: translateY(0);
                box-shadow: 0 2px 8px rgba(255,214,0,0.2);
            }

            &:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                background: linear-gradient(90deg, #999 0%, #666 100%);
            }
        `, { className: 'run-button' });

        // Check if there are any videos initially
        const initialVideoList = getVideoList();
        if (!initialVideoList || initialVideoList.length <= 0) {
            runButton.disabled = true;
            runButton.style.opacity = '0.5';
            runButton.style.cursor = 'not-allowed';
            runButton.style.background = 'linear-gradient(90deg, #999 0%, #666 100%)';
        }

        runButton.innerHTML = '<span>▶ START</span>';

        // Add click handler for run button
        runButton.onclick = (event) => {
            if (runButton.disabled) return;

            event.preventDefault();
            event.stopPropagation();
            
            // Toggle running state
            GLOBALS.isRunning = !GLOBALS.isRunning;
            
            // Update button appearance
            runButton.classList.toggle('active');
            runButton.innerHTML = GLOBALS.isRunning ? '<span>■ STOP</span>' : '<span>▶ START</span>';
            
            // Toggle overlay
            MenuManager.toggleRunning(GLOBALS.isRunning);
            
            // Get current checkbox states
            const currentStates = getCheckboxStates();
            
            if (GLOBALS.isRunning) {
                runButton.style.background = 'linear-gradient(90deg, #ff5252 0%, #ff1744 100%)';
                
                // Show start message using UI.showMessage
                UI.showMessage('✨ Program started! Auto-features enabled ✨', 'success');
                
                // When starting, select first unfinished video with a small delay
                setTimeout(() => {
                    Features.selectFirstUnfinishedVideo();
                }, 500);

                // Initialize features based on current states
                Object.entries(currentStates).forEach(([key, value]) => {
                    const setupFunction = featureSetup[key];
                    if (setupFunction) {
                        setupFunction(value);
                    }
                });
            } else {
                runButton.style.background = 'linear-gradient(90deg, #ffd600 0%, #ff9000 100%)';
                
                // Show stop message using UI.showMessage
                UI.showMessage('⏸️ Program stopped! Auto-features disabled', 'warning');

                // Clean up all features when stopping
                Features.cleanup();
            }

            // Update visual state of checkboxes
            Object.entries(currentStates).forEach(([key, value]) => {
                if (checkboxElements[key]) {
                    checkboxElements[key].updateRunningState();
                }
            });
        };

        controlsContainer.append(settingsContainer, runButton);

        // Create footer content wrapper
        const footerContent = this.createElement('div', `
        display: flex;
        flex-direction: column;
    width: 100%;
    `);

        footerContent.appendChild(controlsContainer);

        // Add copyright
        const copyright = this.createElement('div', `
            font-size: 16px;
            text-align: center;
            padding: 16px 0 12px;
            border-top: 1px solid rgba(255,255,255,0.08);
            margin-top: 16px;
            width: 100%;
            background: linear-gradient(45deg, #ffd600, #ff9000, #ff5252, #ff1744);
            background-size: 300% 300%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: gradientFlow 8s ease infinite, pulseText 2s ease-in-out infinite;
            font-weight: 600;
            letter-spacing: 0.02em;
            transform: translateZ(0);
            -webkit-font-smoothing: antialiased;
        `);

        // Add keyframe animations to the stylesheet
        if (GLOBALS.styleSheet) {
            GLOBALS.styleSheet.textContent += `
                @keyframes gradientFlow {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                @keyframes pulseText {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                    100% { transform: scale(1); }
                }
            `;
        }

        copyright.innerHTML = '✨ Created with <span style="color: #ff1744;">♥</span> by Wenying! ✨';

        footerContent.appendChild(copyright);
        footer.appendChild(footerContent);

        return footer;
    },

    /**
     * Cập nhật danh sách video trong menu
     * @param {Array} videoList - Mảng các đối tượng video
     */
    updateVideoList(videoList) {
        const content = document.getElementById('video-stats-content');
        if (!content) return;

        // Update run button state based on video list
        const runButton = document.querySelector('.run-button');
        if (runButton) {
            const allCompleted = videoList && videoList.length > 0 && videoList.every(v => v.finished);
            const noVideos = !videoList || videoList.length <= 0;

            if (noVideos || allCompleted) {
                runButton.style.opacity = '0.5';
                runButton.style.cursor = 'not-allowed';
                runButton.style.background = 'linear-gradient(90deg, #999 0%, #666 100%)';
                runButton.disabled = true;
                
                // Update button text to show status
                if (allCompleted) {
                    runButton.innerHTML = '<span>✓ ALL COMPLETED</span>';
                } else {
                    runButton.innerHTML = '<span>NO VIDEOS</span>';
                }
            } else {
                runButton.style.opacity = '1';
                runButton.style.cursor = 'pointer';
                runButton.style.background = GLOBALS.isRunning ? 
                    'linear-gradient(90deg, #ff5252 0%, #ff1744 100%)' : 
                    'linear-gradient(90deg, #ffd600 0%, #ff9000 100%)';
                runButton.disabled = false;
                runButton.innerHTML = GLOBALS.isRunning ? '<span>■ STOP</span>' : '<span>▶ START</span>';
            }
        }

        if (!videoList || videoList.length <= 0) {
            content.innerHTML = `
                <div style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 200px;
                    text-align: center;
                    color: #666;
                    padding: 20px;
                ">
                    <div style="font-size: 48px; margin-bottom: 16px;">📺</div>
                    <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">No Videos Found</div>
                    <div style="font-size: 14px; color: #888;">Please check if there are any videos available.</div>
                </div>
            `;
            return;
        }

        // If all videos are completed, show completion message
        if (videoList.every(v => v.finished)) {
            content.innerHTML = `
                <div style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 200px;
                    text-align: center;
                    padding: 20px;
                ">
                    <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
                    <div style="
                        font-size: 20px;
                        font-weight: 700;
                        margin-bottom: 12px;
                        background: linear-gradient(90deg, #00e676, #1de9b6);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                    ">All Videos Completed!</div>
                    <div style="font-size: 15px; color: #888;">Great job! You've finished all the videos.</div>
                </div>
            `;
            return;
        }

        const list = this.createElement('ul', `
            list-style: none;
            padding: 0;
            margin: 0;
            width: 100%;
            max-width: 100%;
        `);

        videoList.forEach((video, idx) => {
            const li = this.createElement('div', `
                padding: 12px 16px;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                cursor: ${GLOBALS.isRunning ? 'not-allowed' : 'pointer'};
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                background: ${video.isActive ? 'rgba(255,214,0,0.13)' : 'rgba(255,255,255,0.03)'};
                border-radius: 14px;
                box-shadow: ${video.isActive ? 
                    '0 4px 12px rgba(255,214,0,0.08)' : 
                    '0 2px 6px rgba(0,0,0,0.08)'};
                opacity: ${GLOBALS.isRunning ? '0.7' : '1'};
                min-width: 0;
                border: 1.5px solid ${video.isActive ? 
                    'rgba(255,214,0,0.2)' : 
                    'rgba(255,255,255,0.06)'};
                
                &:hover {
                    transform: translateY(-1px);
                    background: ${video.isActive ? 
                        'rgba(255,214,0,0.15)' : 
                        'rgba(255,255,255,0.05)'};
                    box-shadow: ${video.isActive ? 
                        '0 6px 16px rgba(255,214,0,0.12)' : 
                        '0 4px 12px rgba(0,0,0,0.12)'};
                    border-color: ${video.isActive ? 
                        'rgba(255,214,0,0.3)' : 
                        'rgba(255,255,255,0.1)'};
                }
            `, { 'data-video-idx': idx });

            const index = this.createElement('span', `
                color: ${video.isActive ? '#ffd600' : '#888'};
                width: 2.2em;
                min-width: 2.2em;
                display: inline-block;
                font-size: 15px;
                font-weight: 600;
                transition: color 0.2s ease;
            `, {}, `${idx + 1}.`);

            const nameContainer = this.createElement('div', `
                flex: 1;
                min-width: 0;
                margin-right: 12px;
                overflow: hidden;
            `);

            const name = this.createElement('span', `
                color: ${video.isActive ? '#ffd600' : '#f5f5f7'};
                font-weight: ${video.isActive ? '600' : '400'};
                font-size: 16px;
                letter-spacing: 0.01em;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                display: block;
                transition: all 0.2s ease;
            `, {}, video.name);

            const status = this.createElement('span', `
                margin-left: 8px;
                font-size: 20px;
                vertical-align: middle;
                color: ${video.finished ? '#00e676' : '#ff5252'};
                min-width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: ${video.finished ? 
                    'rgba(0,230,118,0.1)' : 
                    'rgba(255,82,82,0.1)'};
                border-radius: 8px;
                padding: 4px;
            `, {}, video.finished ? '✓' : '✗');

            nameContainer.appendChild(name);
            li.append(index, nameContainer, status);

            // Add direct click handler to each item
            li.addEventListener('click', (e) => {
                if (GLOBALS.isRunning) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                const videoItems = getVideoItems();
                if (videoItems[idx]) {
                    // Add visual feedback
                    li.style.transform = 'scale(0.98)';
                    li.style.opacity = '0.8';
                    
                    // Click the video item
                    videoItems[idx].click();
                    
                    // Reset visual feedback
                    setTimeout(() => {
                        li.style.transform = '';
                        li.style.opacity = '';
                        
                        // Scroll into view after click
                        li.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest',
                            inline: 'nearest'
                        });
                    }, 150);
                }
            });

            list.appendChild(li);
        });

        content.innerHTML = '';
        content.appendChild(list);
    },

    // Add this at the top of the UI object
    showMessage(message, type = 'info') {
        // Predefined styles for different message types
        const styles = {
            success: {
                background: 'linear-gradient(135deg, rgba(0,230,118,0.98), rgba(0,200,83,0.98))',
                borderColor: 'rgba(0,230,118,0.3)',
                boxShadow: '0 8px 32px rgba(0,230,118,0.25)'
            },
            error: {
                background: 'linear-gradient(135deg, rgba(244,67,54,0.98), rgba(229,57,53,0.98))',
                borderColor: 'rgba(244,67,54,0.3)',
                boxShadow: '0 8px 32px rgba(244,67,54,0.25)'
            },
            warning: {
                background: 'linear-gradient(135deg, rgba(255,193,7,0.98), rgba(255,152,0,0.98))',
                borderColor: 'rgba(255,193,7,0.3)',
                boxShadow: '0 8px 32px rgba(255,193,7,0.25)'
            },
            info: {
                background: 'linear-gradient(135deg, rgba(33,150,243,0.98), rgba(3,169,244,0.98))',
                borderColor: 'rgba(33,150,243,0.3)',
                boxShadow: '0 8px 32px rgba(33,150,243,0.25)'
            },
            purple: {
                background: 'linear-gradient(135deg, rgba(156,39,176,0.98), rgba(123,31,162,0.98))',
                borderColor: 'rgba(156,39,176,0.3)',
                boxShadow: '0 8px 32px rgba(156,39,176,0.25)'
            },
            cyan: {
                background: 'linear-gradient(135deg, rgba(0,188,212,0.98), rgba(0,172,193,0.98))',
                borderColor: 'rgba(0,188,212,0.3)',
                boxShadow: '0 8px 32px rgba(0,188,212,0.25)'
            }
        };

        const style = styles[type] || styles.info;

        // Get or create notifications container
        let notificationsContainer = document.getElementById('notifications-container');
        if (!notificationsContainer) {
            notificationsContainer = this.createElement('div', `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-height: calc(100vh - 40px);
                overflow-y: auto;
                overflow-x: hidden;
                pointer-events: none;
                width: fit-content;
                min-width: 280px;
                max-width: min(420px, calc(100vw - 40px));
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

                /* Custom scrollbar for notifications container */
                &::-webkit-scrollbar {
                    width: 6px;
                    height: 0; /* Hide horizontal scrollbar */
                }
                &::-webkit-scrollbar-track {
                    background: transparent;
                }
                &::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 3px;
                }
                &::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.3);
                }
            `, { id: 'notifications-container' });
            document.body.appendChild(notificationsContainer);
        }

        // Create notification element
        const notification = this.createElement('div', `
            pointer-events: auto;
            padding: 16px 24px;
            border-radius: 16px;
            font-size: 15px;
            font-weight: 600;
            line-height: 1.4;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            transform: translateX(120%);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            width: 100%;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1.5px solid ${style.borderColor};
            box-sizing: border-box;
            overflow-wrap: break-word;
            word-wrap: break-word;
            word-break: break-word;
            hyphens: auto;
            ${Object.entries(style).map(([key, value]) => `${key}: ${value};`).join('')}

            &:hover {
                transform: translateX(0) scale(1.02);
                box-shadow: ${style.boxShadow.replace('0.25)', '0.35)')}
            }
        `);

        // Add message text with proper wrapping
        const messageText = this.createElement('span', `
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: normal;
            overflow-wrap: break-word;
            word-wrap: break-word;
            word-break: break-word;
            hyphens: auto;
        `, {}, message);

        // Add close button with fixed width
        const closeButton = this.createElement('button', `
            background: none;
            border: none;
            color: rgba(255,255,255,0.8);
            font-size: 20px;
            cursor: pointer;
            padding: 0;
            margin: 0;
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s ease;
            margin-top: -2px;

            &:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
        `, {}, '×');

        notification.append(messageText, closeButton);
        notificationsContainer.appendChild(notification);

        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        });

        // Setup auto-remove
        let timeout;
        const remove = () => {
            clearTimeout(timeout);
            notification.style.transform = 'translateX(120%)';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);

            // Remove container if empty
            if (notificationsContainer.children.length <= 1) {
                setTimeout(() => notificationsContainer.remove(), 300);
            }
        };

        // Add click handlers
        closeButton.onclick = (e) => {
            e.stopPropagation();
            remove();
        };

        notification.onclick = remove;

        // Auto remove after 3 seconds
        timeout = setTimeout(remove, 3000);

        // Pause timer on hover
        notification.addEventListener('mouseenter', () => clearTimeout(timeout));
        notification.addEventListener('mouseleave', () => {
            timeout = setTimeout(remove, 3000);
        });

        return notification;
    }
};

// ============================================================
// 6. Quản lý Menu
// Xử lý việc tạo và quản lý menu thống kê video
// ============================================================
const MenuManager = {
    /**
     * Khởi tạo menu và các thành phần
     */
    initialize() {
        // Tạo stylesheet nếu chưa tồn tại
        if (!GLOBALS.styleSheet) {
            GLOBALS.styleSheet = document.createElement('style');
            document.head.appendChild(GLOBALS.styleSheet);
            this.initializeStyles();
        }

        this.createMenu();
        this.setupEventListeners();
        this.updateContent();
    },

    initializeStyles() {
        GLOBALS.styleSheet.textContent = `
            #video-stats-content::-webkit-scrollbar {
                width: 8px;
            }
            #video-stats-content::-webkit-scrollbar-track {
                background: rgba(0,0,0,0.1);
                border-radius: 10px;
                margin: 4px;
            }
            #video-stats-content::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.2);
                border-radius: 10px;
                border: 2px solid transparent;
                background-clip: padding-box;
            }
            #video-stats-content::-webkit-scrollbar-thumb:hover {
                background: rgba(255,255,255,0.3);
            }
            #video-stats-content ul {
                margin: 0;
                padding: 0;
                list-style: none;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
        `;
    },

    setupEventListeners() {
        const debouncedShowStats = debounce(this.updateContent, 100);

        const observer = new MutationObserver((mutations) => {
            const processedNodes = new Set();
            
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    debouncedShowStats();
                    return;
                }
                
                if (mutation.type === 'childList') {
                    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
                    for (const node of nodes) {
                        if (processedNodes.has(node)) continue;
                        processedNodes.add(node);
                        
                        if (node.nodeType === 1 && node.querySelector) {
                            if (node.querySelector('svg')) {
                                debouncedShowStats();
                                return;
                            }
                        }
                    }
                }
            }
        });

        observer.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
            childList: true,
            characterData: false
        });

        this._observer = observer;

        window.addEventListener('unload', () => {
            this._observer?.disconnect();
            this.cleanup();
        });
    },

    toggleRunning(isRunning) {
        GLOBALS.isRunning = isRunning;
        const runButton = document.querySelector('.run-button');
        const menu = document.getElementById(CONSTANTS.SELECTORS.MENU_ID);
        
        // Create or get overlay
        let overlay = document.getElementById('video-stats-overlay');
        if (!overlay && isRunning) {
            overlay = document.createElement('div');
            overlay.id = 'video-stats-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.15);
                z-index: 999998;
                cursor: not-allowed;
                backdrop-filter: blur(1px);
                -webkit-backdrop-filter: blur(1px);
            `;
            document.body.appendChild(overlay);
        }
        
        if (runButton) {
            runButton.innerHTML = isRunning ? '<span>■ STOP</span>' : '<span>▶ START</span>';
            runButton.style.background = isRunning ? 
                'linear-gradient(90deg, #ff5252 0%, #ff1744 100%)' : 
                'linear-gradient(90deg, #ffd600 0%, #ff9000 100%)';
        }

        // Toggle overlay
        if (overlay) {
            if (isRunning) {
                overlay.style.display = 'block';
            } else {
                overlay.style.display = 'none';
                overlay.remove();
            }
        }

        // Update menu state
        if (menu) {
            if (isRunning) {
                menu.style.opacity = '1';
                menu.style.pointerEvents = 'auto';
                menu.style.zIndex = '999999';
            } else {
                menu.style.opacity = '1';
                menu.style.pointerEvents = 'auto';
                menu.style.zIndex = '999999';
            }
        }
    },

    /**
     * Tạo menu chính
     */
    createMenu() {
        const existingMenu = document.getElementById(CONSTANTS.SELECTORS.MENU_ID);
        if (existingMenu) {
            existingMenu.remove();
        }

        const savedPosition = Storage.getMenuPosition();
        GLOBALS.menu = UI.createElement('div', UI.styles.MENU.BASE + `
            top: ${savedPosition?.top ?? 32}px;
            ${savedPosition?.left ? `left: ${savedPosition.left}px;` : 'right: 52px;'}
            z-index: 999999;
            display: flex;
            flex-direction: column;
            height: auto;
            max-height: 75vh;
            overflow: hidden;
            user-select: none;
            will-change: transform;
            -webkit-font-smoothing: antialiased;
            transition: opacity 0.3s ease;
        `, { id: CONSTANTS.SELECTORS.MENU_ID });

        // Add hover effect to restore opacity when running
        if (GLOBALS.styleSheet) {
            GLOBALS.styleSheet.textContent += `
                #${CONSTANTS.SELECTORS.MENU_ID}:hover {
                    opacity: 1 !important;
                }
            `;
        }

        const header = UI.createHeader();
        
        // Optimize content container
        const content = UI.createElement('div', `
            flex: 1;
            min-height: 0;
            max-height: calc(75vh - 160px);
            overflow-y: overlay;
            overflow-x: hidden;
            padding: 12px 24px;
            position: relative;
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,0.2) rgba(0,0,0,0.1);
            scroll-behavior: smooth;
            will-change: transform;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
            transform: translateZ(0);
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
        `, { id: 'video-stats-content' });

        // Add custom scrollbar styles
        if (GLOBALS.styleSheet) {
            GLOBALS.styleSheet.textContent += `
                #video-stats-content::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                #video-stats-content::-webkit-scrollbar-track {
                    background: rgba(0,0,0,0.1);
                    border-radius: 4px;
                    margin: 4px;
                }
                #video-stats-content::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.2);
                    border-radius: 4px;
                    border: 2px solid transparent;
                    background-clip: padding-box;
                    transition: all 0.2s ease;
                }
                #video-stats-content::-webkit-scrollbar-thumb:hover {
                    background: rgba(255,255,255,0.3);
                    border-width: 1px;
                }
                #video-stats-content > ul {
                    margin: 0;
                    padding: 0;
                    list-style: none;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    transform: translateZ(0);
                    will-change: transform;
                }
                #video-stats-content > ul > div {
                    transform: translateZ(0);
                    will-change: transform;
                    transition: transform 0.2s ease, opacity 0.2s ease;
                }
                #video-stats-content > ul > div:active {
                    transform: scale(0.98);
                    opacity: 0.9;
                }
            `;
        }

        const footer = UI.createFooter(Storage.getSettings());

        GLOBALS.menu.append(header, content, footer);
        document.body.appendChild(GLOBALS.menu);

        // Optimized drag functionality
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;

        const setPosition = (x, y) => {
            const maxX = window.innerWidth - GLOBALS.menu.offsetWidth;
            const maxY = window.innerHeight - GLOBALS.menu.offsetHeight;
            
            x = Math.min(Math.max(0, x), maxX);
            y = Math.min(Math.max(0, y), maxY);

            GLOBALS.menu.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            GLOBALS.menu.style.left = '0';
            GLOBALS.menu.style.top = '0';
            GLOBALS.menu.style.right = 'auto';
        };

        const dragStart = (e) => {
            if (!e.target.closest('.menu-header') || 
                e.target.closest('.run-button') || 
                e.target.closest('input') || 
                e.target.closest('button')) {
                return;
            }

            const style = window.getComputedStyle(GLOBALS.menu);
            const matrix = new WebKitCSSMatrix(style.transform);
            
            initialX = e.clientX - matrix.m41;
            initialY = e.clientY - matrix.m42;
            
            isDragging = true;
            header.style.cursor = 'grabbing';
            GLOBALS.menu.style.transition = 'none';
        };

        const dragEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            header.style.cursor = 'grab';
            GLOBALS.menu.style.transition = '';

            // Save the final position
            const style = window.getComputedStyle(GLOBALS.menu);
            const matrix = new WebKitCSSMatrix(style.transform);
            Storage.saveMenuPosition(matrix.m41, matrix.m42);
        };

        let rafId = null;
        const updatePosition = (e) => {
            if (!isDragging) return;
            
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            if (rafId) {
                cancelAnimationFrame(rafId);
            }
            
            rafId = requestAnimationFrame(() => {
                setPosition(currentX, currentY);
            });
        };

        // Add event listeners
        header.style.cursor = 'grab';
        header.addEventListener('mousedown', dragStart, { passive: true });
        document.addEventListener('mousemove', updatePosition, { passive: true });
        document.addEventListener('mouseup', () => {
            if (rafId) {
                cancelAnimationFrame(rafId);
            }
            dragEnd();
        });

        // Ensure initial position is within bounds
        requestAnimationFrame(() => {
            const style = window.getComputedStyle(GLOBALS.menu);
            const matrix = new WebKitCSSMatrix(style.transform);
            setPosition(matrix.m41 || savedPosition?.left || 32, matrix.m42 || savedPosition?.top || 32);
        });

        // Optimize scroll performance
        let scrollRafId = null;
        const smoothScroll = (e) => {
            if (scrollRafId) {
                cancelAnimationFrame(scrollRafId);
            }
            scrollRafId = requestAnimationFrame(() => {
                content.scrollTop = content.scrollTop + e.deltaY;
            });
        };

        content.addEventListener('wheel', smoothScroll, { passive: true });
    },

    /**
     * Cập nhật nội dung menu với danh sách video hiện tại
     */
    updateContent() {
        if (!GLOBALS.menu) return;
        
        const videoList = getVideoList();
        UI.updateVideoList(videoList);

        const stats = document.querySelector('.stats-badge');
        if (stats) {
            const total = videoList.length;
            const finished = videoList.filter(v => v.finished).length;
            const statsInfo = stats.querySelector('div');
            if (statsInfo) {
                // Keep the existing title and update only the stats count
                const titleText = statsInfo.querySelector('div:first-child');
                const statsText = statsInfo.querySelector('div:last-child');
                
                if (titleText && statsText) {
                    statsText.innerHTML = `${finished} / ${total}`;
                    statsText.style.cssText = `
                        font-size: 20px;
                        font-weight: 800;
                        background: linear-gradient(90deg, #ffd600 0%, #ff9000 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                    `;
                } else {
                    // If elements don't exist, create them
                    statsInfo.innerHTML = `
                        <div style="
                            font-size: 26px;
                            font-weight: 800;
                            letter-spacing: 0.02em;
                            background: linear-gradient(90deg, #f5f5f7 0%, #ffd600 100%);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                            white-space: nowrap;
                            position: relative;
                            padding-bottom: 6px;
                            text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            Video Progress
                        </div>
                        <div style="
                            font-size: 20px;
                            font-weight: 800;
                            background: linear-gradient(90deg, #ffd600 0%, #ff9000 100%);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;">
                            ${finished} / ${total}
                        </div>
                    `;
                }
            }
        }
    },

    /**
     * Dọn dẹp menu và các tài nguyên liên quan
     */
    cleanup() {
        Features.cleanup();
        
        // Only show cleanup message if not already showing stop message
        if (!GLOBALS.isRunning) {
            UI.showMessage('👋 Menu closed! See you next time!', 'info');
        }
        
        GLOBALS.menu?.remove();
        GLOBALS.styleSheet?.remove();
        const overlay = document.getElementById('video-stats-overlay');
        overlay?.remove();
        
        // Remove event listeners
        if (this._videoClickHandler) {
            document.removeEventListener('click', this._videoClickHandler, true);
            document.removeEventListener('mousedown', this._videoClickHandler, true);
        }
        
        // Disconnect observer
        this._observer?.disconnect();
    }
};

// ============================================================
// 7. Khởi tạo Ứng dụng
// Xử lý việc thiết lập ứng dụng
// ============================================================

/**
 * Khởi tạo ứng dụng
 * Thiết lập cài đặt, tính năng và tạo menu
 */
function initialize() {
    const settings = Storage.getSettings();
    Features.setupAll(settings);
    MenuManager.initialize();
}

// Bắt đầu ứng dụng
initialize();
// Loader function to inject and run the script
function loadVideoProgressMenu(scriptUrl) {
    return new Promise((resolve, reject) => {
        // Clean up any existing instance
        const existingMenu = document.getElementById('video-stats-menu');
        const existingStyle = document.getElementById('video-progress-styles');
        const existingOverlay = document.getElementById('video-stats-overlay');
        const existingNotifications = document.getElementById('notifications-container');
        
        existingMenu?.remove();
        existingStyle?.remove();
        existingOverlay?.remove();
        existingNotifications?.remove();

        // Load and execute the script
        fetch(scriptUrl)
            .then(response => response.text())
            .then(code => {
                try {
                    // Execute the code
                    (new Function(code))();
                    resolve('Video Progress Menu loaded successfully!');
                } catch (error) {
                    reject(`Error executing script: ${error.message}`);
                }
            })
            .catch(error => reject(`Error loading script: ${error.message}`));
    });
}

// Quick loader command to copy-paste into console
// loadVideoProgressMenu('YOUR_SCRIPT_URL_HERE').then(console.log).catch(console.error);
