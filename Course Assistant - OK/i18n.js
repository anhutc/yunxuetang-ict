const languages = {
    en: {
        // App info
        appName: 'Course Assistant',
        version: 'v1.0.0',
        
        // Tabs navigation
        general: 'General',
        lessons: 'Lessons',
        
        // General tab
        courseProgress: 'Course Progress',
        function: 'Function',
        autoLearn: 'Auto-learn unfinished lessons',
        backgroundBrowser: 'Background Browser',
        
        // Lesson types
        searchPlaceholder: 'Search lessons...',
        video: 'Video',
        test: 'Test',
        
        // Table headers
        type: 'Type',
        lessonName: 'Lesson Name',
        studyTime: 'Study Time',
        status: 'Status',
        
        // Messages
        noLessons: 'No lessons found',
        noLessonsHint: 'Please visit a course page to view lessons'
    },
    vi: {
        // App info
        appName: 'Course Assistant',
        version: 'v1.0.0',
        
        // Tabs
        general: 'Tổng quan',
        lessons: 'Bài học',
        
        // General tab
        courseProgress: 'Tiến độ khóa học',
        function: 'Chức năng',
        autoLearn: 'Tự động học bài chưa hoàn thành',
        backgroundBrowser: 'Trình duyệt nền',
        
        // Lesson types
        searchPlaceholder: 'Tìm kiếm bài học...',
        video: 'Video',
        test: 'Bài thi',
        
        // Table headers
        type: 'Loại',
        lessonName: 'Tên bài học',
        studyTime: 'Thời gian',
        status: 'Trạng thái',
        
        // Messages
        noLessons: 'Không tìm thấy bài học',
        noLessonsHint: 'Vui lòng truy cập trang khóa học để xem bài học'
    }
};

// Get current language from storage or default to English
async function getCurrentLanguage() {
    const result = await chrome.storage.sync.get('language');
    return result.language || 'en';
}

// Get translation string
async function getTranslation(key) {
    const lang = await getCurrentLanguage();
    const keys = key.split('.');
    let value = languages[lang];
    
    for (const k of keys) {
        value = value[k];
        if (!value) return key;
    }
    
    return value;
}

// Set language
async function setLanguage(lang) {
    await chrome.storage.sync.set({ language: lang });
    await updateUI();
}

// Update UI with current language
async function updateUI() {
    const elements = document.querySelectorAll('[data-i18n]');
    for (const element of elements) {
        const key = element.getAttribute('data-i18n');
        element.textContent = await getTranslation(key);
    }
    
    // Update placeholders
    const elements_placeholder = document.querySelectorAll('[data-i18n-placeholder]');
    for (const element of elements_placeholder) {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = await getTranslation(key);
    }
}

export { getCurrentLanguage, getTranslation, setLanguage, updateUI }; 