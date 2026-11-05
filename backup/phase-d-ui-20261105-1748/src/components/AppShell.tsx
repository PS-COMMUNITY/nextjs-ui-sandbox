'use client';

/**
 * هيكل التطبيق الوحيد (SPA) — تنقّل داخلي بين الشاشات دون routes إضافية.
 *
 * توجيه v3 §2.1: شريط علوي بهوية المختبر + اسم وضع العمل + حالة الحفظ + الجودة +
 * مساعدة واضحة؛ تنقل جانبي موجز على الشاشات الواسعة وأفقي قابل للتمرير على الضيقة؛
 * المنطقة الأكبر للمحتوى (نافذة المختبر)؛ تذييل لاصق أسفل الصفحة.
 */
import { useEffect } from 'react';
import {
  Activity,
  BatteryCharging,
  BookOpenCheck,
  Boxes,
  CircleHelp,
  Cpu,
  GraduationCap,
  Hand,
  Home as HomeIcon,
  Keyboard,
  LibraryBig,
  Mouse,
  MousePointerClick,
  Settings as SettingsIcon,
  ClipboardList,
  Blocks,
  Stethoscope,
  Loader2,
} from 'lucide-react';
import { useLabStore, type ScreenId } from '@/lib/store/labStore';
import { APP_VERSION } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import HomeScreen from '@/components/screens/HomeScreen';
import LabScreen from '@/components/lab/LabScreen';
import TechnicianScreen from '@/components/lab/TechnicianScreen';
import CatalogScreen from '@/components/screens/CatalogScreen';
import TrainingScreen from '@/components/lab/TrainingScreen';
import BuilderScreen from '@/components/screens/BuilderScreen';
import DiagnosticsScreen from '@/components/screens/DiagnosticsScreen';
import PowerScreen from '@/components/screens/PowerScreen';
import LessonsScreen from '@/components/screens/LessonsScreen';
import ReportsScreen from '@/components/screens/ReportsScreen';
import SettingsScreen from '@/components/screens/SettingsScreen';

const NAV: { id: ScreenId; labelAr: string; icon: typeof HomeIcon }[] = [
  { id: 'home', labelAr: 'الرئيسية', icon: HomeIcon },
  { id: 'lab', labelAr: 'المختبر 3D', icon: Boxes },
  { id: 'tech', labelAr: 'جلسة الفني', icon: Stethoscope },
  { id: 'catalog', labelAr: 'كتالوج القطع', icon: LibraryBig },
  { id: 'training', labelAr: 'التدريب الموجه', icon: GraduationCap },
  { id: 'builder', labelAr: 'التجميعة والتوافق', icon: Blocks },
  { id: 'diagnostics', labelAr: 'تشخيص الأعطال', icon: Activity },
  { id: 'power', labelAr: 'الطاقة والتخزين', icon: BatteryCharging },
  { id: 'lessons', labelAr: 'الاختبارات والتقارير', icon: BookOpenCheck },
  { id: 'reports', labelAr: 'سجل الجلسات', icon: ClipboardList },
  { id: 'settings', labelAr: 'الإعدادات', icon: SettingsIcon },
];

const QUALITY_LABEL: Record<string, string> = {
  low: 'جودة: منخفضة',
  medium: 'جودة: متوسطة',
  high: 'جودة: مرتفعة',
};

/** محتوى نافذة المساعدة — تحكم الماوس ولوحة المفاتيح الحقيقيين فقط (توجيه v3 §5) */
function HelpContent() {
  const mouseRows = [
    { icon: MousePointerClick, actionAr: 'نقرة يسار على قطعة', resultAr: 'تحديد القطعة وعرض معلوماتها' },
    { icon: Hand, actionAr: 'سحب الزر الأيسر على فراغ', resultAr: 'تدوير الكاميرا' },
    { icon: Mouse, actionAr: 'عجلة الماوس', resultAr: 'تقريب/إبعاد' },
    { icon: Hand, actionAr: 'سحب الزر الأيمن', resultAr: 'تحريك المشهد' },
    { icon: MousePointerClick, actionAr: 'دبل-كليك', resultAr: 'إعادة ضبط الكاميرا' },
    { icon: Hand, actionAr: 'سحب قطعة (في وضع السحب)', resultAr: 'نقلها إلى الصينية أو الجهاز مع تحقق' },
  ];
  const keyRows = [
    { key: 'R', resultAr: 'إعادة ضبط منظور الكاميرا' },
    { key: 'F', resultAr: 'تركيز الكاميرا على القطعة المحددة' },
    { key: 'X', resultAr: 'تبديل الأشعة السينية (مخطط القطع)' },
    { key: 'E', resultAr: 'تبديل العرض التفجيري' },
    { key: 'H', resultAr: 'إظهار/إخفاء تلميحات التحكم' },
    { key: 'M', resultAr: 'وضع التحكم بالشاشة المجسمة (الماوس والكيبورد يتحكمان بالنظام الافتراضي) — Esc للخروج' },
    { key: '1 / 2 / 3', resultAr: 'مناظير جاهزة: أمامي / جانبي / علوي' },
    { key: 'Delete', resultAr: 'الدخول إلى إعدادات البرنامج الثابت (UEFI/BIOS) أثناء التشغيل' },
    { key: 'Esc', resultAr: 'إلغاء التحديد والعزل' },
  ];
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold mb-2 flex items-center gap-1.5">
          <Mouse className="size-4 text-cyan-500" /> الماوس الحقيقي
        </p>
        <ul className="space-y-1.5">
          {mouseRows.map((r) => {
            const Icon = r.icon;
            return (
              <li key={r.actionAr} className="flex items-center gap-2 rounded-md border p-2 text-xs">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium">{r.actionAr}</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-muted-foreground">{r.resultAr}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <p className="text-sm font-bold mb-2 flex items-center gap-1.5">
          <Keyboard className="size-4 text-cyan-500" /> لوحة المفاتيح الحقيقية
        </p>
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
  const hydrated = useLabStore((s) => s.hydrated);
  const hydrate = useLabStore((s) => s.hydrate);
  const saveStatus = useLabStore((s) => s.saveStatus);
  const quality = useLabStore((s) => s.quality);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <Cpu className="h-10 w-10 text-primary animate-pulse" aria-hidden />
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>جارٍ تحميل المختبر…</span>
        </div>
      </div>
    );
  }

  const currentMode = NAV.find((n) => n.id === screen)?.labelAr ?? '';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* (إصلاح U11) رابط «تخطَّ إلى المحتوى» — أول عنصر قابل للتركيز، يظهر فقط عند التركيز بلوحة المفاتيح */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground focus:shadow-lg"
      >
        تخطَّ إلى المحتوى
      </a>
      {/* الشريط العلوي */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 no-print">
        <div className="mx-auto max-w-[1600px] px-3 sm:px-4">
          <div className="flex h-14 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
              <Cpu className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold leading-tight truncate">
                PC Repair 3D Studio
              </h1>
              <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight truncate">
                مختبر صيانة الحاسوب الافتراضي
              </p>
            </div>
            <Badge variant="outline" className="hidden md:inline-flex gap-1">
              <Cpu className="h-3 w-3" aria-hidden /> الوضع: {currentMode}
            </Badge>
            <div className="ms-auto flex items-center gap-2">
              <Badge variant="outline" className="hidden sm:inline-flex text-[11px]">
                {QUALITY_LABEL[quality]}
              </Badge>
              <span
                className={cn(
                  'flex items-center gap-1.5 text-xs',
                  saveStatus.available && !saveStatus.lastErrorAr ? 'text-emerald-500' : 'text-amber-500',
                )}
                title={saveStatus.lastErrorAr ?? 'حفظ محلي تلقائي'}
              >
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    saveStatus.available && !saveStatus.lastErrorAr ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse',
                  )}
                  aria-hidden
                />
                {saveStatus.available && !saveStatus.lastErrorAr ? 'الحفظ المحلي يعمل' : 'تحذير حفظ'}
              </span>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                    <CircleHelp className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">المساعدة</span>
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl" className="max-w-lg max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>التحكم بالمختبر</DialogTitle>
                    <DialogDescription>
                      جهازا الإدخال الحقيقيان (ماوسك ولوحة مفاتيحك) هما أدوات التحكم — لا يوجد ماوس أو كيبورد داخل المشهد.
                    </DialogDescription>
                  </DialogHeader>
                  <HelpContent />
                </DialogContent>
              </Dialog>
            </div>
          </div>
          {/* شريط التنقل الأفقي — للشاشات الضيقة */}
          <nav aria-label="التنقل الرئيسي" className="flex gap-1 overflow-x-auto scrollbar-thin pb-2 lg:hidden">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = screen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScreen(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors',
                    'min-h-[36px]',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {item.labelAr}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* التنقل الجانبي (للشاشات الواسعة) + المحتوى */}
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 items-stretch">
        <aside
          aria-label="التنقل الجانبي"
          className="hidden lg:flex w-52 shrink-0 flex-col gap-1 border-e bg-card/40 p-2 sticky top-[57px] self-start max-h-[calc(100vh-57px)] overflow-y-auto scrollbar-thin no-print"
        >
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = screen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setScreen(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[40px] text-start',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{item.labelAr}</span>
              </button>
            );
          })}
        </aside>

        <main id="main-content" className="flex-1 min-w-0 px-3 sm:px-4 py-4 sm:py-6">
          {screen === 'home' && <HomeScreen />}
          {screen === 'lab' && <LabScreen />}
          {screen === 'tech' && <TechnicianScreen />}
          {screen === 'catalog' && <CatalogScreen />}
          {screen === 'training' && <TrainingScreen />}
          {screen === 'builder' && <BuilderScreen />}
          {screen === 'diagnostics' && <DiagnosticsScreen />}
          {screen === 'power' && <PowerScreen />}
          {screen === 'lessons' && <LessonsScreen />}
          {screen === 'reports' && <ReportsScreen />}
          {screen === 'settings' && <SettingsScreen />}
        </main>
      </div>

      {/* تذييل لاصق أسفل الشاشة — يُدفع طبيعيًا عند طول المحتوى */}
      <footer className="mt-auto border-t bg-card/50 no-print">
        <div className="mx-auto max-w-[1600px] px-4 py-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] sm:text-xs text-muted-foreground text-center">
          <span className="font-medium">PC Repair 3D Studio v{APP_VERSION}</span>
          <span aria-hidden>•</span>
          <span>محاكاة تعليمية — القيم التقديرية ليست قياسات حقيقية</span>
          <span aria-hidden>•</span>
          <span>بياناتك محفوظة محليًا في متصفحك فقط</span>
          <span aria-hidden>•</span>
          <span dir="ltr" className="font-mono">1366×768+</span>
        </div>
      </footer>
    </div>
  );
}
