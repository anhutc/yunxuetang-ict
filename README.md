# Course Assistant - Chrome Extension

![Course Assistant](https://img.shields.io/badge/Version-1.0.0-brightgreen) ![Chrome Extension](https://img.shields.io/badge/Platform-Chrome-blue)

A powerful and optimized Chrome extension designed to enhance your online learning experience on YunXueTang (https://luxshare-ict.yunxuetang.cn/). This extension provides automated course progression, background playback, and comprehensive lesson management with maximum performance and minimal resource usage.

## 🚀 Features

### 🤖 Auto-Learn Mode
- **Intelligent Progression**: Automatically progresses through course lessons
- **Smart Video Handling**: Optimized video playback at 2x speed
- **Completion Tracking**: Monitors lesson completion status
- **Re-study Mode**: Automatically reviews completed lessons with study time tracking
- **Error Recovery**: Robust error handling with automatic retry mechanisms

### 📊 Advanced Analytics
- **Real-time Progress Tracking**: Live course completion statistics
- **Detailed Lesson Insights**: Breakdown by lesson type (video, test, document)
- **Study Time Monitoring**: Track time spent on each lesson
- **Visual Progress Bars**: Interactive progress visualization
- **Completion Rate Analysis**: Detailed completion percentage tracking

## 📦 Installation

### Method 1: Load Unpacked Extension
1. **Download the extension**
   [https://github.com/anhutc/yunxuetang-ict](https://github.com/anhutc/yunxuetang-ict)

2. **Enable Developer Mode**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top-right corner

3. **Load Extension**
   - Click "Load unpacked"
   - Select the extension directory containing `manifest.json`

### Method 2: Install from Chrome Web Store
*(Coming soon)*

## 🛠 Usage

### Basic Operation
1. **Navigate to https://luxshare-ict.yunxuetang.cn/**
   - Visit any course page on `https://luxshare-ict.yunxuetang.cn/`
   - The extension automatically activates

2. **Access Extension**
   - Click the Course Assistant icon in Chrome toolbar
   - The optimized popup interface will appear

3. **Enable Features**
   - Toggle "Auto-learn" in the General tab
   - Monitor progress in real-time
   - Browse lessons in the Lessons tab

### Auto-Learn Mode
- **Automatic Progression**: Extension automatically moves through lessons
- **Video Handling**: Plays videos at 2x speed automatically
- **Quiz Navigation**: Automatically progresses through quizzes and tests
- **Completion Detection**: Recognizes when lessons are completed
- **Continuous Operation**: Runs in background without user intervention

### Manual Control
- **Lesson Selection**: Click any lesson in the list to navigate directly
- **Search Functionality**: Filter lessons by name or type
- **Status Monitoring**: View completion status for all lessons
- **Progress Tracking**: Monitor overall course completion


## 🐛 Troubleshooting

### Common Issues

**Extension not loading on course pages**
- Verify you're on a valid YunXueTang course page
- Check Chrome extension permissions
- Reload the page and try again

**Auto-learn not progressing**
- Ensure Auto-learn is enabled in popup
- Check if lessons are properly detected
- Verify page is fully loaded

### Debug Mode
Enable detailed logging in `config.js`:
```javascript
export const LOG_LEVEL = 4; // 0=off, 4=debug
```

## 🔧 Development

### Building from Source
**Load in Developer Mode**
- Follow installation steps above
- Make changes to source files
- Reload extension to test changes

### File Structure
```
Course Assistant - interface/
├── images/
    ├── icon128.png
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    ├── yunxuetang.png
└── src/
    └── modules/
        ├── lessonManager.js    # Lesson management
        ├── autoLearn.js        # Auto-learning
        └── autoBackground.js   # Background playback
    ├── background.js         # Background service worker
    ├── config.js             # Configuration
    ├── content.js            # Content script
├── i18n.js               # Internationalization
├── manifest.json          # Extension manifest
├── popup.html            # Popup structure
├── popup.js              # Popup logic
├── popup.css             # Styles

```
## 🤝 Support

- **Issues**: [GitHub Issues](https://github.com/anhutc/yunxuetang-ict/issues)
- **Email**: [anhutck58@gmail.com](mailto:anhutck58@gmail.com)
- **Website**: [https://anhutc.github.io/](https://anhutc.github.io/)

---

**Note**: This extension is designed for educational purposes and should be used in accordance with https://luxshare-ict.yunxuetang.cn/ terms of service. The developers are not responsible for any misuse of this software.

<div align="center">

**⭐ Star this repo if you find it helpful!**

</div>
