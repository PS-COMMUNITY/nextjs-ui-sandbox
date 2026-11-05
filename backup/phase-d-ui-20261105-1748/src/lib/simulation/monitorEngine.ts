/**
 * monitorEngine.ts — محرك الشاشة الخارجية (حالات مرئية) — منطق نقّي بلا مشهد.
 *
 * يحدّد ماذا تعرض شاشة العرض الافتراضية في أي لحظة اعتمادًا على حالة المحاكاة
 * والزمن المنقضي منذ ضغط زر التشغيل (bootElapsedMs). هذه الدالة هي المصدر
 * الوحيد للحقيقة الذي يقرأه رسّام نسيج الشاشة في المشهد.
 *
 * V6: هدف الإقلاع يُحسم من مصدر الحقيقة الواحد:
 *   وسيط USB مُدخل وأولوية إقلاعه أولًا ⇒ معالج التثبيت (os — يديره VOS بوضع setup)
 *   قرص عليه نظام مثبت ⇒ النظام الافتراضي (os — سطح المكتب التفاعلي)
 *   أقراص موجودة بلا نظام ⇒ UEFI مع رسالة «Operating System not found»
 *   طلب دخول الإعدادات ⇒ UEFI Setup مباشرة بعد POST
 */

import { isInstalled } from '../types';
import type { MonitorScreen, SimulationState } from '../types';
import { runPost } from './postEngine';
import { getFamily } from '../data/windowsCatalog';

// (تنظيف S7) ثوابت زمنية داخلية فقط — لا يوجد أي مستوردٍ خارجي لها (تحقق بالفحص الآلي).
const BOOT_LOGO_MS = 2200;
const BOOT_POST_MS = 4800;
const BOOT_SUCCESS_MS = 6800;

export const MONITOR_SCREEN_INFO: Record<MonitorScreen, { labelAr: string; hintAr: string }> = {
  off: { labelAr: 'مطفأة', hintAr: 'الشاشة نفسها مطفأة بزرها أو بلا كهرباء' },
  noSignal: { labelAr: 'لا إشارة', hintAr: 'الشاشة تعمل لكن لا مصدر إشارة يصلها' },
  booting: { labelAr: 'شعار البدء', hintAr: 'الجهاز يمر بمرحلة التهيئة الأولى' },
  post: { labelAr: 'رسائل POST', hintAr: 'الاختبار الذاتي يكتب نتائجه سطرًا سطرًا' },
  bios: { labelAr: 'إعدادات UEFI', hintAr: 'بيئة البرنامج الثابت — إقلاع/إعدادات/قائمة أجهزة' },
  warning: { labelAr: 'تحذير', hintAr: 'POST ناجح مع تنبيه يحتاج انتباهك' },
  success: { labelAr: 'نجاح', hintAr: 'كل الفحوص سليمة — الإقلاع جارٍ' },
  os: { labelAr: 'نظام افتراضي', hintAr: 'بيئة تفاعلية كاملة — ماوس وكيبورد حقيقيان' },
};

export interface MonitorView {
  screen: MonitorScreen;
  bootProgress: number;      // 0..1 خلال مرحلتي الشعار وPOST
  postLinesAr: string[];     // أسطر POST المكتوبة حتى الآن
  bootDevicesAr: string[];   // أجهزة الإقلاع المكتشفة (لشاشة BIOS)
  canType: boolean;          // لوحة المفاتيح تقتبس إلى النظام الافتراضي
}

/** قرص إقلاع فعلي: مثبت وموصول (للأقراص SATA يحتاج الكابلين) */
function diskAvailable(sim: SimulationState, id: string): boolean {
  if (id === 'm2-1') return isInstalled(sim.parts.ssd);
  if (id === 'hdd-1') return isInstalled(sim.parts.hdd) && isInstalled(sim.parts.sataData) && isInstalled(sim.parts.sataPower);
  return false;
}

/** هل يوجد قرص إقلاع صالح (مثبت وموصول) — يُستخدم لعرض الأجهزة في UEFI */
export function bootableDevices(sim: SimulationState): Array<{ id: string; labelAr: string; hasOs: boolean }> {
  const out: Array<{ id: string; labelAr: string; hasOs: boolean }> = [];
  for (const disk of sim.disks) {
    if (!diskAvailable(sim, disk.id)) continue;
    const osLabel = sim.os.installed ? ` — ${getFamily(sim.os.installed).nameEn}` : ' — بدون نظام';
    const style = disk.style ? (disk.style === 'gpt' ? 'GPT' : 'MBR') : 'غير مهيأ';
    out.push({ id: disk.id, labelAr: `${disk.labelAr} ${style} ${disk.bus.toUpperCase()}${osLabel}`, hasOs: sim.os.installed !== null && disk.parts.some((p) => p.hasOs) });
  }
  return out;
}

/** تسلسل POST متكيف مع حالة الجهاز — لا يعرض نجاح فحص لقطعة مفقودة (دقة تعليمية) */
function buildPostSequence(sim: SimulationState): string[] {
  return [
    // (إصلاح S1) سطر كشف اللوحة الأم أولًا — غيابها/تلفها يُفشل POST قبل أي فحص آخر
    isInstalled(sim.parts.motherboard) ? 'Detecting Motherboard ... OK' : 'Detecting Motherboard ... NOT DETECTED',
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
  // (إصلاح S2) تقدم إقلاع واحد رتيب (لا ينزل أبدًا) عبر مرحلتي الشعار ثم POST:
  // نافذة POST تنتهي عند الزمن المطلق BOOT_POST_MS، فالنسبة = المنقضي / BOOT_POST_MS
  // من 0 حتى 1.0 بالضبط عند نهاية POST — بلا قفزة 1.0→0.46 عند الانتقال booting→post.
  const bootProgress = Math.min(1, Math.max(0, bootElapsedMs / BOOT_POST_MS));
  if (bootElapsedMs < BOOT_LOGO_MS) {
    return {
      ...idle,
      screen: 'booting',
      bootProgress,
    };
  }

  if (bootElapsedMs < BOOT_POST_MS) {
    const seq = buildPostSequence(sim);
    const shown = Math.min(seq.length, Math.floor((bootElapsedMs - BOOT_LOGO_MS) / 650) + 1);
    return {
      ...idle,
      screen: 'post',
      bootProgress,
      postLinesAr: seq.slice(0, shown),
    };
  }

  // 5) حسم النتيجة عبر محرك POST (المصدر الوحيد — لا منطق موازٍ).
  const finding = runPost(sim);
  const devices = bootableDevices(sim);
  const devicesAr = devices.map((d) => d.labelAr);

  // (إصلاح S1) مزود الطاقة غائب أو تالف بتلف مباشر — لا يصل أي جهد فتبقى الشاشة
  // بلا إشارة إطلاقًا (مسار psuDead/F12 يُعالج أعلاه في الخطوة 2 قبل الوصول إلى هنا).
  if (finding.code === 'POWER_OFF') {
    return idle;
  }

  if (finding.code === 'POST_FAIL') {
    return {
      ...idle,
      screen: 'post',
      bootProgress: 1,
      postLinesAr: [...buildPostSequence(sim), '!! POST FAILED — SYSTEM HALTED !!', ...finding.detailsAr.slice(0, 1)],
    };
  }

  if (finding.code === 'POST_PASS_BOOT_WARNING' && devices.length === 0) {
    // لا جهاز إقلاع → دخول UEFI تلقائيًا
    return {
      ...idle,
      screen: 'bios',
      bootProgress: 1,
      postLinesAr: [...buildPostSequence(sim), 'No bootable device found — entering UEFI Setup ...'],
      bootDevicesAr: devicesAr,
    };
  }

  if (finding.code === 'POST_PASS_BOOT_WARNING') {
    // تحذيرات ما بعد POST (مبرد/طاقة بطاقة/تهوية)
    return {
      ...idle,
      screen: 'warning',
      bootProgress: 1,
      postLinesAr: [...buildPostSequence(sim), 'POST OK with warning — ' + finding.titleAr],
    };
  }

  // ===== POST ناجح: حسم هدف الإقلاع (V6) =====

  // طلب صريح للدخول إلى إعدادات UEFI (DEL / زر الواجهة) — يُعرض بعد اكتمال POST
  if (sim.firmware.setupRequested) {
    return {
      ...idle,
      screen: 'bios',
      bootProgress: 1,
      postLinesAr: [...buildPostSequence(sim), 'Entering UEFI Setup ...'],
      bootDevicesAr: devicesAr,
    };
  }

  // الوسيط المُدخل أولوية الإقلاع له ⇒ معالج التثبيت داخل بيئة الوسيط
  if (sim.usbMedia && sim.firmware.bootOrder[0] === 'usb') {
    // (V6-D) حاجز توافق وضع الإقلاع: XP/Vista تقلع BIOS فقط و11 تقلع UEFI فقط —
    // المحاكاة ترفض الإقلاع من الوسيط وتشرح السبب (سلوك واقعي موثق)
    const fam = getFamily(sim.usbMedia);
    if (!fam.bootModes.includes(sim.firmware.bootMode)) {
      return {
        ...idle,
        screen: 'bios',
        bootProgress: 1,
        postLinesAr: [
          ...buildPostSequence(sim),
          `Boot mode mismatch: ${fam.nameEn} requires ${fam.bootModes.join('/').toUpperCase()} boot.`,
          `This platform is set to ${sim.firmware.bootMode.toUpperCase()} — unable to boot from installation media.`,
          'بدّل وضع الإقلاع من إعدادات البرنامج الثابت (تبويب Boot ← مفتاح Boot Mode) ثم أعد المحاولة.',
        ],
        bootDevicesAr: devicesAr,
      };
    }
    if (bootElapsedMs < BOOT_SUCCESS_MS) {
      return { ...idle, screen: 'success', bootProgress: 1 };
    }
    return { ...idle, screen: 'os', bootProgress: 1, bootDevicesAr: devicesAr, canType: false };
  }

  // قرص عليه نظام مثبت ⇒ الإقلاع إليه (VOS يدير سطح المكتب أو شاشة الإصلاح)
  const osDisk = devices.find((d) => d.hasOs);
  if (osDisk) {
    if (bootElapsedMs < BOOT_SUCCESS_MS) {
      return { ...idle, screen: 'success', bootProgress: 1 };
    }
    // الكتابة اللوحية متاحة على سطح المكتب فقط (لا أثناء الاسترداد)
    return { ...idle, screen: 'os', bootProgress: 1, bootDevicesAr: devicesAr, canType: !sim.os.bcdCorrupt };
  }

  // أقراص موجودة لكن بلا نظام تشغيل ⇒ «Operating System not found» + UEFI
  if (devices.length > 0) {
    return {
      ...idle,
      screen: 'bios',
      bootProgress: 1,
      postLinesAr: [
        ...buildPostSequence(sim),
        'Reboot and Select proper Boot device',
        'or Insert Boot Media in selected Boot device',
      ],
      bootDevicesAr: devicesAr,
    };
  }

  // لا أقراص إطلاقًا
  return {
    ...idle,
    screen: 'bios',
    bootProgress: 1,
    postLinesAr: [...buildPostSequence(sim), 'No bootable device found — entering UEFI Setup ...'],
    bootDevicesAr: devicesAr,
  };
}
