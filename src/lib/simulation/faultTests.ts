/**
 * faultTests.ts — اختبارات آلية لمنطق محرك الأعطال (14 عطلًا).
 *
 * تُنفَّذ في المتصفح وتُعرض نتائجها في واجهة التشخيص — كل اختبار يتحقق من:
 *  1) النقاء: apply لا يُعدّل الحالة المُدخلة (مقارنة JSON قبل/بعد).
 *  2) التركيب: العطل المركّب فعلاً يعطي نتيجة POST المتوقعة (بعد التشغيل المرجعي).
 *  3) الإصلاح: بعد الإصلاح المرجعي يصبح isFixed صحيحًا.
 *  4) المصير السليم: بعد الإصلاح POST ناجح وإقلاع سليم (POST_PASS_BOOT_OK).
 *  5) الشاشة: حالة العرض المتوقعة قبل الإصلاح (preScreen) بعد انقضاء التمهيد.
 */

import { initialSimulationState, type SimulationState } from '../types';
import { runPost } from './postEngine';
import { computeMonitorView } from './monitorEngine';
import { FAULTS, fixFault, poweredState, type FaultDef } from '../data/faults';

export interface FaultTestResult {
  faultId: string;
  titleAr: string;
  ok: boolean;
  checksAr: string[]; // وصف كل فحص مع نتيجته
}

/** يبني حالة اختبار: عطل مركّب على حالة أولية نظيفة ثم تشغيل مرجعي.
 *  نعيد توصيل الكهرباء والغطاء مُغلق — إلا إذا كان فصل الكهرباء هو العطل نفسه (F01). */
function faultedPowered(fault: FaultDef): SimulationState {
  const s = fault.apply(initialSimulationState());
  s.flags.powerOn = true;
  s.flags.panelOpen = false;
  if (!fault.acIsTheFault) s.flags.acConnected = true;
  return s;
}

/** تنفيذ كل الاختبارات — دالة نقية تعيد نتائج قابلة للعرض مباشرة */
export function runFaultSelfTests(): FaultTestResult[] {
  const results: FaultTestResult[] = [];

  for (const fault of FAULTS) {
    const checksAr: string[] = [];
    let ok = true;

    // (1) النقاء: apply/fix لا يعدلان المدخل
    try {
      const before = initialSimulationState();
      const snapshot = JSON.stringify(before);
      fault.apply(before);
      const pureApply = JSON.stringify(before) === snapshot;
      fault.fix(before);
      const pureFix = JSON.stringify(before) === snapshot;
      checksAr.push(`${pureApply && pureFix ? '✓' : '✗'} النقاء: apply/fix لا يعدلان الحالة المُدخلة`);
      if (!pureApply || !pureFix) ok = false;
    } catch {
      checksAr.push('✗ النقاء: استثناء أثناء التحقق');
      ok = false;
    }

    // (2) النتيجة المتوقعة مع العطل (بعد التشغيل المرجعي)
    try {
      const faulted = faultedPowered(fault);
      const code = runPost(faulted).code;
      checksAr.push(`${code === fault.preCode ? '✓' : '✗'} نتيجة POST مع العطل: ${code} (متوقع ${fault.preCode})`);
      if (code !== fault.preCode) ok = false;

      // (5) الشاشة المتوقعة بعد انقضاء التمهيد (8 ثوانٍ)
      const view = computeMonitorView(faulted, 8000);
      checksAr.push(`${view.screen === fault.preScreen ? '✓' : '✗'} حالة الشاشة مع العطل: ${view.screen} (متوقع ${fault.preScreen})`);
      if (view.screen !== fault.preScreen) ok = false;
    } catch {
      checksAr.push('✗ فشل تشغيل المحاكاة مع العطل');
      ok = false;
    }

    // (3)(4) الإصلاح المرجعي والمصير السليم
    try {
      const fixed = poweredState(fixFault(faultedPowered(fault), fault.id));
      const fixedOk = fault.isFixed(fixed);
      checksAr.push(`${fixedOk ? '✓' : '✗'} isFixed بعد الإصلاح المرجعي`);
      if (!fixedOk) ok = false;

      const code = runPost(fixed).code;
      checksAr.push(`${code === 'POST_PASS_BOOT_OK' ? '✓' : '✗'} POST بعد الإصلاح: ${code} (متوقع POST_PASS_BOOT_OK)`);
      if (code !== 'POST_PASS_BOOT_OK') ok = false;

      const view = computeMonitorView(fixed, 8000);
      checksAr.push(`${view.screen === 'os' ? '✓' : '✗'} الشاشة بعد الإصلاح: ${view.screen} (متوقع os)`);
      if (view.screen !== 'os') ok = false;
    } catch {
      checksAr.push('✗ فشل الإصلاح المرجعي');
      ok = false;
    }

    results.push({ faultId: fault.id, titleAr: fault.titleAr, ok, checksAr });
  }

  return results;
}

/** ملخص نصي لعرضه بجانب النتائج */
export function summarizeFaultTests(results: FaultTestResult[]): { total: number; passed: number; allOk: boolean } {
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  return { total, passed, allOk: total > 0 && passed === total };
}
