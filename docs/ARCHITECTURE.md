# البنية المعمارية — PC Repair 3D Studio v2.0.0

وثيقة معمارية دقيقة للكود الفعلي في `src/lib`. كل الطبقات تعتمد على عقد واحد مشترك: `src/lib/types.ts`.

## الطبقات الست

| الطبقة | الملفات | المسؤولية |
|---|---|---|
| **data** | `data/catalog.ts` (899 سطرًا)، `data/lessons.ts`، `data/quiz.ts`، `data/scenarios.ts` | محتوى تعليمي ثابت: 12 `CatalogEntry`، دروس، 12 سؤال اختبار، 6 سيناريوهات أعطال. بيانات خالصة بلا منطق حالة |
| **simulation** | `simulation/machineFlags.ts`، `assemblyEngine.ts`، `postEngine.ts`، `compatibilityEngine.ts`، `powerEstimator.ts`، `smartSim.ts`، `diagnosticsEngine.ts` | دوال **نقية (pure)**: تستقبل `SimulationState` وتعيد نتائج/نسخًا جديدة. لا واجهة، لا تحقق جانبي |
| **services** | `services/persistence.ts`، `exportService.ts`، `missionEngine.ts`، `reportService.ts` | حفظ localStorage (مفتاح `pcrs_v1_state`، تحقق إصدار، فشل آمن)، تصدير CSV/JSON (BOM + اقتباس RFC 4180)، تحقق خطوات المهام، بناء التقارير |
| **scene** | `scene/PCScene.ts` (843 سطرًا)، `partsFactory.ts` (879 سطرًا)، `layout.ts`، `visualTypes.ts` | Three.js 0.186.1: مصنع مجسمات إجرائي بالكامل (بلا GLB)، كاميرا/إضاءة/OrbitControls، حركة lerp/slerp، X-Ray، عرض تفجيري، اختيار بالأشعة، تنظيف موارد |
| **store** | `store/labStore.ts` (342 سطرًا) | zustand: الحالة الوحيدة للحقيقة — تحقق ثم تسجيل حدث ثم إشعار (sonner) ثم حفظ مؤجل (debounce‏ 400ms) |
| **screens** | `components/AppShell.tsx` + 10 شاشات في `components/screens/` و`components/lab/` | عرض React خالص؛ كل فعل يمر عبر المتجر ولا يلمس المحركات مباشرة |

## مجرى الأحداث (من نقرة إلى الشاشة)

مثال: المستخدم يفك برغي GPU.

```
نقرة/ضغط زر في UI
  → labStore.toggleFlag / removePart / installPart
      → canToggleFlag / canRemove / canInstall   (محرك نقي: هل الشرط مستوفى؟)
          → ناجح:  applyToggleFlag/applyRemove → نسخة SimulationState جديدة
                   + logEvent(...) في logs
                   + toast(sonner) رسالة عربية
                   + schedulePersist() حفظ مؤجل بعد 400ms إلى localStorage
          → مرفوض: StepResult { ok:false, messageAr } → توست تربوي يشرح أول شرط ناقص
  → scene.syncState(sim)      (المشهد يطابق المجسمات مع الأعلام: غطاء/مزالج/براغٍ/قوابس/LED)
  → إعادة عرض الشاشات (اشتراك zustand)
```

الفرع ثلاثي الأبعاد للنقرة المباشرة على المجسمات: `pointerdown/up` في PCScene مع حد أقصى لمسافة 6px لتمييز النقرة عن السحب → raycast على مجموعات المكوّنات → `callbacks.onSelect(id)` → `store.select(id)` → إبراز أخضر (emissive ‏0x4d7c0f بشدة 0.35) + بطاقة المعلومات.

## كتالوج المكوّنات — حقول `CatalogEntry` كاملة

المصدر: `types.ts` + `data/catalog.ts`. المعرّفات الثلاثة عشر حقلًا:

| الحقل | النوع | المعنى |
|---|---|---|
| `id` | `ComponentId` (12 قيمة ثابتة) | معرف لا يتغير لاحقًا |
| `nameAr` / `nameEn` | string | الاسم بالعربية والإنجليزية |
| `category` | string | تصنيف عربي: هيكل/لوحات/معالجة/تبريد/ذاكرة/رسوميات/تخزين/طاقة/كابلات/تهوية |
| `role` | string | دور القطعة في جملة |
| `description` | string | وصف تعليمي مفصل |
| `referenceSpecs` | `Record<string,string>` | مواصفات المنصة المرجعية (مثل socket: LGA1700) |
| `meshKey` | string | مفتاح المجسم في المشهد (ثابت) |
| `mountPoint` | string | موضع التثبيت بالعربية |
| `removeRequirements` / `installRequirements` | string[] | خطوات الفك/التركيب (وصف للعرض) |
| `faults` / `safety` | string[] | أعطال محتملة / تنبيهات سلامة |
| `powerEstimateW?` | number | تقدير تعليمي فقط |
| `isIllustrative` | boolean | true = قيم توضيحية لا قياس حقيقي |
| `compatibilityNotes` | string[] | ملاحظات توافق |
| `sourceNote` | string | «محتوى تعليمي مرجعي — يحتاج مراجعة معلم التخصص» |
| `reviewedAt` | string | تاريخ مراجعة ISO (2025-01-15 في الكتالوج الحالي) |

كما يصدّر الكتالوج `COMPONENT_MAP` (فهرس بالمعرف) و`BUILD_OPTIONS` (خيارات فاحص التوافق من نوع `BuildOption`).

## نظام الأعلام — `MachineFlag` الـ13

علمٌ لكل ملامح فيزيائية للجهاز؛ حالة المحاكاة الكاملة هي `flags: Record<MachineFlag, boolean>` + `parts: Record<ComponentId, 'installed' | 'removed'>`:

| # | العلم | المعنى |
|---|---|---|
| 1 | `powerOn` | الجهاز قيد التشغيل |
| 2 | `acConnected` | كابل الكهرباء (حائط ← PSU) موصول |
| 3 | `panelOpen` | الغطاء الجانبي مفتوح |
| 4 | `pcieLatchOpen` | مزلاج فتحة PCIe محلَّر |
| 5 | `ramClipsOpen` | مزالج RAM محلَّرة |
| 6 | `cpuLeverOpen` | رافعة مقبس المعالج مفتوحة |
| 7 | `gpuScrewsOut` | براغي بطاقة الرسوميات مفكوكة |
| 8 | `psuScrewsOut` | براغي مزود الطاقة مفكوكة |
| 9 | `fanScrewsOut` | براغي مراوح الهيكل مفكوكة |
| 10 | `m2ScrewOut` | برغي تثبيت M.2 مفكوك |
| 11 | `moboScrewsOut` | مسامير اللوحة الأم مفكوكة |
| 12 | `fanHeadersDisconnected` | موصلات مراوح اللوحة مفصولة |
| 13 | `frontPanelDisconnected` | موصلات Front Panel / USB / Audio مفصولة |

`machineFlags.ts` يعرّف `FLAG_INFO` (تسمية عربية + إرشاد لكل علم) و`canToggleFlag` (الحكم الشرطي برسالة رفض تربوية) و`applyToggleFlag` (قلب بلا شروط بعد نجاح الفحص). اعتماديات الفك/التركيب مصدرها `assemblyEngine.ts` (الجداول REMOVE_REQS / INSTALL_REQS)، وقاعدة السلامة الذهبية: `isSafeForInternals = !powerOn && !acConnected` إلزامية لكل العمل الداخلي عدا الهيكل نفسه.

## الواجهة العامة لـ PCScene

| الدالة | الوظيفة |
|---|---|
| `constructor({ container, quality, callbacks })` | تهيئة renderer/camera/controls وبناء المشهد؛ فشل WebGL يعطي رسالة عربية و`failed=true` |
| `setQuality(q)` | ضبط جودة low/medium/high |
| `setXray(on)` | شفافية الهيكل (حفظ قيم المواد الأصلية واستعادتها) |
| `setPanelOpen(on, animate?)` / `setExploded(on, animate?)` | فتح الغطاء (≈100°) / العرض التفجيري عبر `EXPLODE_VECTORS` |
| `syncState(sim)` | مطابقة الأعلام والقطع مع المجسمات (مزالج، براغٍ، قوابس، دوّارات المراوح عند التشغيل) |
| `highlight(id)` / `isolate(id)` | إبراز / عزل مكوّن |
| `resetCamera()` / `focusComponent(id)` | إعادة الكاميرا / تقريب ناعم (tween) على قطعة |
| `dispose()` | تحرير كامل للموارد |

ثوابت موثقة في المشهد: وحدة ≈10سم، الهيكل X∈[0,2.1] Y∈[0,4.5] Z∈[0,4.6]، اللوحة عمودية على الجدار الخلفي بوجه نحو -X، صينية القطع طاولة أمام-يسار الجهاز، ومواضع راحة لكل قطعة في `TRAY.slots`.

## قرار SPA داخل مسار واحد

رغم App Router في Next.js 16، التطبيق **صفحة واحدة**: `src/app/page.tsx` يعرض `AppShell`، والتنقل بين الشاشات العشر عبر `store.screen` (union نوع `ScreenId`) مع عرض شرطي `{screen === 'lab' && <LabScreen />}`. المبرر: حالة المحاكاة والمشهد ثلاثي الأبعاد حية ومشتركة بين كل الشاشات — أي تنقل URL حقيقي يقتل مثيل WebGL ويفقد السياق، بينما التبديل الداخلي يحفظ المشهد ويجعل كل الشاشات (كتالوج/تقارير/تشخيص) تقرأ نفس `SimulationState` لحظيًا.

---

## الجلسة الرابعة (v3.0.0) — الطبقات المضافة وفق التوجيه الرئيسي

```
src/lib/
├── types.ts                  ← 15 ComponentId (+hdd/sataData/sataPower)، PartStatus بخمس حالات،
│                                AssemblyState الثمانية + assemblyStateOf()، PeripheralState، MonitorScreen
├── data/
│   ├── catalog.ts            ← +3 سجلات (HDD 3.5"، كابل SATA بيانات، كابل SATA طاقة)
│   └── faults.ts             ★ محرك الأعطال: 14 عطلًا (بطاقة طلب/فرضية/أدلة/apply/fix/isFixed/preCode/preScreen)
├── simulation/
│   ├── machineFlags.ts       ← بوابة تشغيل واقعية: القطع الناقصة لا تمنع الزر (تظهر في POST)؛ الفصل الجزئي يمنع
│   ├── assemblyEngine.ts     ← +انتقالات الثماني: applyDetach/Extract/Prepare/Damage/Repair + isCable
│   ├── postEngine.ts         ← +قواعد: psuDead، ramIncompatible، fans، (ssd|HDD+كابلي SATA) كأقراص إقلاع بديلة
│   ├── monitorEngine.ts      ★ حالات الشاشة الثماني (منطق نقّي — المصدر الوحيد لرسّام الشاشة)
│   ├── technicianEngine.ts   ★ جلسة الفني: مراحل تسع + بوابات نقية + أدوات + فرضيات (14 حقيقية + 3 مشتتات)
│   └── faultTests.ts         ★ 14×5 فحص آلي (نقاء/POST/شاشة/isFixed/مصير سليم) — يُعرض في شاشة التشخيص
├── scene/
│   ├── layout.ts             ← MOUNTS/TRAY/EXPLODE للثلاثة الجدد + PERIPH (موضع الطرفيات) + MONITOR_CAMERA
│   ├── partsFactory.ts       ← +buildHdd/buildSataData/buildSataPower/buildMonitor/buildKeyboard/buildMouse/buildAirflow
│   ├── screenTexture.ts      ★ رسّام CanvasTexture للحالات الثماني (بما فيها دفتر ملاحظات عربي RTL)
│   └── PCScene.ts            ← التقاط الطرفيات (peripheral/userData)، دوران مشروط بالطاقة، توهج التلف،
│                                طفو «بانتظار التركيب»، فصل جزئي = إزاحة 22% من متجه التفجير، focusMonitor
├── store/labStore.ts         ← +bootStartedAt/notepad/airflowVisible/tech + أفعال آلة الثماني وجلسة الفني
└── services/persistence.ts   ← +tech في PersistShape (مع توافق خلفي اختياري)
```

**المصدر الوحيد للحقيقة**: `SimulationState` في المتجر — المشهد 3D والتشخيص ولوحة بوابة جلسة الفني يقرؤونها كلها؛ `assemblyStateOf` يشتق الحالة الثمانية المعروضة ولا تُخزّن أبدًا.

**قاعدة الكابلات**: الكابلات الخمسة (atx24/eps/gpuPower/sataData/sataPower) تُفصل وتوصَل بحركة واحدة، ومساراتها أنابيب CatmullRom من نقاط عالمية محددة — لا كابل يطفو في الفراغ، وكابل إشارة الشاشة يختفي كليًا عند فصله.

**قرار PSU**: فك PSU متاح كقطعة (بالبراغي والاعتماديات) لكن فتح جسم PSU غير موجود إطلاقًا في أي مسار — والعطل F12 يُحل بالاستبدال من المخزن التعليمي فقط.
