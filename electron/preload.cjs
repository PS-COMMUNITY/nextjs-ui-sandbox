/**
 * PC Repair 3D Studio — Electron preload (نموذج مصدر جاهز)
 * ⚠️ لم يُختبر في بيئة تطوير هذا المشروع — راجع docs/ELECTRON_GUIDE_AR.md.
 *
 * واجهة مقيّدة عمدًا: لا نكشف fs ولا Node إطلاقًا.
 * التطبيق يحفظ بياناته في localStorage الخاص بالواجهة،
 * ولذلك لا يحتاج هذا الجسر أي وظائف تقريبًا — نكشف اسم المنصة فقط.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('pcrsDesktop', {
  platform: process.platform, // 'win32' | 'darwin' | 'linux'
  isDesktop: true,
  // لا fs. لا ipcRenderer. لا shell. لا remote.
});
