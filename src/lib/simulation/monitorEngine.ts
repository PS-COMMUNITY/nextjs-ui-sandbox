/**
 * monitorEngine.ts — محرك الشاشة الخارجية (8 حالات مرئية) — منطق نقّي بلا مشهد.
 *
 * يحدّد ماذا تعرض شاشة العرض الافتراضية في أي لحظة اعتمادًا على حالة المحاكاة
 * والزمن المنقضي منذ ضغط زر التشغيل (bootElapsedMs). هذه الدالة هي المصدر
 * الوحيد للحقيقة الذي يقرأه رسّام نسيج الشاشة في المشهد (screenTexture).
 *
 * تسلسل التمهيد المعتمد:
 *   0    → 2200ms : شعار بدء التشغيل (booting)
 *   2200 → 4800ms : رسائل POST تُكتب سطرًا سطرًا (post)
 *   4800ms+      : حسم النتيجة (فشل POST / تحذير / BIOS بلا إقلاع / نجاح)
 *   4800 → 6800ms: شاشة نجاح عند اكتمال التجميعة
 *   6800ms+      : نظام افتراضي مبسّط (os) — الكتابة بلوحة المفاتيح متاحة
 */

import { isInstalled } from '../types';
import type { MonitorScreen, SimulationState } from '../types';
import { runPost } from './postEngine';

export const BOOT_LOGO_MS = 2200;
export const BOOT_POST_MS = 4800;
export const BOOT_SUCCESS_MS = 6800;

export const MONITOR_SCREEN_INFO: Record<MonitorScreen, { labelAr: string; hintAr: string }> = {
  off: { labelAr: 'مطفأة', hintAr: 'الشاشة نفسها مطفأة بزرها أو بلا كهرباء' },
  noSignal: { labelAr: 'لا إشارة', hintAr: 'الشاشة تعمل لكن لا مصدر إشارة يصلها' },
  booting: { labelAr: 'شعار البدء', hintAr: 'الجهاز يمر بمرحلة التهيئة الأولى' },
  post: { labelAr: 'رسائل POST', hintAr: 'الاختبار الذاتي يكتب نتائجه سطرًا سطرًا' },
  bios: { labelAr: 'إعدادات UEFI', hintAr: 'لا جهاز إقلاع — دخل النظام الإعدادات تلقائيًا' },
  warning: { labelAr: 'تحذير', hintAr: 'POST ناجح مع تنبيه يحتاج انتباهك' },
  success: { labelAr: 'نجاح', hintAr: 'كل الفحوص سليمة — الإقلاع جارٍ' },
  os: { labelAr: 'نظام افتراضي', hintAr: 'سطح مكتب مبسّط — يمكنك الكتابة بلوحة المفاتيح' },
};

export interface MonitorView {
  screen: MonitorScreen;
  bootProgress: number;      // 0..1 خلال مرحلتي الشعار وPOST
  postLinesAr: string[];     // أسطر POST المكتوبة حتى الآن
  bootDevicesAr: string[];   // أجهزة الإقلاع المكتشفة (لشاشة BIOS)
  canType: boolean;          // لوحة المفاتيح تقتبس إلى النظام الافتراضي
}

/** تسلسل POST متكيف مع حالة الجهاز — لا يعرض نجاح فحص لقطعة مفقودة (دقة تعليمية v3 §17) */
function buildPostSequence(sim: SimulationState): string[] {
  return [
    isInstalled(sim.parts.cpu) ? 'Detecting CPU ... OK (LGA1700)' : 'Detecting CPU ... NOT DETECTED',
    isInstalled(sim.parts.ram) ? 'Memory Training (DDR5) ... OK' : 'Memory Training ... NO MEMORY MODULES',
    'Initializing PCIe Devices ... OK',
    'Detecting Storage Devices ...',
    'Loading Boot Options ...',
  ];
}

export function computeMonitorView(sim: SimulationState, bootElapsedMs: number): MonitorView {
  const { flags, parts, peripherals } = sim;

  const idle: MonitorView = {
    screen: 'noSignal',
    bootProgress: 0,
    postLinesAr: [],
    bootDevicesAr: [],
    canType: false,
  };

  // 1) الشاشة نفسها مطفأة بزرها.
  if (!peripherals.monitorOn) {
    return { ...idle, screen: 'off' };
  }

  // 2) لا مصدر إشارة إطلاقًا: مزود ميت / جهاز مطفأ / غير موصول.
  if (peripherals.psuDead || !flags.powerOn || !flags.acConnected) {
    return idle;
  }

  // 3) مسار العرض مقطوع: كابل الإشارة مفصول أو لا بطاقة رسوميات.
  if (!peripherals.monitorCableConnected || !isInstalled(parts.gpu)) {
    return idle;
  }

  // 4) مراحل التمهيد الزمنية.
  if (bootElapsedMs < BOOT_LOGO_MS) {
    return {
      ...idle,
      screen: 'booting',
      bootProgress: Math.max(0, bootElapsedMs / BOOT_LOGO_MS),
    };
  }

  if (bootElapsedMs < BOOT_POST_MS) {
    // رسائل POST تتكشف سطرًا سطرًا (~650ms لكل سطر) — آخر سطر «يبحث عن أجهزة التخزين»
    const seq = buildPostSequence(sim);
    const shown = Math.min(seq.length, Math.floor((bootElapsedMs - BOOT_LOGO_MS) / 650) + 1);
    return {
      ...idle,
      screen: 'post',
      bootProgress: (bootElapsedMs - 0) / BOOT_POST_MS,
      postLinesAr: seq.slice(0, shown),
    };
  }

  // 5) حسم النتيجة عبر محرك POST (المصدر الوحيد — لا منطق موازي).
  const finding = runPost(sim);
  const storageOk =
    isInstalled(parts.ssd) ||
    (isInstalled(parts.hdd) && isInstalled(parts.sataData) && isInstalled(parts.sataPower));

  const bootDevicesAr: string[] = [];
  if (isInstalled(parts.ssd)) bootDevicesAr.push('M.2 NVMe — 1000GB (UEFI)');
  if (isInstalled(parts.hdd) && isInstalled(parts.sataData) && isInstalled(parts.sataPower)) {
    bootDevicesAr.push('SATA HDD 3.5" — 1TB');
  } else if (isInstalled(parts.hdd)) {
    bootDevicesAr.push('SATA HDD — غير موصول (تحقق من الكابلين)');
  }

  if (finding.code === 'POST_FAIL') {
    // أسطر الفشل: أعد الملاحظات المختصرة على الشاشة
    return {
      ...idle,
      screen: 'post',
      bootProgress: 1,
      postLinesAr: [...buildPostSequence(sim), '!! POST FAILED — SYSTEM HALTED !!', ...finding.detailsAr.slice(0, 1)],
    };
  }

  if (finding.code === 'POST_PASS_BOOT_WARNING') {
    if (!storageOk) {
      // لا جهاز إقلاع → دخول UEFI تلقائيًا (المصير الثاني المطلوب)
      return {
        ...idle,
        screen: 'bios',
        bootProgress: 1,
        postLinesAr: [...buildPostSequence(sim), 'No bootable device found — entering UEFI Setup ...'],
        bootDevicesAr,
      };
    }
    // تحذيرات ما بعد POST (مبرد/طاقة بطاقة/تهوية)
    return {
      ...idle,
      screen: 'warning',
      bootProgress: 1,
      postLinesAr: [...buildPostSequence(sim), 'POST OK with warning — ' + finding.titleAr],
    };
  }

  // POST ناجح وإقلاع سليم
  if (bootElapsedMs < BOOT_SUCCESS_MS) {
    return { ...idle, screen: 'success', bootProgress: 1 };
  }
  return { ...idle, screen: 'os', bootProgress: 1, canType: true };
}
