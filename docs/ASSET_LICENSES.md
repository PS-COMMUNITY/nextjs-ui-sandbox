# تراخيص الأصول — PC Repair 3D Studio v4.0.0 (مراجعة v4)

جرد كامل وصادق للأصول المستخدمة في المشروع ومصدرها وترخيصها.

**بعد مراجعة v4:** أُضيف 4 أصول خارجية جديدة منزّلة فعليًا من Poly Haven برخصة CC0
(مصباح مكتب + صندوق عدة + طقم مفكات + كماشات) لتصبح حصيلة الأصول الحقيقية **6 أصول CC0**،
والبقية إجرائية/برمجية كما هو مفصل أدناه.

## جدول الأصول

| الأصل | المصدر | الترخيص | ملاحظة |
|---|---|---|---|
| **مسح لوحة دوائر `circuit_board`** (أساس اللوحة الأم PCB — glTF 1K بخامات Diffuse/Normal/ARM) | Poly Haven — polyhaven.com/a/circuit_board — المؤلف: Benny Weimer | **CC0 / Public Domain** (موثّق من polyhaven.com/license) | ملفات محلية تحت `public/models/circuit-board/` — لا اعتماد على روابط خارجية وقت التشغيل |
| **مفك `screwdriver`** (أداة تدريب على سجادة القطع) | Poly Haven — polyhaven.com/a/screwdriver — المؤلف: PierreB3D | **CC0 / Public Domain** | ملفات محلية تحت `public/models/screwdriver/` |
| **مصباح مكتب `desk_lamp_arm_01`** (إضاءة مكتب واقعية + ضوء نقطي دافئ فوق المكتب) | Poly Haven — polyhaven.com/a/desk_lamp_arm_01 — المؤلفان: Yann Kervran وKuutti Siitonen | **CC0 / Public Domain** (تحقق v4 عبر api.polyhaven.com/info) | glTF 1K + bin + 3 خرائط — محلي تحت `public/models/desk_lamp_arm_01/` — موضع بعيد عن جسم الجهاز كي لا يحجب النقر |
| **صندوق عدة معدني `metal_tool_chest`** (زينة الورشة تحت المكتب) | Poly Haven — polyhaven.com/a/metal_tool_chest — المؤلفان: Yann Kervran وJohn Hutcheson | **CC0 / Public Domain** | محلي تحت `public/models/metal_tool_chest/` |
| **طقم مفكات `screwdrivers_02`** (أدوات حقيقية على سجادة القطع — 3 مفكات منفصلة) | Poly Haven — polyhaven.com/a/screwdrivers_02 — المؤلف: BKS | **CC0 / Public Domain** | محلي تحت `public/models/screwdrivers_02/` |
| **كماشات `pliers`** (أداة حقيقية على السجادة — 3 مجسمات منفصلة: فكان ودبوس) | Poly Haven — polyhaven.com/a/pliers — المؤلف: PierreB3D | **CC0 / Public Domain** | محلي تحت `public/models/pliers/` |
| المجسمات الإجرائية المتبقية (14 مكوّنًا تفاعليًا + هيكل الحوض المبثوق + الواجهة + مكتب الورشة + الجدار + الأرفف + المشترك) | كود المشروع — `src/lib/scene/partsFactory.ts` و`PCScene.ts` و`layout.ts` | جزء من المشروع (لا ترخيص خارجي) | هيكل الحوض ExtrudeGeometry من مقطع C حقيقي بسماكة جدران؛ مراجع الرفض موثقة في `ASSET_CANDIDATES.md` |
| أيقونات الواجهة | مكتبة `lucide-react` (^0.525.0) | ISC | أيقونات SVG عبر npm |
| محرك الرسم ثلاثي الأبعاد | `three` (^0.186.1) | MIT | مع أنواعه `@types/three` (MIT) |
| الإطار والتشغيل | `next` (^16.1.1) | MIT | App Router |
| مكتبة الواجهة | `react` / `react-dom` (^19.0.0) | MIT | |
| تنسيق الواجهة | `tailwindcss` (^4) | MIT | مع `tailwind-merge` (MIT) و`tailwindcss-animate` (MIT) |
| مكوّنات UI الجاهزة | `shadcn/ui` (ملفات `src/components/ui/*`) | MIT | مبنية فوق Radix UI (`@radix-ui/react-*` — تراخيص MIT) |
| إدارة الحالة | `zustand` (^5.0.6) | MIT | المتجر المركزي |
| الإشعارات | `sonner` (^2.0.6) | MIT | التوستات |
| خط العرض الأساسي | خط **Tajawal** من Google Fonts | OFL (SIL Open Font License) | يُحمَّل من CDN وقت العرض عبر `<link>` في `layout.tsx` — ليس مضمّنًا في المستودع |
| خطوط بديلة | خطوط النظام (system-ui stack) | تراخيص أنظمتها | البديل الآمن دون إنترنت — اختُبر عمل التطبيق كاملًا معها |

## تفصيل أصول Poly Haven (CC0)

- **CC0 = إهداء للملكية العامة:** يسمح بالاستخدام والتعديل وإعادة التوزيع التجاري وغير التجاري **دون أي إلزام إسناد**. الإسناد أعلاه تطوعي امتثالًا لروح §3.3 وتوثيقًا للمصدر.
- صفحة الترخيص المفحوصة: `https://polyhaven.com/license` («CC0 means absolute freedom»).
- **ملاحظة تحقق v4 صادقة:** واجهة `api.polyhaven.com/info` لم تعد تُعيد حقل `license` صراحةً؛
  اعتمد التحقق على بيان المؤلفين من API نفسه + إفادة Poly Haven الدائمة بأن كل أصول الموقع CC0
  (صفحة الترخيص أعلاه) + تحقق md5 وأحجام الملفات عند التنزيل لكل ملف.
- تاريخ الوصول: نوفمبر 2025 — عبر `api.polyhaven.com` و`dl.polyhaven.org`.
- لا يشترط CC0 إسنادًا داخل شاشة «حول» — المرجع الدائم هو هذا الملف و`asset-manifest.json`.
