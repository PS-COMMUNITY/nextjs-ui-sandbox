'use client';

/**
 * شاشة المختبر ثلاثي الأبعاد — المشهد التفاعلي + لوحة المعلومات وأدوات التحكم.
 * آلة الحالات الكاملة: مثبتة/فصل جزئي/صينية/بانتظار/تلف تدريبي + طرفيات تفاعلية.
 *
 * توجيه v3 المطبق هنا:
 *  - جهازا إدخال المستخدم الحقيقيان فقط: الماوس (تحديد/تدوير/تكبير/تحريك/سحب قطع)
 *    ولوحة المفاتيح (اختصارات لا تُلتقط أثناء الكتابة في الحقول + حقل إدخال حقيقي).
 *  - لا كيبورد ولا ماوس ثلاثيي الأبعاد في المشهد إطلاقًا.
 *  - شريط أدوات مصغر وواضح + ملء شاشة + لوحة خطوات قابلة للطي + تلميح تحكم.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  DoorOpen,
  DoorClosed,
  X,
  Bomb,
  Focus,
  EyeOff,
  RotateCcw,
  Power,
  PlugZap,
  Plug,
  Wrench,
  Hammer,
  ShieldAlert,
  TriangleAlert,
  CheckCircle2,
  CircleDashed,
  Wind,
  Thermometer,
  MonitorUp,
  MonitorX,
  Monitor,
  PackageOpen,
  HandMetal,
  MousePointerClick,
  View,
  FlipHorizontal2,
  ChevronsUp,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Hand,
  PanelRightClose,
  Keyboard,
  Eraser,
  Usb,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { isWebGLAvailable, PCScene } from '@/lib/scene/PCScene';
import { preloadGlbAssets } from '@/lib/scene/glbParts';
import type { ComponentId, ChecklistItem, MachineFlag, PartStatus, WinFamilyId } from '@/lib/types';
import { assemblyStateOf, ASSEMBLY_STATE_INFO, SECURE_FLAGS } from '@/lib/types';
import { COMPONENT_MAP } from '@/lib/data/catalog';
import { WINDOWS_FAMILIES } from '@/lib/data/windowsCatalog';
import type { Arch, PartStyle, WinFamily } from '@/lib/data/windowsCatalog';
import {
  getRemovalChecklist,
  getInstallChecklist,
} from '@/lib/simulation/assemblyEngine';
import { computeMonitorView } from '@/lib/simulation/monitorEngine';
import { FLAG_INFO } from '@/lib/simulation/machineFlags';
import { installedCount, useLabStore } from '@/lib/store/labStore';
import TechnicianScreen from '@/components/lab/TechnicianScreen';
import MissionsPanel from '@/components/lab/MissionsPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ============ شارة الحالة (آلة الحالات الثمانية) ============
function StatusBadge({ id }: { id: ComponentId }) {
  const sim = useLabStore((s) => s.sim);
  if (id === 'case') {
    return <Badge variant="outline" className="gap-1">هيكل الجهاز</Badge>;
  }
  const secureOpen = (SECURE_FLAGS[id] ?? []).some((f) => sim.flags[f]);
  const state = assemblyStateOf(sim.parts[id], secureOpen);
  const info = ASSEMBLY_STATE_INFO[state];
  const colorClass: Record<string, string> = {
    emerald: 'bg-emerald-600/15 text-emerald-400 border-emerald-600/40',
    amber: 'bg-amber-600/15 text-amber-400 border-amber-600/40',
    slate: 'bg-slate-600/15 text-slate-300 border-slate-600/40',
    cyan: 'bg-cyan-600/15 text-cyan-400 border-cyan-600/40',
    rose: 'bg-rose-600/15 text-rose-400 border-rose-600/40',
  };
  const icon =
    state === 'INSTALLED_CORRECTLY' ? <CheckCircle2 className="h-3 w-3" aria-hidden /> :
    state === 'AWAITING_INSTALL' ? <HandMetal className="h-3 w-3" aria-hidden /> :
    state === 'TRAINING_DAMAGE' ? <TriangleAlert className="h-3 w-3" aria-hidden /> :
    <Wrench className="h-3 w-3" aria-hidden />;
  return (
    <Badge variant="outline" className={cn('gap-1', colorClass[info.colorAr] ?? '')}>
      {icon}
      {state === 'INSTALLED_CORRECTLY' ? 'مثبتة بإحكام' : state === 'INSTALLED_SECURED' ? 'مثبتة (مزالج مفتوحة)' : info.labelAr}
    </Badge>
  );
}

/** خطوة قائمة تحقق — (V8) الأعلام تُنفّد بالنقر داخل المشهد لا بأزرار وهمية */
function ChecklistRow({
  item,
  mode,
  onPart,
}: {
  item: ChecklistItem;
  mode: 'remove' | 'install';
  onPart: (id: ComponentId) => void;
}) {
  const isFlag = item.source !== 'safetyOff' && item.source !== 'safetyUnplug' && item.source !== 'base';
  const canRunPart = !item.done && !isFlag && item.actionPart && item.available;
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs',
        item.done ? 'border-emerald-600/30 bg-emerald-600/10' : 'border-border bg-card',
        !item.done && !item.available && 'opacity-60',
      )}
    >
      {item.done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
      ) : (
        <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium leading-tight', item.done && 'line-through opacity-70')}>{item.labelAr}</p>
        {!item.done && item.hintAr ? (
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{item.hintAr}</p>
        ) : null}
      </div>
      {isFlag && !item.done ? (
        // (V8) لا زر «نفّذ» — الخطوة تُنفّد فعليًا بالنقر على البرغي/المزلاج/القابس في المشهد
        <span className="flex items-center gap-1 shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
          <MousePointerClick className="h-3 w-3" aria-hidden />
          انقرها في المشهد
        </span>
      ) : null}
      {canRunPart ? (
        <Button size="sm" variant="secondary" className="h-8 gap-1 px-2.5 text-[11px] shrink-0 max-sm:h-11 max-sm:px-3" onClick={() => onPart(item.actionPart!)}>
          <Hammer className="h-3 w-3" aria-hidden />
          {mode === 'remove' ? 'افصل' : 'وصّل'}
        </Button>
      ) : null}
    </li>
  );
}

function InfoPanel() {
  const selected = useLabStore((s) => s.selected);
  const select = useLabStore((s) => s.select);
  const sim = useLabStore((s) => s.sim);
  const detachPart = useLabStore((s) => s.detachPart);
  const extractPart = useLabStore((s) => s.extractPart);
  const preparePart = useLabStore((s) => s.preparePart);
  const installPart = useLabStore((s) => s.installPart);
  const repairPart = useLabStore((s) => s.repairPart);
  const setIsolated = useLabStore((s) => s.setIsolated);
  const isolated = useLabStore((s) => s.isolated);

  if (!selected) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground mb-1">حدّد قطعة من المشهد</p>
          <p>انقر على أي قطعة داخل الجهاز لعرض معلوماتها وحالتها وخطوات فكها أو تركيبها. انقر زر الشاشة الافتراضية (في المشهد) لتشغيلها، واكتب في حقل «دفتر النظام» أسفل المشهد عندما يدخل النظام الافتراضي.</p>
          <p className="mt-1">تدوير: سحب بالزر الأيسر — تقريب: العجلة — تحريك: الزر الأيمن — إعادة الكاميرا: دبل-كليك.</p>
        </CardContent>
      </Card>
    );
  }

  const entry = COMPONENT_MAP[selected];
  const status: PartStatus = sim.parts[selected];
  const removable = selected !== 'case';
  const removalItems = removable ? getRemovalChecklist(sim, selected) : [];
  const installItems = removable ? getInstallChecklist(sim, selected) : [];

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base leading-tight">{entry.nameAr}</CardTitle>
            <p dir="ltr" className="text-left font-mono text-[11px] text-muted-foreground mt-0.5">
              {entry.nameEn} · {entry.id}
            </p>
          </div>
          <StatusBadge id={selected} />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">{entry.description}</p>

        {/* أزرار آلة الحالات */}
        {removable ? (
          <div className="flex flex-wrap gap-2">
            {status === 'installed' ? (
              <Button size="sm" className="gap-1.5" onClick={() => detachPart(selected)}>
                <Hammer className="h-3.5 w-3.5" aria-hidden /> فصل جزئي (فك)
              </Button>
            ) : null}
            {status === 'separated' ? (
              <Button size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700" onClick={() => extractPart(selected)}>
                <PackageOpen className="h-3.5 w-3.5" aria-hidden /> استخراج إلى الصينية
              </Button>
            ) : null}
            {status === 'removed' ? (
              <Button size="sm" className="gap-1.5 bg-cyan-700 hover:bg-cyan-600" onClick={() => preparePart(selected)}>
                <HandMetal className="h-3.5 w-3.5" aria-hidden /> التقاط للتركيب
              </Button>
            ) : null}
            {status === 'awaiting' ? (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => installPart(selected)}>
                <Wrench className="h-3.5 w-3.5" aria-hidden /> ركّب الآن
              </Button>
            ) : null}
            {status === 'damaged' ? (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => repairPart(selected)}>
                <Wrench className="h-3.5 w-3.5" aria-hidden /> استبدال بقطعة سليمة
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setIsolated(isolated === selected ? null : selected)}
            >
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
              {isolated === selected ? 'إلغاء العزل' : 'عزل للفحص'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">الهيكل هو جسم الجهاز — استخدم زر «الغطاء الجانبي» في شريط أدوات المشهد لفتحه أو إغلاقه.</p>
        )}

        <Separator />

        {/* قائمة تحقق الفك */}
        {removable && status === 'installed' ? (
          <div>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-500" aria-hidden /> شروط الفك بالترتيب
            </p>
            <ul className="space-y-1.5">
              {removalItems.map((item) => (
                <ChecklistRow key={item.source + item.labelAr} item={item} mode="remove" onPart={detachPart} />
              ))}
            </ul>
          </div>
        ) : null}

        {/* قائمة تحقق التركيب */}
        {removable && (status === 'awaiting' || status === 'removed') ? (
          <div>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> شروط إعادة التركيب
            </p>
            <ul className="space-y-1.5">
              {installItems.map((item) => (
                <ChecklistRow key={item.source + item.labelAr} item={item} mode="install" onPart={installPart} />
              ))}
            </ul>
          </div>
        ) : null}

        {/* خطوات الإغلاق بعد التركيب */}
        {removable && status === 'installed' && (SECURE_FLAGS[selected] ?? []).some((f) => sim.flags[f]) ? (
          <div>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
              <Hammer className="h-3.5 w-3.5 text-primary" aria-hidden /> أكمل التثبيت (خطوات متبقية)
            </p>
            <ul className="space-y-1.5">
              {(SECURE_FLAGS[selected] ?? [])
                .filter((f) => sim.flags[f])
                .map((f) => (
                  <li key={f} className="flex items-center gap-2 rounded-md border border-amber-600/30 bg-amber-600/10 px-2.5 py-2 text-xs">
                    <CircleDashed className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-tight">{FLAG_INFO[f].labelAr} — ما زال مفتوحًا</p>
                      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{FLAG_INFO[f].hintAr}</p>
                    </div>
                    {/* (V8) الإغلاق بنقرة مباشرة على المزلاج/البرغي داخل المشهد */}
                    <span className="flex items-center gap-1 shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                      <MousePointerClick className="h-3 w-3" aria-hidden />
                      انقرة في المشهد
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {/* السلامة */}
        {entry.safety.length > 0 ? (
          <div className="rounded-md border border-amber-600/30 bg-amber-600/10 p-2.5">
            <p className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> تنبيهات السلامة
            </p>
            <ul className="text-[11px] leading-relaxed text-amber-200/80 list-disc ps-4 space-y-0.5">
              {entry.safety.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          type="button"
          className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => select(null)}
        >
          إلغاء التحديد
        </button>
      </CardContent>
    </Card>
  );
}

// ============ لوحة السلامة السريعة (الطاقة + الشاشة) ============
function SafetyStrip() {
  const sim = useLabStore((s) => s.sim);
  const toggleFlag = useLabStore((s) => s.toggleFlag);
  const toggleMonitor = useLabStore((s) => s.toggleMonitor);
  const count = installedCount(sim);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={sim.flags.powerOn ? 'destructive' : 'outline'}
        className={cn('gap-1.5', !sim.flags.powerOn && 'border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/10')}
        onClick={() => toggleFlag('powerOn')}
      >
        <Power className="h-3.5 w-3.5" aria-hidden />
        {sim.flags.powerOn ? 'إطفاء الجهاز' : 'تشغيل الجهاز'}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={cn('gap-1.5', sim.flags.acConnected ? 'border-amber-600/40 text-amber-400' : 'border-emerald-600/40 text-emerald-400')}
        onClick={() => toggleFlag('acConnected')}
      >
        {sim.flags.acConnected ? <PlugZap className="h-3.5 w-3.5" aria-hidden /> : <Plug className="h-3.5 w-3.5" aria-hidden />}
        {sim.flags.acConnected ? 'فصل كابل الكهرباء' : 'توصيل كابل الكهرباء'}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={cn('gap-1.5', sim.peripherals.monitorOn ? 'border-cyan-600/40 text-cyan-400' : '')}
        onClick={toggleMonitor}
        title="تشغيل/إطفاء الشاشة الافتراضية (أو انقر زرها في المشهد)"
      >
        <Monitor className="h-3.5 w-3.5" aria-hidden />
        {sim.peripherals.monitorOn ? 'إطفاء الشاشة' : 'تشغيل الشاشة'}
      </Button>
      <Badge variant="outline" className="font-mono" dir="ltr">
        {count}/14
      </Badge>
    </div>
  );
}

// ============ تلميح التحكم بالجهازين الحقيقيين (زر H) ============
function HintsOverlay({ dragMode }: { dragMode: boolean }) {
  const visible = useLabStore((s) => s.hintsVisible);
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none absolute top-12 start-2 z-10 max-lg:hidden rounded-md border border-border/70 bg-background/85 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground backdrop-blur-sm"
      dir="rtl"
      role="note"
      aria-label="تلميحات التحكم بالماوس ولوحة المفاتيح الحقيقيين"
    >
      <p className="font-bold text-foreground mb-0.5 flex items-center gap-1.5">
        <Hand className="h-3 w-3" aria-hidden /> تحكم الماوس
      </p>
      <p>سحب الزر الأيسر: تدوير • العجلة: تقريب • الزر الأيمن: تحريك</p>
      <p>نقرة: تحديد قطعة • دبل-كليك: إعادة الكاميرا</p>
      {dragMode ? (
        <p className="text-cyan-400 mt-0.5">وضع الفك/التركيب: اسحب القطعة المفصولة إلى الصينية، أو القطعة الجاهزة إلى الجهاز</p>
      ) : (
        <p className="mt-0.5">فعّل «وضع السحب» لفك/تركيب القطع بالسحب المباشر</p>
      )}
      <p className="mt-0.5">لوحة المفاتيح: R إعادة • F تركيز • X أشعة • 1/2/3 مناظير • H إخفاء</p>
    </div>
  );
}

// ============ الوضع البديل التعليمي عند غياب WebGL ============
function FallbackView({ messageAr }: { messageAr: string }) {
  const openTool = useLabStore((s) => s.openTool);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-600/40 bg-amber-600/10 p-4">
        <p className="font-bold text-amber-400 flex items-center gap-2">
          <TriangleAlert className="h-4 w-4" aria-hidden /> المشهد ثلاثي الأبعاد غير متاح
        </p>
        <p className="text-sm text-amber-200/80 mt-1 leading-relaxed">{messageAr}</p>
        <p className="text-xs text-muted-foreground mt-1">
          ما يلي عرض تعليمي مبسط نصي — وليس محاكاة ثلاثية الأبعاد.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(COMPONENT_MAP).map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4">
              <p className="font-bold text-sm">{c.nameAr}</p>
              <p dir="ltr" className="text-left font-mono text-[10px] text-muted-foreground">{c.nameEn}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-3">{c.role}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button variant="outline" onClick={() => openTool('catalog')}>
        الانتقال إلى كتالوج القطع الكامل
      </Button>
    </div>
  );
}

// ============ (V6-D) حوار وسائط التثبيت — نقطة الدخول الرسمية لمعالج تثبيت Windows ============
// (ميزة F1) تبويب «إنشاء وسيط تثبيت»: معالج بأسلوب Rufus يعلّم سلسلة القرارات الكلاسيكية
// للفني (عائلة ← بنية ← نمط تقسيم/وضع إقلاع ← محاكاة إنشاء). حالة المعالج محلية بالكامل
// في هذا المكوّن — المتجر لا يرى إلا الناتج النهائي عبر insertUsb(family) الموجود أصلًا.

/** مراحل محاكاة الإنشاء الأربع — تُعرض بالتسلسل مع تقدم العملية */
const CREATION_STAGES_AR = [
  'تهيئة الوسيط (FAT32)',
  'كتابة سجل الإقلاع',
  'نسخ ملفات التثبيت (~3GB وهميًا)',
  'اكتمل إنشاء الوسيط',
] as const;

/** عتبة بدء كل مرحلة على شريط التقدم (٪) */
const CREATION_STAGE_AT: readonly number[] = [0, 25, 55, 100];

/** المدة الكلية لمحاكاة الإنشاء — 2.5ث (25 نداء × 100ms) */
const CREATION_TOTAL_MS = 2500;

/** رسالة تعارض نمط التقسيم مع العائلة — شرح عربي يُعطَّل معه زر «التالي» */
function schemeConflictAr(f: WinFamily, s: PartStyle): string {
  if (s === 'gpt') {
    return f.bootModes.includes('uefi')
      ? 'نمط GPT غير مدرج ضمن أنماط هذه العائلة التعليمية — اختر MBR.'
      : 'هذه العائلة تققلع بوضع BIOS/Legacy فقط ولا تدعم الإقلاع من قرص GPT — اختر MBR.';
  }
  return f.bootModes.includes('bios')
    ? 'نمط MBR غير مدرج ضمن أنماط هذه العائلة التعليمية — اختر GPT.'
    : 'هذه العائلة تتطلب UEFI مع قرص GPT (مع TPM 2.0 وSecure Boot) — MBR غير مدعوم.';
}

function UsbMediaDialog() {
  const usbMedia = useLabStore((s) => s.sim.usbMedia);
  const platformBoot = useLabStore((s) => s.sim.firmware.bootMode);
  const insertUsb = useLabStore((s) => s.insertUsb);
  const [open, setOpen] = useState(false);

  // ===== حالة التبويب ومعالج الإنشاء — كلها محلية (لا حالة معالج في المتجر) =====
  const [tab, setTab] = useState<'ready' | 'create'>('ready');
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0); // 0=عائلة، 1=بنية، 2=نمط تقسيم، 3=محاكاة الإنشاء
  const [familyId, setFamilyId] = useState<WinFamilyId | null>(null);
  const [arch, setArch] = useState<Arch | null>(null);
  const [scheme, setScheme] = useState<PartStyle | null>(null);
  const [progress, setProgress] = useState(0); // 0..100
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const family = familyId ? WINDOWS_FAMILIES.find((f) => f.id === familyId) ?? null : null;
  /** البنى المدعومة للعائلة = اتحاد بنى طبعاتها (XP Home مثلًا x86 فقط بينما Professional يدعم x64) */
  const familyArchs: Arch[] = family
    ? (['x86', 'x64'] as Arch[]).filter((a) => family.editions.some((e) => e.arch.includes(a)))
    : [];
  /** وضع الإقلاع المشتق من نمط التقسيم — القاعدة الكلاسيكية: GPT⇔UEFI وMBR⇔BIOS/Legacy */
  const derivedBoot: 'bios' | 'uefi' | null =
    scheme === 'gpt' ? 'uefi' : scheme === 'mbr' ? 'bios' : null;
  const schemeSupported = !!(
    family &&
    scheme &&
    derivedBoot &&
    family.partStyles.includes(scheme) &&
    family.bootModes.includes(derivedBoot)
  );

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // تنظيف المؤقت عند تفكيك المكوّن — لا مؤقت يتيم بعد الإغلاق
  useEffect(() => stopTimer, [stopTimer]);

  const resetWizard = useCallback(() => {
    stopTimer();
    setStep(0);
    setFamilyId(null);
    setArch(null);
    setScheme(null);
    setProgress(0);
    setDone(false);
  }, [stopTimer]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        setTab('ready');
        resetWizard();
      }
    },
    [resetWizard],
  );

  /** الخطوة 1: اختيار العائلة يهيئ البنية ونمط التقسيم المقترحَين تلقائيًا */
  const chooseFamily = (id: WinFamilyId) => {
    const f = WINDOWS_FAMILIES.find((x) => x.id === id);
    if (!f) return;
    setFamilyId(id);
    setArch(f.editions.some((e) => e.arch.includes('x86')) ? 'x86' : 'x64');
    // اقتراح نمط التقسيم: عائلة بوضع إقلاع وحيد ← نمطها الوحيد، وإلا وفق وضع إقلاع المنصة الحالي
    const preferred: PartStyle = platformBoot === 'uefi' ? 'gpt' : 'mbr';
    setScheme(f.partStyles.includes(preferred) ? preferred : f.partStyles[0]);
    setStep(1);
  };

  /** الخطوة 4: محاكاة إنشاء 2.5ث — الاكتمال والإلغاء كلاهما في نداء المؤقت (حدث خارجي) */
  const startCreation = () => {
    const chosenFamily = familyId;
    if (!chosenFamily || !scheme) return;
    stopTimer();
    setDone(false);
    setProgress(0);
    setStep(3);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - startedAt) / CREATION_TOTAL_MS) * 100));
      setProgress(pct);
      if (pct >= 100) {
        // الاكتمال: إدخال الوسيط بالإجراء الموجود + toast نجاح — قسم «وسائط جاهزة» سيعكس الحالة من المتجر
        stopTimer();
        setDone(true);
        insertUsb(chosenFamily);
        toast.success('جُهّز الوسيط وأُدخل — أعد التشغيل وأدخل قائمة الإقلاع');
      }
    }, 100);
  };

  /** حالة كل سطر مرحلة على شريط التقدم: مخفية/جارية/منتهية */
  const stageState = (i: number): 'hidden' | 'active' | 'done' => {
    if (progress < CREATION_STAGE_AT[i]) return 'hidden';
    const next = CREATION_STAGE_AT[i + 1];
    if (next === undefined ? progress >= 100 : progress >= next) return 'done';
    return 'active';
  };

  const familyName = (id: WinFamilyId | null) =>
    id ? WINDOWS_FAMILIES.find((f) => f.id === id)?.nameAr ?? id : '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={usbMedia ? 'default' : 'ghost'}
          className="h-7 gap-1 px-2 text-[11px]"
          title="إدخال/إخراج وسيط تثبيت Windows — يفتح معالج التثبيت عند الإقلاع منه (V6-D)"
        >
          <Usb className="h-3.5 w-3.5" aria-hidden />
          {usbMedia ? `الوسيط: ${WINDOWS_FAMILIES.find((f) => f.id === usbMedia)?.nameEn ?? usbMedia}` : 'وسيط USB'}
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Usb className="h-4 w-4" aria-hidden />
            وسائط تثبيت Windows — محاكاة تعليمية
          </DialogTitle>
          <DialogDescription>
            اختر عائلة لإدخال وسيطها. بعد الإدخال: شغّل الجهاز، وتأكد أن أولوية الإقلاع «USB» أولًا (زر DEL أو تبويب Boot في إعدادات البرنامج الثابت) — بعد POST سيقلع الجهاز إلى معالج التثبيت على الشاشة المجسمة.
          </DialogDescription>
        </DialogHeader>

        {/* (F1) تبويبا الحوار: الوسائط الجاهزة / معالج إنشاء الوسيط */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1" role="tablist" aria-label="أقسام حوار وسائط التثبيت">
          <Button
            type="button"
            role="tab"
            aria-selected={tab === 'ready'}
            variant={tab === 'ready' ? 'default' : 'ghost'}
            className="h-9 max-sm:h-11 text-xs"
            onClick={() => setTab('ready')}
          >
            وسائط جاهزة
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={tab === 'create'}
            variant={tab === 'create' ? 'default' : 'ghost'}
            className="h-9 max-sm:h-11 text-xs"
            onClick={() => setTab('create')}
          >
            إنشاء وسيط تثبيت
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
          <p className="font-medium mb-1">وضع إقلاع المنصة الحالي: {platformBoot === 'uefi' ? 'UEFI (يقبل GPT)' : 'BIOS/Legacy (يقبل MBR)'}</p>
          <p className="text-muted-foreground">
            العائلات القديمة (XP/Vista) تقلع بوضع BIOS/Legacy فقط، وويندوز 11 يقلع بوضع UEFI فقط. بدّل الوضع من إعدادات البرنامج الثابت ← تبويب Boot ← مفتاح Boot Mode. متطلبات TPM 2.0 وSecure Boot من تبويب Security.
          </p>
        </div>

        {tab === 'ready' ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">وسائط جاهزة</p>
              {usbMedia ? (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Usb className="h-3 w-3" aria-hidden />
                  مُدخل الآن: {familyName(usbMedia)}
                </Badge>
              ) : (
                <span className="text-[11px] text-muted-foreground">لا وسيط مُدخل حاليًا</span>
              )}
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto pe-1 scrollbar-thin" role="list" aria-label="قائمة عائلات Windows المتاحة">
              {WINDOWS_FAMILIES.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg border p-2.5" role="listitem">
                  <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">
                      {f.nameEn} <span className="text-muted-foreground">({f.year})</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                      {f.editions.length} طبعات • حد أدنى {Math.ceil(f.minRamMB / 1024)}GB RAM / {f.minDiskGB}GB قرص
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {f.bootModes.map((m) => (
                        <Badge key={m} variant="outline" className="text-[9px] px-1 py-0">{m === 'uefi' ? 'UEFI' : 'BIOS/Legacy'}</Badge>
                      ))}
                      {f.partStyles.map((s) => (
                        <Badge key={s} variant="outline" className="text-[9px] px-1 py-0">{s.toUpperCase()}</Badge>
                      ))}
                      {f.requiresTpm2 ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5"><ShieldCheck className="h-2.5 w-2.5" aria-hidden />TPM 2.0 + Secure Boot</Badge>
                      ) : null}
                    </div>
                  </div>
                  {usbMedia === f.id ? (
                    <Button size="sm" variant="secondary" className="h-8 shrink-0 max-sm:h-11 max-sm:px-3" onClick={() => { insertUsb(null); }}>
                      إخراج الوسيط
                    </Button>
                  ) : (
                    <Button size="sm" className="h-8 shrink-0 max-sm:h-11 max-sm:px-3" onClick={() => { insertUsb(f.id); }}>
                      إدخال
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="max-h-80 space-y-3 overflow-y-auto pe-1 scrollbar-thin" aria-live="polite" aria-label="معالج إنشاء وسيط تثبيت">
            {/* رأس الخطوة */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {step === 0 && 'الخطوة 1 من 3 — اختر عائلة Windows'}
                {step === 1 && `الخطوة 2 من 3 — اختر البنية لـ ${familyName(familyId)}`}
                {step === 2 && 'الخطوة 3 من 3 — اختر نمط التقسيم'}
                {step === 3 && (done ? 'اكتمل إنشاء الوسيط' : 'جارٍ إنشاء الوسيط — محاكاة تعليمية')}
              </p>
              <Badge variant="outline" className="shrink-0 text-[10px]">{['عائلة', 'بنية', 'تقسيم', 'إنشاء'][step]}</Badge>
            </div>

            {/* الخطوة 1: العائلات السبع مع عدد الطبعات وشارات البنى المتاحة */}
            {step === 0 && (
              <div className="space-y-2">
                {WINDOWS_FAMILIES.map((f) => {
                  const archs: Arch[] = (['x86', 'x64'] as Arch[]).filter((a) => f.editions.some((e) => e.arch.includes(a)));
                  const selected = familyId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => chooseFamily(f.id)}
                      aria-pressed={selected}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg border p-2.5 text-start min-h-11 transition-colors hover:bg-muted/60',
                        selected && 'border-primary bg-primary/10',
                      )}
                    >
                      <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-tight">
                          {f.nameAr} <span className="text-muted-foreground">({f.nameEn} • {f.year})</span>
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{f.editions.length} طبعات</Badge>
                          {archs.map((a) => (
                            <Badge key={a} variant="outline" className="text-[9px] px-1 py-0">{a === 'x86' ? '32-bit (x86)' : '64-bit (x64)'}</Badge>
                          ))}
                          {f.requiresTpm2 ? (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5"><ShieldCheck className="h-2.5 w-2.5" aria-hidden />TPM 2.0</Badge>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* الخطوة 2: البنية — تُعرض البنى المدعومة فقط حسب بيانات العائلة */}
            {step === 1 && family && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {(['x86', 'x64'] as Arch[]).map((a) => {
                    const supported = familyArchs.includes(a);
                    const selected = arch === a;
                    return (
                      <button
                        key={a}
                        type="button"
                        disabled={!supported}
                        onClick={() => setArch(a)}
                        aria-pressed={selected}
                        className={cn(
                          'flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-lg border p-2.5 text-start transition-colors',
                          supported ? 'hover:bg-muted/60' : 'cursor-not-allowed opacity-40',
                          selected && 'border-primary bg-primary/10',
                        )}
                      >
                        <span className="text-sm font-medium">{a === 'x86' ? 'x86 — 32-bit' : 'x64 — 64-bit'}</span>
                        <span className="text-[10px] text-muted-foreground">{supported ? 'مدعومة لهذه العائلة' : 'غير متاحة لهذه العائلة'}</span>
                      </button>
                    );
                  })}
                </div>
                {familyId === 'xp' && arch === 'x64' && (
                  <p className="rounded-md border border-amber-600/30 bg-amber-600/10 p-2 text-[11px] leading-relaxed text-amber-200/90">
                    ملاحظة تعليمية: إصدار Home من XP جاء ببنية x86 فقط — بنية x64 متاحة عبر إصدار Professional.
                  </p>
                )}
                {familyId === '11' && (
                  <p className="rounded-md border border-amber-600/30 bg-amber-600/10 p-2 text-[11px] leading-relaxed text-amber-200/90">
                    ويندوز 11 جاء ببنية 64-bit فقط — لا توجد إصدارات x86 منه.
                  </p>
                )}
              </div>
            )}

            {/* الخطوة 3: نمط التقسيم + وضع الإقلاع المشتق منه */}
            {step === 2 && family && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {(['gpt', 'mbr'] as PartStyle[]).map((s) => {
                    const selected = scheme === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setScheme(s)}
                        aria-pressed={selected}
                        className={cn(
                          'flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-lg border p-2.5 text-start transition-colors hover:bg-muted/60',
                          selected && 'border-primary bg-primary/10',
                        )}
                      >
                        <span className="text-sm font-medium">{s === 'gpt' ? 'GPT — لأنظمة UEFI' : 'MBR — لأنظمة BIOS/Legacy'}</span>
                        <span className="text-[10px] text-muted-foreground">{s === 'gpt' ? 'جدول أقسام حديث مع قسم EFI' : 'جدول أقسام كلاسيكي للإقلاع القديم'}</span>
                      </button>
                    );
                  })}
                </div>
                {scheme && derivedBoot && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      وضع الإقلاع المشتق: {derivedBoot === 'uefi' ? 'UEFI' : 'BIOS/Legacy'}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">تأكد أن وضع إقلاع المنصة في تبويب Boot يطابقه قبل الإقلاع من الوسيط.</span>
                  </div>
                )}
                {scheme && !schemeSupported && (
                  <p className="rounded-md border border-rose-600/30 bg-rose-600/10 p-2 text-[11px] leading-relaxed text-rose-300">
                    {schemeConflictAr(family, scheme)}
                  </p>
                )}
                {/* سطر تعليمي: GPT+UEFI مقابل MBR+BIOS في جملة واحدة */}
                <p className="rounded-md border border-border bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
                  القاعدة: GPT يقترن بـ UEFI (جدول أقسام حديث يدعم أقراصًا أكبر من 2TB وقسم EFI منفصل)، بينما MBR يقترن بـ BIOS/Legacy — نمط التقسيم يجب أن يطابق وضع إقلاع اللوحة وإلا رفض المثبّت القرص.
                </p>
              </div>
            )}

            {/* الخطوة 4: شريط تقدم + المراحل الأربع بالتسلسل */}
            {step === 3 && (
              <div className="space-y-2.5">
                <Progress value={progress} className="h-2" aria-label="تقدم إنشاء الوسيط" />
                <p className="text-[11px] text-muted-foreground" dir="ltr">{progress}%</p>
                <ul className="space-y-1.5">
                  {CREATION_STAGES_AR.map((label, i) => {
                    const st = stageState(i);
                    if (st === 'hidden') return null;
                    return (
                      <li key={label} className={cn('flex items-center gap-2 text-xs', st === 'done' ? 'text-emerald-500' : 'text-foreground')}>
                        {st === 'done'
                          ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          : <CircleDashed className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />}
                        {label}
                      </li>
                    );
                  })}
                </ul>
                {done && family && (
                  <p className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-2 text-[11px] leading-relaxed text-emerald-300">
                    الوسيط «{family.nameAr}» ({arch === 'x86' ? 'x86' : 'x64'} • {scheme === 'gpt' ? 'GPT/UEFI' : 'MBR/BIOS'}) أصبح مُدخلًا — تجده الآن في قسم «وسائط جاهزة».
                  </p>
                )}
              </div>
            )}

            {/* أزرار المعالج */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {step === 0 && (
                <Button size="sm" className="h-9 max-sm:h-11 max-sm:px-3 flex-1" disabled={!familyId} onClick={() => setStep(1)}>
                  التالي: اختر البنية
                </Button>
              )}
              {step === 1 && (
                <>
                  <Button size="sm" variant="outline" className="h-9 max-sm:h-11 max-sm:px-3" onClick={() => setStep(0)}>رجوع</Button>
                  <Button size="sm" className="h-9 max-sm:h-11 max-sm:px-3 flex-1" disabled={!arch} onClick={() => setStep(2)}>التالي: نمط التقسيم</Button>
                </>
              )}
              {step === 2 && (
                <>
                  <Button size="sm" variant="outline" className="h-9 max-sm:h-11 max-sm:px-3" onClick={() => setStep(1)}>رجوع</Button>
                  <Button size="sm" className="h-9 max-sm:h-11 max-sm:px-3 flex-1" disabled={!scheme || !schemeSupported} onClick={startCreation}>
                    بدء الإنشاء (محاكاة)
                  </Button>
                </>
              )}
              {step === 3 && !done && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 max-sm:h-11 max-sm:px-3 w-full text-rose-400"
                  onClick={() => { stopTimer(); setProgress(0); setStep(2); }}
                >
                  إلغاء الإنشاء
                </Button>
              )}
              {step === 3 && done && (
                <>
                  <Button size="sm" variant="outline" className="h-9 max-sm:h-11 max-sm:px-3" onClick={resetWizard}>
                    إنشاء وسيط آخر
                  </Button>
                  <Button size="sm" className="h-9 max-sm:h-11 max-sm:px-3 flex-1" onClick={() => setTab('ready')}>
                    عرض الوسائط الجاهزة
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          أمانة تعليمية: هذه وسائط محاكاة داخل المشروع — لا تُوزّع ملفات Windows ولا تطلب مفاتيح حقيقية، وكل العمليات على أقراص الجهاز الافتراضي فقط.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ============ الشاشة الرئيسية للمختبر ============
export default function LabScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneWrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PCScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [errorAr, setErrorAr] = useState<string>('');
  const [dragMode, setDragMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canType, setCanType] = useState(false);
  const [focusMode, setFocusModeState] = useState(false);
  const [fansReport, setFansReport] = useState<Array<{ labelAr: string; rpm: number; running: boolean; stateAr: string; airflowAr: string }>>([]);
  const [assetsReady, setAssetsReady] = useState(false); // (إضافة تدقيق V6) مؤشر تجهيز النماذج — كان المشهد يظهر فارغًا بلا رسالة

  const sim = useLabStore((s) => s.sim);
  const selected = useLabStore((s) => s.selected);
  const xray = useLabStore((s) => s.xray);
  const exploded = useLabStore((s) => s.exploded);
  const isolated = useLabStore((s) => s.isolated);
  const quality = useLabStore((s) => s.quality);
  const sidePanelsHidden = useLabStore((s) => s.sidePanelsHidden);
  const screen = useLabStore((s) => s.screen);
  const bootStartedAt = useLabStore((s) => s.bootStartedAt);
  const notepad = useLabStore((s) => s.notepad);
  const airflowVisible = useLabStore((s) => s.airflowVisible);
  const benchTool = useLabStore((s) => s.benchTool);
  const setBenchTool = useLabStore((s) => s.setBenchTool);
  const toggleXray = useLabStore((s) => s.toggleXray);
  const toggleExploded = useLabStore((s) => s.toggleExploded);
  const setIsolated = useLabStore((s) => s.setIsolated);
  const setAirflow = useLabStore((s) => s.setAirflow);
  const resetSimulation = useLabStore((s) => s.resetSimulation);
  const select = useLabStore((s) => s.select);
  const damagePart = useLabStore((s) => s.damagePart);
  const setNotepad = useLabStore((s) => s.setNotepad);
  const clearNotepad = useLabStore((s) => s.clearNotepad);

  // (إصلاح U8) مرجع الجودة: إنشاء المشهد يعمل مرة واحدة بمعتمدات [] — يقرأ الجودة
  // من المرجع بدل القيمة الملتقطة وقت الإنشاء، مع بقاء مؤثر المزامنة المنفصل كما هو.
  const qualityRef = useRef(quality);
  // (إصلاح U6) سجل مؤقتات السلاسل الزمنية (مثل إعادة تشغيل بيئة الاسترداد) —
  // تُلغى كلها عند التخلص من المشهد/مغادرة الشاشة حتى لا تعمل بعد رحيل الشاشة.
  const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const trackTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      pendingTimeoutsRef.current.delete(id);
      fn();
    }, ms);
    pendingTimeoutsRef.current.add(id);
    return id;
  }, []);
  const clearPendingTimeouts = useCallback(() => {
    for (const id of pendingTimeoutsRef.current) clearTimeout(id);
    pendingTimeoutsRef.current.clear();
  }, []);

  // إنشاء المشهد مرة واحدة — كل حالات الفشل تمر عبر callback واحد
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fail = (message: string) => {
      setFailed(true);
      setErrorAr(message);
    };
    const callbacks = {
      onSelect: (id: ComponentId | null) => useLabStore.getState().select(id),
      onPeripheral: (kind: string) => {
        const store = useLabStore.getState();
        if (kind === 'monitor-power' || kind === 'monitor') store.toggleMonitor();
        // (V8) كيبورد/فأرة المكتب الماديان: النقر عليهما يدخل التحكم بالشاشة كفني حقيقي
        if (kind === 'keyboard' || kind === 'mouse') {
          sceneRef.current?.setFocusMode(true);
          toast.info('وضع التحكم بالشاشة — اكتب بلوحة مفاتيحك الحقيقية، Esc للخروج');
        }
      },
      // (V8) نقرة مباشرة على برغي/مزلاج/رافعة/قابس/مفتاح PSU — نفس مسار التحقق والسجل
      onFlagClick: (flag: MachineFlag) => useLabStore.getState().toggleFlag(flag),
      // (V8) نقر برغي بلا مفك — توجيه لالتقاط الأداة كما في الواقع
      onToolRequired: () => {
        if (useLabStore.getState().benchTool !== 'screwdriver') {
          toast.error('البراغي لا تُفك بالأصابع — التقط المفك: انقر المفك على الطاولة أو زر «المفك» أعلى المشهد (S)');
        }
      },
      // (V8) التقاط الأداة من الطاولة داخل المشهد نفسه
      onToolPick: () => {
        useLabStore.getState().setBenchTool('screwdriver');
        toast.success('أمسكتَ بمفك فيليبس — انقر أي برغي لفكّه، وانقره مجددًا لتثبيته');
      },
      // (V8) زر الطاقة الفعلي على واجهة الهيكل — نفس مسار زر التشغيل
      onPowerButton: () => useLabStore.getState().toggleFlag('powerOn'),
      // إفلات قطعة مسحوبة: التحقق المنطقي أولًا ثم الحركة (توجيه v3 §6)
      onPartDrop: (id: ComponentId, zone: 'tray' | 'case' | null) => {
        const st = useLabStore.getState();
        const status = st.sim.parts[id];
        if (zone === 'tray' && status === 'separated') st.extractPart(id);
        else if (zone === 'case' && (status === 'awaiting' || status === 'removed')) st.installPart(id);
        // غير ذلك: لا تغيير منطقي — يعاد الهدف الصحيح أدناه
        const after = useLabStore.getState().sim;
        sceneRef.current?.syncState(after);
      },
      // (V6-B) شارة وضع التحكم بالشاشة
      onFocusMode: (on: boolean) => {
        setFocusModeState(on);
        useLabStore.getState().setInputMode(on ? 'monitor' : 'lab');
      },
      // (V6 §3) الحرارة المُحاكاة → المتجر (مصدر الحقيقة)
      onThermal: (cpu, gpu) => useLabStore.getState().setThermal(cpu, gpu),
      // إطفاء حراري تعليمي
      onThermalShutdown: (cpu) => {
        const st = useLabStore.getState();
        if (st.sim.flags.powerOn) {
          st.toggleFlag('powerOn');
          toast.error(`إطفاء حراري تعليمي: حرارة المعالج بلغت ${cpu.toFixed(0)}°C — تحقق من المبرد ومراوح الهيكل`);
        }
      },
      // (V6-D) إعدادات UEFI من داخل النظام الافتراضي
      onFirmwareChange: (patch) => {
        const st = useLabStore.getState();
        const key = Object.keys(patch)[0];
        if (key === 'bootOrder' && Array.isArray(patch.bootOrder)) st.patchFirmware({ bootOrder: patch.bootOrder as string[] });
        else if (key === 'secureBoot') st.patchFirmware({ secureBoot: Boolean(patch.secureBoot) });
        else if (key === 'tpm') st.patchFirmware({ tpm: Boolean(patch.tpm) });
        else if (key === 'xmp') st.patchFirmware({ xmp: Boolean(patch.xmp) });
        else if (key === 'setupRequested') st.patchFirmware({ setupRequested: Boolean(patch.setupRequested) });
        else if (key === 'bootMode') st.patchFirmware({ bootMode: patch.bootMode === 'bios' ? 'bios' : 'uefi' });
      },
      onBootDevice: (deviceId) => {
        const st = useLabStore.getState();
        st.bootFromDevice(deviceId);
        st.patchFirmware({ setupRequested: false });
      },
      // (V6-E/F16) بيئة الاسترداد
      onStartupRepair: () => useLabStore.getState().runStartupRepair(),
      onRecoveryRestart: () => {
        const st = useLabStore.getState();
        st.toggleFlag('powerOn'); // إطفاء
        // (إصلاح U6) المؤقت متتبّع في pendingTimeoutsRef ويُلغى عند مغادرة الشاشة
        trackTimeout(() => {
          // حارس: إن شُغّل الجهاز يدويًا أثناء الانتظار فلا نطفئه من جديد
          if (useLabStore.getState().sim.flags.powerOn) return;
          useLabStore.getState().toggleFlag('powerOn'); // تشغيل من جديد
        }, 900);
      },
      onError: fail,
    };
    let scene: PCScene | null = null;
    if (!isWebGLAvailable()) {
      queueMicrotask(() => fail('متصفحك لا يدعم WebGL — لن يمكن عرض المشهد ثلاثي الأبعاد. استخدم متصفحًا حديثًا أو فعّل تسريع العتاد.'));
      return;
    }
    // (V5) تحميل النماذج الحقيقية قبل إنشاء المشهد — الفشل يبقي المجسمات الإجرائية
    let cancelled = false;
    void (async () => {
      try {
        await preloadGlbAssets();
      } catch {
        // تجاهل: buildAllParts ستستخدم المجسمات الإجرائية
      }
      if (cancelled) return;
      setAssetsReady(true);
      try {
        scene = new PCScene({ container: el, quality: qualityRef.current, callbacks });
        sceneRef.current = scene;
        const st = useLabStore.getState();
        scene.syncState(st.sim);
        scene.setXray(st.xray);
        scene.setExploded(st.exploded);
        scene.setAirflow(st.airflowVisible);
        scene.setBootClock(st.bootStartedAt);
        scene.setNotepad(st.notepad);
        scene.setDragEnabled(false);
        // خطاف فحص تطويري فقط (غير مستخدم في الإنتاج الوظيفي)
        if (typeof window !== 'undefined') {
          (window as unknown as Record<string, unknown>).__pcrs = { scene };
        }
      } catch {
        queueMicrotask(() => fail('تعذر إنشاء المشهد ثلاثي الأبعاد — قد تكون موارد الجهاز منخفضة.'));
      }
    })();
    return () => {
      cancelled = true;
      clearPendingTimeouts(); // (إصلاح U6) إلغاء المؤقتات المعلقة عند مغادرة الشاشة/إلغاء التركيب
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // مزامنة الحالة مع المشهد
  useEffect(() => {
    qualityRef.current = quality; // (إصلاح U8) إبقاء المرجع متزامنًا مع تغيّر الجودة
    sceneRef.current?.setQuality(quality);
  }, [quality]);
  useEffect(() => {
    sceneRef.current?.setXray(xray);
  }, [xray]);
  useEffect(() => {
    sceneRef.current?.setExploded(exploded);
  }, [exploded]);
  useEffect(() => {
    sceneRef.current?.highlight(selected);
  }, [selected]);
  useEffect(() => {
    sceneRef.current?.isolate(isolated);
  }, [isolated]);
  useEffect(() => {
    sceneRef.current?.syncState(sim);
  }, [sim]);
  useEffect(() => {
    sceneRef.current?.setBootClock(bootStartedAt);
  }, [bootStartedAt]);
  useEffect(() => {
    sceneRef.current?.setNotepad(notepad);
  }, [notepad]);
  useEffect(() => {
    sceneRef.current?.setAirflow(airflowVisible);
  }, [airflowVisible]);
  useEffect(() => {
    sceneRef.current?.setDragEnabled(dragMode);
  }, [dragMode]);

  // هل النظام الافتراضي يقبل الكتابة الآن؟ (يحدد فعالية حقل «دفتر النظام»)
  useEffect(() => {
    const update = () => {
      const st = useLabStore.getState();
      const elapsed = st.bootStartedAt !== null ? Math.max(0, Date.now() - st.bootStartedAt) : 0;
      setCanType(computeMonitorView(st.sim, elapsed).canType);
    };
    update();
    const iv = setInterval(update, 800);
    return () => clearInterval(iv);
  }, [sim, bootStartedAt]);

  // (V6 §3) قراءة حية لتقرير المراوح من المشهد (سرعات/حالات لكل مروحة)
  useEffect(() => {
    const iv = setInterval(() => {
      const scene = sceneRef.current;
      if (scene) setFansReport(scene.getFanReport());
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // ===== اختصارات لوحة المفاتيح الحقيقية (توجيه v3 §5 + v6 §4.3) =====
  // في وضع التحكم بالشاشة: كل المفاتيح توجّه إلى النظام الافتراضي (عدا Esc للخروج).
  // في وضع المختبر: الاختصارات لا تُلتقط أثناء الكتابة في input/textarea/مفاتيح معدلة.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useLabStore.getState();

      // (V6-B) وضع التحكم بالشاشة: أولوية الإدخال للنظام الافتراضي
      if (st.inputMode === 'monitor') {
        // مفاتيح المتصفح المحفوظة تمر دائمًا (تحديث/ملء شاشة/أدوات المطور)
        if (e.key === 'F5' || e.key === 'F11' || e.key === 'F12' || ((e.ctrlKey || e.metaKey) && ['r', 'l', 't', 'w', 'j'].includes(e.key.toLowerCase()))) return;
        const consumed = sceneRef.current?.handleMonitorKey(e);
        if (consumed) e.preventDefault();
        return;
      }

      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.code) {
        case 'KeyR': // إعادة ضبط منظور الكاميرا
          sceneRef.current?.resetCamera();
          break;
        case 'KeyF': { // تركيز الكاميرا على القطعة المحددة
          const sel = st.selected;
          if (sel && sel !== 'case') sceneRef.current?.focusComponent(sel);
          break;
        }
        case 'KeyX': // تبديل الأشعة السينية
          st.toggleXray();
          break;
        case 'KeyE': // تبديل العرض التفجيري
          st.toggleExploded();
          break;
        case 'KeyH': // إظهار/إخفاء تلميحات التحكم
          st.setHintsVisible(!st.hintsVisible);
          break;
        case 'KeyS': // (V8) تبديل أداة المقعد: يد ↔ مفك فيليبس
          {
            const next = st.benchTool === 'screwdriver' ? 'hand' : 'screwdriver';
            st.setBenchTool(next);
            sceneRef.current?.setActiveTool(next);
            if (next === 'screwdriver') toast.success('مفك فيليبس بيدك الآن — انقر البراغي لفكّها/تثبيتها');
            else toast.info('عدت إلى اليد — المزالج والقوابس والأزرار تنفّد بالنقر المباشر');
          }
          break;
        case 'KeyM': // (V6-B) تفعيل وضع التحكم بالشاشة
          sceneRef.current?.setFocusMode(true);
          break;
        case 'Digit1': // منظير أمامي
          sceneRef.current?.setViewPreset('front');
          break;
        case 'Digit2': // منظير جانبي
          sceneRef.current?.setViewPreset('side');
          break;
        case 'Digit3': // منظير علوي
          sceneRef.current?.setViewPreset('top');
          break;
        case 'Delete': // (V6-D) الدخول إلى إعدادات UEFI أثناء الإقلاع
          st.requestSetup();
          break;
        case 'Escape': {
          // (إصلاح تدقيق V6) حوار مفتوح يعالج Esc نفسه — لا تُلغِ التحديد معًا (تأثير مزدوج)
          const openDialog = document.querySelector('[role="alertdialog"], [data-state="open"][role="dialog"]');
          if (openDialog) break;
          st.select(null);
          st.setIsolated(null);
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ملء الشاشة (Fullscreen API) — إعادة الضبط عبر Esc أو الزر نفسه
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFullscreen = useCallback(() => {
    const el = sceneWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => toast.error('تعذر تفعيل ملء الشاشة — قد يمنعه المتصفح.'));
    }
  }, []);

  const resetCamera = useCallback(() => sceneRef.current?.resetCamera(), []);
  const focusSelected = useCallback(() => {
    if (selected) sceneRef.current?.focusComponent(selected);
  }, [selected]);
  const toggleScreenControl = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setFocusMode(!scene.isFocusMode());
  }, []);

  if (failed) {
    return <FallbackView messageAr={errorAr} />;
  }

  const panelOpen = sim.flags.panelOpen;

  return (
    // (v7) ورشة غامرة: المشهد يملأ كل المساحة وكل الأدوات طبقات زجاجية عائمة فوقه —
    // جذر ملء الشاشة هو هذا الغلاف كي يبقى HUD كاملًا داخل وضع fullscreen الأصلي.
    <div
      ref={sceneWrapRef}
      className="absolute inset-0 overflow-hidden bg-[#0d1218]"
      dir="rtl"
    >
      {/* حاوية الكانفس — ResizeObserver في المشهد يتكيف مع أي حجم تلقائيًا */}
      <div
        ref={containerRef}
        dir="ltr"
        className="absolute inset-0"
        role="application"
        aria-label="المشهد ثلاثي الأبعاد للجهاز — اسحب للتدوير، انقر على قطعة لتحديدها، وعجلة الماوس للتقريب"
      />

      {/* مؤشر تجهيز النماذج قبل اكتمال التحميل */}
      {!assetsReady ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-[#0d1218] text-sm text-slate-300" dir="rtl" role="status" aria-live="polite">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" aria-hidden />
          جارٍ تجهيز النماذج ثلاثية الأبعاد…
          <span className="text-[11px] text-muted-foreground">فشل التحميل يعني تلقائيًا البديل الإجرائي — لن يبقى المشهد فارغًا</span>
        </div>
      ) : null}

      {/* تلميحات التحكم (زر H) — جهة لا تتعارض مع اللوحة الجانبية */}
      <HintsOverlay dragMode={dragMode} />

      {/* شريط الأدوات العائم — أعلى المنتصف */}
      <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-2">
        <div
          role="toolbar"
          aria-label="أدوات المشهد ثلاثي الأبعاد"
          className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto scrollbar-thin rounded-lg border border-border/60 bg-background/85 p-1 shadow-lg backdrop-blur"
        >
        {/* (V8) أداة يد الفني — البداية الحقيقية لأي عمل: ماذا بيدك الآن؟ */}
        <Button
          size="sm"
          variant={benchTool === 'hand' ? 'default' : 'ghost'}
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => {
            setBenchTool('hand');
            sceneRef.current?.setActiveTool('hand');
          }}
          title="أداة اليد: المزالج والقوابس والقوابس تنفّد بالنقر المباشر (S للتبديل)"
        >
          <Hand className="h-3.5 w-3.5" aria-hidden /> يد
        </Button>
        <Button
          size="sm"
          variant={benchTool === 'screwdriver' ? 'default' : 'ghost'}
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => {
            setBenchTool('screwdriver');
            sceneRef.current?.setActiveTool('screwdriver');
          }}
          title="مفك فيليبس #2 — وحده يفك/يثبّت البراغي (S للتبديل) — أو التقط المفك من الطاولة بالنقر عليه"
        >
          <Wrench className="h-3.5 w-3.5" aria-hidden /> مفك
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => sceneRef.current?.setViewPreset('front')} title="منظور أمامي (1)">
          <View className="h-3.5 w-3.5" aria-hidden /> أمامي
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => sceneRef.current?.setViewPreset('side')} title="منظور جانبي (2)">
          <FlipHorizontal2 className="h-3.5 w-3.5" aria-hidden /> جانبي
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => sceneRef.current?.setViewPreset('top')} title="منظور علوي (3)">
          <ChevronsUp className="h-3.5 w-3.5" aria-hidden /> علوي
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => sceneRef.current?.zoomStep(1)} title="تكبير">
          <ZoomIn className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => sceneRef.current?.zoomStep(-1)} title="إبعاد">
          <ZoomOut className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={resetCamera} title="إعادة ضبط الكاميرا (R أو دبل-كليك)">
          <Camera className="h-3.5 w-3.5" aria-hidden /> إعادة الضبط
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button size="sm" variant={panelOpen ? 'default' : 'ghost'} className="h-7 gap-1 px-2 text-[11px]" onClick={() => useLabStore.getState().toggleFlag('panelOpen')} title="فتح/إغلاق الغطاء الجانبي">
          {panelOpen ? <DoorClosed className="h-3.5 w-3.5" aria-hidden /> : <DoorOpen className="h-3.5 w-3.5" aria-hidden />} الغطاء
        </Button>
        <Button size="sm" variant={xray ? 'default' : 'ghost'} className="h-7 gap-1 px-2 text-[11px]" onClick={toggleXray} title="الأشعة السينية — مخطط القطع (X)">
          <X className={cn('h-3.5 w-3.5', !xray && 'opacity-60')} aria-hidden /> أشعة
        </Button>
        <Button size="sm" variant={exploded ? 'default' : 'ghost'} className="h-7 gap-1 px-2 text-[11px]" onClick={toggleExploded} title="العرض التفجيري (E)">
          <Bomb className="h-3.5 w-3.5" aria-hidden /> تفجيري
        </Button>
        <Button size="sm" variant={airflowVisible ? 'default' : 'ghost'} className="h-7 gap-1 px-2 text-[11px]" onClick={() => setAirflow(!airflowVisible)} title="أسهم اتجاه تدفق الهواء">
          <Wind className="h-3.5 w-3.5" aria-hidden /> هواء
        </Button>
        <Button size="sm" variant={focusMode ? 'default' : 'ghost'} className="h-7 gap-1 px-2 text-[11px]" onClick={toggleScreenControl} title="وضع التحكم بالشاشة المجسمة: الماوس والكيبورد الحقيقيان يتحكمان بالنظام الافتراضي (M)">
          <MonitorUp className="h-3.5 w-3.5" aria-hidden /> التحكم بالشاشة
        </Button>
        {/* (V6-D) وسائط التثبيت — البوابة الرسمية لمعالج تثبيت Windows ومختبر الأقراص */}
        <UsbMediaDialog />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button
          size="sm"
          variant={dragMode ? 'default' : 'ghost'}
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => setDragMode(!dragMode)}
          title="وضع الفك/التركيب: سحب القطع بالماوس مباشرة"
        >
          <Hand className="h-3.5 w-3.5" aria-hidden /> وضع السحب
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11px]"
          disabled={!selected || selected === 'case'}
          onClick={focusSelected}
          title="تقريب الكاميرا نحو القطعة المحددة (F)"
        >
          <Focus className="h-3.5 w-3.5" aria-hidden /> توجيه
        </Button>
        {selected && selected !== 'case' && sim.parts[selected] !== 'damaged' ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px] text-rose-400 hover:bg-rose-600/10" title="إحداث تلف تدريبي مقصود">
                <MonitorX className="h-3.5 w-3.5" aria-hidden /> تلف تدريبي
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>إحداث تلف تدريبي مقصود؟</AlertDialogTitle>
                <AlertDialogDescription>
                  وضع الاستكشاف: ستتلوّن القطعة بالأحمر وتُعتبر تالفة في التشخيص (TRAINING_DAMAGE). يمكنك استبدالها بقطعة سليمة من المخزن التعليمي في أي وقت.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => damagePart(selected)}>تأكيد التلف التدريبي</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        {isolated ? (
          <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setIsolated(null)} title="إلغاء عزل القطعة (Esc)">
            <EyeOff className="h-3.5 w-3.5" aria-hidden /> إلغاء العزل
          </Button>
        ) : null}
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={toggleFullscreen} title="ملء الشاشة / العودة">
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" aria-hidden /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden />}
          {isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
        </Button>
        <Button
          size="sm"
          variant={sidePanelsHidden ? 'default' : 'ghost'}
          className="h-7 gap-1 px-2 text-[11px] ms-auto"
          onClick={() => useLabStore.getState().setSidePanelsHidden(!sidePanelsHidden)}
          title="إخفاء اللوحات الجانبية لتوسيع المشهد"
        >
          <PanelRightClose className="h-3.5 w-3.5" aria-hidden />
          {sidePanelsHidden ? 'إظهار اللوحة' : 'إخفاء اللوحة'}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px] text-rose-400 hover:bg-rose-600/10" title="إعادة الجهاز إلى الحالة الافتراضية">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> إعادة تهيئة
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>إعادة تهيئة الجهاز الافتراضي؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيُعاد كل شيء إلى الحالة الافتراضية (كل القطع مثبتة، الجهاز مطفأ). سجل الجلسات لن يُمس.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={resetSimulation}>تأكيد الإعادة</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>

      {/* (V6-B) شارة وضع التحكم بالشاشة + زر خروج آمن — تحت شريط الأدوات */}
      {focusMode ? (
        <div className="pointer-events-none absolute inset-x-0 top-12 z-30 flex justify-center px-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/85 px-3 py-1.5 text-xs text-emerald-200 shadow-lg backdrop-blur" dir="rtl">
            <MonitorUp className="h-3.5 w-3.5" aria-hidden />
            <span className="font-bold">وضع التحكم بالشاشة</span>
            <span className="opacity-80 hidden sm:inline">— الماوس والكيبورد الحقيقيان يتحكمان بالنظام الافتراضي داخل الشاشة المجسمة</span>
            <kbd className="rounded border border-emerald-500/50 px-1 font-mono">Esc</kbd>
            <span className="opacity-80">للعودة</span>
            <Button size="sm" variant="secondary" className="h-6 gap-1 px-2 text-[10px]" onClick={() => sceneRef.current?.setFocusMode(false)}>
              <DoorClosed className="h-3 w-3" aria-hidden /> خروج
            </Button>
          </div>
        </div>
      ) : null}

      {/* الرصيف السفلي العائم — التشغيل والسلامة ثم الحرارة والمراوح ثم دفتر النظام */}
      <div className="pointer-events-none absolute bottom-2 start-2 z-20 max-lg:z-40 flex w-[min(640px,calc(100vw-1rem))] flex-col gap-1.5">
        <div className="pointer-events-auto rounded-lg border border-border/60 bg-background/85 px-2 py-1.5 shadow-lg backdrop-blur">
          <SafetyStrip />
        </div>

        {/* (V6 §3) قراءة حية: الحرارة المُحاكاة + سرعة كل مروحة وحالتها واتجاه تدفقها */}
        <div
          className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-background/85 px-2 py-1.5 shadow-lg backdrop-blur"
          dir="rtl"
          aria-label="قراءة المراوح والحرارة المحاكاة"
        >
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Thermometer className="h-3 w-3" aria-hidden />
            CPU {sim.thermal.cpuTempC.toFixed(0)}°C / GPU {sim.thermal.gpuTempC.toFixed(0)}°C
          </Badge>
          <span className="text-[10px] text-muted-foreground">محاكاة تعليمية:</span>
          {fansReport.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">…تجهيز منظومة المراوح</span>
          ) : (
            fansReport.map((f) => (
              <Badge
                key={f.labelAr}
                variant="outline"
                className={cn(
                  'gap-1 text-[10px]',
                  !f.running ? 'border-slate-600/40 text-slate-400' : f.rpm > 1200 ? 'border-rose-600/40 text-rose-400' : 'border-emerald-600/40 text-emerald-400',
                )}
                title={`${f.labelAr} — ${f.airflowAr}`}
              >
                <Wind className="h-3 w-3" aria-hidden />
                {f.labelAr}: {f.running ? `${f.rpm} RPM` : 'متوقفة'}
              </Badge>
            ))
          )}
        </div>

        {/* حقل إدخال حقيقي → دفتر النظام الافتراضي على الشاشة (توجيه v3 أ.2) */}
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border/60 bg-background/85 px-2 py-1.5 shadow-lg backdrop-blur">
          <Badge variant="outline" className="gap-1 shrink-0 text-[10px]">
            <Keyboard className="h-3 w-3" aria-hidden /> دفتر النظام
          </Badge>
          <Input
            value={notepad}
            onChange={(e) => setNotepad(e.target.value)}
            disabled={!canType}
            placeholder={canType ? 'اكتب بلوحة مفاتيحك — يظهر النص على الشاشة الافتراضية' : 'يعمل بعد إقلاع ناجح يدخل النظام الافتراضي'}
            className="h-8 min-w-0 flex-1 text-xs"
            aria-label="إدخال نص حقيقي يظهر في دفتر النظام الافتراضي على الشاشة ثلاثية الأبعاد"
          />
          <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0 max-sm:h-11 max-sm:w-11" onClick={clearNotepad} title="مسح دفتر النظام" disabled={!notepad.length}>
            <Eraser className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">مسح دفتر النظام</span>
          </Button>
        </div>
      </div>

      {/* اللوحة الجانبية العائمة — محتواها يتبع نمط العمل الحالي فوق المشهد الحيّ نفسه */}
      {/* على الجوال: ورقة سفلية بارتفاع محدود حتى لا تُخفي المشهد كليًا */}
      {!sidePanelsHidden ? (
        <div className="absolute bottom-2 end-2 top-12 z-30 w-[min(384px,calc(100vw-1rem))] max-lg:inset-x-2 max-lg:top-auto max-lg:h-[46vh] max-lg:w-auto">
          <ScrollArea className="h-full rounded-lg border border-border/60 bg-background/90 shadow-xl backdrop-blur scrollbar-thin">
            <div className="p-2" dir="rtl">
              {screen === 'lab' ? (
                <InfoPanel />
              ) : screen === 'tech' ? (
                <TechnicianScreen variant="panel" />
              ) : (
                <MissionsPanel />
              )}
            </div>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
