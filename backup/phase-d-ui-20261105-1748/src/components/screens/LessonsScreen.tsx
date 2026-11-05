'use client';

/**
 * LessonsScreen — تبويبان: «الدروس والمهام» (بطاقات LESSONS) و«الاختبار السريع»
 * (تدفق سؤال-سؤال محلي على QUESTIONS مع حفظ الدرجة عبر recordQuiz).
 */

import { useState } from 'react';

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleCheck,
  CircleX,
  Info,
  ListChecks,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LESSONS } from '@/lib/data/lessons';
import { QUESTIONS } from '@/lib/data/quiz';
import { useLabStore } from '@/lib/store/labStore';
import type { Mission } from '@/lib/types';
import { cn } from '@/lib/utils';

const QUIZ_ID = 'quiz-main';
const PASS_PERCENT = 60; // مطابق لعتبة تسجيل النجاح في المتجر

const DIFFICULTY_CLASS: Record<Mission['difficulty'], string> = {
  مبتدئ: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  متوسط: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  متقدم: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400',
};

export default function LessonsScreen() {
  const missionsDone = useLabStore((s) => s.missionsDone);
  const lessonsRead = useLabStore((s) => s.lessonsRead);
  const startMission = useLabStore((s) => s.startMission);
  const markLessonRead = useLabStore((s) => s.markLessonRead);
  const recordQuiz = useLabStore((s) => s.recordQuiz);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-black md:text-2xl">
          <BookOpen className="size-5 text-sky-500" />
          الدروس والمهام
        </h1>
        <p className="text-sm text-muted-foreground">
          <span dir="ltr" className="font-mono">{LESSONS.length}</span> مهام موجهة تُتحقق خطواتها
          آليًا داخل المختبر، واختبار سريع من{' '}
          <span dir="ltr" className="font-mono">{QUESTIONS.length}</span> سؤالًا.
        </p>
      </div>

      <Tabs defaultValue="lessons" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:w-96">
          <TabsTrigger value="lessons" className="gap-1.5 py-2">
            <BookOpen className="size-4" />
            الدروس والمهام
          </TabsTrigger>
          <TabsTrigger value="quiz" className="gap-1.5 py-2">
            <ListChecks className="size-4" />
            الاختبار السريع
          </TabsTrigger>
        </TabsList>

        {/* ==================== تبويب الدروس ==================== */}
        <TabsContent value="lessons" className="mt-4 space-y-4">
          {LESSONS.map((m) => {
            const done = missionsDone.includes(m.id);
            const read = lessonsRead.includes(m.id);
            return (
              <Card key={m.id} className={cn('gap-4', done && 'border-emerald-500/40')}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base leading-snug">{m.titleAr}</CardTitle>
                    <div className="flex items-center gap-2">
                      {done && (
                        <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                          <CircleCheck className="size-3" />
                          مكتملة
                        </Badge>
                      )}
                      <Badge variant="outline" className={DIFFICULTY_CLASS[m.difficulty]}>
                        {m.difficulty}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription className="text-sm leading-relaxed">
                    {m.objectiveAr}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                    {m.safetyAr.map((s) => (
                      <li key={s} className="flex items-start gap-2 text-sm leading-relaxed">
                        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="group gap-1.5">
                        اعرض خطوات المهمة
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span dir="ltr" className="font-mono">
                            {m.steps.length}
                          </span>
                          خطوة
                        </span>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ol className="mt-3 list-decimal space-y-1.5 ps-5 text-sm leading-relaxed text-muted-foreground">
                        {m.steps.map((st) => (
                          <li key={st.id}>{st.textAr}</li>
                        ))}
                      </ol>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
                <CardFooter className="flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => startMission(m.id)}>
                    <Play className="size-4" />
                    ابدأ المهمة الموجهة
                  </Button>
                  {read ? (
                    <Badge variant="secondary" className="gap-1">
                      <BookOpen className="size-3" />
                      مقروء
                    </Badge>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => markLessonRead(m.id)}>
                      <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                      علّمت الدرس كمقروء
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </TabsContent>

        {/* ==================== تبويب الاختبار ==================== */}
        <TabsContent value="quiz" className="mt-4">
          <QuizTab onRecord={recordQuiz} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// تدفق الاختبار السريع (حالة محلية كاملة)
// ============================================================

function QuizTab({ onRecord }: { onRecord: (quizId: string, score: number) => void }) {
  const total = QUESTIONS.length;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => Array<number | null>(total).fill(null));
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);

  const current = QUESTIONS[index];

  const correctCount = answers.reduce<number>(
    (acc, a, i) => acc + (a !== null && a === QUESTIONS[i].correctIndex ? 1 : 0),
    0,
  );
  const percent = Math.round((correctCount / total) * 100);
  const passed = percent >= PASS_PERCENT;

  const choose = (value: number) => {
    setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)));
  };

  const goNext = () => {
    if (answers[index] === null) return;
    if (index === total - 1) {
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
    }
  };

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  const resetQuiz = () => {
    setIndex(0);
    setAnswers(Array<number | null>(total).fill(null));
    setFinished(false);
    setSaved(false);
  };

  const saveScore = () => {
    onRecord(QUIZ_ID, percent);
    toast.success(`حُفظت درجة الاختبار: ${percent}%`);
    setSaved(true);
  };

  if (!finished) {
    return (
      <Card className="gap-4">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="secondary">{current.topic}</Badge>
            <span className="text-sm text-muted-foreground">
              السؤال{' '}
              <span dir="ltr" className="font-mono">
                {index + 1} / {total}
              </span>
            </span>
          </div>
          <CardTitle className="pt-1 text-lg leading-relaxed">{current.textAr}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={Math.round((index / total) * 100)} />
          <RadioGroup
            value={answers[index] !== null ? String(answers[index]) : ''}
            onValueChange={(v) => choose(Number(v))}
            className="gap-2"
          >
            {current.optionsAr.map((opt, i) => (
              <Label
                key={opt}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm font-normal leading-relaxed transition-colors hover:bg-accent/50',
                  answers[index] === i && 'border-primary/60 bg-primary/10',
                )}
              >
                <RadioGroupItem value={String(i)} className="mt-0.5" />
                <span>{opt}</span>
              </Label>
            ))}
          </RadioGroup>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={goPrev} disabled={index === 0}>
              <ArrowRight className="size-4" />
              السابق
            </Button>
            <Button size="sm" onClick={goNext} disabled={answers[index] === null}>
              {index === total - 1 ? 'إظهار النتيجة' : 'التالي'}
              <ArrowLeft className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* النتيجة */}
      <Card>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">انتهت الأسئلة — هذه نتيجتك:</p>
          <p className="text-4xl font-black">
            <span dir="ltr">{percent}%</span>
          </p>
          {passed ? (
            <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-3" />
              ناجح — أداء جيد
            </Badge>
          ) : (
            <Badge className="gap-1 border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-400">
              <RotateCcw className="size-3" />
              أقل من <span dir="ltr">{PASS_PERCENT}%</span> — يحتاج إعادة ومراجعة التفسيرات
            </Badge>
          )}
          <p className="text-sm text-muted-foreground">
            أجبت إجابة صحيحة عن{' '}
            <span dir="ltr" className="font-mono">
              {correctCount} / {total}
            </span>{' '}
            سؤالًا.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={resetQuiz}>
              <RotateCcw className="size-4" />
              إعادة الاختبار
            </Button>
            <Button size="sm" onClick={saveScore} disabled={saved}>
              <Save className="size-4" />
              {saved ? 'حُفظت الدرجة' : 'حفظ الدرجة'}
            </Button>
          </div>
          {saved && (
            <Badge variant="secondary" className="gap-1">
              <CircleCheck className="size-3" />
              الدرجة محفوظة في سجلك
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* مراجعة التفسيرات */}
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <ListChecks className="size-4 text-sky-500" />
          مراجعة التفسيرات — كل الأسئلة
        </h3>
        <div className="max-h-96 space-y-3 overflow-y-auto pe-1">
          {QUESTIONS.map((q, i) => {
            const mine = answers[i];
            const correct = mine !== null && mine === q.correctIndex;
            return (
              <div key={q.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug">
                    <span dir="ltr" className="font-mono text-muted-foreground">
                      {i + 1}.
                    </span>{' '}
                    {q.textAr}
                  </p>
                  <Badge variant="secondary" className="shrink-0">
                    {q.topic}
                  </Badge>
                </div>
                <p
                  className={cn(
                    'flex items-start gap-1.5 text-sm leading-relaxed',
                    correct
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400',
                  )}
                >
                  {correct ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <CircleX className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span>إجابتك: {mine !== null ? q.optionsAr[mine] : 'لم تُجب'}</span>
                </p>
                {!correct && (
                  <p className="flex items-start gap-1.5 text-sm leading-relaxed text-emerald-700 dark:text-emerald-400">
                    <CircleCheck className="mt-0.5 size-4 shrink-0" />
                    <span>الإجابة الصحيحة: {q.optionsAr[q.correctIndex]}</span>
                  </p>
                )}
                <Separator className="opacity-50" />
                <p className="text-xs leading-relaxed text-muted-foreground">{q.explanationAr}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ملاحظة ثابتة */}
      <Alert className="border-amber-500/40">
        <Info className="size-4 text-sky-500" />
        <AlertTitle>ملاحظة</AlertTitle>
        <AlertDescription className="text-sm leading-relaxed">
          الأسئلة تغطي مفاهيم السلامة والتشخيص الأساسية للمنصة المرجعية.
        </AlertDescription>
      </Alert>
    </div>
  );
}
