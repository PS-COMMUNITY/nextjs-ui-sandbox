'use client';

/**
 * هيكل التطبيق الوحيد (SPA) — تنقّل داخلي بين الشاشات دون routes إضافية.
 */
import { useEffect } from 'react';
import {
  Activity,
  BatteryCharging,
  BookOpenCheck,
  Boxes,
  Cpu,
  GraduationCap,
  Home as HomeIcon,
  LibraryBig,
  Settings as SettingsIcon,
  ClipboardList,
  Blocks,
  Loader2,
} from 'lucide-react';
import { useLabStore, type ScreenId } from '@/lib/store/labStore';
import { APP_VERSION } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import HomeScreen from '@/components/screens/HomeScreen';
import LabScreen from '@/components/lab/LabScreen';
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
  { id: 'catalog', labelAr: 'كتالوج القطع', icon: LibraryBig },
  { id: 'training', labelAr: 'التدريب الموجه', icon: GraduationCap },
  { id: 'builder', labelAr: 'التجميعة والتوافق', icon: Blocks },
  { id: 'diagnostics', labelAr: 'التشخيص', icon: Activity },
  { id: 'power', labelAr: 'الطاقة والتخزين', icon: BatteryCharging },
  { id: 'lessons', labelAr: 'الدروس والاختبارات', icon: BookOpenCheck },
  { id: 'reports', labelAr: 'التقارير', icon: ClipboardList },
  { id: 'settings', labelAr: 'الإعدادات', icon: SettingsIcon },
];

export default function AppShell() {
  const screen = useLabStore((s) => s.screen);
  const setScreen = useLabStore((s) => s.setScreen);
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
          <span>جارٍ تحميل المختبر…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
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
            <Badge variant="outline" className="hidden sm:inline-flex font-mono" dir="ltr">
              v{APP_VERSION}
            </Badge>
            <div className="ms-auto flex items-center gap-2">
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
            </div>
          </div>
          {/* شريط التنقل */}
          <nav aria-label="التنقل الرئيسي" className="flex gap-1 overflow-x-auto scrollbar-thin pb-2">
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

      {/* المحتوى */}
      <main className="flex-1 mx-auto w-full max-w-[1600px] px-3 sm:px-4 py-4 sm:py-6">
        {screen === 'home' && <HomeScreen />}
        {screen === 'lab' && <LabScreen />}
        {screen === 'catalog' && <CatalogScreen />}
        {screen === 'training' && <TrainingScreen />}
        {screen === 'builder' && <BuilderScreen />}
        {screen === 'diagnostics' && <DiagnosticsScreen />}
        {screen === 'power' && <PowerScreen />}
        {screen === 'lessons' && <LessonsScreen />}
        {screen === 'reports' && <ReportsScreen />}
        {screen === 'settings' && <SettingsScreen />}
      </main>

      {/* تذييل ثابت أسفل الشاشة */}
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
