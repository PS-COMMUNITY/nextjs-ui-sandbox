/**
 * installer.ts — معالج تثبيت Windows التعليمي (V6-D) — شاشة كاملة داخل VOS.
 * ============================================================================
 * تدفق تفاعلي حسب العائلة (XP/Vista/7/8/8.1/10/11): لغة → مفتاح (حيث يُسمح
 * بتخطيه) → نسخة → ترخيص → نوع التثبيت → الأقراص والأقسام (تحقق GPT/MBR و
 * UEFI/Legacy ومتطلبات 11) → نسخ/توسيع → إعادات تشغيل → OOBE → سطح المكتب.
 *
 * أمانة (توجيه §5.5): واجهة وتدفق خاصان بالمشروع — لا ISO ولا مفاتيح حقيقية
 * ولا ادعاء أنها نسخة Windows فعلية. العمليات على أقراص المحاكاة فقط.
 */
import { useLabStore } from '../store/labStore';
import type { WinFamilyId } from '../types';
import type { WinFamily } from '../data/windowsCatalog';
import { WINDOWS_FAMILIES, getFamily, allowedPartStyles, partitionConflictMessageAr, autoPartitionPlan, MBR_MAX_DISK_GB } from '../data/windowsCatalog';
import { OS_COLORS, roundRect } from './vos';
import type { VirtualOS } from './vos';

// ============ حالة المعالج ============

export interface SetupState {
  step: number;
  family: WinFamilyId | null;
  langIdx: number;
  keyText: string;
  keySkipped: boolean;
  editionId: string | null;
  arch: 'x86' | 'x64' | null;
  licenseAccepted: boolean;
  installType: 'clean' | null;
  targetDiskId: string | null;
  partPlan: Array<{ label: string; kind: 'efi' | 'msr' | 'recovery' | 'primary'; fs: string; sizeGB: number }> | null;
  progress: number;         // 0..1 لمرحلة النسخ
  progressLabelAr: string;
  restartsLeft: number;
  oobeStep: number;
  userName: string;
  privacy: boolean[];
  errorAr: string | null;
  done: boolean;
  /** حقول زمنية داخلية */
  step7DoneAt?: number;
  step8At?: number;
}

export function initialSetupState(): SetupState {
  return {
    step: 0, family: null, langIdx: 0, keyText: '', keySkipped: false,
    editionId: null, arch: null, licenseAccepted: false, installType: null,
    targetDiskId: null, partPlan: null, progress: 0, progressLabelAr: '',
    restartsLeft: 0, oobeStep: 0, userName: '', privacy: [], errorAr: null, done: false,
  };
}

let setup: SetupState = initialSetupState();

export function getSetupState(): SetupState {
  return setup;
}

export function resetSetup(): void {
  setup = initialSetupState();
}

// ============ الرسم ============

function chrome(os: VirtualOS, ctx: CanvasRenderingContext2D, family: WinFamily | null, titleAr: string): number {
  const themeBg: Record<string, [string, string]> = {
    blueText: ['#0a1a56', '#0a1030'],
    aero: ['#123a63', '#0a1c33'],
    metro: ['#0b2b3d', '#081826'],
    modern: ['#12303a', '#081a20'],
    modern11: ['#1a2c3a', '#0b141c'],
  };
  const [c1, c2] = themeBg[family?.theme ?? 'modern'];
  const g = ctx.createLinearGradient(0, 0, os.W, os.H);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, os.W, os.H);

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(titleAr, 36, 46);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '13px sans-serif';
  ctx.fillText('مثبّت محاكاة تعليمية — PC Lab (ليس وسائط Windows حقيقية ولا يطلب مفاتيح فعلية)', 36, 68);
  return 96;
}

function bigButton(os: VirtualOS, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, onClick: () => void, primary = true): void {
  const hovered = os.hoverAt(x, y, w, h);
  ctx.fillStyle = primary ? (hovered ? '#57d9c9' : '#2aa89a') : hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)';
  roundRect(ctx, x, y, w, h, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  roundRect(ctx, x, y, w, h, 7);
  ctx.stroke();
  ctx.fillStyle = primary ? '#04231f' : '#e8eef5';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + 5);
  ctx.textAlign = 'left';
  os.addRect('button', x, y, w, h, { onClick });
}

function selectable(os: VirtualOS, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, subAr: string | null, selected: boolean, onSelect: () => void): void {
  const hovered = os.hoverAt(x, y, w, h);
  ctx.fillStyle = selected ? 'rgba(57,199,184,0.20)' : hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.035)';
  roundRect(ctx, x, y, w, h, 7);
  ctx.fill();
  ctx.strokeStyle = selected ? '#39c7b8' : 'rgba(255,255,255,0.18)';
  roundRect(ctx, x, y, w, h, 7);
  ctx.stroke();
  ctx.fillStyle = '#e8eef5';
  ctx.font = 'bold 14.5px sans-serif';
  ctx.fillText(label, x + 16, y + 25);
  if (subAr) {
    ctx.fillStyle = 'rgba(232,238,245,0.65)';
    ctx.font = '12.5px sans-serif';
    ctx.fillText(subAr, x + 16, y + h - 12);
  }
  if (selected) {
    ctx.fillStyle = '#39c7b8';
    ctx.fillText('✓', x + w - 26, y + 26);
  }
  os.addRect('row', x, y, w, h, { onClick: onSelect });
}

/** يحول الثيم للعائلة عند رسم الشاشات القديمة (XP نصية أزرق / 7 Aero ...) */

export function drawInstaller(os: VirtualOS, ctx: CanvasRenderingContext2D, now: number): void {
  const store = useLabStore.getState();
  const family = setup.family ? getFamily(setup.family) : null;

  // اختيار العائلة أولًا (قائمة وسائط الإقلاع)
  if (!setup.family) {
    const top = chrome(os, ctx, null, 'اختر وسيط التثبيت — Installation Media');
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '14px sans-serif';
    ctx.fillText('الوسيط المُدخل يحدد عائلة النظام — كل عائلة لها تدفقها ومتطلباتها الموثقة:', 36, top + 16);
    let y = top + 36;
    const cols = 2;
    const bw = Math.min(430, (os.W - 90) / cols);
    let i = 0;
    for (const fam of WINDOWS_FAMILIES) {
      const cx = 36 + (i % cols) * (bw + 18);
      const cy = y + Math.floor(i / cols) * 62;
      selectable(os, ctx, cx, cy, bw, 52, `${fam.nameEn} (${fam.year})`, fam.editions.map((e) => e.nameAr).join(' • ').slice(0, 64), false, () => {
        setup.family = fam.id;
        setup.step = 1;
        setup.errorAr = null;
        os.dirty = true;
      });
      i++;
    }
    y += Math.ceil(WINDOWS_FAMILIES.length / cols) * 62 + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12.5px sans-serif';
    os.wrapText(ctx, 'ملاحظة أمانة: هذا معالج محاكاة داخل مختبر افتراضي — لا يوزع ملفات Windows ولا يطلب مفاتيح حقيقية ولا يمس أقراص جهازك.', 36, y, os.W - 72, 17);
    return;
  }
  if (!family) return;

  const closeBtn = (): void => {
    // إنهاء المثبّت والعودة (إعادة تشغيل بدون وسيط)
    resetSetup();
    store.exitSetup();
    os.dirty = true;
  };

  // ===== 1) اللغة والمنطقة =====
  if (setup.step === 1) {
    const top = chrome(os, ctx, family, `${family.nameEn} Setup — Language / Region`);
    const langs: Array<[string, string]> = [['العربية (فلسطين) — عربي 101', 'ar-PS'], ['English (United States)', 'en-US']];
    let y = top + 8;
    for (let i = 0; i < langs.length; i++) {
      selectable(os, ctx, 36, y, 430, 52, langs[i][0], `Keyboard: ${i === 0 ? 'Arabic 101' : 'US QWERTY'} • Time zone: ${i === 0 ? '(UTC+02:00)' : '(UTC-08:00)'}`, setup.langIdx === i, () => { setup.langIdx = i; os.dirty = true; });
      y += 62;
    }
    bigButton(os, ctx, 36, y + 10, 140, 38, 'Next ←', () => { setup.step = 2; os.dirty = true; });
    bigButton(os, ctx, 190, y + 10, 110, 38, 'إلغاء', closeBtn, false);
    return;
  }

  // ===== 2) مفتاح المنتج =====
  if (setup.step === 2) {
    const top = chrome(os, ctx, family, 'Product Key — مفتاح المنتج');
    const canSkip = family.editions.some((e) => e.keyOptional);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '14px sans-serif';
    ctx.fillText(family.oobe.productKeyMandatory ? 'هذه العائلة تتطلب مفتاح منتج في المسار النظفي (تعليميًا أدخل أي صيغة XXXXX-XXXXX).' : 'يمكن تخطي المفتاح الآن واختيار النسخة يدويًا (سلوك موثق لهذه العائلة).', 36, top + 14);
    // صندوق المفتاح
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, 36, top + 30, 380, 40, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    roundRect(ctx, 36, top + 30, 380, 40, 7);
    ctx.stroke();
    ctx.fillStyle = '#e8eef5';
    ctx.font = '16px monospace';
    ctx.fillText(setup.keyText + (os.blink ? '|' : ''), 48, top + 56);
    os.addRect('custom', 36, top + 30, 380, 40, {
      onClick: () => {
        os.focusedTextbox = {
          get: () => setup.keyText,
          set: (t) => { setup.keyText = t.toUpperCase().slice(0, 29); },
        };
        os.dirty = true;
      },
    }, 'text');

    let y = top + 90;
    if (canSkip) {
      bigButton(os, ctx, 36, y, 220, 38, setup.keySkipped ? '✓ ليس لدي مفتاح (مُخطى)' : 'ليس لدي مفتاح منتج', () => { setup.keySkipped = !setup.keySkipped; setup.keyText = ''; os.dirty = true; });
      y += 50;
    }
    const keyValid = setup.keySkipped || /^[A-Z0-9]{5}(-[A-Z0-9]{5}){0,4}$/.test(setup.keyText) || setup.keyText.length >= 5;
    bigButton(os, ctx, 36, y, 140, 38, 'Next ←', () => {
      if (!keyValid) { setup.errorAr = 'أدخل مفتاحًا بصيغة تعليمية صحيحة أو اختر التخطي إن كان متاحًا لهذه العائلة.'; os.dirty = true; return; }
      setup.errorAr = null;
      setup.step = 3;
      os.dirty = true;
    }, keyValid);
    bigButton(os, ctx, 190, y, 110, 38, 'رجوع →', () => { setup.step = 1; os.dirty = true; }, false);
    if (setup.errorAr) {
      ctx.fillStyle = '#ffb4b4';
      ctx.font = '13px sans-serif';
      os.wrapText(ctx, '!! ' + setup.errorAr, 36, y + 60, os.W - 72, 17);
    }
    return;
  }

  // ===== 3) اختيار النسخة والبنية =====
  if (setup.step === 3) {
    const top = chrome(os, ctx, family, 'Select Edition — اختر النسخة والبنية');
    let y = top + 4;
    for (const ed of family.editions) {
      for (const arch of ed.arch) {
        selectable(os, ctx, 36, y, 470, 48, `${family.nameEn} ${ed.nameAr} ${arch === 'x64' ? '64-bit' : '32-bit'}`, `معمارية ${arch.toUpperCase()} — متوفرة لهذه النسخة`, setup.editionId === ed.id && setup.arch === arch, () => {
          setup.editionId = ed.id;
          setup.arch = arch;
          setup.errorAr = null;
          os.dirty = true;
        });
        y += 58;
      }
    }
    bigButton(os, ctx, 36, y + 8, 140, 38, 'Next ←', () => {
      if (!setup.editionId || !setup.arch) { setup.errorAr = 'اختر نسخة وبنية أولًا.'; os.dirty = true; return; }
      setup.errorAr = null;
      setup.step = 4;
      os.dirty = true;
    });
    bigButton(os, ctx, 190, y + 8, 110, 38, 'رجوع →', () => { setup.step = 2; os.dirty = true; }, false);
    if (setup.errorAr) {
      ctx.fillStyle = '#ffb4b4';
      ctx.font = '13px sans-serif';
      ctx.fillText('!! ' + setup.errorAr, 36, y + 66);
    }
    return;
  }

  // ===== 4) الترخيص =====
  if (setup.step === 4) {
    const top = chrome(os, ctx, family, 'License Terms — اتفاقية الترخيص (تعليمية)');
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, 36, top, os.W - 72, 150, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(232,238,245,0.85)';
    ctx.font = '13px sans-serif';
    const lines = [
      'هذه محاكاة تدريب داخل PC Repair 3D Studio: معالج تثبيت تعليمي يحاكي تدفق',
      'التثبيت لأغراض التعلم فقط — لا يثبت أي نظام حقيقي ولا يعدل جهازك.',
      `معلومات العائلة: ${family.notesAr}`,
      'قبل أي عملية مدمرة في العمل الحقيقي: خذ نسخة احتياطية ووثّق مفاتيح الترخيص.',
    ];
    let ly = top + 26;
    for (const l of lines) { ctx.fillText(l, 52, ly); ly += 22; }
    const checked = setup.licenseAccepted;
    selectable(os, ctx, 36, top + 166, 420, 44, 'I accept the license terms — أوافق', null, checked, () => { setup.licenseAccepted = !checked; os.dirty = true; });
    bigButton(os, ctx, 36, top + 224, 140, 38, 'Next ←', () => {
      if (!setup.licenseAccepted) { setup.errorAr = 'يجب قبول الترخيص للمتابعة.'; os.dirty = true; return; }
      setup.errorAr = null;
      setup.step = 5;
      os.dirty = true;
    }, setup.licenseAccepted);
    bigButton(os, ctx, 190, top + 224, 110, 38, 'رجوع →', () => { setup.step = 3; os.dirty = true; }, false);
    return;
  }

  // ===== 5) نوع التثبيت =====
  if (setup.step === 5) {
    const top = chrome(os, ctx, family, 'Which type of installation?');
    const canUpgrade = family.editions.find((e) => e.id === setup.editionId)?.upgradeFromAr !== null;
    selectable(os, ctx, 36, top + 6, 470, 60, 'Upgrade — ترقية (يبقي الملفات)', canUpgrade ? `مدعوم عند الترقية من: ${(family.editions.find((e) => e.id === setup.editionId)?.upgradeFromAr ?? []).join(', ')}` : 'غير مدعوم في هذا المسار التعليمي لهذه النسخة', false, () => {
      setup.errorAr = 'مسار الترقية في المحاكاة يقتصر على التعليم المفاهيمي — استخدم Custom للاستمرار (سلوك تربوي مقصود).';
      os.dirty = true;
    });
    selectable(os, ctx, 36, top + 78, 470, 60, 'Custom (Clean) — تثبيت نظيف', 'تقسيم الأقراص وتحديد قسم التثبيت يدويًا', false, () => {
      setup.installType = 'clean';
      setup.errorAr = null;
      setup.step = 6;
      os.dirty = true;
    });
    if (setup.errorAr) {
      ctx.fillStyle = '#ffd9a0';
      ctx.font = '13px sans-serif';
      os.wrapText(ctx, '!! ' + setup.errorAr, 36, top + 156, os.W - 72, 17);
    }
    bigButton(os, ctx, 36, os.H - 70, 110, 38, 'رجوع →', () => { setup.step = 4; os.dirty = true; }, false);
    return;
  }

  // ===== 6) الأقراص والأقسام + التحقق =====
  if (setup.step === 6) {
    const top = chrome(os, ctx, family, 'Where do you want to install?');
    const boot = 'uefi'; // منصة الجهاز المرجعي UEFI
    const allowed = family ? allowedPartStyles(family, boot) : [];
    let y = top + 4;

    // فحص متطلبات Windows 11 الموثقة
    if (family.requiresTpm2 && !store.sim.firmware.tpm) {
      ctx.fillStyle = '#ffb4b4';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('!! هذا الجهاز لا يمكن تشغيل ' + family.nameEn + ' — TPM 2.0 غير مفعّل/موجود.', 36, y);
      y += 22;
    }
    if (family.requiresSecureBoot && !store.sim.firmware.secureBoot) {
      ctx.fillStyle = '#ffb4b4';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('!! ' + family.nameEn + ' يتطلب Secure Boot — فعّله من إعدادات UEFI.', 36, y);
      y += 22;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '12.5px sans-serif';
    ctx.fillText(`وضع إقلاع الجهاز: UEFI — الأنماط المسموحة لهذه العائلة: ${allowed.join(' / ').toUpperCase() || 'لا شيء (تعارض وضع الإقلاع)'}`, 36, y);
    y += 26;

    for (const disk of store.sim.disks) {
      const available = disk.bus === 'nvme' ? true : true; // في المثبّت: الأقراص المثبتة
      const total = disk.parts.reduce((a, p) => a + p.sizeGB, 0);
      const label = `Disk ${disk.id === 'm2-1' ? '0' : '1'} — ${disk.sizeGB} GB ${disk.style ? (disk.style === 'gpt' ? '(GPT)' : '(MBR)') : '(Unallocated Space)'}`;
      selectable(os, ctx, 36, y, 470, 46, label,
        disk.style ? `أقسام: ${disk.parts.length} — متاح ${Math.max(0, disk.sizeGB - total).toFixed(0)} GB` : 'قرص غير مهيأ بالكامل',
        setup.targetDiskId === disk.id, () => {
          setup.targetDiskId = disk.id;
          setup.partPlan = null;
          setup.errorAr = null;
          os.dirty = true;
        });
      y += 56;
    }

    // تحذير MBR على قرص > 2TB تعليميًا (لا ينطبق على أقراصنا 1TB — يظهر كملاحظة)
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px sans-serif';
    ctx.fillText(`ملاحظة تعليمية: MBR يحد التقسيم عند ${MBR_MAX_DISK_GB} GB — GPT لا يحد عمليًا.`, 36, y);
    y += 24;

    const disk = store.sim.disks.find((d) => d.id === setup.targetDiskId);
    if (disk) {
      if (disk.style && !allowed.includes(disk.style)) {
        ctx.fillStyle = '#ffb4b4';
        ctx.font = 'bold 13.5px sans-serif';
        os.wrapText(ctx, '!! ' + partitionConflictMessageAr(boot, disk.style), 36, y, os.W - 72, 17);
        y += 40;
      } else if (!disk.style) {
        ctx.fillStyle = '#ffd9a0';
        ctx.font = '13px sans-serif';
        ctx.fillText('القرص غير مهيأ — «New» سينشئ أقسام النظام تلقائيًا وفق النمط المسموح.', 36, y);
        y += 22;
      }
      bigButton(os, ctx, 36, y, 130, 36, 'New (قسم جديد)', () => {
        if (!allowed.length) { setup.errorAr = partitionConflictMessageAr(boot, disk.style ?? 'mbr'); os.dirty = true; return; }
        const style = allowed[0];
        setup.partPlan = autoPartitionPlan(style, disk.sizeGB).map((p) => ({ label: p.label, kind: p.kind, fs: p.fs, sizeGB: p.sizeGB }));
        setup.errorAr = null;
        os.dirty = true;
      });
      bigButton(os, ctx, 178, y, 110, 36, 'Delete', () => {
        if (disk.parts.length === 0) { setup.errorAr = 'لا أقسام لحذفها على هذا القرص.'; os.dirty = true; return; }
        setup.partPlan = null;
        useLabStore.getState().clearDisk(disk.id);
        os.dirty = true;
      }, false);
      y += 48;

      if (setup.partPlan) {
        ctx.fillStyle = 'rgba(232,238,245,0.85)';
        ctx.font = '13px sans-serif';
        ctx.fillText('خطة الأقسام التي ستنشأ (حسب النمط):', 36, y);
        y += 20;
        for (const p of setup.partPlan) {
          ctx.fillText(`  • ${p.label} — ${p.sizeGB.toFixed(2)} GB — ${p.fs.toUpperCase()}`, 48, y);
          y += 20;
        }
      }
      bigButton(os, ctx, 36, y + 8, 170, 38, 'Next — ابدأ التثبيت', () => {
        if (!setup.targetDiskId) { setup.errorAr = 'اختر القرص الهدف أولًا.'; os.dirty = true; return; }
        if (family.requiresTpm2 && !store.sim.firmware.tpm) { setup.errorAr = 'التثبيت محجوب: TPM 2.0 مطلوب (فعّله من UEFI Setup ثم أعد المحاولة).'; os.dirty = true; return; }
        if (family.requiresSecureBoot && !store.sim.firmware.secureBoot) { setup.errorAr = 'التثبيت محجوب: Secure Boot مطلوب لهذه العائلة.'; os.dirty = true; return; }
        if (disk.style && !allowed.includes(disk.style)) { setup.errorAr = partitionConflictMessageAr(boot, disk.style); os.dirty = true; return; }
        // فحص الحد الأدنى الموثق
        if (disk.sizeGB < family.minDiskGB) { setup.errorAr = `القرص أصغر من الحد الأدنى الموثق (${family.minDiskGB} GB).`; os.dirty = true; return; }
        if (!setup.partPlan && disk.parts.length === 0) { setup.errorAr = 'أنشئ قسمًا (New) أولًا — لا مساحة مهيأة للنظام.'; os.dirty = true; return; }
        setup.errorAr = null;
        setup.step = 7;
        setup.progress = 0;
        setup.progressLabelAr = 'Copying Windows files…';
        os.dirty = true;
      });
      bigButton(os, ctx, 220, y + 8, 110, 38, 'رجوع →', () => { setup.step = 5; os.dirty = true; }, false);
      if (setup.errorAr) {
        ctx.fillStyle = '#ffb4b4';
        ctx.font = '13px sans-serif';
        os.wrapText(ctx, '!! ' + setup.errorAr, 36, y + 62, os.W - 72, 17);
      }
    }
    return;
  }

  // ===== 7) النسخ والتوسيع والتثبيت =====
  if (setup.step === 7) {
    const top = chrome(os, ctx, family, 'Installing ' + family.nameEn + '…');
    const stages: Array<[string, number]> = [
      ['Copying Windows files…', 0.25],
      ['Getting files ready for installation…', 0.55],
      ['Installing features…', 0.75],
      ['Installing updates…', 0.92],
      ['Finishing up…', 1],
    ];
    let stageAr = setup.progressLabelAr;
    for (const [label, upto] of stages) {
      if (setup.progress <= upto) { stageAr = label; break; }
    }
    setup.progressLabelAr = stageAr;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '15px sans-serif';
    ctx.fillText(`${stageAr} — ${(setup.progress * 100).toFixed(0)}%`, 36, top + 24);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, 36, top + 40, os.W - 72, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#39c7b8';
    roundRect(ctx, 36, top + 40, Math.max(10, (os.W - 72) * setup.progress), 22, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12.5px sans-serif';
    ctx.fillText('قد يستغرق التثبيت بعض الوقت — الجهاز سيعيد التشغيل عدة مرات (محاكاة زمنية معجّلة).', 36, top + 86);

    // تقدم زمني تلقائي — يعتمد على الآن (رسم مستمر أثناء وضع setup)
    const rate = 0.045;
    if (setup.progress < 1) {
      setup.progress = Math.min(1, setup.progress + rate * (1 / 60));
      if (setup.progress >= 1) setup.step7DoneAt = now;
      os.dirty = true;
    } else if (setup.step7DoneAt && now - setup.step7DoneAt > 900) {
      setup.step = 8;
      setup.step8At = now;
      setup.step7DoneAt = undefined;
      os.dirty = true;
    }
    return;
  }

  // ===== 8) إعادة التشغيل (من القرص) =====
  if (setup.step === 8) {
    chrome(os, ctx, family, 'Restarting…');
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('سيُعاد تشغيل الجهاز الآن — الإقلاع من القرص (وليس الوسيط).', 36, 140);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('تُزال أولوية الإقلاع من USB تلقائيًا حتى لا يعود التشغيل إلى المثبّت (سلوك صحيح موثق).', 36, 168);
    if (setup.step8At && now - setup.step8At > 1600) {
      const ed = family.editions.find((e) => e.id === setup.editionId);
      useLabStore.getState().completeInstall(setup.family!, `${ed?.nameAr ?? ''} ${setup.arch === 'x64' ? '64-bit' : '32-bit'}`, setup.targetDiskId ?? 'm2-1', setup.partPlan);
      resetSetup();
      // التشغيل من جديد: النظام مثبت الآن
      useLabStore.getState().toggleFlag('powerOn');
      os.dirty = true;
    }
    return;
  }
}
