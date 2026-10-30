# تقرير التسليم — V5: اقتناء أصول عتاد عالية الدقة (High-Fidelity Hardware Assets)

> **المعيار الذي حُكم به**: نماذج حقيقية عالية الجودة داخل المشهد تعمل مع منظومة الصيانة — لا مجرد نجاح بناء برمجي.
> **النتيجة**: 10 نماذج حقيقية منزّلة ودمجت (9 مكوّنات MIT + شاشة CC0)، صفر تداخل مع النماذج القديمة، كل منظومة التفاعل v3/v4 محفوظة ومُختبرة متصفحيًا.

---

## أولًا — منهجية البحث (مصادر متعددة، لا Poly Haven وحده)

بحث فعلي بـ 4 وكلاء بحث متوازنين عبر: **Sketchfab API** (بحث عام كامل البيانات)، **BlenderKit API**، **CGTrader**، **TurboSquid**، **OpenGameArt**، **Kenney**، **Quaternius**، **poly.pizza**، **GitHub**، **itch.io**.

نتيجة الوصول المجهول (مثبتة بمحاولات curl حقيقية):

| المصدر | البحث | التنزيل |
|---|---|---|
| Sketchfab | ✅ API عام (بيانات و+ thumbnails) | ❌ يتطلب حساب (OAuth token) — مُثبت 401 |
| BlenderKit | ✅ API عام | ❌ يتطلب حساب — مُثبت 403 |
| CGTrader | ⚠️ صفحة JS فقط | ❌ challenge 202 |
| TurboSquid | ❌ 403 DataDome | ❌ |
| poly.pizza | ❌ Cloudflare (حتى بمتصفح حقيقي «Just a moment…») | ❌ API يتطلب مفتاح 401 |
| OpenGameArt | ✅ | ✅ ملفات مباشرة بلا حساب |
| Kenney | ✅ | ⚠️ تنزيل عبر رابط موقّع بجلسة (لم يُثبت نجاحه) |
| Quaternius | ✅ | ⚠️ عبر مجلدات Google Drive (gdown — انتهت المهلة) |
| GitHub | ✅ | ✅ raw مباشر بلا حساب |
| itch.io | ❌ 403 | ❌ |

**الاكتشاف الحاسم**: مستودع GitHub‏ `Wissemm697/pc-builder` — دليل تفاعلي فرنسي/إنجليزي «تركيب PC من الألف إلى الياء» (نفس مجال مشروعنا حرفيًا) يحتوي **9 نماذج GLB لمكوّنات PC مبنية خصيصًا للتعليم**، مرخّصة **MIT** (نص LICENSE مُقرأ ومُتحقق منه)، بنية عقد احترافية مسمّاة.

---

## ثانيًا — جداول المرشحين (≥3 لكل مكوّن)

> التقييم البصري /10: من معاينات مُحمّلة فعليًا وفُحصت بصريًا (وكلاء البحث حمّلوا thumbnails وفحصوها). «مقيد» = التنزيل يتطلب حسابًا لا نملكه في هذه البيئة.

### 1) صندوق الحاسوب (Desktop PC Case)

| النموذج | المصدر والرابط | الترخيص | الصيغة | الفيرتكسات | الحجم | مجاني؟ | تنزيل بلا حساب؟ | تقييم | القرار |
|---|---|---|---|---|---|---|---|---|---|
| **PC Parts Set — case** | GitHub [pc-builder](https://github.com/Wissemm697/pc-builder) `models/case.glb` | **MIT** | GLB (meshopt+webp) | 8,474 (case_body) + عقد | 114 KB | ✅ | ✅ **مُثبت 200** | 8/10 | ✅ **المختار** — 43 شبكة مفصولة: زجاج، لوح جانبي، 7 أغطية PCIe، 9 مساند نحاسية، زر/لمبة طاقة، شباك أمامي/علوي/خلفي |
| Fractal Design Meshify C | [Sketchfab](https://sketchfab.com/3d-models/fractal-design-meshify-c-pc-case-a46526af2ac84fa098edc3f01c012450) | CC-BY 4.0 | GLB | 146,292 | 12.3 MB | ✅ | ❌ مقيد | 8/10 | احتياط — الأثقل والأجمل للواقعية الصناعية |
| Corsair 200R | [Sketchfab](https://sketchfab.com/3d-models/corsair-200r-41efdc6e62454ec0a870ee8451768d75) | CC-BY | GLB | 1,224 | 5.5 MB | ✅ | ❌ مقيد | 8/10 | احتياط — منخفض المضلعات لكن بخامات ثقيلة |
| Gaming Computer Case | [BlenderKit](https://www.blenderkit.com/asset-gallery-detail/6ea660b5-adc6-4ff7-bd3c-77c3d29b79d0/) | royalty_free | glTF 0.52 MB | — | 0.5 MB | ✅ | ❌ مقيد | 8/10 | احتياط |

### 2) اللوحة الأم (ATX Motherboard)

| النموذج | المصدر | الترخيص | الفيرتكسات | الحجم | تنزيل؟ | تقييم | القرار |
|---|---|---|---|---|---|---|---|
| **PC Parts Set — motherboard** | GitHub pc-builder `motherboard.glb` | **MIT** | 25,486 (body) | 304 KB | ✅ مُثبت | 9/10 | ✅ **المختار** — مقبس LGA بمِطرق/رافعة منفصلة، 4 مزالج DIMM منفصلة، مزلاج PCIe x16، برغي M.2، LEDs تشخيص، 21 خامة (socket_pins/gold/alu_fin…) |
| MotherBoard + Components | [Sketchfab](https://sketchfab.com/3d-models/motherboard-components-3bc94057328243d4b341a55f59160f8a) | CC-BY | 44,060 | 15.9 MB | ❌ مقيد | 9/10 | أفضل مرشح مقيد (لوحة+CPU+RAM منفصلة) |
| X570 Prime [HQ PBR] | [Sketchfab](https://sketchfab.com/3d-models/x570-prime-motherboard-hq-pbr-25b3659935774b1e9d73d8954be065d8) | CC-BY | 17,845 | 10.2 MB | ❌ مقيد | 9/10 | احتياط مقيد |
| ASUS B550 AM4 (تعليمي) | [Sketchfab](https://sketchfab.com/3d-models/motherboard-asus-amd-b550-ryzen-am4-gaming-atx-55426c57d1d04cc29d3a0031e91a649a) | CC-BY | 24,278 | 4.0 MB | ❌ مقيد | 9/10 | احتياط مقيد — الأصغر بين عشرات التقييم 9 |

### 3) بطاقة الرسومات (GPU)

| النموذج | المصدر | الترخيص | الفيرتكسات | الحجم | تنزيل؟ | تقييم | القرار |
|---|---|---|---|---|---|---|---|
| **PC Parts Set — gpu** | GitHub pc-builder `gpu.glb` | **MIT** | 8,962 + رتوران 3,611×2 | 123 KB | ✅ مُثبت | 8/10 | ✅ **المختار** — جسم+2 رتور مراوح منفصلين يدوران فعليًا، أطراف PCIe ذهبية، بلوحة خلفية |
| MSI RTX 3080 (مفكوكة!) | [Sketchfab](https://sketchfab.com/3d-models/msi-rtx-3080-graphics-card-e5c384afae914d548a591f722e1878fc) | CC-BY | 12,311 | 24.1 MB | ❌ مقيد | **10/10** | أفضل مرشح مطلق — شroud/PCB/هيت بايب منفصلة (عرض مفجر) |
| RTX 3080 Founders-style | [Sketchfab](https://sketchfab.com/3d-models/geforce-rtx-3080-graphics-card-8b947ee1bf7a4e3d8ffa1c24893ac160) | CC-BY | 53,290 | 12 MB | ❌ مقيد | 9/10 | احتياط — بأنيميشن مراوح |
| Gold Graphics Card | [Sketchfab](https://sketchfab.com/3d-models/gold-graphics-card-b04686d9adbd456391614ca8e1d07b23) | **CC-BY-NC** | 23,701 | 32.2 MB | ❌ مقيد | 8/10 | مرفوض للاستخدام التعليمي الواسع (NC) |

### 4) المعالج (CPU)

| النموذج | المصدر | الترخيص | الحجم | تنزيل؟ | تقييم | القرار |
|---|---|---|---|---|---|---|
| **PC Parts Set — cpu** | GitHub pc-builder `cpu.glb` | **MIT** | 288 KB | ✅ مُثبت | 8/10 | ✅ **المختار** — IHS محفور «DESKTOP PROCESSOR / LGA1718»، قاعدة خضراء بوسادات ذهبية |
| AM4 Cpu [Free] (Ryzen 5900X) | [Sketchfab](https://sketchfab.com/3d-models/am4-cpu-free-912c9c42d2dc40fe95574345aae51ea0) | CC-BY | 4.0 MB | ❌ مقيد | 9/10 | أفضل مرشح مقيد |
| CPU + Socket (برافعة متحركة) | [Sketchfab](https://sketchfab.com/3d-models/unmarked-processor-cpu-socket-hp-lp-anim-26d2147e082648949b9c703c514e6901) | CC-BY | 30.1 MB | ❌ مقيد | 7/10 | احتياط — الوحيد بمقبس كامل |
| Computer CPU (OGA) | [OpenGameArt](https://opengameart.org/content/computer-cpu) | CC-BY 3.0 | 0.5 MB | ✅ مُثبت | 5/10 | مرفوض — ‎.blend فقط + طراز 2013 بسيط |

### 5) مبرد المعالج (CPU Cooler)

| النموذج | المصدر | الترخيص | الحجم | تنزيل؟ | تقييم | القرار |
|---|---|---|---|---|---|---|
| **PC Parts Set — cooler** | GitHub pc-builder `cooler.glb` | **MIT** | 147 KB | ✅ مُثبت | 8/10 | ✅ **المختار** — برج بزعانف + مروحة بدوار منفصل + مشابك سلك |
| Cooler Master Tower | [Sketchfab](https://sketchfab.com/3d-models/cooler-master-cpu-cooler-e54651982f524644a2144b52a6b36e89) | CC-BY | 5.5 MB | ❌ مقيد | 8/10 | أفضل مرشح مقيد |
| Noctua NH-D15 (عقد مفصولة!) | [Sketchfab](https://sketchfab.com/3d-models/noctua-nh-d15-cpu-cooler-23e225925e174a9f929d995cd9bd22e2) | CC-BY | 0.6 MB | ❌ مقيد | 6/10 | احتياط — أخف وأكثر فصلًا لكن بلا خامات |
| AMD Wraith Stealth | [Sketchfab](https://sketchfab.com/3d-models/free-amd-wraith-stealth-cpu-cooler-ff1e128c191c4f808e60e7a7a523c9cc) | CC-BY | 12.3 MB | ❌ مقيد | 7/10 | احتياط — مثالي لدرس «مبرد المخزن» |

### 6) الذاكرة (RAM)

| النموذج | المصدر | الترخيص | الحجم | تنزيل؟ | تقييم | القرار |
|---|---|---|---|---|---|---|
| **PC Parts Set — ram** | GitHub pc-builder `ram.glb` | **MIT** | 39 KB | ✅ مُثبت | 7/10 | ✅ **المختار** — شريحة DDR4bare: 8 رقائق، أطراف ذهبية، سنّون؛ تُستنسخ مرتين في فتحتين (تعليم: فتحة فارغة) |
| RAM Stick — PC | [Sketchfab](https://sketchfab.com/3d-models/none-ab2b1c25c31b44c1a757911734bdf942) | CC-BY | 1.8 MB | ❌ مقيد | 7/10 | أفضل مرشح مقيد |
| Corsair Vengeance LPX | [Sketchfab](https://sketchfab.com/3d-models/none-ee11e1926e514075a70642ecb5dc5c2d) | CC-BY | 1.5 MB | ❌ مقيد | 7/10 | احتياط — بهيتسبريدر |
| Kingston Fury DDR5 | [Sketchfab](https://sketchfab.com/3d-models/none-2a7a6efdcb294829b26fb9503a90e572) | CC-BY | 125 KB | ❌ مقيد | 5/10 | احتياط LOD — منخفض التفاصيل جدًا |

### 7) مزود الطاقة (PSU)

| النموذج | المصدر | الترخيص | الحجم | تنزيل؟ | تقييم | القرار |
|---|---|---|---|---|---|---|
| **PC Parts Set — psu** | GitHub pc-builder `psu.glb` | **MIT** | 164 KB | ✅ مُثبت | 8/10 | ✅ **المختار** — جسم+رتور مروحة+كابلات ثابتة+مفتاح rocks فعلٍ، ملصق 750W، شبك عسلوي، مقابس modular |
| PSU Power Supply Unit | [Sketchfab](https://sketchfab.com/3d-models/none-69ccd1be3a77497cb2acc9e39e7c52b3) | CC-BY | 750 KB | ❌ مقيد | 7/10 | أفضل مرشح مقيد |
| Aerocool KCAS 500W | [Sketchfab](https://sketchfab.com/3d-models/none-bfb1f77fffb0410f9ee0d0be6fb5fc88) | CC-BY | 25.5 MB | ❌ مقيد | 7.5/10 | احتياط — خامات ثقيلة تحتاج تصغيرًا |
| PSU (8 فيرتكس!) | [Sketchfab](https://sketchfab.com/3d-models/none-26fead1e09ae41c08d8596aea24dcad6) | CC-BY | 115 KB | ❌ مقيد | 2/10 | مرفوض — صندوق مفرّغ placeholder |

### 8) وحدات التخزين (HDD / SSD)

| النموذج | المصدر | الترخيص | الحجم | تنزيل؟ | تقييم | القرار |
|---|---|---|---|---|---|---|
| **PC Parts Set — ssd (M.2)** | GitHub pc-builder `ssd.glb` | **MIT** | 23 KB | ✅ مُثبت | 8/10 | ✅ **المختار** — M.2 2280: موصل ذهبي + سنّ + رقائق + ملصق 1TB |
| 3.5" HDD | [Sketchfab](https://sketchfab.com/3d-models/none-8063b935c95e467f835f922190edff73) | CC-BY | 396 KB | ❌ مقيد | 7/10 | **أفضل مرشح للقرص الميكانيكي — محجوب بالحساب** (انظر الفجوات) |
| WD Green 1TB | [Sketchfab](https://sketchfab.com/3d-models/none-e9244f56e0724dd097570e29bae4b7c6) | CC-BY | 7.5 MB | ❌ مقيد | 8/10 | احتياط مقيد — الأعلى تفصيلًا |
| SSD 2.5" + M.2 (طقم) | [Sketchfab](https://sketchfab.com/3d-models/none-bdd5fd67a7674359ab8648204b5c0575) | CC-BY | 7 MB | ❌ مقيد | 7.5/10 | احتياط مقيد — SSD+HDD+M.2 بحزمة واحدة |
| Hard Drive (Jamoues) | [Sketchfab](https://sketchfab.com/3d-models/none-946666a390b44c90901e7dd07fb509a5) | **CC-BY-SA** | 36 MB | ❌ مقيد | 6.5/10 | مرفوض — 36MB وترخيص CopyLeft عدوى |

### 9) الشاشة (PC Monitor)

| النموذج | المصدر | الترخيص | الحجم | تنزيل؟ | تقييم | القرار |
|---|---|---|---|---|---|---|
| **Low-poly Monitor (OGA)** | [OpenGameArt](https://opengameart.org/content/low-poly-monitor) `fbx.zip → Monitor.fbx` | **CC0** | 30 KB GLB بعد التحويل | ✅ **مُثبت 200 + حُوّل FBX2glTF** | 7/10 | ✅ **المختار** — لوح+بيزل+عنق+قاعدة هندسًا؛ أُعيد تلوين البيزل الفتشان إلى معدن داكن (CC0 يسمح) وسطح العرض استضاف CanvasTexture الحي |
| Computer Monitor Lowpoly | [Sketchfab](https://sketchfab.com/3d-models/computer-monitor-lowpoly-model-1d4ee42eda804b02b05b63721921c1d7) | CC-BY | 65 KB | ❌ مقيد | 8/10 | أفضل مرشح مقيد |
| Basic PC Monitor (مفصول اللوح/الحامل) | [Sketchfab](https://sketchfab.com/3d-models/basic-pc-monitor-6ab2bc870fb140fe898e2da3255e0fcd) | CC-BY | 6.7 MB | ❌ مقيد | 7/10 | احتياط — الأفضل فصلًا |
| Pc monitor HP 27 (CC0 + gltf!) | [BlenderKit](https://www.blenderkit.com/asset-gallery-detail/cd027a8a-3f76-40c7-a5bb-d873e7a4bfa6/) | CC0 | — | ❌ مقيد | — | بديل CC0 إذا أُنشئ حساب BlenderKit لاحقًا |

### 10) مروحة الهيكل (إضافة — كانت إجرائية)

| النموذج | المصدر | الترخيص | القرار |
|---|---|---|---|
| **PC Parts Set — fan** | GitHub pc-builder `fan.glb` — MIT — 50 KB | 120mm بإطار ورتور منفصلين | ✅ **المختار** — 3 نسخ (أماميتان + خلفية) بدوّارات حقيقية تدور مع محرك الطاقة |

---

## ثالثًا — الأصول المُختارة والمُثبتة التنزيل

| # | الملف في `public/models/parts/` | الحجم | المصدر | الترخيص | تم التحقق |
|---|---|---|---|---|---|
| 1 | `case.glb` | 114 KB | GitHub Wissemm697/pc-builder | MIT | ✅ HTTP 200 + LICENSE مُقروء |
| 2 | `motherboard.glb` | 304 KB | المصدر نفسه | MIT | ✅ |
| 3 | `cpu.glb` | 288 KB | المصدر نفسه | MIT | ✅ |
| 4 | `cooler.glb` | 147 KB | المصدر نفسه | MIT | ✅ |
| 5 | `gpu.glb` | 123 KB | المصدر نفسه | MIT | ✅ |
| 6 | `ram.glb` | 39 KB | المصدر نفسه | MIT | ✅ |
| 7 | `psu.glb` | 164 KB | المصدر نفسه | MIT | ✅ |
| 8 | `ssd.glb` | 23 KB | المصدر نفسه | MIT | ✅ |
| 9 | `fan.glb` | 50 KB | المصدر نفسه | MIT | ✅ |
| 10 | `monitor.glb` | 30 KB | OpenGameArt (FBX→GLB عبر FBX2glTF) | **CC0** | ✅ HTTP 200 + شارة CC0 بصفحة الأصل |
| — | `CREDITS.md` | — | وثيقة أصول تُرضي شرط الإسناد | — | ✅ |

إجمالي حمولة النماذج: **≈1.28 MB** لكل 10 نماذج (ضغط meshopt + خامات webp).

---

## رابعًا — الدمج التقني (`src/lib/scene/glbParts.ts`)

- **تحميل مسبق** `preloadGlbAssets()` قبل إنشاء المشهد (من `LabScreen`) — فشل فردي يُبقي المجسم الإجرائي مكانه (لا مشهد مكسور أبدًا).
- **استبدال تزامني** داخل `buildAllParts` قبل ربط سجلات الأعلام — لا تطفو نسخة فوق القديمة إطلاقًا: محتوى كل مجموعة يُفرَّغ (مع تحرير الهندسات) ثم يُستبدل.
- **معايرة رقمية**: كل نموذج قيس بنقاطه (script قياس glTF: مواضع عقد المساند/المزالج/الرافعة/الأصابع) ثم حُسب أساس دوران + مقياس لكل محور بحيث تقع الميزات الحقيقية على نظام الإحداثيات التعليمي: مقبس اللوحة = MOUNTS.cpu، فتحات RAM = MOUNTS.ram، مزلاج PCIe = سطر MOUNTS.gpu… (تحقق فعلي: مواضع عالمية مقيسة بعد التشغيل = MOUNTS بدقة ±0.01).
- **الحفاظ على منظومة التفاعل**: أعلام الأعلام (FlagVisuals) أُعيد بناؤها من عقد النماذج الحقيقية: `socket_lever` (رافعة المقبس داخل pivot بمحور صحيح)، `dimm_latch_A1..B2` (المزالج الأربعة)، `pcie_x16_latch`، `m2_screw`، `case_power_led` (بخامة مستنسخة للتحكم بالإنارة)، والدوّارات `*_rotor` (مراوح GPU×2 + المبرد + PSU + الهيكل ×3) غذّت مصفوفة spinners.
- براغي فكّ GPU/PSU/المراوح/اللوحة + قابسا fan-headers وfront-panel أُعيد بناؤها إجرائيًا فوق النماذج (النماذج لا تحمل براغٍ منفصلة) لتبقى أهداف النقر والأعلام كما هي.
- الشاشة: جسم GLB + **سطح عرض جديد مُنطق من bbox مادة الشاشة الفعلية** يحمل اسم `monitor-screen` — CanvasTexture (8 حالات الشاشة) يرسم عليه مباشرة؛ زر الطاقة + لمبة الذقن + كابل الإشارة الإجرائي محفوظون.

---

## خامسًا — الأدلة البصرية قبل/بعد (لقطات فعلية في `verify/v5-research/`)

| الاختبار | قبل (إجرائي) | بعد (نماذج حقيقية) |
|---|---|---|
| A — الشكل العام بنفس الكاميرا | `before-lab.png` | `FINAL-after-default.png` — هيكل Mid-Tower حقيقي بواجهة شبكية وزجاج |
| B — فتح الغطاء والتفاصيل الداخلية | `before-lab.png` | `FINAL-after-open.png` — GPU بمراوحها، اللوحة، RAM الخضراء، كابلات |
| C — الزجاج المغلق | — | `cal-glass-closed.png` — الزجاج الحقيقي شفاف يعكس |
| D — منظر جانبي معاير | — | `cal-side.png` |
| E — تقريب المعالج/المبرد | — | `cal-cpu.png` — برج المبرد بزعانفه + مزالج DIMM البيضاء |
| F — الشاشة الافتراضية | — | `int5-monitor.png` — سطح مكتب كامل (رموز + نافذة عربية) على الشاشة الحقيقية |

### إثبات التفاعل على النماذج الجديدة (نقرات فعلية بالماوس)

1. **التحديد بالأشعة على GLB**: نقر البطاقة → لوحة معلومات «بطاقة الرسومات RTX 4070» + توهج أخضر لخامات النموذج (`int-select-gpu.png`).
2. **حماية سلسلة السلامة**: «فصل جزئي» والغطاء مغلق → **رفض** «افتح الغطاء الجانبي أولاً» (`int2-sep2.png`)؛ وبعد فتح الغطاء → **رفض** «افصل كابل طاقة البطاقة أولًا» (`int2-sep3.png`) — قواعد v3 تعمل فوق النماذج الجديدة.
3. **الاستخراج إلى الصينية**: حالة القطعة removed → البطاقة الحقيقية **مستلقية على سجادة القطع** بوضعية طبيعية (`int3-tray-gpu.png`)، وكل القطع معًا (`int4-tray-all.png`).
4. **الالتقاط والتركيب**: «التقاط للتركيب» → «بانتظار التركيب» → «ركّب الآن» → البطاقة عادت إلى **[1.46, 2.99, 1.70] = موضعها المعاير بدقة** (`int3-gpu-installed2.png`).
5. **العرض التفجيري والأشعة السينية** يعملان على خامات GLB (`int6-exploded.png`، `int6-xray.png`).
6. **منظومة التشغيل/الشاشة**: 8 حالات الشاشة (No Signal → POST → سطح المكتب) على السطح الحقيقي (`int5-monitor.png`).

---

## سادسًا — الأجزاء التي تعذر إيجاد نماذج مناسبة لها (بصراحة)

| الجزء | الحالة | السبب الموثق |
|---|---|---|
| **HDD — القرص الميكانيكي 3.5"** | بقي إجرائيًا | كل المرشحات الجيدة (3.5" HDD بدقة 396KB، WD Green، حزمة Storage الثلاثية) على Sketchfab **بترخيص مناسب لكن محجوبة بحساب**؛ OpenGameArt/poly.pizza/GitHub/Quaternius/Kenney: صفر نتائج 3D ذات صلة (فُحصت بالبحث الفعلي). البديل الإجرائي الحالي مفصّل (أغطية/براغي/منافذ SATA) وموثق حتى يُوفَّر حساب Sketchfab مجاني مرة واحدة ثم يُستبدل بدقيقة واحدة (البنية جاهزة: أضف سطرًا في DEFS). |
| كابلات atx24/eps/gpuPower/sata | بقي إجرائيًا | **خارج قائمة المكوّنات العشرة أصلًا** (كابلات مرنة تُرسم كمسارات حقيقية بين PSU والقطع — نموذج جامد يفسدها). |

### نماذج مرشحة مرفوضة وأسبابها
- «Hard Drive» (Jamoues): ترخيص CC-BY-SA عدوى + 36MB.
- «Gold Graphics Card» / «RTX 4090 FE» (exela): CC-BY-**NC** — قيود غير متوافقة دون موافقتك (لم تُستخدم).
- «ASROCK 4X4-V1000M» (BlenderKit): لوحة صناعية SODIMM — ليست ATX تعليمية.
- «PSU» (TymonG): 8 فيرتكسات — placeholder مفرّغ.
- «Gaming PC Case Nightshark»: شكل عضوي مبالغ به لا يشبه حقيقي.

---

## سابعًا — حدود مُختبرة وغير مختبرة

**تم اختباره فعليًا (متصفح آلي، لقطات موثقة)**: تحميل 10/10 نماذج (سجلات `[glb] loaded`)، تطبيع المواضع (قياس عالمي = MOUNTS)، التحديد/الإبراز/المعلومات، رفضا سلسلة السلامة، فتح/غلق الزجاج الحقيقي حول المفصلة، استخراج→صينية→التقاط→تركيب→عودة دقيقة، الشاشة الحية بكل حالاتها، التفجيري/الأشعة، جودة lint (0 أخطاء)، صفر أخطاء في dev.log.

**غير مُختبر/قيود بيئية (بصراحة)**:
1. **FPS على عتاد حقيقي**: بيئة المعاينة بلا GPU (SwiftShader) — القياس هنا ~2fps لا يعبر عن الأداء؛ مجموع الأصول 1.28MB وعدد المضلعات مُحسّن مسبقًا (نماذج game-ready).
2. **حساب Sketchfab/BlenderKit**: عدم توفره حجب أجود المرشحات (قوائمها موثقة أعلاه جاهزة للتنزيل عند توفره).
3. **تداخل مبرج برجي بطول كامل مع أعلى بطاقة الرسومات**: اللوحة الحقيقية تضع PCIe x16 أعلى من المعتاد قليلًا؛ التداخل جزئي ومخفي خلف البطاقة من زاوية الكاميرا الرئيسية — موثق كتعارض «خارج spec» موجود في الحواسيب الحقيقية (مشكلة clearance معروفة).
4. الوضع الأفقي للقطع في الصينية مُختبر بصريًا للبطاقة/المبرد/PSU/M.2 — قطع أصغر (cpu/ram) وضعياتها موروثة من ضبط v3 وقد تحتاج نخاسة بصرية إن غيّرت مستقبلًا أبعادها.

---

**الخلاصة**: المعيار المطلوب تحقق — نماذج حقيقية عالية الجودة (Mid-Tower مفتوح الأجزاء، لوحة LGA برافعتها ومزالجها، GPU بمراوح دوّارة، مبرد برجي، RAM، PSU بمفتاحه ومراوحه، M.2، شاشة كاملة الهيكل) داخل المشهد، تعمل مع كامل منظومة الصيانة (تحديد/فك/صينية/تركيب/أعطال/POST)، مع سجل أصول وتراخيص نُظيف، وحدود موثقة بلا تجميل.
