'use client';

/**
 * SettingsScreen — الإعدادات: الرسوميات، المظهر (next-themes)، النسخ الاحتياطي
 * (تصدير/استيراد JSON عبر exportService)، منطقة الخطر، الاختصارات، وحول التطبيق.
 * لا يلمس هذه الشاشة عقود المحاكاة — كل الأفعال عبر useLabStore.
 */

import { useEffect, useRef, useState } from 'react';

import {
  Database,
  Download,
  Hand,
  Info,
  Keyboard,
  Maximize,
  Monitor,
  Moon,
  Mouse,
  MousePointerClick,
  Move3d,
  Settings2,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { downloadJson, readTextFile } from '@/lib/services/exportService';
import { useLabStore, type GraphicsQuality } from '@/lib/store/labStore';
import { APP_VERSION, CATALOG_VERSION } from '@/lib/types';

const QUALITY_DESC: Record<GraphicsQuality, string> = {
  low: 'منخفض: إيقاف الظلال وتخفيض دقة العرض — أسرع خيار للأجهزة الضعيفة.',
  medium: 'متوسط: ظلال مبسطة ودقة متوازنة — الإعداد الافتراضي المناسب لمعظم الأجهزة.',
  high: 'مرتفع: ظلال كاملة وأعلى دقة وإضاءة أدق — يحتاج بطاقة رسوميات جيدة.',
};

const SHORTCUTS: { icon: typeof Mouse; actionAr: string; resultAr: string }[] = [
  { icon: MousePointerClick, actionAr: 'النقر على قطعة', resultAr: 'تحديدها' },
  { icon: Hand, actionAr: 'السحب', resultAr: 'تدوير الكاميرا' },
  { icon: Mouse, actionAr: 'العجلة', resultAr: 'تقريب/إبعاد' },
  { icon: Move3d, actionAr: 'الزر الأيمن سحب', resultAr: 'تحريك' },
  { icon: Maximize, actionAr: 'دبل-كليك', resultAr: 'إعادة الكاميرا' },
];

// (إضافة تدقيق V6) اختصارات لوحة المفاتيح — كانت غائبة من هذه الشاشة
const KEY_SHORTCUTS: { key: string; resultAr: string }[] = [
  { key: 'R', resultAr: 'إعادة ضبط الكاميرا' },
  { key: 'F', resultAr: 'تركيز على القطعة المحددة' },
  { key: 'X', resultAr: 'الأشعة السينية' },
  { key: 'E', resultAr: 'العرض التفجيري' },
  { key: 'H', resultAr: 'تلميحات التحكم' },
  { key: 'M', resultAr: 'وضع التحكم بالشاشة المجسمة' },
  { key: '1 / 2 / 3', resultAr: 'مناظير أمامي/جانبي/علوي' },
  { key: 'Delete', resultAr: 'الدخول إلى إعدادات UEFI/BIOS' },
  { key: 'Esc', resultAr: 'إلغاء التحديد/العزل — والخروج من وضع الشاشة' },
];

export default function SettingsScreen() {
  const quality = useLabStore((s) => s.quality);
  const setQuality = useLabStore((s) => s.setQuality);
  const sim = useLabStore((s) => s.sim);
  const logs = useLabStore((s) => s.logs);
  const quizScores = useLabStore((s) => s.quizScores);
  const missionsDone = useLabStore((s) => s.missionsDone);
  const lessonsRead = useLabStore((s) => s.lessonsRead);
  const logEvent = useLabStore((s) => s.logEvent);
  const resetTrainingData = useLabStore((s) => s.resetTrainingData);
  const resetEverything = useLabStore((s) => s.resetEverything);
  const importBackupFromJson = useLabStore((s) => s.importBackupFromJson);

  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  // ===== تصدير نسخة JSON =====
  const handleExport = () => {
    try {
      const obj = {
        version: APP_VERSION,
        simulation: sim,
        logs,
        quizScores,
        missionsDone,
        lessonsRead,
        settings: { quality },
        savedAt: Date.now(),
      };
      downloadJson(obj, 'pcrs-backup.json');
      logEvent('export', 'تصدير نسخة احتياطية JSON', true);
      toast.success('صُدِّرت النسخة الاحتياطية — تحقق من مجلد التنزيلات');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل تصدير النسخة الاحتياطية');
    }
  };

  // ===== استيراد نسخة =====
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await readTextFile(file);
      importBackupFromJson(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر قراءة ملف النسخة الاحتياطية');
    } finally {
      event.target.value = ''; // يسمح بإعادة اختيار نفس الملف لاحقًا
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-black md:text-2xl">
          <Settings2 className="size-5 text-sky-500" />
          الإعدادات
        </h1>
        <p className="text-sm text-muted-foreground">
          اضبط الرسوميات والمظهر وأدر بياناتك المحلية — كل التغييرات تُحفظ تلقائيًا.
        </p>
      </div>

      {/* ===== 1) الرسوميات ===== */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="size-4 text-sky-500" />
            الرسوميات
          </CardTitle>
          <CardDescription>جودة عرض المشهد ثلاثي الأبعاد في المختبر.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="quality-select">جودة المشهد</Label>
          <Select
            value={quality}
            onValueChange={(v) => setQuality(v as GraphicsQuality)}
          >
            <SelectTrigger id="quality-select" className="w-56">
              <SelectValue placeholder="اختر الجودة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">منخفض</SelectItem>
              <SelectItem value="medium">متوسط</SelectItem>
              <SelectItem value="high">مرتفع</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm leading-relaxed text-muted-foreground">{QUALITY_DESC[quality]}</p>
        </CardContent>
      </Card>

      {/* ===== 2) المظهر ===== */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {isDark ? (
              <Moon className="size-4 text-sky-500" />
            ) : (
              <Sun className="size-4 text-sky-500" />
            )}
            المظهر
          </CardTitle>
          <CardDescription>التبديل بين الوضع الداكن والفاتح للواجهة.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="theme-switch">الوضع الداكن</Label>
              <p className="text-xs text-muted-foreground">
                {isDark ? 'الواجهة حاليًا داكنة.' : 'الواجهة حاليًا فاتحة.'}
              </p>
            </div>
            <Switch
              id="theme-switch"
              checked={isDark}
              disabled={!mounted}
              onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
            />
          </div>
        </CardContent>
      </Card>

      {/* ===== 3) النسخ الاحتياطي ===== */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4 text-sky-500" />
            النسخ الاحتياطي
          </CardTitle>
          <CardDescription>
            صدّر كل بيانات جلستك (حالة الجهاز، السجل، الدرجات، المهام، الدروس) في ملف JSON واحد
            وأعدها لاحقًا أو على جهاز آخر.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={handleExport}>
            <Download className="size-4" />
            تصدير نسخة JSON
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4" />
            استيراد نسخة
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
            aria-label="اختر ملف النسخة الاحتياطية"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            الاستيراد يستبدل البيانات الحالية بمحتوى الملف بعد التحقق من صحته.
          </p>
        </CardContent>
      </Card>

      {/* ===== 4) منطقة الخطر ===== */}
      <Card className="gap-4 border-rose-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-rose-700 dark:text-rose-400">
            <TriangleAlert className="size-4" />
            منطقة الخطر
          </CardTitle>
          <CardDescription>
            عمليات لا يمكن التراجع عنها — اقرأ التحذير قبل التأكيد.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {/* مسح سجل التدريب */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
              >
                <Trash2 className="size-4" />
                مسح سجل التدريب
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>مسح سجل التدريب؟</AlertDialogTitle>
                <AlertDialogDescription>
                  سيُمسح سجل الأحداث ودرجات الاختبارات والمهام المكتملة والدروس المقروءة. حالة
                  الجهاز في المختبر لن تتأثر. لا يمكن التراجع عن هذه العملية.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={resetTrainingData}
                  className="bg-amber-500 text-black hover:bg-amber-600"
                >
                  نعم، امسح السجل
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* حذف كل البيانات */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="size-4" />
                حذف كل البيانات وإعادة التهيئة
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-rose-700 dark:text-rose-400">
                  تحذير: حذف كل البيانات المحلية
                </AlertDialogTitle>
                <AlertDialogDescription>
                  سيُحذف كل شيء نهائيًا: حالة الجهاز الافتراضي، سجل الأحداث، درجات الاختبارات،
                  المهام المكتملة، الدروس المقروءة، والإعدادات — ثم يُعاد التطبيق إلى حالته الأولى
                  كأنه أول تشغيل. صدّر نسخة احتياطية أولًا إن أردت الاحتفاظ ببياناتك. لا يمكن
                  التراجع إطلاقًا.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={resetEverything}
                  className="bg-rose-600 text-white hover:bg-rose-700"
                >
                  نعم، احذف كل شيء
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* ===== 5) الاختصارات والمساعدة ===== */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-4 text-sky-500" />
            الاختصارات والمساعدة
          </CardTitle>
          <CardDescription>التحكم بالمؤشر داخل المشهد ثلاثي الأبعاد.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {SHORTCUTS.map(({ icon: Icon, actionAr, resultAr }) => (
              <li
                key={actionAr}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{actionAr}</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-muted-foreground">{resultAr}</span>
              </li>
            ))}
          </ul>
          <Separator className="my-4" />
          <p className="mb-2 text-sm font-medium">اختصارات لوحة المفاتيح الحقيقية</p>
          <ul className="space-y-2">
            {KEY_SHORTCUTS.map(({ key, resultAr }) => (
              <li
                key={key}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <kbd dir="ltr" className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{key}</kbd>
                <span className="text-muted-foreground">{resultAr}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
            الاختصارات لا تعمل أثناء الكتابة في حقول النص، وفي وضع التحكم بالشاشة تُوجّه كل المفاتيح إلى النظام الافتراضي.
          </p>
        </CardContent>
      </Card>

      {/* ===== 6) حول التطبيق ===== */}
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="size-4 text-sky-500" />
            حول التطبيق
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">إصدار التطبيق</span>
              <Badge variant="outline">
                <span dir="ltr" className="font-mono">
                  {APP_VERSION}
                </span>
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">إصدار الكتالوج</span>
              <Badge variant="outline">
                <span dir="ltr" className="font-mono">
                  {CATALOG_VERSION}
                </span>
              </Badge>
            </div>
          </div>
          <Separator />
          <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
            <Database className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              تُحفظ بياناتك محليًا في متصفحك فقط (localStorage) ولا تُرسل إلى أي خدمة خارجية —
              مسح بيانات المتصفح يحذف تقدمك.
            </span>
          </p>
          <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              لمعرفة تراخيص المكتبات المستخدمة (Three.js وغيرها) راجع ملف التراخيص في مجلد
              الوثائق الخاص بالمشروع.
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
