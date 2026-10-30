# Asset Credits / حقوق الأصول ثلاثية الأبعاد

جميع الملفات في هذا المجلد (`public/models/parts/`) هي نماذج حقيقية منزّلة ومستخدمة وفق تراخيصها.

## 1) طقم مكوّنات PC — مصدر: GitHub `Wissemm697/pc-builder`

- **المصدر**: https://github.com/Wissemm697/pc-builder (ملفات `models/*.glb`)
- **الترخيص**: MIT License — Copyright (c) 2026 Wissemm697 (نص الترخيص الكامل في مستودع المصدر)
- **الاستخدام**: تعديل وإعادة استضافة مسموحة مع الإبقاء على إشعار الترخيص — هذا الملف هو الإشعار.
- **الملفات**: `case.glb`, `motherboard.glb`, `cpu.glb`, `cooler.glb`, `gpu.glb`, `ram.glb`, `psu.glb`, `ssd.glb`, `fan.glb`
- **ملاحظة**: النماذج مضغوطة بـ EXT_meshopt_compression وتستخدم EXT_texture_webp (يدعمها Three.js GLTFLoader مع MeshoptDecoder).

## 2) الشاشة المكتبية — مصدر: OpenGameArt «Low-poly monitor»

- **المصدر**: https://opengameart.org/content/low-poly-monitor (الملف الأصلي `fbx.zip` → `Monitor.fbx`)
- **الترخيص**: CC0 1.0 (Public Domain) — صفحة الأصل تحمل شارة CC0.
- **التحويل**: FBX → GLB عبر FBX2glTF (ملف `monitor.glb`).
- **الاستخدام**: خالٍ بلا قيود؛ أُعيد تلوين الخامات داخل التطبيق (CC0 يسمح بالتعديل).

## أجزاء بلا نماذج منزّلة (تُبنى إجرائيًا داخل التطبيق)

- `HDD` (قرص 3.5 بوصة): لم يُعثر على نموذج مجاني قابل للتنزيل بلا حساب وبترخيص مناسب — التفاصيل في تقرير التسليم.
- كابلات الطاقة/البيانات (atx24/eps/gpuPower/sata): تُرسم برمجيًا كمسارات كابلات حقيقية (ليست ضمن قائمة المكوّنات العشرة).
