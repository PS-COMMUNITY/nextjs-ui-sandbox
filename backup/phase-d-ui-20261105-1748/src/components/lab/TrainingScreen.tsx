'use client';

/**
 * شاشة التدريب الموجّه — مهام خطوة بخطوة تُتحقق آليًا من حالة المحاكاة.
 */
import { useEffect, useMemo } from 'react';
import {
  GraduationCap,
  CheckCircle2,
  CircleDashed,
  Boxes,
  ShieldAlert,
  Trophy,
  Flag,
  Loader2,
} from 'lucide-react';
import { LESSONS } from '@/lib/data/lessons';
import {
  currentPendingStepIndex,
  isStepDone,
  getMission,
} from '@/lib/services/missionEngine';
import { useLabStore } from '@/lib/store/labStore';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const DIFFICULTY_CLASS: Record<string, string> = {
  'مبتدئ': 'bg-emerald-600/15 text-emerald-400 border border-emerald-600/40',
  'متوسط': 'bg-amber-600/15 text-amber-400 border border-amber-600/40',
  'متقدم': 'bg-rose-600/15 text-rose-400 border border-rose-600/40',
};

export default function TrainingScreen() {
  const sim = useLabStore((s) => s.sim);
  const lastDiagnosis = useLabStore((s) => s.lastDiagnosis);
  const activeMissionId = useLabStore((s) => s.activeMissionId);
  const missionsDone = useLabStore((s) => s.missionsDone);
  const startMission = useLabStore((s) => s.startMission);
  const abandonMission = useLabStore((s) => s.abandonMission);
  const completeMission = useLabStore((s) => s.completeMission);
  const setScreen = useLabStore((s) => s.setScreen);
  const missionStepIndex = useLabStore((s) => s.missionStepIndex);

  const mission = getMission(activeMissionId) ?? null;

  // المؤشر الفعلي: أول خطوة غير مستوفاة (الخطوات المستوفاة سلفًا تُتجاوز تلقائيًا)
  const pendingIndex = useMemo(
    () => (mission ? currentPendingStepIndex(mission, sim, lastDiagnosis) : -1),
    [mission, sim, lastDiagnosis],
  );

  // إتمام تلقائي للمهمة
  useEffect(() => {
    if (mission && pendingIndex === -1) {
      completeMission(mission.id);
      toast.success(`🎉 اكتملت مهمة «${mission.titleAr}» — ${mission.completionMessageAr}`);
    }
  }, [mission, pendingIndex, completeMission]);

  // ============ مهمة نشطة ============
  if (mission) {
    const doneCount = pendingIndex === -1 ? mission.steps.length : pendingIndex;
    const progress = Math.round((doneCount / mission.steps.length) * 100);
    const currentStep = pendingIndex === -1 ? null : mission.steps[pendingIndex];

    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Card className="border-primary/40">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" aria-hidden />
                {mission.titleAr}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" dir="ltr" className="font-mono">
                  {doneCount}/{mission.steps.length}
                </Badge>
                <Button size="sm" variant="ghost" onClick={abandonMission}>
                  إنهاء المهمة
                </Button>
              </div>
            </div>
            <Progress value={progress} className="mt-2" />
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">{mission.objectiveAr}</p>

            <div className="rounded-md border border-rose-600/30 bg-rose-600/10 p-3">
              <p className="text-xs font-bold text-rose-400 mb-1 flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> تذكير السلامة (لا يُخفى أبدًا)
              </p>
              <ul className="text-[11px] text-rose-200/80 list-disc ps-4 space-y-0.5">
                {mission.safetyAr.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            {/* الخطوة الحالية */}
            {currentStep ? (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
                <p className="text-xs text-primary font-bold mb-1 flex items-center gap-1.5">
                  <Flag className="h-3.5 w-3.5" aria-hidden />
                  الخطوة {doneCount + 1} من {mission.steps.length}
                </p>
                <p className="text-sm font-bold leading-relaxed">{currentStep.textAr}</p>
                {currentStep.hintAr ? (
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">تلميح: {currentStep.hintAr}</p>
                ) : null}
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" className="gap-1.5" onClick={() => setScreen('lab')}>
                    <Boxes className="h-3.5 w-3.5" aria-hidden /> افتح المختبر ونفّذ الخطوة
                  </Button>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> يُتحقق من الخطوة تلقائيًا عند تنفيذها
                  </span>
                </div>
              </div>
            ) : null}

            {/* قائمة الخطوات */}
            <ol className="space-y-1.5">
              {mission.steps.map((step, i) => {
                const done = isStepDone(step, sim, lastDiagnosis);
                const isCurrent = i === pendingIndex;
                return (
                  <li
                    key={step.id}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors',
                      done && 'border-emerald-600/30 bg-emerald-600/10',
                      isCurrent && 'border-primary/50 bg-primary/10',
                      !done && !isCurrent && 'border-border opacity-60',
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                    ) : (
                      <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className={cn('flex-1', done && 'line-through opacity-70')}>{step.textAr}</span>
                    {isCurrent ? <Badge className="bg-primary/20 text-primary border border-primary/40" variant="outline">الحالية</Badge> : null}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============ قائمة المهام ============
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">التدريب الموجه</h2>
        <p className="text-sm text-muted-foreground mt-1">
          مهام عملية خطوة بخطوة على الجهاز الافتراضي — تُتحقق كل خطوة آليًا من حالة المحاكاة، وتميّز الصواب من الخطأ بشرح تفسيري.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {LESSONS.map((m) => {
          const done = missionsDone.includes(m.id);
          const satisfied = m.steps.filter((s) => isStepDone(s, sim, lastDiagnosis)).length;
          return (
            <Card key={m.id} className={cn('flex flex-col', done && 'border-emerald-600/40')}>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm leading-snug">{m.titleAr}</CardTitle>
                  <Badge variant="outline" className={cn('shrink-0', DIFFICULTY_CLASS[m.difficulty] ?? '')}>
                    {m.difficulty}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 flex-1 flex flex-col gap-3">
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{m.objectiveAr}</p>
                <div className="mt-auto space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span dir="ltr" className="font-mono">
                      {satisfied}/{m.steps.length}
                    </span>
                    {done ? (
                      <span className="flex items-center gap-1 text-emerald-500 font-medium">
                        <Trophy className="h-3.5 w-3.5" aria-hidden /> مكتملة
                      </span>
                    ) : null}
                  </div>
                  <Progress value={(satisfied / m.steps.length) * 100} className="h-1.5" />
                  <Button size="sm" variant={done ? 'outline' : 'default'} className="w-full gap-1.5" onClick={() => startMission(m.id)}>
                    <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                    {done ? 'إعادة المهمة' : 'ابدأ المهمة'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        التسلسلات هنا سيناريو تدريبي للمنصة المرجعية الافتراضية وقد تختلف بين الأجهزة الحقيقية — راجعها مع معلم التخصص قبل اعتمادها مرجعًا نهائيًا.
      </p>
    </div>
  );
}
