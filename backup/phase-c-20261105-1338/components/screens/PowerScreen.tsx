'use client';

/**
 * PowerScreen — «الطاقة والتخزين».
 * تبويب «ميزانية الطاقة»: حساب التجميعة المرجعية (estimatePower + BASE_PLATFORM_W)،
 * جدول موصلات PSU في التجميعة المرجعية (ATX/EPS/PCIe)، وقواعد إرشادية.
 * تبويب «صحة القرص (محاكاة)»: ثلاثة سيناريوهات SMART حتمية عبر simulateSmart
 * مع شارة «محاكاة تعليمية» بارزة دائمًا (FlaskConical + badgeAr).
 * كل الأرقام تقديرية تعليمية وليست قياسًا حقيقيًا.
 */

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleCheck,
  CircleHelp,
  FlaskConical,
  HardDrive,
  Hourglass,
  Info,
  Percent,
  PlugZap,
  ShieldCheck,
  XCircle,
  Zap,
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
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { SmartSimResult } from '@/lib/types';
import { BUILD_OPTIONS, DEFAULT_BUILD } from '@/lib/data/catalog';
import { findOption } from '@/lib/simulation/compatibilityEngine';
import { CASE_FANS_W, estimatePower, readSpecNumber } from '@/lib/simulation/powerEstimator';
import { simulateSmart } from '@/lib/simulation/smartSim';

/** عدد موصلات PCIe 8-pin التي تحتاجها البطاقة من قيمة powerConnector. */
function gpuPcieConnectorsNeeded(spec: string | undefined): number {
  const v = (spec ?? '').trim().toLowerCase();
  if (v === '8pin+6pin' || v === '6pin+8pin') return 2;
  if (v === '8pin' || v === '6pin') return 1;
  return 0; // none أو أي قيمة أخرى: لا موصل خارجي
}

type SmartScenario = SmartSimResult['scenario'];

const SMART_SCENARIOS: { key: SmartScenario; labelAr: string; icon: typeof CircleCheck }[] = [
  { key: 'healthy', labelAr: 'قرص سليم', icon: CircleCheck },
  { key: 'aging', labelAr: 'قرص متقادم', icon: Hourglass },
  { key: 'failing', labelAr: 'قرص متعطل', icon: AlertTriangle },
];

export default function PowerScreen() {
  const [smart, setSmart] = useState<SmartSimResult | null>(null);

  // ===== حسابات التجميعة المرجعية (ثابتة) =====
  const est = useMemo(() => estimatePower(DEFAULT_BUILD, BUILD_OPTIONS), []);
  const cpuOpt = findOption(BUILD_OPTIONS, 'cpu', DEFAULT_BUILD.cpu);
  const gpuOpt = findOption(BUILD_OPTIONS, 'gpu', DEFAULT_BUILD.gpu);
  const psuOpt = findOption(BUILD_OPTIONS, 'psu', DEFAULT_BUILD.psu);
  const moboOpt = findOption(BUILD_OPTIONS, 'motherboard', DEFAULT_BUILD.motherboard);
  const coolerOpt = findOption(BUILD_OPTIONS, 'cooler', DEFAULT_BUILD.cooler);
  const ramOpt = findOption(BUILD_OPTIONS, 'ram', DEFAULT_BUILD.ram);
  const ssdOpt = findOption(BUILD_OPTIONS, 'ssd', DEFAULT_BUILD.ssd);

  const optW = (specKey: string, opt: { specs: Record<string, string>; powerW?: number } | undefined): number =>
    opt !== undefined ? (readSpecNumber(opt.specs, specKey) ?? opt.powerW ?? 0) : 0;
  const cpuW = optW('tdpW', cpuOpt);
  const gpuW = optW('tdpW', gpuOpt);
  const moboW = moboOpt?.powerW ?? 0;
  const coolerW = coolerOpt?.powerW ?? 0;
  const ramW = ramOpt?.powerW ?? 0;
  const ssdW = ssdOpt?.powerW ?? 0;

  const pcieNeeded = gpuPcieConnectorsNeeded(gpuOpt?.specs['powerConnector']);
  const pcieAvailable = psuOpt !== undefined ? (readSpecNumber(psuOpt.specs, 'pcie8pin') ?? 0) : 0;
  const epsAvailable = (psuOpt?.specs['eps8pin'] ?? '') === 'yes';
  const pcieShortage = pcieAvailable < pcieNeeded;

  const healthProgressCls =
    smart === null
      ? ''
      : smart.scenario === 'healthy'
        ? '[&>div]:bg-emerald-500'
        : smart.scenario === 'aging'
          ? '[&>div]:bg-amber-500'
          : '[&>div]:bg-rose-500';

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-6">
      {/* ===== ترويسة الشاشة ===== */}
      <header className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
          <Zap className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">الطاقة والتخزين</h1>
          <p className="text-sm text-muted-foreground">
            ميزانية طاقة التجميعة المرجعية وقواعدها الإرشادية، ومحاكاة تعليمية لقراءة صحة القرص (SMART).
          </p>
        </div>
      </header>

      <Tabs defaultValue="budget">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="budget" className="gap-1.5">
            <PlugZap className="size-4" />
            ميزانية الطاقة
          </TabsTrigger>
          <TabsTrigger value="disk" className="gap-1.5">
            <HardDrive className="size-4" />
            صحة القرص (محاكاة)
          </TabsTrigger>
        </TabsList>

        {/* ================= تبويب ميزانية الطاقة ================= */}
        <TabsContent value="budget" className="mt-4 space-y-4">
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {/* بطاقة الحساب */}
            <Card className="gap-3 p-4">
              <CardHeader className="p-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PlugZap className="size-4 text-sky-600 dark:text-sky-400" />
                  حساب الطاقة للتجميعة المرجعية
                </CardTitle>
                <CardDescription>
                  مجموع استهلاك القطع المختارة (معالج + بطاقة + لوحة + مبرد + ذاكرة + قرص + مراوح)، ثم مقارنته
                  بميزانية الأمان التعليمية: 80٪ من قدرة مزود الطاقة (psuRatedW × 0.80).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-0">
                {/* أرقام كبيرة */}
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">الاستهلاك التقديري</p>
                    <p className="mt-1">
                      <span dir="ltr" className="text-2xl font-bold">
                        {est.totalW}
                      </span>{' '}
                      <span className="text-xs text-muted-foreground">واط</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">ميزانية الأمان (80٪)</p>
                    <p className="mt-1">
                      {est.budgetW === null ? (
                        <span dir="ltr" className="text-2xl font-bold text-muted-foreground">—</span>
                      ) : (
                        <>
                          <span dir="ltr" className="text-2xl font-bold">
                            {est.budgetW}
                          </span>{' '}
                          <span className="text-xs text-muted-foreground">واط</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">نسبة الاستخدام</p>
                    <p className="mt-1">
                      {est.usagePercent === null ? (
                        <span dir="ltr" className="text-2xl font-bold text-muted-foreground">—</span>
                      ) : (
                        <span dir="ltr" className="text-2xl font-bold">
                          {est.usagePercent}%
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">قدرة PSU المرجعي</p>
                    <p className="mt-1">
                      {est.psuW === null ? (
                        <span dir="ltr" className="text-2xl font-bold text-muted-foreground">
                          —
                        </span>
                      ) : (
                        <>
                          <span dir="ltr" className="text-2xl font-bold">
                            {est.psuW}
                          </span>{' '}
                          <span className="text-xs text-muted-foreground">واط</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {est.remainingW !== null && (
                  <p className="text-center text-xs text-muted-foreground">
                    الهامش المتبقي حتى ميزانية الأمان: <span dir="ltr" className="font-mono font-semibold">{est.remainingW} W</span>
                    {' '}• الموصى به لمستوى أمان مكافئ: <span dir="ltr" className="font-mono font-semibold">{est.recommendedPsuW} W</span>
                  </p>
                )}

                {/* جدول مساهمة المكونات */}
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-start">المكوّن</TableHead>
                        <TableHead className="text-start">الخيار المرجعي</TableHead>
                        <TableHead className="text-end">المساهمة التقديرية</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">المعالج</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{cpuOpt?.nameAr ?? '—'}</TableCell>
                        <TableCell className="text-end">
                          <span dir="ltr" className="font-mono">
                            {cpuW} W
                          </span>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">بطاقة الرسوميات</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{gpuOpt?.nameAr ?? '—'}</TableCell>
                        <TableCell className="text-end">
                          <span dir="ltr" className="font-mono">
                            {gpuW} W
                          </span>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">اللوحة الأم</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{moboOpt?.nameAr ?? '—'}</TableCell>
                        <TableCell className="text-end">
                          <span dir="ltr" className="font-mono">{moboW} W</span>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">مبرد المعالج</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{coolerOpt?.nameAr ?? '—'}</TableCell>
                        <TableCell className="text-end">
                          <span dir="ltr" className="font-mono">{coolerW} W</span>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">الذاكرة</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{ramOpt?.nameAr ?? '—'}</TableCell>
                        <TableCell className="text-end">
                          <span dir="ltr" className="font-mono">{ramW} W</span>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">قرص التخزين</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{ssdOpt?.nameAr ?? '—'}</TableCell>
                        <TableCell className="text-end">
                          <span dir="ltr" className="font-mono">{ssdW} W</span>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">مراوح الهيكل</TableCell>
                        <TableCell className="text-xs text-muted-foreground">قيمة تعليمية ثابتة (CASE_FANS_W)</TableCell>
                        <TableCell className="text-end">
                          <span dir="ltr" className="font-mono">{CASE_FANS_W} W</span>
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-muted/40">
                        <TableCell className="font-bold" colSpan={2}>
                          المجموع التقديري
                        </TableCell>
                        <TableCell className="text-end">
                          <span dir="ltr" className="font-mono font-bold">
                            {est.totalW} W
                          </span>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* حكم الكفاية: أيقونة + نص وليس لونًا فقط */}
                <div
                  className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                    est.verdict === 'ok'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                      : est.verdict === 'low'
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300'
                        : 'border-border bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {est.verdict === 'ok' ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  ) : est.verdict === 'low' ? (
                    <XCircle className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <CircleHelp className="mt-0.5 size-4 shrink-0" />
                  )}
                  <div>
                    <Badge
                      variant="outline"
                      className={`mb-1 ${
                        est.verdict === 'ok'
                          ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                          : est.verdict === 'low'
                            ? 'border-rose-500/40 text-rose-700 dark:text-rose-300'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {est.verdict === 'ok' ? 'قدرة كافية' : est.verdict === 'low' ? 'قدرة غير كافية' : 'غير معلومة'}
                    </Badge>
                    <p className="leading-relaxed">{est.messageAr}</p>
                  </div>
                </div>

                {/* تنبيهات إلزامية */}
                <div className="space-y-2">
                  {est.notesAr.map((note) => (
                    <Alert
                      key={note}
                      className="border-amber-500/30 bg-amber-500/5 py-2 text-amber-800 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400"
                    >
                      <Info />
                      <AlertDescription className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                        {note}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {/* موصلات PSU في التجميعة المرجعية */}
              <Card className="gap-3 p-4">
                <CardHeader className="p-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="size-4 text-sky-600 dark:text-sky-400" />
                    موصلات PSU في التجميعة المرجعية
                  </CardTitle>
                  <CardDescription>
                    PSU:{' '}
                    <span className="font-medium text-foreground">{psuOpt?.nameAr ?? 'غير مختار'}</span> — البطاقة:{' '}
                    <span className="font-medium text-foreground">{gpuOpt?.nameAr ?? 'غير مختار'}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-0">
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-start">الموصل</TableHead>
                          <TableHead className="text-start">المطلوب مقابل المتوفر</TableHead>
                          <TableHead className="text-end">الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">
                            ATX 24-pin <span className="text-xs text-muted-foreground">(تغذية اللوحة الرئيسية)</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">مطلوب 1 — متوفر مع PSU المرجعي</TableCell>
                          <TableCell className="text-end">
                            <span className="inline-flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="size-4" />
                              متوفر
                            </span>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">
                            EPS 8-pin <span className="text-xs text-muted-foreground">(تغذية المعالج)</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            مطلوب 1 — متوفر في PSU:{' '}
                            <span dir="ltr" className="font-mono">
                              {epsAvailable ? 'yes' : 'no'}
                            </span>
                          </TableCell>
                          <TableCell className="text-end">
                            {epsAvailable ? (
                              <span className="inline-flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="size-4" />
                                متوفر
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-sm text-rose-700 dark:text-rose-300">
                                <XCircle className="size-4" />
                                غير متوفر
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">
                            PCIe 8-pin <span className="text-xs text-muted-foreground">(طاقة بطاقة الرسوميات)</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            المطلوب{' '}
                            <span dir="ltr" className="font-mono font-bold text-foreground">
                              {pcieNeeded}
                            </span>{' '}
                            / المتوفر{' '}
                            <span dir="ltr" className="font-mono font-bold text-foreground">
                              {pcieAvailable}
                            </span>
                          </TableCell>
                          <TableCell className="text-end">
                            {pcieShortage ? (
                              <span className="inline-flex items-center gap-1 text-sm text-rose-700 dark:text-rose-300">
                                <XCircle className="size-4" />
                                ناقص
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="size-4" />
                                كافٍ
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  {pcieShortage && (
                    <Alert className="border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200 [&>svg]:text-rose-600 dark:[&>svg]:text-rose-400">
                      <XCircle />
                      <AlertTitle>موصلات PCIe غير كافية</AlertTitle>
                      <AlertDescription className="leading-relaxed text-rose-700 dark:text-rose-300">
                        لا تستخدم محوّلات ملتوية كحل دائم — اختر PSU بعدد موصلات PCIe يغطي متطلب البطاقة؛ المحوّلات
                        سبب متكرر لذوبان الكابلات داخل الهيكل.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* قواعد إرشادية */}
              <Card className="gap-3 p-4">
                <CardHeader className="p-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Info className="size-4 text-sky-600 dark:text-sky-400" />
                    قواعد إرشادية لميزانية الطاقة
                  </CardTitle>
                  <CardDescription>قواعد تعليمية مبسطة — تُعدَّل حسب توصيات الشركات المصنِّعة.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-0 p-0">
                  {[
                    {
                      icon: Percent,
                      title: 'ميزانية الأمان = 80٪ من قدرة PSU',
                      text: 'الصيغة التعليمية المعتمدة: safetyBudgetW = psuRatedW × 0.80، ثم usagePercent = الحمل ÷ الميزانية × 100 وremainingW = الميزانية − الحمل. في التجميعة المرجعية: 750 واط → ميزانية 600 واط، الحمل 414 واط (نحو 69٪) وهامش 186 واط. هذه معادلة تعليمية لا تحلّ محل فحص ذروة الاستهلاك أو توصيات الشركة.',
                    },
                    {
                      icon: ShieldCheck,
                      title: 'جودة PSU لا تقل أهمية عن القدرة',
                      text: 'شهادات الكفاءة (مثل 80+ Bronze/Gold) وحمايات الجهد المنخفض/العالي تحدد ثبات التغذية تحت الحمل — قدرة كبيرة بجودة سيئة خطر لا ميزة.',
                    },
                    {
                      icon: Activity,
                      title: 'ذروات الحمل اللحظية',
                      text: 'بطاقات الرسوميات الحديثة قد تستهلك ذروات قصيرة تتجاوز رقم TDP المكتوب بكثير — لذلك القدرة «التي تكفي نظريًا» قد تنطفئ عمليًا عند أول حمل.',
                    },
                  ].map((rule, i) => (
                    <div key={rule.title}>
                      {i > 0 && <Separator className="my-3" />}
                      <div className="flex items-start gap-2.5">
                        <rule.icon className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
                        <div>
                          <p className="text-sm font-medium">{rule.title}</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">{rule.text}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ================= تبويب صحة القرص (محاكاة) ================= */}
        <TabsContent value="disk" className="mt-4 space-y-4">
          <Card className="gap-3 p-4">
            <CardHeader className="p-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="size-4 text-sky-600 dark:text-sky-400" />
                محاكاة قراءة SMART
              </CardTitle>
              <CardDescription>
                اختر سيناريوًا لعرض قيم حتمية ثابتة تشرح كيف تُقرأ مؤشرات صحة القرص — لا قراءة من أي قرص حقيقي.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-0">
              <div className="flex flex-wrap gap-2">
                {SMART_SCENARIOS.map((sc) => {
                  const active = smart?.scenario === sc.key;
                  return (
                    <Button
                      key={sc.key}
                      variant="outline"
                      onClick={() => setSmart(simulateSmart(sc.key))}
                      className={
                        active
                          ? 'gap-1.5 border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'gap-1.5'
                      }
                    >
                      <sc.icon className="size-4" />
                      {sc.labelAr}
                    </Button>
                  );
                })}
              </div>

              {/* تنبيه «محاكاة تعليمية» بارز — يظهر دائمًا مع النتيجة */}
              {smart !== null && (
                <>
                  <Alert className="border-amber-500/60 bg-amber-500/15 text-amber-900 dark:text-amber-200 [&>svg]:size-5 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
                    <FlaskConical />
                    <AlertTitle className="font-bold">{smart.badgeAr}</AlertTitle>
                    <AlertDescription className="text-amber-800 dark:text-amber-300">
                      القيم التالية حتمية ومكتوبة يدويًا لأغراض التعلّم فقط — لا تعكس أي قرص فعلي ولا تتنبأ بحالته.
                    </AlertDescription>
                  </Alert>

                  {/* قيم كبيرة */}
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-xs text-muted-foreground">الصحة العامة</p>
                      <p className="mt-1">
                        <span dir="ltr" className="text-3xl font-bold">
                          {smart.healthPercent}
                        </span>
                        <span className="text-sm text-muted-foreground">%</span>
                      </p>
                      <Progress
                        value={smart.healthPercent}
                        className={`mt-2 h-1.5 ${healthProgressCls}`}
                        aria-label={`نسبة الصحة ${smart.healthPercent}%`}
                      />
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-xs text-muted-foreground">الحرارة</p>
                      <p className="mt-1">
                        <span dir="ltr" className="text-3xl font-bold">
                          {smart.temperatureC}
                        </span>
                        <span className="text-sm text-muted-foreground">°س</span>
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-xs text-muted-foreground">قطاعات معاد تخصيصها</p>
                      <p className="mt-1">
                        <span
                          dir="ltr"
                          className={`text-3xl font-bold ${smart.reallocatedSectors > 100 ? 'text-rose-600 dark:text-rose-400' : smart.reallocatedSectors > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                        >
                          {smart.reallocatedSectors}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <p className="text-xs text-muted-foreground">ساعات التشغيل</p>
                      <p className="mt-1">
                        <span dir="ltr" className="text-3xl font-bold">
                          {smart.powerOnHours}
                        </span>
                        <span className="text-sm text-muted-foreground">ساعة</span>
                      </p>
                    </div>
                  </div>

                  {/* التفسير */}
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="mb-1 text-sm font-semibold">تفسير القراءة</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{smart.interpretationAr}</p>
                  </div>
                </>
              )}

              {smart === null && (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
                  <HardDrive className="size-8 text-muted-foreground/60" />
                  <p className="font-medium">لم تُعرض قراءة بعد</p>
                  <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                    اضغط أحد السيناريوهات الثلاثة أعلاه (سليم / متقادم / متعطل) لعرض قيم SMART المحاكاة وطريقة تفسيرها.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* شرح المؤشرات */}
          <Card className="gap-3 p-4">
            <CardHeader className="p-0">
              <CardTitle className="text-base">شرح مختصر لأهم المؤشرات</CardTitle>
              <CardDescription>كيف تقرأ هذه الأرقام على أي قرص حقيقي — مع بقاء القرار للنسخ الاحتياطي أولًا.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {[
                {
                  title: 'نسبة الصحة (health %)',
                  text: 'تقدير إجمالي تعرضه أدوات القرص — انخفاضه المستمر يعني أن وقت النسخ الاحتياطي والاستبدال اقترب حتى لو كان الجهاز يعمل الآن.',
                },
                {
                  title: 'القطاعات المعاد تخصيصها (reallocated sectors)',
                  text: 'قطاعات فشل القرص في استخدامها فاستبدلها ببدائل احتياطية — وجودها أمر طبيعي قليلًا، لكن تزايدها السريع علامة متأخرة على تدهور سطح التخزين.',
                },
                {
                  title: 'الحرارة (°س)',
                  text: 'الحرارة المستقرة أعلى من المعتاد تُقصّر عمر القرص وتفسّر بطء الأداء المفاجئ — راجع تهوية الهيكل قبل الحكم على القرص نفسه.',
                },
                {
                  title: 'ساعات التشغيل (power-on hours)',
                  text: 'ساعات العمل التراكمية — تُفسَّر مع العمر المتوقع للقرص لا وحدها؛ قرص قديم بساعات عالية يستحق مراقبة أقرب حتى مع أرقام سليمة.',
                },
              ].map((item, i) => (
                <div key={item.title}>
                  {i > 0 && <Separator className="my-3" />}
                  <div className="flex items-start gap-2.5">
                    <HardDrive className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{item.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
