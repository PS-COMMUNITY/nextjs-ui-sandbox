'use client';

/**
 * DiagnosticsScreen — «تشخيص الأعطال».
 * أ) سيناريوهات تعليمية جاهزة تُطبَّق على الجهاز الافتراضي (runScenario).
 * ب) فحص POST للجهاز الحالي (runDiagnosis) مع عرض نتيجة runPost(sim) المُحسوبة
 *    مباشرة عند العرض لتعكس آخر حالة دائمًا.
 * ج) بطاقة تعليمية: الفرق بين POST وBOOT.
 * كل النتائج محاكاة تعليمية (SIM_NOTE_AR تُعرض دومًا).
 */

import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  FlaskConical,
  HardDrive,
  Info,
  Lightbulb,
  Play,
  PowerOff,
  Stethoscope,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

import type { DiagnosisCode } from '@/lib/types';
import { SCENARIOS } from '@/lib/data/scenarios';
import { runPost, SIM_NOTE_AR } from '@/lib/simulation/postEngine';
import { useLabStore } from '@/lib/store/labStore';

/** خريطة كود التشخيص → شارة ملونة بأيقونة ونص (وليس لونًا فقط). */
const DIAGNOSIS_BADGE: Record<
  DiagnosisCode,
  { labelAr: string; cls: string; icon: LucideIcon }
> = {
  POWER_OFF: {
    labelAr: 'لا طاقة',
    cls: 'border-zinc-400/50 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
    icon: PowerOff,
  },
  POST_FAIL: {
    labelAr: 'فشل POST',
    cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    icon: XCircle,
  },
  POST_PASS_BOOT_WARNING: {
    labelAr: 'POST ناجح مع تحذير إقلاع',
    cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    icon: AlertTriangle,
  },
  POST_PASS_BOOT_OK: {
    labelAr: 'POST ناجح والإقلاع سليم',
    cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  INCOMPATIBLE_BUILD: {
    labelAr: 'تجميعة غير متوافقة',
    cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    icon: Ban,
  },
};

export default function DiagnosticsScreen() {
  const sim = useLabStore((s) => s.sim);
  const lastDiagnosis = useLabStore((s) => s.lastDiagnosis);
  const runDiagnosis = useLabStore((s) => s.runDiagnosis);
  const runScenario = useLabStore((s) => s.runScenario);
  const setScreen = useLabStore((s) => s.setScreen);

  // النتيجة محسوبة مباشرة عند العرض من الحالة الحالية — تعكس آخر حالة دائمًا.
  const finding = useMemo(() => runPost(sim), [sim]);
  const checked = lastDiagnosis !== null;
  const badge = DIAGNOSIS_BADGE[finding.code];
  const BadgeIcon = badge.icon;
  const detailsWithoutSimNote = finding.detailsAr.filter((d) => d !== SIM_NOTE_AR);

  const applyScenarioToMachine = (scenarioId: string, titleAr: string) => {
    runScenario(scenarioId);
    toast.info(`طُبِّق سيناريو «${titleAr}» — اذهب إلى المختبر أو اضغط «تشغيل فحص POST» أدناه لرؤية الأثر.`);
  };

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-6">
      {/* ===== ترويسة الشاشة ===== */}
      <header className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
          <Stethoscope className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">تشخيص الأعطال</h1>
          <p className="text-sm text-muted-foreground">
            طبّق سيناريو عطل تعليمي ثم شغّل فحص POST على الجهاز الافتراضي واقرأ النتيجة والخطوة التالية.
          </p>
        </div>
      </header>

      {/* ===== أ) سيناريوهات تعليمية جاهزة ===== */}
      <section className="space-y-3" aria-label="سيناريوهات تعليمية جاهزة">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">سيناريوهات تعليمية جاهزة</h2>
          <Badge variant="outline" className="text-muted-foreground">
            <span dir="ltr" className="font-mono">
              {SCENARIOS.length}
            </span>
            سيناريوهات
          </Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SCENARIOS.map((sc) => (
            <Card key={sc.id} className="gap-3 p-4">
              <CardHeader className="p-0">
                <CardTitle className="text-base leading-relaxed">{sc.titleAr}</CardTitle>
                <CardDescription className="leading-relaxed">{sc.descriptionAr}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-3 p-0">
                <Badge
                  variant="outline"
                  className="max-w-full border-amber-500/40 bg-amber-500/5 text-start text-amber-700 dark:text-amber-300"
                >
                  <Wrench className="size-3 shrink-0" />
                  <span className="truncate">العطل: {sc.faultAr}</span>
                </Badge>
                <Button size="sm" className="w-full gap-1.5" onClick={() => applyScenarioToMachine(sc.id, sc.titleAr)}>
                  <Play className="size-4" />
                  طبّق على الجهاز
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          بعد التطبيق اذهب للمختبر
          <Button variant="link" size="sm" className="h-auto p-0 text-sm" onClick={() => setScreen('lab')}>
            (فتح المختبر)
          </Button>
          أو اضغط «تشغيل فحص POST» أدناه — يُسجَّل تطبيق السيناريو في سجل الجلسة.
        </p>
      </section>

      {/* ===== ب) فحص POST للجهاز الحالي ===== */}
      <section className="grid items-start gap-4 lg:grid-cols-5" aria-label="فحص POST">
        <Card className="gap-3 p-4 lg:col-span-3">
          <CardHeader className="p-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Stethoscope className="size-4 text-sky-600 dark:text-sky-400" />
              فحص POST للجهاز الحالي
            </CardTitle>
            <CardDescription>
              يفحص الفحص الذاتي حالة العتاد المحاكاة الآن: التغذية، المعالج، الذاكرة، المبرد، العرض، والتخزين.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            <Button size="lg" className="w-full gap-2" onClick={runDiagnosis}>
              <Play className="size-5" />
              تشغيل فحص POST
            </Button>

            {!checked ? (
              /* حالة placeholder واضحة إن لم يسبق فحص */
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
                <Stethoscope className="size-8 text-muted-foreground/60" />
                <p className="font-medium">لم يُشغَّل فحص POST بعد</p>
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  اضغط «تشغيل فحص POST» أعلاه لفحص حالة الجهاز الافتراضي الحالية — النتيجة ستظهر هنا مع الخطوة التالية المقترحة.
                </p>
              </div>
            ) : (
              <>
                {/* شارة النتيجة: أيقونة + نص + لون */}
                <div className={`flex items-center gap-3 rounded-lg border p-4 ${badge.cls}`}>
                  <BadgeIcon className="size-6 shrink-0" />
                  <div>
                    <Badge variant="outline" className="mb-1 border-current bg-background/40">
                      {badge.labelAr}
                    </Badge>
                    <p className="font-bold">{finding.titleAr}</p>
                  </div>
                </div>

                {/* تفاصيل النتيجة */}
                <div>
                  <p className="mb-2 text-sm font-semibold">تفاصيل النتيجة</p>
                  <ul className="space-y-1.5">
                    {detailsWithoutSimNote.map((d) => (
                      <li key={d} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                        <ArrowLeft className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Separator />

                {/* الخطوة التالية المقترحة */}
                <div>
                  <p className="mb-2 text-sm font-semibold">الخطوة التالية المقترحة</p>
                  <ol className="space-y-1.5">
                    {finding.nextStepsAr.map((step, i) => (
                      <li key={step} className="flex items-start gap-2 text-sm leading-relaxed">
                        <span
                          dir="ltr"
                          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 font-mono text-xs font-bold text-sky-700 dark:text-sky-400"
                        >
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* ملاحظة المحاكاة الخافتة */}
                <Alert className="border-border bg-muted/40 text-muted-foreground [&>svg]:text-muted-foreground/70">
                  <FlaskConical />
                  <AlertDescription className="text-xs leading-relaxed">{SIM_NOTE_AR}</AlertDescription>
                </Alert>
              </>
            )}
          </CardContent>
        </Card>

        {/* ===== ج) بطاقة تعليمية: POST مقابل BOOT ===== */}
        <Card className="gap-3 p-4 lg:col-span-2">
          <CardHeader className="p-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-sky-600 dark:text-sky-400" />
              درس سريع: ما الفرق بين POST وBOOT؟
            </CardTitle>
            <CardDescription>الخلط بينهما أشهر خطأ تشخيصي عند المبتدئين.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            <div className="space-y-3 text-sm leading-relaxed">
              <p>
                <span className="font-bold text-foreground">POST</span> هو فحص عتاد بدء التشغيل: تختبره اللوحة الأم لحظة
                توصيل الطاقة للتحقق من المعالج والذاكرة والبطاقة وعرض الصورة قبل أي نظام تشغيل. نجاح POST يعني أن العتاد
                الأساسي سليم فحسب.
              </p>
              <p>
                <span className="font-bold text-foreground">BOOT</span> هو مرحلة تالية تمامًا: يبحث فيها الجهاز عن جهاز
                إقلاع (قرص عليه نظام تشغيل) ثم يحوّل إليه لتحميل النظام. لذلك قد يكون POST ناجحًا 100% ثم يفشل الإقلاع
                لغياب القرص أو خلل ترتيب الإقلاع.
              </p>
            </div>
            <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
              <HardDrive />
              <AlertTitle>مثال يوضّح الفرق</AlertTitle>
              <AlertDescription className="leading-relaxed text-amber-700 dark:text-amber-300">
                جهاز بلا SSD: ينجح POST كاملًا (المراوح تدور وتظهر شاشة الشركة المصنِّعة) ثم تتوقف الرسالة عند «No Boot
                Device» — العتاد سليم لكن لا جهاز إقلاع لتحميل النظام منه. جرّب سيناريو «قرص التخزين مفقود» أعلاه
                لتراه بنفسك.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
