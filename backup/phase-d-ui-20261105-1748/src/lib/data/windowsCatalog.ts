/**
 * windowsCatalog.ts — كتالوج Windows التعليمي (V6-D).
 * ============================================================================
 * بيانات كل عائلة في كتلة مستقلة: الإصدارات (Editions) والبنى المتوفرة فعليًا،
 * وضع الإقلاع ونمط التقسيم المدعوم، نظام الملفات، متطلبات الحد الأدنى،
 * وشكل معالج التثبيت. لا «كل الإصدارات مدعومة» ولا شروط مخترعة:
 * كل صف موثق من خصائص العائلة المعروفة تعليميًا.
 *
 * تنبيه أمانة: هذه محاكاة واجهة وتدفق خاصة بالمشروع — ليست نسخ Windows فعلية
 * ولا توزع أي ملفات أو مفاتيح محمية (توجيه V6 §5.5). المفاتيح: حقل تعليمي
 * بلا تخزين ولا تحقق حقيقي.
 */
import type { WinFamilyId } from '../types';

export type SetupTheme = 'blueText' | 'aero' | 'metro' | 'modern' | 'modern11';
export type BootMode = 'bios' | 'uefi';
export type PartStyle = 'mbr' | 'gpt';
export type Arch = 'x86' | 'x64';

export interface WinEdition {
  id: string;               // مثل '10-pro'
  nameAr: string;           // «Pro»
  arch: Arch[];             // البنى المتوفرة فعليًا لهذه النسخة
  keyOptional: boolean;     // هل يمكن تخطي مفتاح المنتج في هذا المسار
  upgradeFromAr: string[] | null; // مسارات الترقية المدعومة (null = clean فقط في المحاكاة)
}

export interface WinFamily {
  id: WinFamilyId;
  nameAr: string;
  nameEn: string;
  year: number;
  theme: SetupTheme;
  bootModes: BootMode[];          // أوضاع الإقلاع المدعومة
  partStyles: PartStyle[];        // أنماط التقسيم المدعومة (ضمن وضع الإقلاع المختار)
  fileSystems: Array<'ntfs' | 'fat32'>; // أنظمة الملفات المتاحة عند التهيئة
  minRamMB: number;
  minDiskGB: number;
  requiresTpm2: boolean;          // متطلب صريح (Windows 11)
  requiresSecureBoot: boolean;    // متطلب صريح (Windows 11)
  oobe: {
    userAccounts: boolean;
    privacyToggles: boolean;      // شاشة خصوصية (10/11)
    networkRequired: boolean;     // فرض شبكة (11 في المسار التعليمي)
    productKeyMandatory: boolean; // مفتاح إلزامي في مسار التثبيت النظيف
    restarts: number;             // عدد إعادات التشغيل أثناء التثبيت
  };
  editions: WinEdition[];
  notesAr: string;                // ملاحظة تعليمية عن الخصائص الفارقية
}

export const WINDOWS_FAMILIES: WinFamily[] = [
  {
    id: 'xp',
    nameAr: 'ويندوز XP',
    nameEn: 'Windows XP',
    year: 2001,
    theme: 'blueText',
    bootModes: ['bios'],
    partStyles: ['mbr'],
    fileSystems: ['ntfs', 'fat32'],
    minRamMB: 128,
    minDiskGB: 2,
    requiresTpm2: false,
    requiresSecureBoot: false,
    oobe: { userAccounts: true, privacyToggles: false, networkRequired: false, productKeyMandatory: true, restarts: 1 },
    editions: [
      { id: 'xp-home', nameAr: 'Home', arch: ['x86'], keyOptional: false, upgradeFromAr: ['Windows 98/ME'] },
      { id: 'xp-pro', nameAr: 'Professional', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['Windows 2000/XP'] },
    ],
    notesAr: 'مسار Legacy تعليمي: إعداد من مرحلتين (نصية ثم رسومية)، BIOS/MBR فقط، ونظاما ملفات NTFS أو FAT32. لا يدعم GPT للإقلاع.',
  },
  {
    id: 'vista',
    nameAr: 'ويندوز Vista',
    nameEn: 'Windows Vista',
    year: 2007,
    theme: 'aero',
    bootModes: ['bios'],
    partStyles: ['mbr'],
    fileSystems: ['ntfs'],
    minRamMB: 512,
    minDiskGB: 15,
    requiresTpm2: false,
    requiresSecureBoot: false,
    oobe: { userAccounts: true, privacyToggles: false, networkRequired: false, productKeyMandatory: true, restarts: 1 },
    editions: [
      { id: 'vista-homebasic', nameAr: 'Home Basic', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: null },
      { id: 'vista-homepremium', nameAr: 'Home Premium', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['XP'] },
      { id: 'vista-business', nameAr: 'Business', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['XP Pro'] },
      { id: 'vista-ultimate', nameAr: 'Ultimate', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['XP'] },
    ],
    notesAr: 'أول معالج تثبيت رسومي موحد (WinPE-based) — يظهر في المحاكاة بأسلوب Aero. BIOS/MBR و NTFS فقط.',
  },
  {
    id: '7',
    nameAr: 'ويندوز 7',
    nameEn: 'Windows 7',
    year: 2009,
    theme: 'aero',
    bootModes: ['bios', 'uefi'],
    partStyles: ['mbr', 'gpt'],
    fileSystems: ['ntfs'],
    minRamMB: 1024,
    minDiskGB: 16,
    requiresTpm2: false,
    requiresSecureBoot: false,
    oobe: { userAccounts: true, privacyToggles: false, networkRequired: false, productKeyMandatory: true, restarts: 1 },
    editions: [
      { id: '7-starter', nameAr: 'Starter', arch: ['x86'], keyOptional: false, upgradeFromAr: null },
      { id: '7-homebasic', nameAr: 'Home Basic', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['Vista'] },
      { id: '7-homepremium', nameAr: 'Home Premium', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['Vista'] },
      { id: '7-pro', nameAr: 'Professional', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['Vista'] },
      { id: '7-ultimate', nameAr: 'Ultimate', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['Vista'] },
    ],
    notesAr: 'يدعم UEFI مع GPT في نسخ 64-bit فقط — المحاكاة تُظهر التحقق: x64 + UEFI ⇒ GPT، وإلا MBR.',
  },
  {
    id: '8',
    nameAr: 'ويندوز 8',
    nameEn: 'Windows 8',
    year: 2012,
    theme: 'metro',
    bootModes: ['bios', 'uefi'],
    partStyles: ['mbr', 'gpt'],
    fileSystems: ['ntfs'],
    minRamMB: 1024,
    minDiskGB: 16,
    requiresTpm2: false,
    requiresSecureBoot: false,
    oobe: { userAccounts: true, privacyToggles: false, networkRequired: false, productKeyMandatory: true, restarts: 1 },
    editions: [
      { id: '8-core', nameAr: 'Core (Home)', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['7'] },
      { id: '8-pro', nameAr: 'Pro', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['7'] },
    ],
    notesAr: 'واجهة Metro وشاشة بدء حيّة — مسار تثبيت مشترك مع 8.1 لكن بشاشات مختلفة. Secure Boot بدأ الانتشار مع منصات UEFI لهذه الجيل.',
  },
  {
    id: '8.1',
    nameAr: 'ويندوز 8.1',
    nameEn: 'Windows 8.1',
    year: 2013,
    theme: 'metro',
    bootModes: ['bios', 'uefi'],
    partStyles: ['mbr', 'gpt'],
    fileSystems: ['ntfs'],
    minRamMB: 1024,
    minDiskGB: 16,
    requiresTpm2: false,
    requiresSecureBoot: false,
    oobe: { userAccounts: true, privacyToggles: false, networkRequired: false, productKeyMandatory: true, restarts: 1 },
    editions: [
      { id: '8.1-core', nameAr: 'Core (Home)', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['8', '7'] },
      { id: '8.1-pro', nameAr: 'Pro', arch: ['x86', 'x64'], keyOptional: false, upgradeFromAr: ['8', '7'] },
    ],
    notesAr: 'تحديث مستقل عن 8: زر Start رجع وإعدادات موسعة — التدفق مشابه مع شاشات OOBE مختلفة.',
  },
  {
    id: '10',
    nameAr: 'ويندوز 10',
    nameEn: 'Windows 10',
    year: 2015,
    theme: 'modern',
    bootModes: ['bios', 'uefi'],
    partStyles: ['mbr', 'gpt'],
    fileSystems: ['ntfs'],
    minRamMB: 1024,
    minDiskGB: 32,
    requiresTpm2: false,
    requiresSecureBoot: false,
    oobe: { userAccounts: true, privacyToggles: true, networkRequired: false, productKeyMandatory: false, restarts: 2 },
    editions: [
      { id: '10-home', nameAr: 'Home', arch: ['x86', 'x64'], keyOptional: true, upgradeFromAr: ['7', '8.1'] },
      { id: '10-pro', nameAr: 'Pro', arch: ['x86', 'x64'], keyOptional: true, upgradeFromAr: ['7', '8.1'] },
      { id: '10-education', nameAr: 'Education', arch: ['x86', 'x64'], keyOptional: true, upgradeFromAr: null },
      { id: '10-enterprise', nameAr: 'Enterprise', arch: ['x86', 'x64'], keyOptional: true, upgradeFromAr: null },
    ],
    notesAr: 'مفتاح المنتج قابل للتخطي («ليس لدي مفتاح منتج») مع اختيار النسخة يدويًا. شاشة خصوصية في OOBE. MBR و GPT كلاهما ممكن.',
  },
  {
    id: '11',
    nameAr: 'ويندوز 11',
    nameEn: 'Windows 11',
    year: 2021,
    theme: 'modern11',
    bootModes: ['uefi'],
    partStyles: ['gpt'],
    fileSystems: ['ntfs'],
    minRamMB: 4096,
    minDiskGB: 64,
    requiresTpm2: true,
    requiresSecureBoot: true,
    oobe: { userAccounts: true, privacyToggles: true, networkRequired: true, productKeyMandatory: false, restarts: 2 },
    editions: [
      { id: '11-home', nameAr: 'Home', arch: ['x64'], keyOptional: true, upgradeFromAr: ['10'] },
      { id: '11-pro', nameAr: 'Pro', arch: ['x64'], keyOptional: true, upgradeFromAr: ['10'] },
      { id: '11-education', nameAr: 'Education', arch: ['x64'], keyOptional: true, upgradeFromAr: null },
      { id: '11-enterprise', nameAr: 'Enterprise', arch: ['x64'], keyOptional: true, upgradeFromAr: null },
    ],
    notesAr: 'متطلبات صارمة موثقة: 64-bit فقط، UEFI + GPT + Secure Boot + TPM 2.0 إلزامية — المحاكاة تحجب التثبيت وتشرح السبب عند غيابها.',
  },
];

export function getFamily(id: WinFamilyId): WinFamily {
  const f = WINDOWS_FAMILIES.find((x) => x.id === id);
  if (!f) throw new Error(`unknown family: ${id}`);
  return f;
}

/** بنية التقسيم المسموحة لوضع إقلاع محدد في عائلة محددة (قاعدة تحقق التثبيت) */
export function allowedPartStyles(family: WinFamily, boot: BootMode): PartStyle[] {
  if (!family.bootModes.includes(boot)) return [];
  if (boot === 'uefi') return family.partStyles.filter((s) => s === 'gpt');
  return family.partStyles.filter((s) => s === 'mbr');
}

/** أقصى قرص قابل لعنونة في MBR تعليميًا (2TB حد التقسيم القياسي) */
export const MBR_MAX_DISK_GB = 2048;

/** رسالة الخطأ التعليمية عند تعارض نمط التقسيم مع وضع الإقلاع */
export function partitionConflictMessageAr(boot: BootMode, style: PartStyle): string {
  if (boot === 'uefi' && style === 'mbr') {
    return 'لا يمكن تثبيت النظام على هذا القرص: القرص بنمط MBR بينما الجهاز يققلع بوضع UEFI — أنظمة UEFI تتطلب قرص GPT. (رسالة تعليمية مستوحاة من سلوك المثبّت الحقيقي)';
  }
  if (boot === 'bios' && style === 'gpt') {
    return 'لا يمكن تثبيت النظام على هذا القرص: القرص بنمط GPT بينما الجهاز يققلع بوضع BIOS/Legacy — الإقلاع القديم يتطلب MBR. (رسالة تعليمية)';
  }
  return 'نمط التقسيم غير متوافق مع وضع الإقلاع الحالي. (رسالة تعليمية)';
}

/** بناء الأقسام التلقائية عند اختيار «جديد» على قرص غير مهيأ — حسب النمط */
export function autoPartitionPlan(style: PartStyle, sizeGB: number): Array<{ label: string; kind: 'efi' | 'msr' | 'recovery' | 'primary'; fs: 'ntfs' | 'fat32' | 'none'; sizeGB: number; letter: string | null }> {
  if (style === 'gpt') {
    // (ميزة B11) خطة GPT تضيف قسم استرداد 0.75GB — بترتيب EFI ← MSR ← الأساسي ← الاسترداد
    // (الاسترداد أخيرًا كالسلوك الشائع في المثبّت الحقيقي؛ الاختيار في completeInstall بالنوع
    // kind === 'primary' لا بالترتيب فيبقى صحيحًا)
    const overheadGB = 0.1 + 0.016 + 0.75;
    return [
      { label: 'EFI System Partition', kind: 'efi', fs: 'fat32', sizeGB: 0.1, letter: null },
      { label: 'Microsoft Reserved', kind: 'msr', fs: 'none', sizeGB: 0.016, letter: null },
      { label: 'Primary', kind: 'primary', fs: 'ntfs', sizeGB: Math.max(1, sizeGB - overheadGB), letter: null },
      { label: 'استرداد', kind: 'recovery', fs: 'ntfs', sizeGB: 0.75, letter: null },
    ];
  }
  return [{ label: 'Primary', kind: 'primary', fs: 'ntfs', sizeGB, letter: null }];
}
