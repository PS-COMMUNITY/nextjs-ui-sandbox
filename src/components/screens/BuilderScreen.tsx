'use client';

/**
 * BuilderScreen — «بناء تجميعة مرجعية / فاحص التوافق».
 * حالة محلية بالكامل (BuildSelection) تبدأ بالتجميعة المرجعية DEFAULT_BUILD،
 * وتفحص عبر checkCompatibility/summarizeBuild + estimatePower فورًا عند العرض.
 * كل الأحكام تعليمية — لا تعكس منتجات حقيقية.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Eraser,
  HelpCircle,
  Info,
  PlugZap,
  Sparkles,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { BuildSelection, BuildSlot, RuleVerdict } from '@/lib/types';
import { BUILD_OPTIONS, DEFAULT_BUILD } from '@/lib/data/catalog';
import {
  BUILD_SLOTS,
  checkCompatibility,
  findOption,
  summarizeBuild,
} from '@/lib/simulation/compatibilityEngine';
import { estimatePower } from '@/lib/simulation/powerEstimator';

const NONE_VALUE = '__none__';

/** خريطة الحكم → لون/أيقونة/نص (emerald نجاح، rose خطأ، amber تحذير). */
const VERDICT_UI: Record<
  RuleVerdict,
  { labelAr: string; cls: string; icon: LucideIcon; iconCls: string }
> = {
  compatible: {
    labelAr: 'التجميعة متوافقة',
    cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
    icon: CheckCircle2,
    iconCls: 'text-emerald-600 dark:text-emerald-400',
  },
  incompatible: {
    labelAr: 'توجد تعارضات',
    cls: 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300',
    icon: XCircle,
    iconCls: 'text-rose-600 dark:text-rose-400',
  },
  'needs-review': {
    labelAr: 'تحتاج مراجعة',
    cls: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
    icon: AlertTriangle,
    iconCls: 'text-amber-600 dark:text-amber-400',
  },
};

/** يحوّل specs إلى سطر مختصر «key: value • key: value». */
function specsLine(specs: Record<string, string>): string {
  return Object.entries(specs)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' • ');
}

export default function BuilderScreen() {
  const [sel, setSel] = useState<BuildSelection>(DEFAULT_BUILD);

  const results = useMemo(() => checkCompatibility(sel, BUILD_OPTIONS), [sel]);
  const summary = useMemo(() => summarizeBuild(sel, BUILD_OPTIONS), [sel]);
  const est = useMemo(() => estimatePower(sel, BUILD_OPTIONS), [sel]);

  const priced = useMemo(
    () =>
      BUILD_SLOTS.map(({ slot }) => findOption(BUILD_OPTIONS, slot, sel[slot]))
        .filter((o): o is NonNullable<typeof o> => o !== undefined)
        .filter((o) => typeof o.priceIllustrative === 'number'),
    [sel],
  );
  const totalPrice = priced.reduce((sum, o) => sum + (o.priceIllustrative ?? 0), 0);
  const selectedCount = BUILD_SLOTS.filter(({ slot }) => sel[slot] !== undefined).length;

  const setSlot = (slot: BuildSlot, id: string | undefined) => {
    setSel((prev) => {
      const next: BuildSelection = { ...prev };
      if (id === undefined) delete next[slot];
      else next[slot] = id;
      return next;
    });
  };

  const applyReferenceBuild = () => {
    setSel(DEFAULT_BUILD);
    toast.info('أُعيدت التجميعة المرجعية الكاملة المتوافقة.');
  };

  const clearSelection = () => {
    setSel({});
    toast.info('فُرِّغت كل الاختيارات — اختر قطعة من كل خانة لبدء فحص جديد.');
  };

  const banner = VERDICT_UI[summary.status];
  const BannerIcon = banner.icon;

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-6">
      {/* ===== ترويسة الشاشة ===== */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <PlugZap className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">بناء تجميعة مرجعية / فاحص التوافق</h1>
            <p className="text-sm text-muted-foreground">
              اختر قطعة لكل خانة وراقب قواعد التوافق التسع وتقدير الطاقة أثناء التعديل.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <span dir="ltr" className="font-mono">
              {selectedCount}/{BUILD_SLOTS.length}
            </span>
            خانات مختارة
          </Badge>
          <Button variant="outline" size="sm" onClick={applyReferenceBuild} className="gap-1.5">
            <Sparkles className="size-4 text-sky-600 dark:text-sky-400" />
            التجميعة المرجعية
          </Button>
          <Button variant="outline" size="sm" onClick={clearSelection} className="gap-1.5">
            <Eraser className="size-4" />
            تفريغ الاختيارات
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        {/* ===== خانات التجميعة الثماني ===== */}
        <section className="space-y-4 lg:col-span-3" aria-label="خانات التجميعة">
          <div className="grid gap-4 sm:grid-cols-2">
            {BUILD_SLOTS.map((slotMeta) => {
              const options = BUILD_OPTIONS.filter((o) => o.slot === slotMeta.slot);
              const current = sel[slotMeta.slot];
              const chosen = findOption(BUILD_OPTIONS, slotMeta.slot, current);
              return (
                <Card key={slotMeta.slot} className="gap-3 p-4">
                  <CardHeader className="p-0">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>{slotMeta.labelAr}</span>
                      {chosen === undefined ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          غير مختار
                        </Badge>
                      ) : (
                        <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="size-3" />
                          مختار
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>يتطلب اختيارًا واحدًا من {options.length} خيارات</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 p-0">
                    <Select
                      value={current ?? ''}
                      onValueChange={(v) => {
                        if (v === NONE_VALUE) setSlot(slotMeta.slot, undefined);
                        else setSlot(slotMeta.slot, v);
                      }}
                    >
                      <SelectTrigger className="w-full" aria-label={`اختيار ${slotMeta.labelAr}`}>
                        <SelectValue placeholder="— اختر قطعة —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>— بدون اختيار —</SelectItem>
                        {options.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.nameAr}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {chosen !== undefined && (
                      <div className="space-y-1 rounded-md bg-muted/50 p-2">
                        <p className="break-all text-xs leading-relaxed text-muted-foreground">
                          <span dir="ltr" className="font-mono">
                            {specsLine(chosen.specs)}
                          </span>
                        </p>
                        {typeof chosen.priceIllustrative === 'number' && (
                          <p className="text-xs text-muted-foreground">
                            سعر توضيحي:{' '}
                            <span dir="ltr" className="font-mono font-medium text-amber-700 dark:text-amber-400">
                              ${chosen.priceIllustrative}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ===== لوحة النتائج ===== */}
        <section className="space-y-4 self-start lg:sticky lg:top-4 lg:col-span-2" aria-label="نتائج الفحص">
          {/* ملخص الحكم العام */}
          <div className={`flex items-center gap-3 rounded-lg border p-4 ${banner.cls}`}>
            <BannerIcon className="size-6 shrink-0" />
            <div>
              <p className="font-bold">{banner.labelAr}</p>
              <p className="text-xs opacity-80">
                <span dir="ltr" className="font-mono">
                  {results.filter((r) => r.status === 'compatible').length}
                </span>{' '}
                قاعدة متوافقة •{' '}
                <span dir="ltr" className="font-mono">
                  {summary.reviewAr.length}
                </span>{' '}
                تحتاج مراجعة •{' '}
                <span dir="ltr" className="font-mono">
                  {summary.incompatibleAr.length}
                </span>{' '}
                تعارض
              </p>
            </div>
          </div>

          {/* تنبيه بأول تعارضين عند وجود تعارض */}
          {summary.status === 'incompatible' && (
            <Alert className="border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200 [&>svg]:text-rose-600 dark:[&>svg]:text-rose-400">
              <XCircle />
              <AlertTitle>تعارضات تمنع بناء هذه التجميعة عمليًا</AlertTitle>
              <AlertDescription className="text-rose-700 dark:text-rose-300">
                <ul className="list-disc space-y-1 ps-4">
                  {summary.incompatibleAr.slice(0, 2).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* قائمة نتائج القواعد التسع */}
          <Card className="gap-3 p-4">
            <CardHeader className="p-0">
              <CardTitle className="text-base">نتائج فحص قواعد التوافق</CardTitle>
              <CardDescription>
                تُفحص القواعد التسع تلقائيًا مع كل تعديل — الأخضر يحقق القاعدة، والأحمر يخلها، والكهرماني يحتاج بيانات.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {results.map((r, i) => {
                const ui = VERDICT_UI[r.status];
                const RuleIcon = ui.icon;
                return (
                  <div key={r.ruleId}>
                    {i > 0 && <Separator className="my-3" />}
                    <div className="flex items-start gap-2.5">
                      <RuleIcon className={`mt-0.5 size-4 shrink-0 ${ui.iconCls}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{r.titleAr}</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">{r.reasonAr}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* بطاقة الطاقة */}
          <Card className="gap-3 p-4">
            <CardHeader className="p-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <PlugZap className="size-4 text-sky-600 dark:text-sky-400" />
                تقدير الطاقة للتجميعة الحالية
              </CardTitle>
              <CardDescription>
                الحمل التقديري مقابل ميزانية الأمان: 80٪ من قدرة PSU المختار (psuRatedW × 0.80).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-0">
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">الاستهلاك التقديري</p>
                  <p className="mt-1">
                    <span dir="ltr" className="text-2xl font-bold text-foreground">
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
                      <span dir="ltr" className="text-2xl font-bold text-foreground">{est.budgetW}</span>
                    )}{' '}
                    <span className="text-xs text-muted-foreground">واط</span>
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">نسبة الاستخدام</p>
                  <p className="mt-1">
                    {est.usagePercent === null ? (
                      <span dir="ltr" className="text-2xl font-bold text-muted-foreground">—</span>
                    ) : (
                      <span
                        dir="ltr"
                        className={`text-2xl font-bold ${est.verdict === 'low' ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}
                      >
                        {est.usagePercent}%
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">قدرة PSU المختار</p>
                  <p className="mt-1">
                    {est.psuW === null ? (
                      <span dir="ltr" className="text-2xl font-bold text-muted-foreground">
                        —
                      </span>
                    ) : (
                      <>
                        <span
                          dir="ltr"
                          className={`text-2xl font-bold ${est.verdict === 'low' ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}
                        >
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
                  {est.remainingW >= 0
                    ? (
                      <>
                        الهامش المتبقي حتى ميزانية الأمان: <span dir="ltr" className="font-mono font-semibold">{est.remainingW} W</span>
                      </>
                    )
                    : (
                      <>
                        التجاوز فوق ميزانية الأمان: <span dir="ltr" className="font-mono font-semibold">{Math.abs(est.remainingW)} W</span>
                      </>
                    )}
                </p>
              )}

              {/* حكم كفاية القدرة: أيقونة + نص وليس لونًا فقط */}
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
                  <HelpCircle className="mt-0.5 size-4 shrink-0" />
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

              {/* تنبيهات إلزامية — كلها تذكّر أن الأرقام تقديرية */}
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

              {/* مجموع الأسعار التوضيحية */}
              {priced.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <CircleDollarSign className="size-4 text-sky-600 dark:text-sky-400" />
                    <span>
                      مجموع الأسعار:{' '}
                      <span dir="ltr" className="font-mono text-base font-bold">
                        ${totalPrice}
                      </span>
                    </span>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                    أسعار تعليمية توضيحية
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
