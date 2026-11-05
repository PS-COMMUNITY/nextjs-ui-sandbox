'use client';

/**
 * MissionsPanel (v7) — لوحة المهام الموجهة داخل ورشة العمل الغامرة.
 * تظهر كلوحة عائمة فوق المشهد الحيّ (بدل صفحة مستقلة كانت تجمد المشهد):
 *  - مهمة نشطة: الخطوة الحالية + قائمة الخطوات تُتحقق آليًا من حالة المحاكاة.
 *  - لا مهمة: قائمة مهام عملية مضغوطة تُبدأ بنقرة.
 * التنفيذ نفسه يحدث في المشهد ثلاثي الأبعاد — هذه اللوحة مرشد فقط، لا أسئلة.
 */
import { useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  CircleDashed,
  Flag,
  GraduationCap,
  Loader2,
  ShieldAlert,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { LESSONS } from '@/lib/data/lessons';
import { currentPendingStepIndex, isStepDone, getMission } from '@/lib/services/missionEngine';
import { useLabStore } from '@/lib/store/labStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const DIFFICULTY_CLASS: Record<string, string> = {
  'مبتدئ': 'bg-emerald-600/15 text-emerald-400 border border-emerald-600/40',
  'متوسط': 'bg-amber-600/15 text-amber-400 border border-amber-600/40',
  'متقدم': 'bg-rose-600/15 text-rose-400 border border-rose-600/40',
};

export default function MissionsPanel() {
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
      <div className="space-y-3">
        <Card className="border-primary/40">
          <CardHeader className="p-3 pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-1.5 leading-snug">
                <GraduationCap className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                {mission.titleAr}
              </CardTitle>
              <Badge variant="outline" dir="ltr" className="shrink-0 font-mono text-[10px]">
                {doneCount}/{mission.steps.length}
              </Badge>
            </div>
            <Progress value={progress} className="mt-2 h-1.5" />
          </CardHeader>
          <CardContent className="p-3 pt-1 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">{mission.objectiveAr}</p>

            <div className="rounded-md border border-rose-600/30 bg-rose-600/10 p-2.5">
              <p className="text-[11px] font-bold text-rose-400 mb-1 flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> تذكير السلامة (لا يُخفى أبدًا)
              </p>
              <ul className="text-[10px] text-rose-200/80 list-disc ps-4 space-y-0.5">
                {mission.safetyAr.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            {/* الخطوة الحالية */}
            {currentStep ? (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                <p className="text-[11px] text-primary font-bold mb-1 flex items-center gap-1.5">
                  <Flag className="h-3.5 w-3.5" aria-hidden />
                  الخطوة {doneCount + 1} من {mission.steps.length}
                </p>
                <p className="text-xs font-bold leading-relaxed">{currentStep.textAr}</p>
                {currentStep.hintAr ? (
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">تلميح: {currentStep.hintAr}</p>
                ) : null}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Button size="sm" className="h-8 gap-1.5 text-[11px]" onClick={() => setScreen('lab')}>
                    نفّذها في المشهد الآن
                  </Button>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> تُتحقق آليًا عند التنفيذ
                  </span>
                </div>
              </div>
            ) : null}

            {/* قائمة الخطوات */}
            <ol className="space-y-1">
              {mission.steps.map((step, i) => {
                const done = isStepDone(step, sim, lastDiagnosis);
                const isCurrent = i === pendingIndex;
                return (
                  <li
                    key={step.id}
                    className={cn(
                      'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors',
                      done && 'border-emerald-600/30 bg-emerald-600/10',
                      isCurrent && 'border-primary/50 bg-primary/10',
                      !done && !isCurrent && 'border-border opacity-60',
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
                    ) : (
                      <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className={cn('flex-1 leading-snug', done && 'line-through opacity-70')}>{step.textAr}</span>
                    {isCurrent ? <Badge className="bg-primary/20 text-primary border border-primary/40 text-[9px]" variant="outline">الحالية</Badge> : null}
                  </li>
                );
              })}
            </ol>

            <Button size="sm" variant="ghost" className="w-full text-[11px]" onClick={abandonMission}>
              إنهاء المهمة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============ قائمة المهام (مضغوطة للوحة الجانبية) ============
  return (
    <div className="space-y-2">
      <div className="rounded-lg border bg-card p-3">
        <h2 className="text-sm font-bold flex items-center gap-1.5">
          <GraduationCap className="h-4 w-4 text-primary" aria-hidden /> المهام الموجهة
        </h2>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          اختر مهمة ونفّذ خطواتها على الجهاز الافتراضي في المشهد — كل خطوة تُتحقق آليًا من حالة المحاكاة.
        </p>
      </div>
      {LESSONS.map((m) => {
        const done = missionsDone.includes(m.id);
        const satisfied = m.steps.filter((s) => isStepDone(s, sim, lastDiagnosis)).length;
        return (
          <div
            key={m.id}
            className={cn(
              'rounded-lg border p-2.5 transition-colors',
              done ? 'border-emerald-600/40 bg-emerald-600/5' : 'bg-card hover:bg-accent/40',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold leading-snug">{m.titleAr}</p>
              <Badge variant="outline" className={cn('shrink-0 text-[9px]', DIFFICULTY_CLASS[m.difficulty] ?? '')}>
                {m.difficulty}
              </Badge>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{m.objectiveAr}</p>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={(satisfied / m.steps.length) * 100} className="h-1 flex-1" />
              <span dir="ltr" className="font-mono text-[10px] text-muted-foreground">
                {satisfied}/{m.steps.length}
              </span>
              {done ? <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden /> : null}
              <Button size="sm" variant={done ? 'outline' : 'default'} className="h-7 shrink-0 gap-1 px-2 text-[10px]" onClick={() => startMission(m.id)}>
                {done ? 'إعادة' : 'ابدأ'}
              </Button>
            </div>
          </div>
        );
      })}
      <p className="px-1 text-[10px] text-muted-foreground leading-relaxed">
        سيناريو تدريبي للمنصة الافتراضية — قد تختلف التفاصيل بين الأجهزة الحقيقية؛ راجعها مع معلم التخصص.
      </p>
    </div>
  );
}
