'use client';

/**
 * CatalogScreen — كتالوج القطع الخمسة عشر: بحث + تصفية بالتصنيف + بطاقات + حوار تفاصيل كاملة.
 * البيانات من COMPONENTS/COMPONENT_MAP فقط، والانتقال للمختبر عبر select + setScreen.
 */

import { useMemo, useState } from 'react';

import {
  BookOpen,
  Boxes,
  CircleAlert,
  CircleDollarSign,
  Info,
  MapPin,
  Search,
  SearchX,
  TriangleAlert,
  Wrench,
  X,
  Zap,
} from 'lucide-react';

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { COMPONENTS, COMPONENT_MAP } from '@/lib/data/catalog';
import { useLabStore } from '@/lib/store/labStore';
import type { ComponentId } from '@/lib/types';
import { cn } from '@/lib/utils';

const ALL_FILTER = 'الكل';

export default function CatalogScreen() {
  const select = useLabStore((s) => s.select);
  const setScreen = useLabStore((s) => s.setScreen);

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(ALL_FILTER);
  const [openId, setOpenId] = useState<ComponentId | null>(null);

  const categories = useMemo(
    () => [ALL_FILTER, ...Array.from(new Set(COMPONENTS.map((c) => c.category)))],
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // البحث يشمل الاسم العربي والإنجليزي والدور والوصف
    return COMPONENTS.filter((c) => activeCategory === ALL_FILTER || c.category === activeCategory)
      .filter((c) => {
        if (q === '') return true;
        return [c.nameAr, c.nameEn, c.role, c.description].some((t) => t.toLowerCase().includes(q));
      });
  }, [query, activeCategory]);

  const entry = openId !== null ? COMPONENT_MAP[openId] : null;

  const openInLab = (id: ComponentId) => {
    select(id);
    setScreen('lab');
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      {/* ===== ترويسة وأدوات البحث ===== */}
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-black md:text-2xl">
          <BookOpen className="size-5 text-sky-500" />
          كتالوج القطع
        </h1>
        <p className="text-sm text-muted-foreground">
          عرض <span dir="ltr" className="font-mono">{filtered.length}</span> من أصل{' '}
          <span dir="ltr" className="font-mono">{COMPONENTS.length}</span> قطعة مرجعية — ابحث
          بالاسم أو الدور أو الوصف، أو صفِّ حسب التصنيف.
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث: اسم القطعة بالعربية أو الإنجليزية، دورها، أو وصفها…"
            className="ps-9"
            aria-label="بحث في الكتالوج"
          />
          {query !== '' && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute end-1 top-1/2 size-7 -translate-y-1/2"
              onClick={() => setQuery('')}
              aria-label="مسح البحث"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="تصفية حسب التصنيف">
          {categories.map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={activeCategory === cat ? 'default' : 'outline'}
              className="rounded-full"
              aria-pressed={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* ===== شبكة البطاقات ===== */}
      {filtered.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="gap-4">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg leading-snug">{c.nameAr}</CardTitle>
                  <Badge variant="secondary" className="shrink-0">
                    {c.category}
                  </Badge>
                </div>
                <CardDescription>
                  <span dir="ltr" className="font-mono text-xs">
                    {c.nameEn} · {c.id}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-relaxed">{c.role}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  {c.powerEstimateW !== undefined && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-sky-500/40 font-normal text-sky-700 dark:text-sky-300"
                    >
                      <Zap className="size-3" />
                      <span dir="ltr">{c.powerEstimateW} W</span>
                      — قيمة توضيحية
                    </Badge>
                  )}
                  {c.priceIllustrativeUsd !== undefined && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-emerald-500/40 font-normal text-emerald-700 dark:text-emerald-300"
                    >
                      <CircleDollarSign className="size-3" />
                      <span dir="ltr">${c.priceIllustrativeUsd}</span>
                      — سعر تعليمي من الكتالوج المرجعي
                    </Badge>
                  )}
                  {c.faults.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Wrench className="size-3" />
                      أعطال محتملة: <span dir="ltr" className="font-mono">{c.faults.length}</span>
                    </span>
                  )}
                  {c.safety.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      <TriangleAlert className="size-3" />
                      تنبيهات سلامة: <span dir="ltr" className="font-mono">{c.safety.length}</span>
                    </span>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenId(c.id)}>
                  <BookOpen className="size-4" />
                  التفاصيل الكاملة
                </Button>
                <Button size="sm" onClick={() => openInLab(c.id)}>
                  <Boxes className="size-4" />
                  اعرض في المختبر
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <SearchX className="size-10 text-muted-foreground" />
            <p className="font-semibold">لا نتائج مطابقة لبحثك</p>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              جرّب كلمة أبسط، أو تحقق من الإملاء، أو اختر تصنيفًا آخر من الشرائح أعلاه.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery('');
                setActiveCategory(ALL_FILTER);
              }}
            >
              <X className="size-4" />
              مسح البحث والتصفية
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== حوار التفاصيل الكاملة ===== */}
      <Dialog open={openId !== null} onOpenChange={(open) => { if (!open) setOpenId(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {entry && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <DialogTitle className="text-lg leading-snug">{entry.nameAr}</DialogTitle>
                  <Badge variant="secondary">{entry.category}</Badge>
                </div>
                <DialogDescription>
                  <span dir="ltr" className="font-mono text-xs">
                    {entry.nameEn} · {entry.id}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                {/* الوصف */}
                <section className="space-y-2">
                  <h4 className="text-sm font-bold">الوصف التعليمي</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {entry.description}
                  </p>
                </section>
                <Separator />

                {/* المواصفات المرجعية */}
                <section className="space-y-2">
                  <h4 className="text-sm font-bold">المواصفات المرجعية</h4>
                  <div className="overflow-hidden rounded-lg border">
                    {Object.entries(entry.referenceSpecs).map(([key, value], i, arr) => (
                      <div
                        key={key}
                        className={cn(
                          'flex items-center justify-between gap-4 px-3 py-2 text-sm',
                          i < arr.length - 1 && 'border-b',
                        )}
                      >
                        <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                          {key}
                        </span>
                        <span className="text-end font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* موضع التثبيت */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-1.5 text-sm font-bold">
                    <MapPin className="size-4 text-sky-500" />
                    موضع التثبيت
                  </h4>
                  <p className="text-sm leading-relaxed">{entry.mountPoint}</p>
                </section>
                <Separator />

                {/* خطوات الفك والتركيب */}
                <section className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 rounded-lg border p-3">
                    <h5 className="text-sm font-bold">خطوات الفك</h5>
                    <ol className="list-decimal space-y-1 ps-5 text-sm leading-relaxed text-muted-foreground">
                      {entry.removeRequirements.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="space-y-2 rounded-lg border p-3">
                    <h5 className="text-sm font-bold">خطوات التركيب</h5>
                    <ol className="list-decimal space-y-1 ps-5 text-sm leading-relaxed text-muted-foreground">
                      {entry.installRequirements.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </section>
                <Separator />

                {/* الأعطال المحتملة */}
                <section className="space-y-2">
                  <h4 className="text-sm font-bold">الأعطال المحتملة</h4>
                  <ul className="space-y-2">
                    {entry.faults.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm leading-relaxed">
                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* تنبيهات السلامة */}
                <section className="space-y-2">
                  <h4 className="text-sm font-bold">تنبيهات السلامة</h4>
                  <ul className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    {entry.safety.map((s) => (
                      <li key={s} className="flex items-start gap-2 text-sm leading-relaxed">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <Separator />

                {/* ملاحظات التوافق */}
                <section className="space-y-2">
                  <h4 className="text-sm font-bold">ملاحظات التوافق</h4>
                  <ul className="space-y-2">
                    {entry.compatibilityNotes.map((note) => (
                      <li key={note} className="flex items-start gap-2 text-sm leading-relaxed">
                        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* المصدر والمراجعة */}
                <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                  {entry.sourceNote} — آخر مراجعة:{' '}
                  <span dir="ltr" className="font-mono">
                    {entry.reviewedAt}
                  </span>
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
