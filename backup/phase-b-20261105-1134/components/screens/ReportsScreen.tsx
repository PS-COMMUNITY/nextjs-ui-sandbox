'use client';

/**
 * ReportsScreen — «سجل الجلسات والتقارير».
 * بطاقات إحصاء (أحداث/أفعال/اختبارات/مهام) + توصيات buildRecommendationsAr +
 * جدول الأحداث داخل ScrollArea + أزرار تصدير حقيقية (CSV/CSV تقرير/JSON/طباعة).
 * كل القيم من محاكاة تعليمية — يُصرَّح بذلك أسفل الشاشة.
 */

import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  FileDown,
  FileJson,
  GraduationCap,
  Inbox,
  Info,
  Lightbulb,
  ListChecks,
  Printer,
  ScrollText,
  Trophy,
  XCircle,
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { APP_VERSION } from '@/lib/types';
import type { SessionEvent } from '@/lib/types';
import { useLabStore } from '@/lib/store/labStore';
import {
  buildRecommendationsAr,
  eventsToCsvRows,
  reportToCsvRows,
  summarizeSession,
} from '@/lib/services/reportService';
import { downloadCsv, downloadJson } from '@/lib/services/exportService';
import type { PersistShape } from '@/lib/services/persistence';

/** إجمالي المهام التعليمية المتاح في التطبيق. */
const TOTAL_MISSIONS = 6;

export default function ReportsScreen() {
  const logs = useLabStore((s) => s.logs);
  const quizScores = useLabStore((s) => s.quizScores);
  const missionsDone = useLabStore((s) => s.missionsDone);
  const lastDiagnosis = useLabStore((s) => s.lastDiagnosis);
  const sim = useLabStore((s) => s.sim);
  const lessonsRead = useLabStore((s) => s.lessonsRead);
  const quality = useLabStore((s) => s.quality);

  const summary = useMemo(
    () => summarizeSession(logs, quizScores, missionsDone, lastDiagnosis),
    [logs, quizScores, missionsDone, lastDiagnosis],
  );
  const recommendations = useMemo(
    () => buildRecommendationsAr(logs, lastDiagnosis),
    [logs, lastDiagnosis],
  );

  // ===== أزرار التصدير — كلها تعمل فعلًا مع رسائل نجاح/خطأ =====
  const handleExportEvents = () => {
    try {
      downloadCsv(eventsToCsvRows(logs), 'pcrs-events.csv');
      toast.success('صُدِّر سجل الأحداث بصيغة CSV');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل تصدير سجل الأحداث');
    }
  };

  const handleExportReport = () => {
    try {
      downloadCsv(reportToCsvRows(summary), 'pcrs-report.csv');
      toast.success('صُدِّر التقرير الملخّص بصيغة CSV');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل تصدير التقرير');
    }
  };

  const handleExportBackup = () => {
    try {
      const backup: PersistShape = {
        version: APP_VERSION,
        simulation: sim,
        tech: useLabStore.getState().tech,
        logs,
        quizScores,
        missionsDone,
        lessonsRead,
        settings: { quality },
        savedAt: Date.now(),
      };
      downloadJson(backup, 'pcrs-backup.json');
      toast.success('نُزِّلت نسخة احتياطية JSON كاملة من الجلسة');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل إنشاء النسخة الاحتياطية');
    }
  };

  const handlePrint = () => {
    toast.info('اختر «حفظ كـ PDF» من نافذة الطباعة إن أردت نسخة PDF.');
    window.print();
  };

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-6">
      {/* ===== ترويسة الشاشة ===== */}
      <header className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
          <ScrollText className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">سجل الجلسات والتقارير</h1>
          <p className="text-sm text-muted-foreground">
            خلاصة ما فعلته في هذه الجلسة: الأحداث، نتائج الاختبارات، المهام المكتملة، وآخر تشخيص — مع تصدير كامل.
          </p>
        </div>
      </header>

      {/* ===== بطاقات الإحصاء الأربع ===== */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="إحصاءات الجلسة">
        {/* عدد الأحداث */}
        <Card className="gap-2 p-4">
          <CardHeader className="flex items-center justify-between gap-2 p-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">عدد الأحداث</CardTitle>
            <ScrollText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-0">
            <p>
              <span dir="ltr" className="text-3xl font-bold">
                {logs.length}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">كل فعل مسجَّل بأوقاته ونتيجته</p>
          </CardContent>
        </Card>

        {/* أفعال صحيحة/خاطئة: نص + أيقونة وليس لونًا فقط */}
        <Card className="gap-2 p-4">
          <CardHeader className="flex items-center justify-between gap-2 p-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">الأفعال في السجل</CardTitle>
            <ListChecks className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1 p-0">
            <p className="flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>ناجحة:</span>
              <span dir="ltr" className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                {summary.correctActions}
              </span>
            </p>
            <p className="flex items-center gap-1.5 text-sm">
              <XCircle className="size-4 text-rose-600 dark:text-rose-400" />
              <span>خاطئة:</span>
              <span dir="ltr" className="font-mono font-bold text-rose-700 dark:text-rose-300">
                {summary.failedActions}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">الخطأ هنا خطوة تعلّم لا خصم</p>
          </CardContent>
        </Card>

        {/* متوسط درجات الاختبارات */}
        <Card className="gap-2 p-4">
          <CardHeader className="flex items-center justify-between gap-2 p-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">متوسط درجات الاختبارات</CardTitle>
            <GraduationCap className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-0">
            <p>
              {summary.quizTaken === 0 ? (
                <span dir="ltr" className="text-3xl font-bold text-muted-foreground">
                  —
                </span>
              ) : (
                <>
                  <span dir="ltr" className="text-3xl font-bold">
                    {summary.quizAverageScore}
                  </span>
                  <span className="text-sm text-muted-foreground">%</span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.quizTaken === 0 ? (
                'لا اختبارات مأخوذة بعد'
              ) : (
                <>
                  عدد الاختبارات:{' '}
                  <span dir="ltr" className="font-mono">
                    {summary.quizTaken}
                  </span>
                </>
              )}
            </p>
          </CardContent>
        </Card>

        {/* المهام المكتملة */}
        <Card className="gap-2 p-4">
          <CardHeader className="flex items-center justify-between gap-2 p-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">المهام المكتملة</CardTitle>
            <Trophy className="size-4 text-sky-600 dark:text-sky-400" />
          </CardHeader>
          <CardContent className="space-y-2 p-0">
            <p>
              <span dir="ltr" className="text-3xl font-bold">
                {missionsDone.length}
              </span>
              <span dir="ltr" className="text-sm font-medium text-muted-foreground">
                /{TOTAL_MISSIONS}
              </span>
            </p>
            <Progress
              value={(missionsDone.length / TOTAL_MISSIONS) * 100}
              className="h-1.5 [&>div]:bg-sky-500"
              aria-label={`أُنجزت ${missionsDone.length} من ${TOTAL_MISSIONS} مهام`}
            />
            <p className="text-xs text-muted-foreground">من إجمالي مهام التدريب المتاحة</p>
          </CardContent>
        </Card>
      </section>

      {/* ===== التوصيات ===== */}
      <Card className="gap-3 p-4">
        <CardHeader className="p-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="size-4 text-sky-600 dark:text-sky-400" />
            توصيات لك
          </CardTitle>
          <CardDescription>مبنية على أكثر أنواع أخطائك تكرارًا وآخر نتيجة تشخيص.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          {recommendations.map((rec, i) => (
            <div key={rec}>
              {i > 0 && <Separator className="my-3" />}
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 font-mono text-xs font-bold text-sky-700 dark:text-sky-400">
                  <span dir="ltr">{i + 1}</span>
                </span>
                <p className="text-sm leading-relaxed">{rec}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ===== سجل الأحداث + التصدير ===== */}
      <Card className="gap-3 p-4">
        <CardHeader className="p-0">
          <CardTitle className="text-base">سجل الأحداث</CardTitle>
          <CardDescription>ترتيب زمني تصاعدي لكل ما فعلته في الجلسة (حتى 500 حدث).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          {/* أزرار التصدير */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportEvents}>
              <FileDown className="size-4" />
              تصدير CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportReport}>
              <FileDown className="size-4" />
              تصدير التقرير CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportBackup}>
              <FileJson className="size-4" />
              نسخة احتياطية JSON
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
              <Printer className="size-4" />
              طباعة/PDF
            </Button>
          </div>

          {logs.length === 0 ? (
            /* حالة فراغ واضحة */
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
              <Inbox className="size-8 text-muted-foreground/60" />
              <p className="font-medium">لا أحداث بعد</p>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                ابدأ بالمختبر أو السيناريوهات التعليمية — سيُسجَّل هنا كل فعل تقوم به (سلامة، فك، تركيب، فحص POST، اختبار)
                مع نتيجته ووقته.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-96 rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-start">الوقت</TableHead>
                    <TableHead className="text-start">النوع</TableHead>
                    <TableHead className="text-start">الحدث</TableHead>
                    <TableHead className="text-start">النتيجة</TableHead>
                    <TableHead className="text-start">التفصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((e: SessionEvent, i) => (
                    <TableRow key={`${e.ts}-${i}`}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(e.ts).toLocaleString('ar')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono" dir="ltr">
                          {e.kind}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-64 text-sm">{e.labelAr}</TableCell>
                      <TableCell>
                        {e.ok ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="size-4 shrink-0" />
                            ناجح
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-rose-700 dark:text-rose-300">
                            <XCircle className="size-4 shrink-0" />
                            خطأ
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-72 text-xs leading-relaxed text-muted-foreground">
                        {e.detailAr ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ===== ملاحظة المحاكاة ===== */}
      <Alert className="border-border bg-muted/40 text-muted-foreground [&>svg]:text-muted-foreground/70">
        <Info />
        <AlertDescription className="text-xs leading-relaxed">
          كل القيم في التقارير من محاكاة تعليمية داخل التطبيق — وليست قياسات من أجهزة حقيقية ولا تقييمًا لمهارات صيانة
          فعلية.
        </AlertDescription>
      </Alert>
    </div>
  );
}
