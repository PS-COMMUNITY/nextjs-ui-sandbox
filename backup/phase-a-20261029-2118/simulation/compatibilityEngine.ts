/**
 * compatibilityEngine.ts — محرك قواعد توافق التجميعة (Build Compatibility).
 *
 * تسع قواعد ثابتة المعرف (ruleId) تُعاد جميعها دائمًا — حتى مع خيارات ناقصة
 * تصبح «تحتاج مراجعة» بصيغة «اختر … أولًا». كل الأحكام منطقية بحتة وpure.
 * قراءة المواصفات تتم من specs (قيم نصية) مع تحمّل للاختلافات الطفيفة في الكتابة.
 */

import type {
  BuildOption,
  BuildSelection,
  BuildSlot,
  CompatibilityRuleResult,
  RuleVerdict,
} from '../types';
import { estimatePower, readSpecNumber } from './powerEstimator';

/** خانات التجميعة الثماني — كلها مطلوبة في المنصة المرجعية. */
export const BUILD_SLOTS: { slot: BuildSlot; labelAr: string; required: boolean }[] = [
  { slot: 'cpu', labelAr: 'المعالج', required: true },
  { slot: 'motherboard', labelAr: 'اللوحة الأم', required: true },
  { slot: 'ram', labelAr: 'الذاكرة', required: true },
  { slot: 'gpu', labelAr: 'بطاقة الرسوميات', required: true },
  { slot: 'psu', labelAr: 'مزود الطاقة', required: true },
  { slot: 'ssd', labelAr: 'قرص التخزين', required: true },
  { slot: 'cooler', labelAr: 'المبرد', required: true },
  { slot: 'case', labelAr: 'الهيكل', required: true },
];

/** يبحث عن خيار محدد في خانة معينة — يتعامل مع id الفارغ/الغائب. */
export function findOption(options: BuildOption[], slot: BuildSlot, id?: string): BuildOption | undefined {
  if (id === undefined || id === '') return undefined;
  return options.find((o) => o.slot === slot && o.id === id);
}

// ============ أدوات قراءة المواصفات ============

function normalizeSpec(v: string | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

function listSpec(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
}

function mkResult(
  ruleId: string,
  titleAr: string,
  status: RuleVerdict,
  reasonAr: string,
): CompatibilityRuleResult {
  return { ruleId, titleAr, status, reasonAr };
}

function missingReview(ruleId: string, titleAr: string, names: string[]): CompatibilityRuleResult {
  return mkResult(ruleId, titleAr, 'needs-review', `اختر ${names.join(' و')} أولًا لفحص هذه القاعدة.`);
}

/** عدد موصلات PCIe التي تحتاجها البطاقة حسب قيمة powerConnector. */
function pcieConnectorsNeeded(spec: string): number | null {
  const v = normalizeSpec(spec);
  if (v === '') return null;
  if (v === 'none' || v === '0') return 0;
  if (v === '8pin+6pin' || v === '6pin+8pin' || v === '8+6' || v === '6+8') return 2;
  if (v === '8pin' || v === '6pin' || v === '8' || v === '6') return 1;
  if (v.includes('8pin') && v.includes('6pin')) return 2;
  if (v.includes('8pin') || v.includes('6pin')) return 1;
  return null; // قيمة غير مفهومة
}

/**
 * يفحص توافق التجميعة ويعيد نتائج القواعد التسع كلها (بالترتيب الثابت).
 * القواعد: socket-match, ram-type, board-case, gpu-length, cooler-fit,
 * psu-capacity, gpu-power-connector, eps-present, m2-slot.
 */
export function checkCompatibility(sel: BuildSelection, options: BuildOption[]): CompatibilityRuleResult[] {
  const cpu = findOption(options, 'cpu', sel.cpu);
  const mb = findOption(options, 'motherboard', sel.motherboard);
  const ram = findOption(options, 'ram', sel.ram);
  const gpu = findOption(options, 'gpu', sel.gpu);
  const psu = findOption(options, 'psu', sel.psu);
  const ssd = findOption(options, 'ssd', sel.ssd);
  const cooler = findOption(options, 'cooler', sel.cooler);
  const chassis = findOption(options, 'case', sel.case);

  const results: CompatibilityRuleResult[] = [];

  // ===== 1) socket-match: مقبس المعالج مقابل مقبس اللوحة =====
  {
    if (cpu === undefined || mb === undefined) {
      results.push(missingReview('socket-match', 'تطابق مقبس المعالج', [
        ...(cpu === undefined ? ['المعالج'] : []),
        ...(mb === undefined ? ['اللوحة الأم'] : []),
      ]));
    } else {
      const cpuSocket = cpu.specs['socket'] ?? '';
      const mbSocket = mb.specs['socket'] ?? '';
      if (cpuSocket !== '' && cpuSocket === mbSocket) {
        results.push(mkResult('socket-match', 'تطابق مقبس المعالج', 'compatible',
          `المقبس متطابق (${cpuSocket}) — المعالج يجلس في اللوحة دون أي قوة.`));
      } else {
        results.push(mkResult('socket-match', 'تطابق مقبس المعالج', 'incompatible',
          `مقبس المعالج (${cpuSocket || 'غير محدد'}) لا يطابق مقبس اللوحة (${mbSocket || 'غير محدد'}) — الفتحات مبنية باتجاهات دبابيس/أذرع مختلفة، والتركيب بالقوة يتلف المعالج والمقبس معًا.`));
      }
    }
  }

  // ===== 2) ram-type: نوع الذاكرة مقابل نوعها المدعوم في اللوحة =====
  {
    if (ram === undefined || mb === undefined) {
      results.push(missingReview('ram-type', 'توافق نوع الذاكرة', [
        ...(ram === undefined ? ['الذاكرة'] : []),
        ...(mb === undefined ? ['اللوحة الأم'] : []),
      ]));
    } else {
      const ramType = ram.specs['type'] ?? ram.specs['ramType'] ?? '';
      const mbRamType = mb.specs['ramType'] ?? mb.specs['type'] ?? '';
      if (ramType !== '' && ramType === mbRamType) {
        results.push(mkResult('ram-type', 'توافق نوع الذاكرة', 'compatible',
          `نوع الذاكرة متوافق (${ramType}) — الوحدة وفتحة اللوحة بنفس التدبيب (Keying).`));
      } else {
        results.push(mkResult('ram-type', 'توافق نوع الذاكرة', 'incompatible',
          `نوع الذاكرة (${ramType || 'غير محدد'}) لا يطابق ما تدعمه اللوحة (${mbRamType || 'غير محدد'}) — فتحات DDR4 وDDR5 مختلفتا التدبيب ولا يقبل كلٌّ منهما الآخر إطلاقًا.`));
      }
    }
  }

  // ===== 3) board-case: مقاس اللوحة ضمن المقاسات التي يدعمها الهيكل =====
  {
    if (mb === undefined || chassis === undefined) {
      results.push(missingReview('board-case', 'مقاس اللوحة داخل الهيكل', [
        ...(mb === undefined ? ['اللوحة الأم'] : []),
        ...(chassis === undefined ? ['الهيكل'] : []),
      ]));
    } else {
      const formFactor = mb.specs['formFactor'] ?? '';
      const supported = listSpec(chassis.specs['supportsFormFactor']);
      if (formFactor === '' || supported.length === 0) {
        results.push(mkResult('board-case', 'مقاس اللوحة داخل الهيكل', 'needs-review',
          'بيانات المقاسات ناقصة — راجع مواصفات اللوحة والهيكل.'));
      } else if (supported.includes(formFactor)) {
        results.push(mkResult('board-case', 'مقاس اللوحة داخل الهيكل', 'compatible',
          `الهيكل يدعم مقاس اللوحة (${formFactor}) — المقاسات المدعومة: ${supported.join(' / ')}.`));
      } else {
        results.push(mkResult('board-case', 'مقاس اللوحة داخل الهيكل', 'incompatible',
          `الهيكل لا يدعم مقاس اللوحة (${formFactor}) — المقاسات المدعومة: ${supported.join(' / ')}. لوحة أكبر من مساحة الهيكل لن تجد حوامل تثبيت وقد تبقى منافذها خارج الفتحة الخلفية.`));
      }
    }
  }

  // ===== 4) gpu-length: طول البطاقة مقابل الحد الأقصى للهيكل =====
  {
    if (gpu === undefined || chassis === undefined) {
      results.push(missingReview('gpu-length', 'طول بطاقة الرسوميات', [
        ...(gpu === undefined ? ['بطاقة الرسوميات'] : []),
        ...(chassis === undefined ? ['الهيكل'] : []),
      ]));
    } else {
      const lengthMm = readSpecNumber(gpu.specs, 'lengthMm');
      const maxMm = readSpecNumber(chassis.specs, 'maxGpuLengthMm');
      if (lengthMm === null || maxMm === null) {
        results.push(mkResult('gpu-length', 'طول بطاقة الرسوميات', 'needs-review',
          'بيانات الأبعاد ناقصة — راجع طول البطاقة والحد الأقصى في مواصفات الهيكل.'));
      } else if (lengthMm <= maxMm) {
        results.push(mkResult('gpu-length', 'طول بطاقة الرسوميات', 'compatible',
          `طول البطاقة (${lengthMm} مم) داخل الحد الأقصى للهيكل (${maxMm} مم).`));
      } else {
        results.push(mkResult('gpu-length', 'طول بطاقة الرسوميات', 'needs-review',
          `طول البطاقة (${lengthMm} مم) يتجاوز الحد الأقصى المعلن للهيكل (${maxMm} مم) — قد لا تناسب؛ راجع أبعاد الهيكل وبطاقة الرسوميات قبل الشراء.`));
      }
    }
  }

  // ===== 5) cooler-fit: مقابس المبرد المدعومة + الارتفاع داخل الهيكل =====
  {
    if (cooler === undefined || mb === undefined || chassis === undefined) {
      results.push(missingReview('cooler-fit', 'توافق المبرد (المقابس والارتفاع)', [
        ...(cooler === undefined ? ['المبرد'] : []),
        ...(mb === undefined ? ['اللوحة الأم'] : []),
        ...(chassis === undefined ? ['الهيكل'] : []),
      ]));
    } else {
      const sockets = listSpec(cooler.specs['sockets']);
      const mbSocket = mb.specs['socket'] ?? '';
      if (sockets.length === 0) {
        results.push(mkResult('cooler-fit', 'توافق المبرد (المقابس والارتفاع)', 'needs-review',
          'بيانات مقابس المبرد المدعومة ناقصة — راجع مواصفات المبرد.'));
      } else if (!sockets.includes(mbSocket)) {
        results.push(mkResult('cooler-fit', 'توافق المبرد (المقابس والارتفاع)', 'incompatible',
          `المبرد لا يدعم مقبس ${mbSocket || 'اللوحة'} — المقابس المدعومة: ${sockets.join(' / ')}. مسافات ثقوب التثبيت تختلف بين المقابس، والتركيب القسري يتلف المقبس أو يترك المبرد بلا تماس.`));
      } else {
        const heightMm = readSpecNumber(cooler.specs, 'heightMm');
        const maxHeightMm = readSpecNumber(chassis.specs, 'maxCoolerHeightMm');
        if (heightMm === null || maxHeightMm === null) {
          results.push(mkResult('cooler-fit', 'توافق المبرد (المقابس والارتفاع)', 'needs-review',
            'بيانات الارتفاع ناقصة — راجع أبعاد المبرد والحد الأقصى في مواصفات الهيكل.'));
        } else if (heightMm > maxHeightMm) {
          results.push(mkResult('cooler-fit', 'توافق المبرد (المقابس والارتفاع)', 'needs-review',
            `ارتفاع المبرد (${heightMm} مم) قد يصطدم بالغطاء الجانبي (الحد ${maxHeightMm} مم) — راجع أبعاد الهيكل قبل الاعتماد.`));
        } else {
          results.push(mkResult('cooler-fit', 'توافق المبرد (المقابس والارتفاع)', 'compatible',
            `المبرد يدعم مقبس ${mbSocket} وارتفاعه (${heightMm} مم) داخل حد الهيكل (${maxHeightMm} مم).`));
        }
      }
    }
  }

  // ===== 6) psu-capacity: كفاية قدرة مزود الطاقة (ميزانية الأمان 80٪) =====
  {
    const est = estimatePower(sel, options);
    if (est.psuW === null || est.budgetW === null) {
      results.push(mkResult('psu-capacity', 'كفاية قدرة مزود الطاقة', 'needs-review',
        'اختر مزود طاقة أولًا لحساب كفاية القدرة.'));
    } else if (est.totalW > est.psuW) {
      results.push(mkResult('psu-capacity', 'كفاية قدرة مزود الطاقة', 'incompatible',
        `الاستهلاك التقديري (${est.totalW} واط) يتجاوز قدرة PSU نفسها (${est.psuW} واط) — التجميعة قد لا تقلع أصلًا أو تنطفئ تحت الحمل. اختر مزودًا أعلى قدرة.`));
    } else if (est.totalW > est.budgetW) {
      results.push(mkResult('psu-capacity', 'كفاية قدرة مزود الطاقة', 'needs-review',
        `القدرة تكفي نظريًا (${est.psuW} واط مقابل استهلاك ${est.totalW} واط) لكنها تجاوزت ميزانية الأمان (${est.budgetW} واط = 80٪ من قدرة PSU) بنسبة ${est.usagePercent}٪ — يُنصح بمزود ${est.recommendedPsuW} واط لذروات الحمل.`));
    } else {
      results.push(mkResult('psu-capacity', 'كفاية قدرة مزود الطاقة', 'compatible',
        `الاستهلاك التقديري (${est.totalW} واط) ضمن ميزانية الأمان (${est.budgetW} واط = 80٪ من ${est.psuW} واط) بنسبة ${est.usagePercent}٪ مع هامش ${est.remainingW} واط.`));
    }
  }

  // ===== 7) gpu-power-connector: موصلات PCIe المطلوبة مقابل المتوفرة =====
  {
    if (gpu === undefined || psu === undefined) {
      results.push(missingReview('gpu-power-connector', 'موصلات طاقة بطاقة الرسوميات', [
        ...(gpu === undefined ? ['بطاقة الرسوميات'] : []),
        ...(psu === undefined ? ['مزود الطاقة'] : []),
      ]));
    } else {
      const needed = pcieConnectorsNeeded(gpu.specs['powerConnector']);
      const available = readSpecNumber(psu.specs, 'pcie8pin');
      if (needed === null) {
        results.push(mkResult('gpu-power-connector', 'موصلات طاقة بطاقة الرسوميات', 'needs-review',
          'بيانات موصل طاقة البطاقة غير مفهومة — راجع مواصفات البطاقة (none / 6pin / 8pin / 8pin+6pin).'));
      } else if (available === null) {
        results.push(mkResult('gpu-power-connector', 'موصلات طاقة بطاقة الرسوميات', 'needs-review',
          'بيانات موصلات PCIe في مزود الطاقة ناقصة — راجع مواصفات PSU.'));
      } else if (available >= needed) {
        results.push(mkResult('gpu-power-connector', 'موصلات طاقة بطاقة الرسوميات', 'compatible',
          needed === 0
            ? 'البطاقة بلا موصل طاقة إضافي — تكفيها طاقة فتحة PCIe وفق بياناتها.'
            : `موصلات PCIe في PSU (${available}) تكفي متطلب البطاقة (${needed}).`));
      } else {
        results.push(mkResult('gpu-power-connector', 'موصلات طاقة بطاقة الرسوميات', 'incompatible',
          `مزود الطاقة يوفر ${available} موصل PCIe بينما البطاقة تحتاج ${needed} — لا تستخدم محوّلات ملتوية (مثل Molex→PCIe) كمصدر دائم؛ فهي سبب متكرر لذوبان الكابلات داخل الهيكل.`));
      }
    }
  }

  // ===== 8) eps-present: توفر موصل EPS 8-pin مقابل متطلب اللوحة =====
  {
    if (psu === undefined || mb === undefined) {
      results.push(missingReview('eps-present', 'موصل EPS 8-pin', [
        ...(psu === undefined ? ['مزود الطاقة'] : []),
        ...(mb === undefined ? ['اللوحة الأم'] : []),
      ]));
    } else {
      const psuEps = normalizeSpec(psu.specs['eps8pin']);
      const mbRequires = normalizeSpec(mb.specs['eps8pin']);
      if (psuEps === '') {
        results.push(mkResult('eps-present', 'موصل EPS 8-pin', 'needs-review',
          'بيانات موصل EPS في مزود الطاقة ناقصة — راجع مواصفات PSU.'));
      } else if (mbRequires !== 'yes' && mbRequires !== 'true' && mbRequires !== 'required' && mbRequires !== '1') {
        results.push(mkResult('eps-present', 'موصل EPS 8-pin', 'compatible',
          'اللوحة لا تعلن عن متطلب EPS 8-pin منفصل — لا مانع من PSU بلا هذا الموصل وفق البيانات المتاحة.'));
      } else if (psuEps === 'yes') {
        results.push(mkResult('eps-present', 'موصل EPS 8-pin', 'compatible',
          'PSU يوفر EPS 8-pin واللوحة تتطلبه — تغذية المعالج المستقلة مضمونة.'));
      } else {
        results.push(mkResult('eps-present', 'موصل EPS 8-pin', 'incompatible',
          'اللوحة تتطلب كابل EPS 8-pin ومزود الطاقة بلا موصل EPS — المعالج لن يستقبل تغذيته المستقلة ولن يكتمل POST.'));
      }
    }
  }

  // ===== 9) m2-slot: قرص M.2 يحتاج فتحة M.2 متاحة على اللوحة =====
  {
    if (ssd === undefined || mb === undefined) {
      results.push(missingReview('m2-slot', 'فتحة M.2 للتخزين', [
        ...(ssd === undefined ? ['قرص التخزين'] : []),
        ...(mb === undefined ? ['اللوحة الأم'] : []),
      ]));
    } else {
      const iface = normalizeSpec(ssd.specs['interface']);
      if (iface === '') {
        results.push(mkResult('m2-slot', 'فتحة M.2 للتخزين', 'needs-review',
          'بيانات واجهة التخزين ناقصة — راجع مواصفات القرص.'));
      } else if (iface.endsWith('m.2')) {
        const m2Slots = readSpecNumber(mb.specs, 'm2Slots');
        if (m2Slots === null) {
          results.push(mkResult('m2-slot', 'فتحة M.2 للتخزين', 'needs-review',
            'بيانات فتحات M.2 في اللوحة ناقصة — راجع مواصفات اللوحة.'));
        } else if (m2Slots > 0) {
          results.push(mkResult('m2-slot', 'فتحة M.2 للتخزين', 'compatible',
            `فتحات M.2 في اللوحة (${m2Slots}) تستقبل القرص (${iface}).`));
        } else {
          results.push(mkResult('m2-slot', 'فتحة M.2 للتخزين', 'incompatible',
            `قرص التخزين بواجهة ${iface} بلا فتحة M.2 متاحة على اللوحة (عدد الفتحات: ${m2Slots}) — اختر قرصًا بواجهة متاحة أو لوحة بفتحة M.2.`));
        }
      } else {
        results.push(mkResult('m2-slot', 'فتحة M.2 للتخزين', 'compatible',
          `القرص بواجهة ${iface} لا يحتاج فتحة M.2 على اللوحة.`));
      }
    }
  }

  return results;
}

/** خلاصة الحكم العام مع قوائم المخالفات والنقاط التي تحتاج مراجعة. */
export function summarizeBuild(
  sel: BuildSelection,
  options: BuildOption[],
): { status: RuleVerdict; incompatibleAr: string[]; reviewAr: string[] } {
  const results = checkCompatibility(sel, options);
  const incompatibleAr = results
    .filter((r) => r.status === 'incompatible')
    .map((r) => `${r.titleAr}: ${r.reasonAr}`);
  const reviewAr = results
    .filter((r) => r.status === 'needs-review')
    .map((r) => `${r.titleAr}: ${r.reasonAr}`);
  const status: RuleVerdict =
    incompatibleAr.length > 0 ? 'incompatible' : reviewAr.length > 0 ? 'needs-review' : 'compatible';
  return { status, incompatibleAr, reviewAr };
}
