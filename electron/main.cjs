/**
 * PC Repair 3D Studio — Electron main process (نموذج مصدر جاهز)
 * ⚠️ تنبيه صادق: هذا الملف لم يُنفَّذ ولم يُختبر في بيئة تطوير هذا المشروع
 * (بيئة سحابية Linux لا تبني حزم Windows). اختبره محليًا على جهاز Windows
 * باتباع docs/ELECTRON_GUIDE_AR.md قبل أي توزيع.
 *
 * إعدادات أمنية إلزامية مطبقة هنا:
 *  - contextIsolation: true  (عزل سياق الواجهة عن Node)
 *  - nodeIntegration: false  (لا صلاحيات Node للواجهة)
 *  - sandbox: true
 *  - preload محدود جدًا (انظر preload.cjs)
 *  - منع التنقل إلى أي موقع خارجي + منع فتح نوافذ خارجية
 *  - CSP صارمة تُحمَّل مع الصفحة
 */
const { app, BrowserWindow, shell, session, webContents } = require('electron');
const path = require('node:path');

// منع تشغيل أكثر من نسخة
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

/** مجلد بناء الواجهة الثابتة (من next build مع output:'export' → out/) */
const DIST_DIR = path.join(__dirname, '..', 'out');

function applySecurity() {
  // CSP صارمة: لا سكربتات خارجية، لا اتصالات خارجية — التطبيق يعمل محليًا بالكامل
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
        ],
      },
    });
  });

  // حجب أي طلب شبكة خارجي (التطبيق لا يحتاج إنترنت أصلًا)
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const u = details.url || '';
    const allowed = u.startsWith('file://') || u.startsWith('devtools://') || u.startsWith('chrome-extension://');
    callback(allowed ? {} : { cancel: true });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    title: 'PC Repair 3D Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,      // إلزامي
      nodeIntegration: false,      // إلزامي
      sandbox: true,               // إلزامي حيثما أمكن
      webviewTag: false,
      spellcheck: false,
      // عزل ملفات محلي فقط
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // منع التنقل خارج التطبيق
  win.webContents.on('willNavigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  // منع فتح نوافذ/روابط خارجية — افتحها في المتصفح النظام فقط عند الحاجة اليدوية
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // حماية من التنقل عبر منع سحب وإفلات الملفات
  win.webContents.on('will-attach-webview', () => {
    // webview معطل إطلاقًا (webviewTag:false)
  });

  win.loadFile(path.join(DIST_DIR, 'index.html'));
}

app.whenReady().then(() => {
  applySecurity();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
