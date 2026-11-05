'use client';

/**
 * HomeScreen — شاشة الترحيب: بطاقة بطل + ملخص التقدم + حالة الحفظ + تنبيه تعليمي.
 * تعتمد حصرًا على عقود lib/types والمتجر useLabStore — لا منطق محاكاة هنا.
 */

import {
  Activity,
  ArrowLeft,
  BookOpen,
  Boxes,
  CircleCheck,
  CircleX,
  ClipboardList,
  GraduationCap,
  Info,
  ListChecks,
  Save,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { LESSONS } from '@/lib/data/lessons';
import { useLabStore } from '@/lib/store/labStore';

/** تنسيق وقت الحدث بالعربية (يُستدعى بعد الترطيب فقط فلا خطر عدم تطابق SSR). */
function formatTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(ts),
    );
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export default function HomeScreen() {
  const logs = useLabStore((s) => s.logs);
  const quizScores = useLabStore((s) => s.quizScores);
  const missionsDone = useLabStore((s) => s.missionsDone);
  const lessonsRead = useLabStore((s) => s.lessonsRead);
  const saveStatus = useLabStore((s) => s.saveStatus);
  const setScreen = useLabStore((s) => s.setScreen);
  const startMission = useLabStore((s) => s.startMission);

  const lastEvent = logs.length > 0 ? logs[logs.length - 1] : null;

  const scores = Object.values(quizScores);
  const quizAvg =
    scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
      : null;

  const missionsPercent = Math.round((missionsDone.length / LESSONS.length) * 100);
  const lessonsPercent = Math.round((lessonsRead.length / LESSONS.length) * 100);

  const saveOk = saveStatus.available && saveStatus.lastErrorAr === null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      {/* ===== بطاقة البطل ===== */}
      <Card className="border-sky-500/30 bg-sky-500/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Boxes className="size-6 text-sky-500" />
            <CardTitle className="text-2xl font-black leading-snug md:text-3xl">
              مختبر صيانة الحاسوب الافتراضي
            </CardTitle>
          </div>
          <CardDescription className="max-w-3xl space-y-2 pt-2 text-sm leading-relaxed md:text-base">
            <p>
              منصة تعليمية تفاعلية لطلاب تخصص صيانة الحاسوب: 15 مكوّنًا ثلاثي الأبعاد قابلًا للفك
              والتركيب بآلة حالات كاملة، شاشة عرض افترائية بحالاتها الثماني (لا إشارة، رسائل POST،
              إعدادات UEFI، نظام مبسّط تكتب فيه بلوحة مفاتيحك الحقيقية)، وجلسة فني ذو مراحل
              تسع من بطاقة الطلب حتى تقرير التسليم.
            </p>
            <p>
              14 عطلًا تعليميًا مبنيًا على محرك أعطال مُختبَر آليًا (14/14)، وثلاثة مصائر تشغيل
              حقيقية: فشل POST، أو POST ناجح بلا جهاز إقلاع، أو إقلاع سليم إلى النظام.
            </p>
            <p className="font-medium text-amber-700 dark:text-amber-400">
              المختبر مكمل للتدريب العملي الحقيقي في ورشة المعلم — وليس بديلًا عنه.
            </p>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => setScreen('lab')}>
            ادخل المختبر ثلاثي الأبعاد
            <ArrowLeft className="size-4" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => setScreen('tech')}>
            <Stethoscope className="size-4 text-sky-600 dark:text-sky-400" />
            ابدأ جلسة فني (المراحل التسع)
          </Button>
          <Button size="lg" variant="outline" onClick={() => startMission('m-safety')}>
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            ابدأ مهمة السلامة الأولى
          </Button>
        </CardContent>
      </Card>

      {/* ===== شبكة البطاقات ===== */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 1) آخر نشاط */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-sky-500" />
              آخر نشاط
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastEvent ? (
              <div className="flex items-start gap-3">
                {lastEvent.ok ? (
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <CircleX className="mt-0.5 size-5 shrink-0 text-rose-600 dark:text-rose-400" />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium leading-snug">{lastEvent.labelAr}</p>
                  {lastEvent.detailAr && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {lastEvent.detailAr}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{formatTime(lastEvent.ts)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                لا نشاط بعد — ابدأ بجولة في المختبر أو نفّذ مهمة موجهة وسيظهر سجل أحداثك هنا.
              </p>
            )}
          </CardContent>
        </Card>

        {/* 2) تقدمك */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="size-4 text-sky-500" />
              تقدمك
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <ClipboardList className="size-4 text-muted-foreground" />
                  المهام المكتملة
                </span>
                <span dir="ltr" className="font-mono text-muted-foreground">
                  {missionsDone.length} / {LESSONS.length}
                </span>
              </div>
              <Progress value={missionsPercent} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="size-4 text-muted-foreground" />
                  الدروس المقروءة
                </span>
                <span dir="ltr" className="font-mono text-muted-foreground">
                  {lessonsRead.length} / {LESSONS.length}
                </span>
              </div>
              <Progress value={lessonsPercent} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <ListChecks className="size-4 text-muted-foreground" />
                  متوسط درجات الاختبارات
                </span>
                {quizAvg !== null ? (
                  <Badge
                    variant="outline"
                    className={
                      quizAvg >= 60
                        ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                        : 'border-rose-500/40 text-rose-700 dark:text-rose-400'
                    }
                  >
                    <span dir="ltr">{quizAvg}%</span>
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">لم تُسجَّل درجات بعد</span>
                )}
              </div>
              <Progress value={quizAvg ?? 0} />
            </div>
          </CardContent>
        </Card>

        {/* 3) اختصارات التعلم */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4 text-sky-500" />
              اختصارات التعلم
            </CardTitle>
            <CardDescription>انتقل مباشرة إلى أقسام التدريب الخمسة.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="justify-start" onClick={() => setScreen('lab')}>
              <Boxes className="size-4 text-sky-500" />
              المختبر
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setScreen('tech')}
            >
              <Stethoscope className="size-4 text-sky-500" />
              جلسة الفني
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setScreen('diagnostics')}
            >
              <Activity className="size-4 text-sky-500" />
              الأعطل والاختبارات
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setScreen('catalog')}
            >
              <BookOpen className="size-4 text-sky-500" />
              الكتالوج
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setScreen('training')}
            >
              <ClipboardList className="size-4 text-sky-500" />
              التدريب الموجه
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setScreen('lessons')}
            >
              <ListChecks className="size-4 text-sky-500" />
              الاختبار
            </Button>
          </CardContent>
        </Card>

        {/* 4) حالة حفظ البيانات */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Save className="size-4 text-sky-500" />
              حالة حفظ البيانات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {saveOk ? (
              <div className="flex items-start gap-3">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    محفوظ
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {saveStatus.lastSavedAt
                      ? `آخر حفظ: ${formatTime(saveStatus.lastSavedAt)}`
                      : 'لم يُحفظ شيء جديد في هذه الجلسة بعد — يُحفظ التقدم تلقائيًا مع كل إجراء.'}
                  </p>
                </div>
              </div>
            ) : (
              <Alert className="border-amber-500/40">
                <TriangleAlert className="size-4 text-amber-500" />
                <AlertTitle>تنبيه: الحفظ غير مضمون</AlertTitle>
                <AlertDescription className="text-sm leading-relaxed">
                  {saveStatus.lastErrorAr ??
                    'تخزين المتصفح غير متاح — ستبقى بيانات الجلسة في الذاكرة فقط ولن تُحفظ بعد إغلاق الصفحة.'}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* 5) تنبيه تعليمي ثابت */}
        <Card className="md:col-span-2">
          <CardContent className="pt-0">
            <Alert className="border-amber-500/40">
              <Info className="size-4 text-sky-500" />
              <AlertTitle>تنبيه تعليمي</AlertTitle>
              <AlertDescription className="text-sm leading-relaxed">
                كل القيم المعروضة في المنصة (الطاقة، SMART، الأسعار) محاكاة تعليمية توضيحية وليست
                قياسات حقيقية — استخدمها لفهم المفاهيم ومنطق القرار فقط.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      <Separator className="opacity-40" />
      <p className="pb-2 text-center text-xs text-muted-foreground">
        منصة مرجعية للتدريب التعليمي — المحتوى يحتاج مراجعة معلم التخصص قبل تطبيقه على أجهزة فعلية.
      </p>
    </div>
  );
}
