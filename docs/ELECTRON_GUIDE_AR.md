# دليل بناء نسخة Windows (Electron) — PC Repair 3D Studio v2.0.0

> **تنبيه صدق أولًا:** هذه الخطوات **لم تُختبر في بيئة تطوير هذا المشروع إطلاقًا** (BLOCKED). بيئة التطوير سحابية Linux لا تدعم بناء حزم Windows، ولم يُبنَ ملف تثبيت ولا شُغِّل Electron هنا. هذا الدليل مرجع جاهز للتجربة **محليًا على جهاز Windows**، والأكواد فيه نماذج للنسخ تُراجع وتُجرَّب قبل الاعتماد عليها.

## المتطلب الأساسي

التطبيق نفسه تطبيق ويب يعمل في المتصفح (Next.js). نسخة Windows تعني تغليفه في قشرة Electron. المحتويات المطلوبة غير موجودة جاهزة في المستودع — أنشئها محليًا وفق الخطوات التالية.

## 1) تثبيت الأدوات

```bash
npm i -D electron electron-builder
```

## 2) بناء تطبيق الويب أولًا

```bash
npm run build      # ينتج .next/standalone + static + public
```

## 3) ملف `electron/main.cjs` (نموذج — أنشئه محليًا)

الإعدادات الأمنية **إلزامية كلها** في هذا الملف:

```js
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1366, height: 768,
    webPreferences: {
      contextIsolation: true,   // إلزامي: عزل السياق
      nodeIntegration: false,   // إلزامي: لا Node داخل الصفحة
      sandbox: true,            // إلزامي: وضع الحماية
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // منع أي تنقل خارجي (التطبيق يعمل محليًا فقط)
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost')) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    e?.preventDefault?.();
    return { action: 'deny' };
  });

  // CSP صارم يمنع السكربتات الخارجية
  win.webContents.session.webRequest.onHeadersReceived((d, cb) => {
    cb({
      responseHeaders: {
        ...d.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"],
      },
    });
  });

  win.loadURL('http://localhost:3000'); // أو loadFile على ملفات البناء بعد تجهيز استضافة محلية
});
```

## 4) ملف `electron/preload.cjs` (نموذج — محدود الغرض)

```js
const { contextBridge } = require('electron');
// لا تكشف أي شيء من Node — الجسر فارغ لأن التطبيق لا يحتاج أي وصول للنظام
contextBridge.exposeInMainWorld('pcrsDesktop', { isDesktop: true });
```

## 5) إعدادات `electron-builder` في `package.json` (نموذج)

```json
{
  "build": {
    "appId": "edu.pcrs.studio",
    "productName": "PC Repair 3D Studio",
    "files": [".next/standalone/**", ".next/static/**", "public/**", "electron/**"],
    "win": { "target": "nsis" }
  }
}
```

## 6) أمر البناء

```bash
npx electron-builder --win nsis    # ينتج مثبّت NSIS ‏.exe على جهاز Windows
```

## 7) قائمة التحقق الأمنية (راجعها قبل أي توزيع)

- [ ] `contextIsolation: true` و`nodeIntegration: false` و`sandbox: true` فعليًا في النافذة.
- [ ] `preload` لا يكشف سوى حقل معلومات واحد (أو أفرغه كليًا إن لم يلزم).
- [ ] CSP صارم يُرسل مع كل استجابة، ومنع التنقل والنوافذ الخارجية.
- [ ] لا `remote`، لا تحميل محتوى بعيد، لا تعطيل `webSecurity`.
- [ ] خصوصية التطبيق محفوظة: لا أي طلبات شبكة صادرة (التطبيق localStorage فقط).

## ما لم يُختبر (كرر نفس الصدق)

- لم يُنفَّذ `electron-builder --win nsis` ولا أي خطوة من الخطوات أعلاه في بيئة هذا المشروع.
- لم يُختبر تثبيت NSIS ولا تشغيل التطبيق تحت Windows ولا سلوك WebGL (ANGLE/D3D) داخل Electron.
- التوقيع الرقمي للمثبت غير معالج في هذا الدليل — يبقى المثبت غير موقّع وقد يحذّر Windows SmartScreen.
- البيئة المستهدفة للتشغيل الموصى بها: Windows 10/11 مع متصفح مضمّن Chromium حديث داخل Electron.
