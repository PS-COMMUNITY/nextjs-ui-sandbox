'use client';

/**
 * هيكل التطبيق الوحيد (v7 — ورشة واحدة غامرة):
 * التطبيق كله مشهد ثلاثي الأبعاد حيّ يملأ الشاشة — لا صفحة ترحيب ولا قائمة
 * اختبارات. ثلاثة أنماط عمل فوق المشهد نفسه (المختبر الحر / جلسة الفني /
 * المهام الموجهة) + نوافذ أدوات مرجعية تنفتح فوق المشهد دون تجميده.
 *
 * اللجنة تقيّم تقنيات 3D والتدريب العملي — لذلك المشهد هو البطل:
 * يفتح مباشرة، يبقى حيًّا عند تبديل النمط، والأدوات طبقة فوقه.
 */
import {
  Activity,
  BatteryCharging,
  Blocks,
  Boxes,
  CircleHelp,
  Cpu,
  GraduationCap,
  LibraryBig,
  Settings as SettingsIcon,
  Stethoscope,
  ClipboardList,
  Loader2,
  Wrench,
} from 'lucide-react';
import { useEffect } from 'react';
import { useLabStore, type ScreenId, type ToolId } from '@/lib/store/labStore';
import { APP_VERSION } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import LabScreen from '@/components/lab/LabScreen';
import CatalogScreen from '@/components/screens/CatalogScreen';
import DiagnosticsScreen from '@/components/screens/DiagnosticsScreen';
import PowerScreen from '@/components/screens/PowerScreen';
import BuilderScreen from '@/components/screens/BuilderScreen';
import ReportsScreen from '@/components/screens/ReportsScreen';
import SettingsScreen from '@/components/screens/SettingsScreen';

/** أنماط العمل الثلاثة — كلها فوق المشهد الحيّ نفسه */
const MODES: { id: ScreenId; labelAr: string; hintAr: string; icon: typeof Boxes }[] = [
  { id: 'lab', labelAr: 'المختبر', hintAr: 'فك وتركيب وتشغيل حر', icon: Boxes },
  { id: 'tech', labelAr: 'جلسة فني', hintAr: 'المراحل التسع حتى تقرير التسليم', icon: Stethoscope },
  { id: 'missions', labelAr: 'المهام', hintAr: 'تدريب موجه يُتحقق آليًا', icon: GraduationCap },
];

/** الأدوات المرجعية — نوافذ فوق المشهد */
const TOOLS: { id: ToolId; labelAr: string; icon: typeof LibraryBig; titleAr: string; descAr: string; widthClass: string }[] = [
  { id: 'catalog', labelAr: 'كتالوج القطع', icon: LibraryBig, titleAr: 'كتالوج القطع المرجعي', descAr: 'مواصفات القطع الافتراضية المستخدمة في المختبر', widthClass: 'max-w-5xl' },
  { id: 'diagnostics', labelAr: 'تشخيص الأعطال', icon: Activity, titleAr: 'تشخيص الأعطال', descAr: 'سيناريوهات أعطال وفحص POST للجهاز الحالي', widthClass: 'max-w-4xl' },
  { id: 'power', labelAr: 'الطاقة والتخزين', icon: BatteryCharging, titleAr: 'الطاقة والتخزين', descAr: 'ميزانية الطاقة وصحة الأقراص (محاكاة تعليمية)', widthClass: 'max-w-4xl' },
  { id: 'builder', labelAr: 'التوافق والتجميعة', icon: Blocks, titleAr: 'التجميعة والتوافق', descAr: 'قواعد التوافق بين القطع قبل الشراء أو التجميع', widthClass: 'max-w-5xl' },
  { id: 'reports', labelAr: 'سجل الجلسات', icon: ClipboardList, titleAr: 'سجل الجلسات والتقارير', descAr: 'أحداثك في المختبر وتصديرها', widthClass: 'max-w-4xl' },
  { id: 'settings', labelAr: 'الإعدادات', icon: SettingsIcon, titleAr: 'الإعدادات', descAr: 'جودة الرسم والنسخ الاحتياطي والبيانات', widthClass: 'max-w-2xl' },
];

/** محتوى نافذة المساعدة — تحكم الماوس ولوحة المفاتيح الحقيقيين فقط */
function HelpContent() {
  const mouseRows = [
    { actionAr: 'نقرة على برغي', resultAr: 'فكّه/تثبيته — يتطلب اختيار المفك أولًا' },
    { actionAr: 'نقرة على مزلاج/رافعة/قابس', resultAr: 'فتحه أو إغلاقه مباشرة بيدك' },
    { actionAr: 'نقرة على زر الطاقة على الهيكل', resultAr: 'تشغيل/إطفاء الجهاز (كزر حقيقي)' },
    { actionAr: 'نقرة على مفتاح PSU الخلفي', resultAr: 'توصيل/فصل الكهرباء (AC)' },
    { actionAr: 'نقرة على المفك على الطاولة', resultAr: 'التقاط المفك لفك البراغي' },
    { actionAr: 'نقرة على الكيبورد/الفأرة على المكتب', resultAr: 'التحكم بالشاشة المجسمة (Esc للخروج)' },
    { actionAr: 'نقرة يسار على قطعة', resultAr: 'تحديد القطعة وعرض معلوماتها' },
    { actionAr: 'سحب الزر الأيسر على فراغ', resultAr: 'تدوير الكاميرا' },
    { actionAr: 'عجلة الماوس', resultAr: 'تقريب/إبعاد' },
    { actionAr: 'سحب الزر الأيمن', resultAr: 'تحريك المشهد' },
    { actionAr: 'دبل-كليك', resultAr: 'إعادة ضبط الكاميرا' },
    { actionAr: 'سحب قطعة (في وضع السحب)', resultAr: 'نقلها إلى الصينية أو الجهاز مع تحقق' },
  ];
  const keyRows = [
    { key: 'R', resultAr: 'إعادة ضبط منظور الكاميرا' },
    { key: 'F', resultAr: 'تركيز الكاميرا على القطعة المحددة' },
    { key: 'S', resultAr: 'تبديل أداة اليد ↔ مفك فيليبس (البراغي تتطلب المفك)' },
    { key: 'X', resultAr: 'تبديل الأشعة السينية (مخطط القطع)' },
    { key: 'E', resultAr: 'تبديل العرض التفجيري' },
    { key: 'H', resultAr: 'إظهار/إخفاء تلميحات التحكم' },
    { key: 'M', resultAr: 'وضع التحكم بالشاشة المجسمة — Esc للخروج' },
    { key: '1 / 2 / 3', resultAr: 'مناظير جاهزة: أمامي / جانبي / علوي' },
    { key: 'Delete', resultAr: 'الدخول إلى إعدادات البرنامج الثابت (UEFI/BIOS) أثناء التشغيل' },
    { key: 'Esc', resultAr: 'إلغاء التحديد والعزل' },
  ];
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold mb-2">الماوس الحقيقي</p>
        <ul className="space-y-1.5">
          {mouseRows.map((r) => (
            <li key={r.actionAr} className="flex items-center gap-2 rounded-md border p-2 text-xs">
              <span className="font-medium">{r.actionAr}</span>
              <span className="text-muted-foreground">=</span>
              <span className="text-muted-foreground">{r.resultAr}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-sm font-bold mb-2">لوحة المفاتيح الحقيقية</p>
        <ul className="space-y-1.5">
          {keyRows.map((r) => (
            <li key={r.key} className="flex items-center gap-2 rounded-md border p-2 text-xs">
              <kbd dir="ltr" className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">{r.key}</kbd>
              <span className="text-muted-foreground">{r.resultAr}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          الاختصارات لا تعمل أثناء الكتابة داخل حقول النص — لوحة المفاتيح الحقيقية تخدم إدخال النص أولًا.
        </p>
      </div>
    </div>
  );
}

export default function AppShell() {
  const screen = useLabStore((s) => s.screen);
  const setScreen = useLabStore((s) => s.setScreen);
  const tool = useLabStore((s) => s.tool);
  const openTool = useLabStore((s) => s.openTool);
  const closeTool = useLabStore((s) => s.closeTool);
  const hydrated = useLabStore((s) => s.hydrated);
  const hydrate = useLabStore((s) => s.hydrate);
  const saveStatus = useLabStore((s) => s.saveStatus);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <Cpu className="h-10 w-10 text-primary animate-pulse" aria-hidden />
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>جارٍ تجهيز ورشة العمل ثلاثية الأبعاد…</span>
        </div>
      </div>
    );
  }

  const activeTool = TOOLS.find((t) => t.id === tool) ?? null;
  const saveOk = saveStatus.available && !saveStatus.lastErrorAr;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* (إصلاح U11) رابط «تخطَّ إلى المحتوى» */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground focus:shadow-lg"
      >
        تخطَّ إلى المحتوى
      </a>

      {/* الشريط العلوي الرفيع — كل المساحة الباقية للمشهد */}
      <header className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 no-print relative z-40">
        <div className="flex h-12 items-center gap-2 px-2 sm:px-3">
          {/* الهوية */}
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
              <Cpu className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <div className="hidden md:block leading-tight">
              <h1 className="text-sm font-bold truncate">PC Repair 3D Studio</h1>
              <p className="text-[10px] text-muted-foreground truncate">مختبر صيانة الحاسوب الافتراضي</p>
            </div>
          </div>

          {/* أنماط العمل الثلاثة — مفصولة بصريًا فوق المشهد الحيّ */}
          <nav aria-label="أنماط العمل" className="flex items-center gap-1 rounded-lg border bg-card/60 p-1 mx-auto">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = screen === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setScreen(m.id)}
                  aria-current={active ? 'page' : undefined}
                  title={m.hintAr}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors min-h-[34px]',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{m.labelAr}</span>
                </button>
              );
            })}
          </nav>

          {/* الأدوات + المساعدة + حالة الحفظ */}
          <div className="flex items-center gap-1.5 shrink-0 ms-auto">
            <span
              className={cn('h-2 w-2 rounded-full shrink-0', saveOk ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse')}
              title={saveOk ? 'الحفظ المحلي يعمل' : (saveStatus.lastErrorAr ?? 'تحذير حفظ')}
              aria-hidden
            />
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                  <Wrench className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">الأدوات</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">أدوات مرجعية فوق المشهد</DropdownMenuLabel>
                {TOOLS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <DropdownMenuItem key={t.id} onClick={() => openTool(t.id)} className="gap-2 text-sm">
                      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {t.labelAr}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                  <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">المساعدة</span>
                </Button>
              </DialogTrigger>
              <DialogContent dir="rtl" className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>التحكم بالمختبر</DialogTitle>
                  <DialogDescription>
                    أنت الفني على طاولة الصيانة: افك البراغي بالمفك، افتح المزالج بيدك، واضغط زر الطاقة على الهيكل — كل خطوة نقرة حقيقية داخل المشهد، لا أزرار «تنفيذ» وهمية.
                  </DialogDescription>
                </DialogHeader>
                <HelpContent />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* المشهد الغامر — يملأ كل المساحة المتبقية ويبقى حيًّا دائمًا */}
      <main id="main-content" className="flex-1 min-h-0 relative">
        <LabScreen />
      </main>

      {/* تذييل لاصق بسطر واحد — لا يسرق مساحة المشهد */}
      <footer className="shrink-0 border-t bg-card/50 no-print relative z-40">
        <div className="h-7 px-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-0 text-[10px] sm:text-[11px] text-muted-foreground leading-none">
          <span className="font-medium">PC Repair 3D Studio v{APP_VERSION}</span>
          <span aria-hidden>•</span>
          <span className="hidden sm:inline">محاكاة تعليمية — القيم تقديرية وليست قياسات حقيقية</span>
          <span aria-hidden className="hidden sm:inline">•</span>
          <span>بياناتك محفوظة محليًا في متصفحك فقط</span>
        </div>
      </footer>

      {/* نافذة الأداة المرجعية — تنفتح فوق المشهد دون تفكيكه */}
      <Dialog open={activeTool !== null} onOpenChange={(open) => { if (!open) closeTool(); }}>
        {activeTool ? (
          <DialogContent dir="rtl" className={cn('w-[96vw] h-[88vh] max-h-[88vh] overflow-hidden flex flex-col', activeTool.widthClass)}>
            <DialogHeader className="shrink-0">
              <DialogTitle>{activeTool.titleAr}</DialogTitle>
              <DialogDescription>{activeTool.descAr}</DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin -mx-1 px-1" dir="rtl">
              {tool === 'catalog' && <CatalogScreen />}
              {tool === 'diagnostics' && <DiagnosticsScreen />}
              {tool === 'power' && <PowerScreen />}
              {tool === 'builder' && <BuilderScreen />}
              {tool === 'reports' && <ReportsScreen />}
              {tool === 'settings' && <SettingsScreen />}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
