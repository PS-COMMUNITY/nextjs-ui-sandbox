'use client';

/**
 * شاشة المختبر ثلاثي الأبعاد — المشهد التفاعلي + لوحة المعلومات وأدوات التحكم.
 * آلة الحالات الكاملة: مثبتة/فصل جزئي/صينية/بانتظار/تلف تدريبي + طرفيات تفاعلية.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  DoorOpen,
  DoorClosed,
  X,
  Bomb,
  Focus,
  EyeOff,
  RotateCcw,
  Power,
  PlugZap,
  Plug,
  Wrench,
  Hammer,
  ShieldAlert,
  TriangleAlert,
  CheckCircle2,
  CircleDashed,
  Wind,
  MonitorUp,
  MonitorX,
  PackageOpen,
  HandMetal,
} from 'lucide-react';
import { isWebGLAvailable, PCScene } from '@/lib/scene/PCScene';
import type { ComponentId, ChecklistItem, MachineFlag, PartStatus } from '@/lib/types';
import { assemblyStateOf, ASSEMBLY_STATE_INFO, SECURE_FLAGS } from '@/lib/types';
import { COMPONENT_MAP } from '@/lib/data/catalog';
import {
  getRemovalChecklist,
  getInstallChecklist,
} from '@/lib/simulation/assemblyEngine';
import { FLAG_INFO } from '@/lib/simulation/machineFlags';
import { installedCount, useLabStore } from '@/lib/store/labStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

// ============ شارة الحالة (آلة الحالات الثمانية) ============
function StatusBadge({ id }: { id: ComponentId }) {
  const sim = useLabStore((s) => s.sim);
  if (id === 'case') {
    return <Badge variant="outline" className="gap-1">هيكل الجهاز</Badge>;
  }
  const secureOpen = (SECURE_FLAGS[id] ?? []).some((f) => sim.flags[f]);
  const state = assemblyStateOf(sim.parts[id], secureOpen);
  const info = ASSEMBLY_STATE_INFO[state];
  const colorClass: Record<string, string> = {
    emerald: 'bg-emerald-600/15 text-emerald-400 border-emerald-600/40',
    amber: 'bg-amber-600/15 text-amber-400 border-amber-600/40',
    slate: 'bg-slate-600/15 text-slate-300 border-slate-600/40',
    cyan: 'bg-cyan-600/15 text-cyan-400 border-cyan-600/40',
    rose: 'bg-rose-600/15 text-rose-400 border-rose-600/40',
  };
  const icon =
    state === 'INSTALLED_CORRECTLY' ? <CheckCircle2 className="h-3 w-3" aria-hidden /> :
    state === 'AWAITING_INSTALL' ? <HandMetal className="h-3 w-3" aria-hidden /> :
    state === 'TRAINING_DAMAGE' ? <TriangleAlert className="h-3 w-3" aria-hidden /> :
    <Wrench className="h-3 w-3" aria-hidden />;
  return (
    <Badge variant="outline" className={cn('gap-1', colorClass[info.colorAr] ?? '')}>
      {icon}
      {state === 'INSTALLED_CORRECTLY' ? 'مثبتة بإحكام' : state === 'INSTALLED_SECURED' ? 'مثبتة (مزالج مفتوحة)' : info.labelAr}
    </Badge>
  );
}

/** خطوة قائمة تحقق قابلة للتنفيذ (علم ميكانيكي أو فك/تركيب قطعة) */
function ChecklistRow({
  item,
  mode,
  onFlag,
  onPart,
}: {
  item: ChecklistItem;
  mode: 'remove' | 'install';
  onFlag: (f: MachineFlag) => void;
  onPart: (id: ComponentId) => void;
}) {
  const isFlag = item.source !== 'safetyOff' && item.source !== 'safetyUnplug' && item.source !== 'base';
  const canRunFlag = !item.done && isFlag && item.available;
  const canRunPart = !item.done && !isFlag && item.actionPart && item.available;
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs',
        item.done ? 'border-emerald-600/30 bg-emerald-600/10' : 'border-border bg-card',
        !item.done && !item.available && 'opacity-60',
      )}
    >
      {item.done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
      ) : (
        <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium leading-tight', item.done && 'line-through opacity-70')}>{item.labelAr}</p>
        {!item.done && item.hintAr ? (
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{item.hintAr}</p>
        ) : null}
      </div>
      {canRunFlag ? (
        <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-[11px] shrink-0" onClick={() => onFlag(item.source as MachineFlag)}>
          <Hammer className="h-3 w-3" aria-hidden /> نفّذ
        </Button>
      ) : null}
      {canRunPart ? (
        <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-[11px] shrink-0" onClick={() => onPart(item.actionPart!)}>
          <Hammer className="h-3 w-3" aria-hidden />
          {mode === 'remove' ? 'افصل' : 'وصّل'}
        </Button>
      ) : null}
    </li>
  );
}

function InfoPanel() {
  const selected = useLabStore((s) => s.selected);
  const select = useLabStore((s) => s.select);
  const sim = useLabStore((s) => s.sim);
  const detachPart = useLabStore((s) => s.detachPart);
  const extractPart = useLabStore((s) => s.extractPart);
  const preparePart = useLabStore((s) => s.preparePart);
  const installPart = useLabStore((s) => s.installPart);
  const repairPart = useLabStore((s) => s.repairPart);
  const toggleFlag = useLabStore((s) => s.toggleFlag);
  const setIsolated = useLabStore((s) => s.setIsolated);
  const isolated = useLabStore((s) => s.isolated);

  if (!selected) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground mb-1">حدّد قطعة من المشهد</p>
          <p>انقر على أي قطعة داخل الجهاز لعرض معلوماتها وحالتها وخطوات فكها أو تركيبها. انقر زر الشاشة لتشغيلها، ومفاتيح لوحة المفاتيح للكتابة داخل النظام الافتراضي.</p>
          <p className="mt-1">تدوير: سحب بالزر الأيسر — تقريب: العجلة — تحريك: الزر الأيمن.</p>
        </CardContent>
      </Card>
    );
  }

  const entry = COMPONENT_MAP[selected];
  const status: PartStatus = sim.parts[selected];
  const removable = selected !== 'case';
  const removalItems = removable ? getRemovalChecklist(sim, selected) : [];
  const installItems = removable ? getInstallChecklist(sim, selected) : [];

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base leading-tight">{entry.nameAr}</CardTitle>
            <p dir="ltr" className="text-left font-mono text-[11px] text-muted-foreground mt-0.5">
              {entry.nameEn} · {entry.id}
            </p>
          </div>
          <StatusBadge id={selected} />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">{entry.description}</p>

        {/* أزرار آلة الحالات */}
        {removable ? (
          <div className="flex flex-wrap gap-2">
            {status === 'installed' ? (
              <Button size="sm" className="gap-1.5" onClick={() => detachPart(selected)}>
                <Hammer className="h-3.5 w-3.5" aria-hidden /> فصل جزئي (فك)
              </Button>
            ) : null}
            {status === 'separated' ? (
              <Button size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700" onClick={() => extractPart(selected)}>
                <PackageOpen className="h-3.5 w-3.5" aria-hidden /> استخراج إلى الصينية
              </Button>
            ) : null}
            {status === 'removed' ? (
              <Button size="sm" className="gap-1.5 bg-cyan-700 hover:bg-cyan-600" onClick={() => preparePart(selected)}>
                <HandMetal className="h-3.5 w-3.5" aria-hidden /> التقاط للتركيب
              </Button>
            ) : null}
            {status === 'awaiting' ? (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => installPart(selected)}>
                <Wrench className="h-3.5 w-3.5" aria-hidden /> ركّب الآن
              </Button>
            ) : null}
            {status === 'damaged' ? (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => repairPart(selected)}>
                <Wrench className="h-3.5 w-3.5" aria-hidden /> استبدال بقطعة سليمة
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setIsolated(isolated === selected ? null : selected)}
            >
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
              {isolated === selected ? 'إلغاء العزل' : 'عزل للفحص'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">الهيكل هو جسم الجهاز — استخدم أزرار السلامة أعلاه لفتح الغطاء الجانبي أو إغلاقه.</p>
        )}

        <Separator />

        {/* قائمة تحقق الفك */}
        {removable && status === 'installed' ? (
          <div>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-500" aria-hidden /> شروط الفك بالترتيب
            </p>
            <ul className="space-y-1.5">
              {removalItems.map((item) => (
                <ChecklistRow key={item.source + item.labelAr} item={item} mode="remove" onFlag={toggleFlag} onPart={detachPart} />
              ))}
            </ul>
          </div>
        ) : null}

        {/* قائمة تحقق التركيب */}
        {removable && (status === 'awaiting' || status === 'removed') ? (
          <div>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> شروط إعادة التركيب
            </p>
            <ul className="space-y-1.5">
              {installItems.map((item) => (
                <ChecklistRow key={item.source + item.labelAr} item={item} mode="install" onFlag={toggleFlag} onPart={installPart} />
              ))}
            </ul>
          </div>
        ) : null}

        {/* خطوات الإغلاق بعد التركيب */}
        {removable && status === 'installed' && (SECURE_FLAGS[selected] ?? []).some((f) => sim.flags[f]) ? (
          <div>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
              <Hammer className="h-3.5 w-3.5 text-primary" aria-hidden /> أكمل التثبيت (خطوات متبقية)
            </p>
            <ul className="space-y-1.5">
              {(SECURE_FLAGS[selected] ?? [])
                .filter((f) => sim.flags[f])
                .map((f) => (
                  <li key={f} className="flex items-center gap-2 rounded-md border border-amber-600/30 bg-amber-600/10 px-2.5 py-2 text-xs">
                    <CircleDashed className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-tight">{FLAG_INFO[f].labelAr} — ما زال مفتوحًا</p>
                      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{FLAG_INFO[f].hintAr}</p>
                    </div>
                    <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-[11px] shrink-0" onClick={() => toggleFlag(f)}>
                      <Hammer className="h-3 w-3" aria-hidden /> أغلق
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {/* السلامة */}
        {entry.safety.length > 0 ? (
          <div className="rounded-md border border-amber-600/30 bg-amber-600/10 p-2.5">
            <p className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> تنبيهات السلامة
            </p>
            <ul className="text-[11px] leading-relaxed text-amber-200/80 list-disc ps-4 space-y-0.5">
              {entry.safety.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          type="button"
          className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => select(null)}
        >
          إلغاء التحديد
        </button>
      </CardContent>
    </Card>
  );
}

// ============ لوحة السلامة السريعة ============
function SafetyStrip() {
  const sim = useLabStore((s) => s.sim);
  const toggleFlag = useLabStore((s) => s.toggleFlag);
  const count = installedCount(sim);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={sim.flags.powerOn ? 'destructive' : 'outline'}
        className={cn('gap-1.5', !sim.flags.powerOn && 'border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/10')}
        onClick={() => toggleFlag('powerOn')}
      >
        <Power className="h-3.5 w-3.5" aria-hidden />
        {sim.flags.powerOn ? 'إطفاء الجهاز' : 'تشغيل الجهاز'}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={cn('gap-1.5', sim.flags.acConnected ? 'border-amber-600/40 text-amber-400' : 'border-emerald-600/40 text-emerald-400')}
        onClick={() => toggleFlag('acConnected')}
      >
        {sim.flags.acConnected ? <PlugZap className="h-3.5 w-3.5" aria-hidden /> : <Plug className="h-3.5 w-3.5" aria-hidden />}
        {sim.flags.acConnected ? 'فصل كابل الكهرباء' : 'توصيل كابل الكهرباء'}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => toggleFlag('panelOpen')}
      >
        {sim.flags.panelOpen ? <DoorClosed className="h-3.5 w-3.5" aria-hidden /> : <DoorOpen className="h-3.5 w-3.5" aria-hidden />}
        {sim.flags.panelOpen ? 'إغلاق الغطاء' : 'فتح الغطاء'}
      </Button>
      <Badge variant="outline" className="font-mono" dir="ltr">
        {count}/14
      </Badge>
    </div>
  );
}

// ============ الوضع البديل التعليمي عند غياب WebGL ============
function FallbackView({ messageAr }: { messageAr: string }) {
  const setScreen = useLabStore((s) => s.setScreen);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-600/40 bg-amber-600/10 p-4">
        <p className="font-bold text-amber-400 flex items-center gap-2">
          <TriangleAlert className="h-4 w-4" aria-hidden /> المشهد ثلاثي الأبعاد غير متاح
        </p>
        <p className="text-sm text-amber-200/80 mt-1 leading-relaxed">{messageAr}</p>
        <p className="text-xs text-muted-foreground mt-1">
          ما يلي عرض تعليمي مبسط نصي — وليس محاكاة ثلاثية الأبعاد.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(COMPONENT_MAP).map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4">
              <p className="font-bold text-sm">{c.nameAr}</p>
              <p dir="ltr" className="text-left font-mono text-[10px] text-muted-foreground">{c.nameEn}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-3">{c.role}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button variant="outline" onClick={() => setScreen('catalog')}>
        الانتقال إلى كتالوج القطع الكامل
      </Button>
    </div>
  );
}

// ============ الشاشة الرئيسية للمختبر ============
export default function LabScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PCScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [errorAr, setErrorAr] = useState<string>('');

  const sim = useLabStore((s) => s.sim);
  const selected = useLabStore((s) => s.selected);
  const xray = useLabStore((s) => s.xray);
  const exploded = useLabStore((s) => s.exploded);
  const isolated = useLabStore((s) => s.isolated);
  const quality = useLabStore((s) => s.quality);
  const sidePanelsHidden = useLabStore((s) => s.sidePanelsHidden);
  const bootStartedAt = useLabStore((s) => s.bootStartedAt);
  const notepad = useLabStore((s) => s.notepad);
  const airflowVisible = useLabStore((s) => s.airflowVisible);
  const toggleXray = useLabStore((s) => s.toggleXray);
  const toggleExploded = useLabStore((s) => s.toggleExploded);
  const setIsolated = useLabStore((s) => s.setIsolated);
  const setAirflow = useLabStore((s) => s.setAirflow);
  const resetSimulation = useLabStore((s) => s.resetSimulation);
  const select = useLabStore((s) => s.select);
  const damagePart = useLabStore((s) => s.damagePart);

  // إنشاء المشهد مرة واحدة — كل حالات الفشل تمر عبر callback واحد
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fail = (message: string) => {
      setFailed(true);
      setErrorAr(message);
    };
    const callbacks = {
      onSelect: (id: ComponentId | null) => useLabStore.getState().select(id),
      onPeripheral: (kind: string, detail?: string) => {
        const store = useLabStore.getState();
        if (kind === 'monitor-power') store.toggleMonitor();
        else if (kind === 'monitor') store.toggleMonitor();
        else if (kind === 'keyboard' && detail) store.typeKey(detail);
        else if (kind === 'mouse') {
          // الفأرة قطعة عرض تعليمية — الإدخال الحقيقي عبر واجهة المتصفح
        }
      },
      onError: fail,
    };
    let scene: PCScene | null = null;
    if (!isWebGLAvailable()) {
      queueMicrotask(() => fail('متصفحك لا يدعم WebGL — لن يمكن عرض المشهد ثلاثي الأبعاد. استخدم متصفحًا حديثًا أو فعّل تسريع العتاد.'));
      return;
    }
    try {
      scene = new PCScene({ container: el, quality, callbacks });
      sceneRef.current = scene;
      const st = useLabStore.getState();
      scene.syncState(st.sim);
      scene.setXray(st.xray);
      scene.setExploded(st.exploded);
      scene.setAirflow(st.airflowVisible);
      scene.setBootClock(st.bootStartedAt);
      scene.setNotepad(st.notepad);
      // خطاف فحص تطويري فقط (غير مستخدم في الإنتاج الوظيفي)
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__pcrs = { scene };
      }
    } catch {
      queueMicrotask(() => fail('تعذر إنشاء المشهد ثلاثي الأبعاد — قد تكون موارد الجهاز منخفضة.'));
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // مزامنة الحالة مع المشهد
  useEffect(() => {
    sceneRef.current?.setQuality(quality);
  }, [quality]);
  useEffect(() => {
    sceneRef.current?.setXray(xray);
  }, [xray]);
  useEffect(() => {
    sceneRef.current?.setExploded(exploded);
  }, [exploded]);
  useEffect(() => {
    sceneRef.current?.highlight(selected);
  }, [selected]);
  useEffect(() => {
    sceneRef.current?.isolate(isolated);
  }, [isolated]);
  useEffect(() => {
    sceneRef.current?.syncState(sim);
  }, [sim]);
  useEffect(() => {
    sceneRef.current?.setBootClock(bootStartedAt);
  }, [bootStartedAt]);
  useEffect(() => {
    sceneRef.current?.setNotepad(notepad);
  }, [notepad]);
  useEffect(() => {
    sceneRef.current?.setAirflow(airflowVisible);
  }, [airflowVisible]);

  const resetCamera = useCallback(() => sceneRef.current?.resetCamera(), []);
  const focusSelected = useCallback(() => {
    if (selected) sceneRef.current?.focusComponent(selected);
  }, [selected]);
  const gotoMonitor = useCallback(() => sceneRef.current?.focusMonitor(), []);

  if (failed) {
    return <FallbackView messageAr={errorAr} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* شريط أدوات المشهد */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={resetCamera}>
          <Camera className="h-3.5 w-3.5" aria-hidden /> إعادة ضبط الكاميرا
        </Button>
        <Button size="sm" variant={xray ? 'default' : 'outline'} className="gap-1.5" onClick={toggleXray}>
          <X className={cn('h-3.5 w-3.5', !xray && 'opacity-60')} aria-hidden /> الأشعة السينية {xray ? '(مفعّلة)' : ''}
        </Button>
        <Button size="sm" variant={exploded ? 'default' : 'outline'} className="gap-1.5" onClick={toggleExploded}>
          <Bomb className="h-3.5 w-3.5" aria-hidden /> العرض التفجيري {exploded ? '(مفعّل)' : ''}
        </Button>
        <Button
          size="sm"
          variant={airflowVisible ? 'default' : 'outline'}
          className="gap-1.5"
          onClick={() => setAirflow(!airflowVisible)}
          title="أسهم تدفق الهواء داخل الهيكل"
        >
          <Wind className="h-3.5 w-3.5" aria-hidden /> اتجاه الهواء
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={gotoMonitor} title="الانتقال إلى الشاشة الافتراضية">
          <MonitorUp className="h-3.5 w-3.5" aria-hidden /> الشاشة
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={!selected || selected === 'case'}
          onClick={focusSelected}
          title="تقريب الكاميرا نحو القطعة المحددة"
        >
          <Focus className="h-3.5 w-3.5" aria-hidden /> توجيه للقطعة
        </Button>
        {selected && selected !== 'case' && sim.parts[selected] !== 'damaged' ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 text-rose-400 border-rose-600/40 hover:bg-rose-600/10">
                <MonitorX className="h-3.5 w-3.5" aria-hidden /> تلف تدريبي
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>إحداث تلف تدريبي مقصود؟</AlertDialogTitle>
                <AlertDialogDescription>
                  وضع الاستكشاف: ستتلوّن القطعة بالأحمر وتُعتبر تالفة في التشخيص (TRAINING_DAMAGE). يمكنك استبدالها بقطعة سليمة من المخزن التعليمي في أي وقت.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => damagePart(selected)}>تأكيد التلف التدريبي</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        {isolated ? (
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setIsolated(null)}>
            <EyeOff className="h-3.5 w-3.5" aria-hidden /> إلغاء العزل
          </Button>
        ) : null}
        <Button
          size="sm"
          variant={sidePanelsHidden ? 'default' : 'ghost'}
          className="gap-1.5 ms-auto"
          onClick={() => useLabStore.getState().setSidePanelsHidden(!sidePanelsHidden)}
        >
          {sidePanelsHidden ? 'إظهار لوحة المعلومات' : 'إخفاء لوحة المعلومات'}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5 text-rose-400 border-rose-600/40 hover:bg-rose-600/10">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> إعادة تهيئة الجهاز
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>إعادة تهيئة الجهاز الافتراضي؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيُعاد كل شيء إلى الحالة الافتراضية (كل القطع مثبتة، الجهاز مطفأ). سجل الجلسات لن يُمس.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={resetSimulation}>تأكيد الإعادة</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* المشهد + اللوحة */}
      <div className={cn('grid gap-4', sidePanelsHidden ? '' : 'lg:grid-cols-[1fr_380px]')}>
        <div className="space-y-3 min-w-0">
          <SafetyStrip />
          <div
            ref={containerRef}
            dir="ltr"
            className="relative h-[52vh] min-h-[380px] lg:h-[calc(100vh-300px)] lg:min-h-[480px] w-full overflow-hidden rounded-xl border bg-[#0d1218]"
            role="application"
            aria-label="المشهد ثلاثي الأبعاد للجهاز — اسحب للتدوير، واضغط على قطعة لتحديدها، وزر الشاشة لتشغيلها، ومفاتيح لوحة المفاتيح للكتابة"
          />
          <p className="text-[11px] text-muted-foreground">
            الجهاز المرجعي: هيكل Mid-Tower + لوحة ATX (مقبس LGA1700 / ذاكرة DDR5) — انقر زر الشاشة لتشغيلها، ومفاتيح لوحة المفاتيح ثلاثية الأبعاد تكتب داخل النظام الافتراضي.
          </p>
        </div>
        {!sidePanelsHidden ? (
          <div className="min-w-0">
            <ScrollArea className="h-fit max-h-[calc(100vh-240px)] scrollbar-thin">
              <InfoPanel />
            </ScrollArea>
          </div>
        ) : null}
      </div>
    </div>
  );
}
