'use client';

/**
 * شاشة جلسة الفني — المراحل التسع الإلزامية (المواصفة §7):
 * بطاقة الطلب ← السلامة ← الفحص الخارجي ← الفحص الداخلي ← خطة التشخيص
 * ← الإصلاح الافتراضي ← التجميع والتحقق ← التشغيل وPOST ← تقرير التسليم.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  FileText,
  Hammer,
  MonitorUp,
  PackageOpen,
  Printer,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useLabStore } from '@/lib/store/labStore';
import { FAULTS, getFault } from '@/lib/data/faults';
import {
  TECH_HYPOTHESES,
  TECH_STAGES,
  TECH_TOOLS,
  getHypothesis,
  stageGate,
  type TechStage,
} from '@/lib/simulation/technicianEngine';
import { computeMonitorView, MONITOR_SCREEN_INFO } from '@/lib/simulation/monitorEngine';
import { codeLabelAr } from '@/lib/data/faults';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// ============ شريط المراحل ============
function StageStepper({ current, onJump }: { current: TechStage; onJump: (s: TechStage) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TECH_STAGES.map((st) => {
        const active = st.id === current;
        const passed = st.id < current;
        return (
          <button
            key={st.id}
            type="button"
            onClick={() => passed && onJump(st.id)}
            disabled={!passed}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors min-h-[30px]',
              active && 'border-primary bg-primary text-primary-foreground shadow-sm',
              passed && !active && 'border-emerald-600/40 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20',
              !active && !passed && 'border-border text-muted-foreground',
            )}
          >
            <span className="font-mono">{st.id}</span>
            {st.titleAr}
          </button>
        );
      })}
    </div>
  );
}

// ============ لوحة بوابة المرحلة الحالية ============
function GatePanel({ stage }: { stage: TechStage }) {
  const tech = useLabStore((s) => s.tech);
  const sim = useLabStore((s) => s.sim);
  if (!tech) return null;
  const gate = stageGate(stage, tech, sim);
  return (
    <Card className={cn('border', gate.done ? 'border-emerald-600/40 bg-emerald-600/5' : 'border-amber-600/40 bg-amber-600/5')}>
      <CardContent className="p-3">
        <p className={cn('text-xs font-bold flex items-center gap-1.5', gate.done ? 'text-emerald-400' : 'text-amber-400')}>
          {gate.done ? <ShieldCheck className="h-4 w-4" aria-hidden /> : <TriangleAlert className="h-4 w-4" aria-hidden />}
          {gate.done ? 'بوابة المرحلة مفتوحة' : 'ما يمنع الانتقال'}
        </p>
        {gate.done ? (
          <p className="text-xs text-muted-foreground mt-1">{gate.hintAr}</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {gate.blockersAr.map((b, i) => (
              <li key={i} className="text-xs text-amber-200/90 flex items-start gap-1.5">
                <Ban className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden /> {b}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ============ محتوى المراحل ============
function Stage1OrderCard() {
  const tech = useLabStore((s) => s.tech);
  const patchTech = useLabStore((s) => s.patchTech);
  const advanceTechStage = useLabStore((s) => s.advanceTechStage);
  if (!tech) return null;
  const fault = getFault(tech.scenarioId);
  if (!fault) return null;
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" aria-hidden /> بطاقة طلب الصيانة — {fault.id}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground mb-1">شكوى العميل:</p>
          <p className="text-sm leading-relaxed">«{fault.complaintAr}»</p>
          <div className="flex items-center gap-2 mt-3">
            <Badge variant="outline">{fault.difficulty}</Badge>
            <Badge variant="outline" className="font-mono">{fault.id}</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          مهمتك: تشخيص العطل من الأدلة ثم إصلاحه في المختبر حتى يعمل النظام — دون افتراض العطل من الشكوى وحدها.
        </p>
        {tech.orderRead ? (
          <Button className="gap-1.5" onClick={advanceTechStage}>
            الانتقال إلى السلامة <ArrowLeft className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button className="gap-1.5" onClick={() => patchTech({ orderRead: true })}>
            <BadgeCheck className="h-4 w-4" aria-hidden /> استلمت الطلب
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Stage2Safety() {
  const tech = useLabStore((s) => s.tech);
  const sim = useLabStore((s) => s.sim);
  const patchTech = useLabStore((s) => s.patchTech);
  const toggleTechTool = useLabStore((s) => s.toggleTechTool);
  const toggleFlag = useLabStore((s) => s.toggleFlag);
  const advanceTechStage = useLabStore((s) => s.advanceTechStage);
  if (!tech) return null;
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-500" aria-hidden /> السلامة أولًا
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={sim.flags.powerOn ? 'destructive' : 'outline'} onClick={() => toggleFlag('powerOn')}>
            {sim.flags.powerOn ? 'الجهاز يعمل — أطفئه' : 'الجهاز مطفأ'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => toggleFlag('acConnected')}>
            {sim.flags.acConnected ? 'الكهرباء موصولة — افصلها' : 'الكهرباء مفصولة'}
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer">
            <Checkbox checked={tech.esdStrap} onCheckedChange={(v) => patchTech({ esdStrap: v === true })} />
            لبست سوار التأريض المضاد للكهرباء الساكنة
          </label>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer">
            <Checkbox checked={tech.tidyDesk} onCheckedChange={(v) => patchTech({ tidyDesk: v === true })} />
            رتبت سطح العمل (بلا سوائل ولا فوضى)
          </label>
        </div>
        <div>
          <p className="text-xs font-bold mb-1.5">اختر أدوات العمل المناسبة (انقر للاختيار):</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {TECH_TOOLS.map((tool) => {
              const picked = tech.toolsChosen.includes(tool.id);
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => toggleTechTool(tool.id)}
                  className={cn(
                    'flex items-start gap-2 rounded-md border px-2.5 py-2 text-start text-xs transition-colors',
                    picked ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                  )}
                >
                  {picked ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden /> : <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />}
                  <span className="min-w-0">
                    <span className="font-medium block leading-tight">{tool.nameAr}</span>
                    {picked ? <span className={cn('text-[11px] leading-tight mt-0.5 block', tool.correct ? 'text-emerald-400' : 'text-rose-400')}>{tool.whyAr}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <Button className="gap-1.5" onClick={advanceTechStage}>
          تحقق من الانتقال <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

function Stage3External() {
  const tech = useLabStore((s) => s.tech);
  const patchTech = useLabStore((s) => s.patchTech);
  const advanceTechStage = useLabStore((s) => s.advanceTechStage);
  if (!tech) return null;
  const items: Array<{ key: keyof typeof tech; labelAr: string }> = [
    { key: 'extAcCable', labelAr: 'فحصت كابل الكهرباء والمقبس خلف مزود الطاقة' },
    { key: 'extMonitorCable', labelAr: 'فحصت كابل إشارة الشاشة (طرفاه: الجهاز والشاشة)' },
    { key: 'extPeripherals', labelAr: 'فحصت لوحة المفاتيح والفأرة ومواضع منافذهما' },
    { key: 'extPowerPressed', labelAr: 'جربت ضغطة تشغيل واحدة وسجلت الاستجابة (مراوح/أضواء/صفارة)' },
  ];
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MonitorUp className="h-5 w-5 text-primary" aria-hidden /> الفحص الخارجي
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          كثير من الأعطال تُرى من الخارج قبل فتح أي برغي: كابل غير مقفول، طرف شاشة مفصول، أو استجابة تشغيل غريبة.
        </p>
        <div className="grid gap-2">
          {items.map((it) => (
            <label key={it.key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer">
              <Checkbox checked={Boolean(tech[it.key])} onCheckedChange={(v) => patchTech({ [it.key]: v === true })} />
              {it.labelAr}
            </label>
          ))}
        </div>
        <Button className="gap-1.5" onClick={advanceTechStage}>
          تحقق من الانتقال <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

function Stage4Internal() {
  const tech = useLabStore((s) => s.tech);
  const sim = useLabStore((s) => s.sim);
  const patchTech = useLabStore((s) => s.patchTech);
  const toggleFlag = useLabStore((s) => s.toggleFlag);
  const advanceTechStage = useLabStore((s) => s.advanceTechStage);
  if (!tech) return null;
  const items: Array<{ key: keyof typeof tech; labelAr: string }> = [
    { key: 'intDust', labelAr: 'فحصت الغبار وفتحات التهوية ومسار الهواء' },
    { key: 'intCables', labelAr: 'فحصت الكابلات والموصلات (مرتخية/مفصولة/سليمة)' },
    { key: 'intScrews', labelAr: 'فحصت البراغي والتثبيت (قطع مرتخية؟)' },
  ];
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <PackageOpen className="h-5 w-5 text-primary" aria-hidden /> الفحص الداخلي
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => toggleFlag('panelOpen')}
        >
          {sim.flags.panelOpen ? 'الغطاء مفتوح' : 'افتح الغطاء الجانبي'}
        </Button>
        <div className="grid gap-2">
          {items.map((it) => (
            <label key={it.key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer">
              <Checkbox checked={Boolean(tech[it.key])} onCheckedChange={(v) => patchTech({ [it.key]: v === true })} />
              {it.labelAr}
            </label>
          ))}
        </div>
        <Button className="gap-1.5" onClick={advanceTechStage}>
          تحقق من الانتقال <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

function Stage5Hypothesis() {
  const tech = useLabStore((s) => s.tech);
  const patchTech = useLabStore((s) => s.patchTech);
  const advanceTechStage = useLabStore((s) => s.advanceTechStage);
  if (!tech) return null;
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" aria-hidden /> خطة التشخيص — اختر فرضيتك
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          وضع تقييم: لن تُكشف الإجابة الآن — ستحكم على فرضيتك في تقرير التسليم بناءً على ما نفّذته فعلاً.
        </p>
        <div className="grid gap-1.5 max-h-72 overflow-y-auto scrollbar-thin pe-1">
          {TECH_HYPOTHESES.map((h) => {
            const picked = tech.hypothesisId === h.id;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => patchTech({ hypothesisId: h.id })}
                className={cn(
                  'flex items-start gap-2 rounded-md border px-2.5 py-2 text-start text-xs transition-colors',
                  picked ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                )}
              >
                <span className={cn('font-mono shrink-0', picked ? 'text-primary' : 'text-muted-foreground')}>{h.id}</span>
                <span className="leading-relaxed">{h.textAr}</span>
              </button>
            );
          })}
        </div>
        <Button className="gap-1.5" onClick={advanceTechStage} disabled={!tech.hypothesisId}>
          سجّل الفرضية وانتقل للإصلاح <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

function Stage6Repair() {
  const tech = useLabStore((s) => s.tech);
  const sim = useLabStore((s) => s.sim);
  const setScreen = useLabStore((s) => s.setScreen);
  const advanceTechStage = useLabStore((s) => s.advanceTechStage);
  const patchTech = useLabStore((s) => s.patchTech);
  if (!tech) return null;
  const fault = getFault(tech.scenarioId);
  const fixed = fault?.isFixed(sim) ?? false;
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-5 w-5 text-amber-500" aria-hidden /> الإصلاح الافتراضي
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          انتقل إلى المختبر ونفّذ الفك/التركيب وفق قوائم الشروط — المحرك يرفض أي اختصار غير آمن وسيشرح لك السبب.
        </p>
        <div className={cn('rounded-md border p-3 text-xs leading-relaxed', fixed ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-300' : 'border-amber-600/40 bg-amber-600/10 text-amber-200')}>
          {fixed ? 'العطل الأساسي أُصلح — تحقق من التجميع الكامل قبل التشغيل.' : 'العطل الأساسي ما زال قائمًا — واصل الفحص والإصلاح في المختبر.'}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-1.5" onClick={() => setScreen('lab')}>
            <Hammer className="h-4 w-4" aria-hidden /> انتقل إلى المختبر
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setScreen('diagnostics')}>
            <Stethoscope className="h-4 w-4" aria-hidden /> فحص POST السريع
          </Button>
        </div>
        <Separator />
        <label className="block">
          <span className="text-xs font-bold mb-1 block">ملاحظات الفني (اختياري):</span>
          <textarea
            dir="rtl"
            value={tech.repairNotes}
            onChange={(e) => patchTech({ repairNotes: e.target.value.slice(0, 500) })}
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-xs leading-relaxed"
            placeholder="سجّل ما لاحظته أثناء الإصلاح — سيُدرج في تقرير التسليم"
          />
        </label>
        <Button className="gap-1.5" onClick={advanceTechStage}>
          تحقق من الانتقال <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

function Stage7Verify() {
  const sim = useLabStore((s) => s.sim);
  const setScreen = useLabStore((s) => s.setScreen);
  const advanceTechStage = useLabStore((s) => s.advanceTechStage);
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BadgeCheck className="h-5 w-5 text-emerald-500" aria-hidden /> التجميع والتحقق
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <GatePanel stage={7} />
        <div className="flex flex-wrap gap-2">
          <Button className="gap-1.5" onClick={() => setScreen('lab')}>
            <Hammer className="h-4 w-4" aria-hidden /> افتح المختبر
          </Button>
          <Button className="gap-1.5" onClick={advanceTechStage}>
            تحقق من الانتقال <ArrowLeft className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          تحقق تشمل: كل القطع في مواضعها، المزالج والبراغي مغلقة، الغطاء الجانبي مُغلق — ثم فقط انتقل للتشغيل.
        </p>
      </CardContent>
    </Card>
  );
}

function Stage8Boot() {
  const sim = useLabStore((s) => s.sim);
  const bootStartedAt = useLabStore((s) => s.bootStartedAt);
  const toggleFlag = useLabStore((s) => s.toggleFlag);
  const setScreen = useLabStore((s) => s.setScreen);
  const advanceTechStage = useLabStore((s) => s.advanceTechStage);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 700);
    return () => clearInterval(t);
  }, []);
  const view = useMemo(
    () => computeMonitorView(sim, bootStartedAt !== null ? Date.now() - bootStartedAt : 0),
    [sim, bootStartedAt, setTick],
  );
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MonitorUp className="h-5 w-5 text-primary" aria-hidden /> التشغيل وفحص POST — المصائر الثلاثة
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-1.5"
            variant={sim.flags.powerOn ? 'destructive' : 'default'}
            onClick={() => toggleFlag('powerOn')}
          >
            {sim.flags.powerOn ? 'إطفاء' : 'شغّل الجهاز'}
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setScreen('lab')}>
            <MonitorUp className="h-4 w-4" aria-hidden /> شاهد الشاشة في المختبر
          </Button>
        </div>
        <div className="rounded-md border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1">حالة الشاشة الافتراضية الآن:</p>
          <p className="text-sm font-bold flex items-center gap-2">
            {MONITOR_SCREEN_INFO[view.screen].labelAr}
            <Badge variant="outline" className="font-mono text-[10px]">{view.screen}</Badge>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{MONITOR_SCREEN_INFO[view.screen].hintAr}</p>
          {view.postLinesAr.length > 0 ? (
            <pre dir="ltr" className="mt-2 rounded bg-black/40 p-2 text-[10px] leading-relaxed font-mono overflow-x-auto text-emerald-300">
              {view.postLinesAr.join('\n')}
            </pre>
          ) : null}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          المصائر الثلاثة الممكنة: <span className="text-rose-400">فشل POST</span> (قطع حرجة) — <span className="text-amber-400">POST ناجح بلا جهاز إقلاع</span> (دخول UEFI) — <span className="text-emerald-400">إقلاع سليم إلى النظام الافتراضي</span>.
        </p>
        <Button className="gap-1.5" onClick={advanceTechStage}>
          تحقق من الانتقال <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

function Stage9Report() {
  const tech = useLabStore((s) => s.tech);
  const sim = useLabStore((s) => s.sim);
  const bootStartedAt = useLabStore((s) => s.bootStartedAt);
  const finishTechReport = useLabStore((s) => s.finishTechReport);
  const abandonTechSession = useLabStore((s) => s.abandonTechSession);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 900);
    return () => clearInterval(t);
  }, []);
  if (!tech) return null;
  const fault = getFault(tech.scenarioId);
  const hyp = getHypothesis(tech.hypothesisId);
  const generated = tech.reportAt !== null;
  const view = computeMonitorView(sim, bootStartedAt !== null ? Date.now() - bootStartedAt : 0);

  if (!generated) {
    return (
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" aria-hidden /> تقرير التسليم
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            وُلّد التقرير من سجل جلسك الفعلي: بطاقة الطلب، الفرضية وحكمها، خطوات الإصلاح المسجلة، ونتيجة POST النهائية.
          </p>
          <Button className="gap-1.5" onClick={finishTechReport}>
            <FileText className="h-4 w-4" aria-hidden /> ولّد التقرير
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" aria-hidden /> تقرير تسليم الجهاز — {new Date(tech.reportAt!).toLocaleString('ar')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3 text-sm leading-relaxed">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground mb-1">بطاقة الطلب</p>
            <p className="text-xs">{fault?.complaintAr ?? '—'}</p>
            <Badge variant="outline" className="mt-2 font-mono">{fault?.id}</Badge>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground mb-1">الفرضية التي اخترتها وحكمها</p>
            <p className="text-xs">{hyp?.textAr ?? 'لم تختر فرضية'}</p>
            <div className="mt-2 flex items-center gap-2">
              {tech.hypothesisCorrect ? (
                <Badge className="gap-1 bg-emerald-600/15 text-emerald-400 border border-emerald-600/40" variant="outline">
                  <CheckCircle2 className="h-3 w-3" aria-hidden /> فرضية صحيحة
                </Badge>
              ) : (
                <Badge className="gap-1 bg-rose-600/15 text-rose-400 border border-rose-600/40" variant="outline">
                  <XCircle className="h-3 w-3" aria-hidden /> فرضية غير صحيحة
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground mb-1">العطل الفعلي (يكشف بعد الإصلاح)</p>
          <p className="text-xs">{fault?.faultAr}</p>
          <ul className="mt-2 space-y-0.5">
            {(fault?.evidencesAr ?? []).map((e, i) => (
              <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" aria-hidden /> {e}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground mb-1">نتيجة التشغيل النهائية</p>
            <p className="text-xs font-bold">{MONITOR_SCREEN_INFO[view.screen].labelAr}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{MONITOR_SCREEN_INFO[view.screen].hintAr}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground mb-1">ملاحظات الفني</p>
            <p className="text-xs whitespace-pre-wrap">{tech.repairNotes || '— بلا ملاحظات —'}</p>
          </div>
        </div>
        <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 p-3">
          <p className="text-xs font-bold text-emerald-400 mb-1">بيان التسليم</p>
          <p className="text-xs leading-relaxed text-emerald-200/90">
            الجهاز عاد للعميل بحالة تشغيل سليمة (POST ناجح وإقلاع إلى النظام الافتراضي). كل الأرقام في هذا التقرير ناتج محاكاة تعليمية للمنصة المرجعية وليست قياسات أجهزة حقيقية.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> اطبع التقرير
          </Button>
          <Button variant="secondary" className="gap-1.5" onClick={abandonTechSession}>
            جلسة فني جديدة
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ اختيار بطاقة طلب (عند عدم وجود جلسة) ============
function OrderPicker() {
  const startTechSession = useLabStore((s) => s.startTechSession);
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" aria-hidden /> اختر بطاقة طلب لبدء جلسة فني
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          {/* (إصلاح U9) العدد من بيانات الأعطال لا نص ثابت — يطابق HomeScreen */}
          {`${FAULTS.length} عطلًا تعليميًا بأربع درجات صعوبة — سيُركّب العطل على الجهاز الافتراضي وستمر بالمراحل التسع حتى تقرير التسليم.`}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FAULTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => startTechSession(f.id)}
              className="flex flex-col items-start gap-1.5 rounded-lg border p-3 text-start transition-colors hover:bg-accent"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{f.id}</span>
                <Badge variant="outline" className="text-[10px]">{f.difficulty}</Badge>
              </div>
              <span className="text-sm font-bold leading-tight">{f.titleAr}</span>
              <span className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{f.complaintAr}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============ الشاشة ============
export default function TechnicianScreen() {
  const tech = useLabStore((s) => s.tech);
  const abandonTechSession = useLabStore((s) => s.abandonTechSession);
  const patchTech = useLabStore((s) => s.patchTech);

  if (!tech) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" aria-hidden /> جلسة الفني — المراحل التسع
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            سير عمل فني حقيقي من بطاقة الطلب حتى تقرير التسليم — لا يمكن تخطي مرحلة، وكل بوابة انتقال تُتحقق آليًا من حالة الجهاز.
          </p>
        </div>
        <OrderPicker />
      </div>
    );
  }

  const stage = tech.stage;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-primary" aria-hidden />
            جلسة فني — {getFault(tech.scenarioId)?.titleAr}
            <Badge variant="outline" className="font-mono">{tech.scenarioId}</Badge>
          </h2>
          <Button size="sm" variant="ghost" onClick={abandonTechSession}>
            إلغاء الجلسة
          </Button>
        </div>
        <StageStepper current={stage} onJump={(s) => patchTech({ stage: s })} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {stage === 1 && <Stage1OrderCard />}
          {stage === 2 && <Stage2Safety />}
          {stage === 3 && <Stage3External />}
          {stage === 4 && <Stage4Internal />}
          {stage === 5 && <Stage5Hypothesis />}
          {stage === 6 && <Stage6Repair />}
          {stage === 7 && <Stage7Verify />}
          {stage === 8 && <Stage8Boot />}
          {stage === 9 && <Stage9Report />}
        </div>
        <div className="min-w-0 space-y-3">
          <GatePanel stage={stage} />
          <Card>
            <CardContent className="p-3 text-[11px] text-muted-foreground leading-relaxed">
              <p className="font-bold text-foreground mb-1 text-xs">{TECH_STAGES[stage - 1].titleAr}</p>
              {TECH_STAGES[stage - 1].briefAr}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs font-bold mb-1.5">المراحل</p>
              <ul className="space-y-1">
                {TECH_STAGES.map((st) => (
                  <li key={st.id} className={cn('text-[11px] flex items-center gap-1.5', st.id === stage ? 'text-foreground font-bold' : st.id < stage ? 'text-emerald-400' : 'text-muted-foreground')}>
                    {st.id < stage ? <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden /> : <CircleDashed className="h-3 w-3 shrink-0" aria-hidden />}
                    {st.id}. {st.titleAr}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
