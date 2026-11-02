#!/usr/bin/env python3
"""
Transform the portfolio HTML:
 1. Swap all base64 images for compressed WebP versions
 2. Add width/height + decoding=async to every embedded <img> (no layout shift)
 3. Fix the disappearing-cards bug (fail-safe reveal script)
 4. Add performance/smoothness CSS (content-visibility, reduced-motion)
 5. Slim Google Fonts payload
 6. Insert the new "PC Repair 3D Studio" project card (#13) + its theme CSS
 7. Re-number Welding card to 14 and update counters (14 projects)
Output: upload/portfolio-mohammad-adel-alqili (5).html
"""
import base64, io, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, ".portfolio-build")
SRC = os.path.join(ROOT, "upload/portfolio-mohammad-adel-alqili (4).html")
DST = os.path.join(ROOT, "upload/portfolio-mohammad-adel-alqili (5).html")

img_map = json.load(open(os.path.join(BUILD, "img_map.json")))
shots = json.load(open(os.path.join(BUILD, "new_shots.json")))

data = open(SRC, encoding="utf-8").read()
orig_len = len(data)

# ------------------------------------------------------------------
# 1) replace every old base64 payload with the compressed webp URI
#    (single regex pass — swap the FULL data URI, no double prefixes)
# ------------------------------------------------------------------
import hashlib
b64_to_new = {e["old_b64"]: e["new_uri"] for e in img_map.values()}

def swap_uri(m):
    b64 = m.group(2)
    return b64_to_new.get(b64, m.group(0))

data = re.sub(r'data:image/([a-z]+);base64,([A-Za-z0-9+/=]+)', swap_uri, data)
swapped = sum(1 for e in img_map.values() if e["new_uri"] in data)
print(f"swapped URIs present in output: {swapped}/{len(img_map)}")

# ------------------------------------------------------------------
# 2) augment <img> tags: width/height from map + decoding=async
# ------------------------------------------------------------------
uri_to_entry = {e["new_uri"]: e for e in img_map.values()}

img_re = re.compile(r'<img\s[^>]*data:image/webp;base64,[^>]*>')

def augment(m):
    tag = m.group(0)
    um = re.search(r'src="(data:image/webp;base64,[^"]+)"', tag)
    if not um:
        return tag
    entry = uri_to_entry.get(um.group(1))
    if entry and "width=" not in tag:
        tag = tag.replace(
            f'src="{um.group(1)}"',
            f'src="{um.group(1)}" width="{entry["w"]}" height="{entry["h"]}"', 1)
    if "decoding=" not in tag:
        tag = tag.replace("<img", '<img decoding="async"', 1)
    return tag

data = img_re.sub(augment, data)

# ------------------------------------------------------------------
# 3) fail-safe reveal script (root cause of "cards disappeared")
# ------------------------------------------------------------------
start = data.find("  // Scroll reveal animation")
end_marker = "document.querySelectorAll('.skill-card').forEach(el => skillObserver.observe(el));"
end = data.find(end_marker)
assert start != -1 and end != -1, "reveal script block not found"
end += len(end_marker)

NEW_JS = """  // Scroll reveal — fail-safe design: المحتوى يظهر دائماً حتى لو فشل الجافاسكربت أو لم يدعمه المتصفح
  (function () {
    var targets = document.querySelectorAll('.skill-card, .project-card, .achievement-card, .cert-card, .timeline-item');
    function revealAll() {
      targets.forEach(function (el) { el.style.opacity = '1'; el.style.transform = 'none'; });
    }
    var ok = false;
    try { ok = ('IntersectionObserver' in window) && targets.length > 0; } catch (e) { ok = false; }
    if (!ok) return; /* لا نُخفي أي بطاقة إذا لم تتوفر الإمكانيات */
    /* شبكة أمان 1: كشف كل البطاقات بعد 1.5 ثانية مهما حدث */
    setTimeout(revealAll, 1500);
    /* شبكة أمان 2: كشف كل البطاقات بعد اكتمال تحميل الصفحة */
    window.addEventListener('load', function () { setTimeout(revealAll, 500); });
    try {
      targets.forEach(function (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      });
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }
        });
      }, { threshold: 0.08 });
      targets.forEach(function (el) { observer.observe(el); });

      /* Animate skill bars on scroll */
      var skillObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.querySelectorAll('.skill-fill').forEach(function (fill) {
              var width = fill.style.width;
              fill.style.width = '0%';
              setTimeout(function () { fill.style.width = width; }, 100);
            });
          }
        });
      }, { threshold: 0.3 });
      document.querySelectorAll('.skill-card').forEach(function (el) { skillObserver.observe(el); });
    } catch (e) {
      revealAll(); /* أي خطأ غير متوقع → كل المحتوى ظاهر فوراً */
    }
  })();"""

data = data[:start] + NEW_JS + data[end:]

# ------------------------------------------------------------------
# 4+6) extra CSS: performance + PC Studio card theme (before </style>)
# ------------------------------------------------------------------
EXTRA_CSS = """
  /* ===== PERFORMANCE & SMOOTHNESS (v6) ===== */
  @media (prefers-reduced-motion:reduce){
    *,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;}
    html{scroll-behavior:auto;}
  }
  img{background:rgba(26,40,66,0.4);}

  /* ===== PC Repair 3D Studio Card (Project 13 — مختبر صيانة الحاسب ثلاثي الأبعاد) ===== */
  .pcstudio-card:hover{border-color:#ffb627;box-shadow:0 20px 60px -10px rgba(255,182,39,0.26);}
  .pcstudio-card .project-badge{background:linear-gradient(135deg,#ffb627 0%,#ff8a3d 100%);}
  .pcstudio-card .project-title{
    background:linear-gradient(135deg,#ffe8b0 0%,#ffb627 55%,#ff8a3d 100%);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  }
  .pcstudio-card .project-subtitle,.pcstudio-card .project-features li::before{color:#ffb627;}
  .pcstudio-card .tech-tag{color:#ffd479;border-color:rgba(255,182,39,0.45);}
  .pcstudio-shots-title{
    grid-column:1/-1;min-width:0;
    margin:2px 0 14px;font-size:0.85rem;font-weight:700;color:#ffb627;
    display:flex;align-items:center;gap:10px;
  }
  .pcstudio-shots-title::after{content:'';flex:1;height:1px;background:linear-gradient(to left,rgba(255,182,39,0.45),transparent);}
  .pcstudio-shots{
    grid-column:1/-1;min-width:0;
    display:flex;flex-direction:column;gap:14px;
  }
  .pcstudio-shots-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .pcstudio-shot{
    margin:0;min-width:0;
    border:1px solid rgba(255,182,39,0.32);border-radius:12px;overflow:hidden;
    background:#141005;
    box-shadow:0 14px 38px -14px rgba(2,12,27,0.85);
    transition:transform 0.35s ease,box-shadow 0.35s ease,border-color 0.35s ease;
  }
  .pcstudio-shot:hover{transform:translateY(-4px);border-color:rgba(255,182,39,0.65);box-shadow:0 20px 48px -14px rgba(255,182,39,0.26);}
  .pcstudio-shot .shot-bar{
    display:flex;align-items:center;gap:10px;
    background:#191307;border-bottom:1px solid rgba(255,182,39,0.22);padding:8px 12px;
  }
  .pcstudio-shot .dots{display:flex;gap:5px;flex:0 0 auto;}
  .pcstudio-shot .dot{width:9px;height:9px;border-radius:50%;background:#ffb627;opacity:1;}
  .pcstudio-shot .dot:nth-child(2){opacity:0.72;}
  .pcstudio-shot .dot:nth-child(3){opacity:0.45;}
  .pcstudio-shot .shot-url{font-family:'JetBrains Mono',monospace;font-size:0.72rem;color:#e8d5a2;letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .pcstudio-shot img{display:block;width:100%;height:auto;}
  .pcstudio-shot figcaption{background:rgba(20,16,5,0.85);border-top:1px solid rgba(255,182,39,0.18);}
  .pcstudio-phone{max-width:340px;width:100%;margin:0 auto;}
  @media(max-width:768px){
    .pcstudio-shots-row{grid-template-columns:1fr;}
    .pcstudio-shots-title{font-size:0.8rem;}
  }
"""

# insert before the last </style>
last_style_end = data.rfind("</style>")
assert last_style_end != -1
data = data[:last_style_end] + EXTRA_CSS + "\n" + data[last_style_end:]

# ------------------------------------------------------------------
# 5) slimmer Google Fonts payload
# ------------------------------------------------------------------
old_fonts = "family=Cairo:wght@300;400;600;700;900&family=Tajawal:wght@300;400;500;700;900&family=JetBrains+Mono:wght@400;500;700"
new_fonts = "family=Cairo:wght@600;700;900&family=Tajawal:wght@400;500;700;900&family=JetBrains+Mono:wght@400;500;700"
assert old_fonts in data, "fonts URL not found"
data = data.replace(old_fonts, new_fonts)

# ------------------------------------------------------------------
# 6b) build the new project card HTML
# ------------------------------------------------------------------
def fig(shot_key, url_text, alt, caption, extra_cls=""):
    s = shots[shot_key]
    cls = f" class=\"pcstudio-shot {extra_cls}\"" if extra_cls else " class=\"pcstudio-shot\""
    return f"""        <figure{cls} role="figure" aria-label="{alt}">
          <div class="shot-bar" aria-hidden="true">
            <span class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
            <span class="shot-url">{url_text}</span>
          </div>
          <img src="{s['uri']}" width="{s['w']}" height="{s['h']}" alt="{alt}" loading="lazy" decoding="async">
          <figcaption>{caption}</figcaption>
        </figure>"""

CARD = f"""
    <!-- Project 13: PC Repair 3D Studio -->
    <div class="project-card pcstudio-card">
      <div class="project-badge">
        <span class="num">13</span>
        <span class="label">مختبر افتراضي — أحدث المشاريع</span>
      </div>
      <div>
        <h3 class="project-title">PC Repair 3D Studio — ستوديو صيانة الحاسب ثلاثي الأبعاد</h3>
        <p class="project-subtitle">مختبر تدريب تفاعلي لفنيي صيانة الحاسوب — Next.js · TypeScript · Three.js · WebGL</p>
        <p class="project-desc">
          مختبر افتراضي متكامل يحاكي ورشة صيانة حقيقية من أول برغي حتى إقلاع ويندوز: افتح غطاء الهيكل، اسحب القطع من صينية الأدوات، ركّبها في أماكنها الهندسية الصحيحة بنقرة الفأرة، ثم شغّل الجهاز وشاهد POST وBIOS وإقلاع نظام تشغيل كامل على الشاشة ثلاثية الأبعاد داخل المشهد نفسه — وتحكّم بنظام التشغيل بالفأرة ولوحة المفاتيح الحقيقيتين من داخل المجسّم. محرك أعطال ذكي يخفي عيوباً حقيقية فيتدرّب المتدرب على التشخيص والإصلاح خطوة بخطوة مثل فني محترف.
        </p>
        <ul class="project-features">
          <li>مشهد ورشة ثلاثي الأبعاد كامل: مكتب، مصباح، مفكات وكماشة، وعلبة Mid-Tower بغطاء متحرك — بنماذج GLB حقيقية وإضاءة HDRI ونظيرات أمامية وجانبية وعلوية وزوم حر</li>
          <li>12 قطعة حاسوب تُركَّب وتُفكَّك بأماكنها الهندسية الصحيحة: الكرت الرسومي في فتحة PCIe x16 تحت المعالج، والمراوح تدور حول محاورها الفعلية باتجاه سحب/دفع الهواء الصحيح</li>
          <li>محرك أعطال وتشخيص فني: فحص POST فعلي على الشاشة مع رموز أخطاء، اختبارات ذكية لكل قطعة، وتقارير جلسة قابلة للتصدير</li>
          <li>شاشة داخل المشهد تُدار بفأرة ولوحة مفاتيح حقيقيتين: سطح مكتب بنوافذ حقيقية (مفكرة، مستكشف ملفات، مدير أجهزة، إعدادات) تكتب فيها وتفتحها وتغلقها مباشرة</li>
          <li>محاكاة تثبيت ويندوز من XP حتى 11: معالج تثبيت تفاعلي، تقسيم أقراص GPT/MBR، وتحقق من متطلبات TPM وSecure Boot لكل إصدار</li>
          <li>أوضاع عرض احترافية: أشعة سينية X-Ray لرؤية المكونات داخل الهيكل، ووضع تفجيري يفصل القطع، وأسهم تدفق هواء حية للمراوح</li>
          <li>تدريب موجّه بمراحل وسيناريوهات أعطال واختبارات معرفية مع شرح مفصّل لكل إجابة</li>
          <li>واجهة عربية RTL كاملة تعمل بسلاسة على الجوال وسطح المكتب مع اختصارات لوحة مفاتيح احترافية (W · S · E · X · R · H · F)</li>
        </ul>
        <div class="tech-stack">
          <span class="tech-tag">Next.js 16</span>
          <span class="tech-tag">TypeScript</span>
          <span class="tech-tag">Three.js</span>
          <span class="tech-tag">WebGL</span>
          <span class="tech-tag">GLB Models</span>
          <span class="tech-tag">Zustand</span>
          <span class="tech-tag">Prisma</span>
          <span class="tech-tag">RTL UI</span>
        </div>
      </div>

      <div class="pcstudio-shots-title">لقطات حية من المختبر — مشهد الورشة، والقطع، ونظام تشغيل كامل يعمل على الشاشة ثلاثية الأبعاد</div>
      <div class="pcstudio-shots" role="group" aria-label="لقطات شاشة حية من PC Repair 3D Studio">
{fig("lab",
     "PC Repair 3D Studio — 3D Workshop Lab · Desk, Tools &amp; Open Case",
     "مشهد مختبر الصيانة ثلاثي الأبعاد: مكتب خشبي عليه هيكل حاسوب مفتوح الغطاء تظهر داخله اللوحة الأم والمراوح ومزود الطاقة، وشاشة عرض على المكتب، وصينية أدوات بها مفكات وكماشة",
     "المختبر الافتراضي: هيكل مفتوح بقطعه الحقيقية، أدوات على المكتب، وشاشة مخرجات — كل شيء بنظيرات كاميرا حرة وزوم")}
{fig("exploded",
     "PC Repair 3D Studio — Exploded View · Real OS Windows on the 3D Monitor",
     "الوضع التفجيري لمكونات الحاسوب: كل قطعة تطفو في مكانها الهندسي، وعلى الشاشة ثلاثية الأبعاد نظام تشغيل حقيقي بنوافذ مفتوحة",
     "الوضع التفجيري: كل قطعة تطفو في مكانها — ونظام تشغيل حقيقي يعمل بنوافذه على شاشة المشهد")}
{fig("airflow",
     "PC Repair 3D Studio — Airflow Mode · Part Inspector",
     "وضع أسهم تدفق الهواء: أسهم سماوية تظهر مسارات تبريد المراوح من الأماماً إلى الخلف داخل الهيكل، مع لوحة فحص تفاصيل بطاقة الرسوميات",
     "أسهم تدفق الهواء: مسارات التبريد من المخابئ إلى المؤخرة — مع لوحة فحص تفاصيل كل قطعة")}
{fig("mobile",
     "PC Repair 3D Studio — Mobile · Same Lab, Full RTL UI",
     "نسخة الجوال من المختبر: نفس المشهد ثلاثي الأبعاد والشاشة والقوائم العربية كاملة بحجم شاشة هاتف",
     "يعمل بسلاسة على الجوال: نفس المشهد ثلاثي الأبعاد والقوائم العربية كاملة", extra_cls="pcstudio-phone")}
      </div>
    </div>

"""

# ------------------------------------------------------------------
# 7) renumber Welding → 14 FIRST (while only one num-13 badge exists)
# ------------------------------------------------------------------
assert data.count('<span class="num">13</span>') == 1, "expected exactly one num-13 badge"
data = data.replace('<span class="num">13</span>', '<span class="num">14</span>')
data = data.replace("<!-- Project 13: Welding Machine -->", "<!-- Project 14: Welding Machine -->")
data = data.replace("ثلاثة عشر مشروعاً تقنياً متكاملاً", "أربعة عشر مشروعاً تقنياً متكاملاً")
data = data.replace('<span class="stat-num">13+</span>', '<span class="stat-num">14+</span>')

# ------------------------------------------------------------------
# 8) insert the new PC Studio card before the (renamed) Welding card
# ------------------------------------------------------------------
insert_at = data.find("<!-- Project 14: Welding Machine -->")
assert insert_at != -1, "welding marker not found"
data = data[:insert_at] + CARD.lstrip("\n") + data[insert_at:]

# theme-color for mobile browsers (nice touch, no risk)
if 'name="theme-color"' not in data:
    data = data.replace('</title>', '</title>\n<meta name="theme-color" content="#0a1628">', 1)

# ------------------------------------------------------------------
# write result
# ------------------------------------------------------------------
open(DST, "w", encoding="utf-8").write(data)
print(f"OK  {round(orig_len/1024)} KB  ->  {round(len(data)/1024)} KB   ({DST})")
