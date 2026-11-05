/**
 * vos.ts — محرك النظام الافتراضي (Virtual OS) داخل الشاشة المجسمة (V6-B/C).
 * ============================================================================
 * واجهة نظام تشغيل تعليمية مرسومة بالكامل على Canvas 2D (نسيج الشاشة المجسمة):
 * سطح مكتب + نوافذ حقيقية التفاعل (تحريك/تحجيم/تصغير/تكبير/إغلاق) + قائمة
 * ابدأ + شريط مهام + إشعارات + مؤشر ماوس افتراضي.
 *
 * قواعد صارمة (توجيه V6 §4.4):
 *  - لا إدخال HTML ولا eval ولا حقن DOM: كل الإدخال عبر API داخلي واضح
 *    (pointer / wheel / key) تستقبل أحداث الماوس والكيبورد الحقيقيين بعد
 *    تحويلها من إحداثيات سطح الشاشة المجسمة.
 *  - كل عنصر مرئي له سلوك معلن (توجيه V6 §4.5) — لا أزرار زخرفية.
 *  - هذا نظام محاكاة تعليمي وليس Windows حقيقية (توضيح معلن في الواجهة).
 *
 * نمط البناء: Immediate-Mode UI (إطار يُبنى كل رسم) — الأدوات تسجّل مستطيلات
 * تفاعل (UiFrame) تُستخدم للـ hit-testing بين الرسمات. بسيط وموثوق ولا يحتفظ
 * بشجرة DOM وهمية.
 */

// ============ أنواع مشتركة ============

export interface VosPointerOpts {
  button?: number;          // 0 يسار، 2 يمين
  dy?: number;              // عجلة
  shift?: boolean;
  dbl?: boolean;
}

export interface VosKeyEvent {
  key: string;
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta?: boolean;
}

export interface VosWindow {
  id: string;
  appId: string;
  titleAr: string;
  x: number; y: number; w: number; h: number;
  minimized: boolean;
  maximized: boolean;
  z: number;
  state: Record<string, unknown>; // حالة خاصة بالتطبيق داخل هذه النافذة
  prev?: { x: number; y: number; w: number; h: number };
}

export interface VosAppDef {
  id: string;
  titleAr: string;
  iconColor: string;
  iconGlyph: string;
  defaultW: number;
  defaultH: number;
  desktop?: boolean;         // يظهر أيقونة على سطح المكتب
  render: (os: VirtualOS, win: VosWindow | null, ctx: CanvasRenderingContext2D, now: number) => void;
}

// ============ أدوات رسم مساعدة ============

export const OS_COLORS = {
  taskbar: 'rgba(10,14,20,0.94)',
  winBg: '#141a22',
  winBorder: '#2c3846',
  titleBg: '#1d2734',
  titleFocus: '#24435a',
  titleText: '#dbe5f0',
  text: '#d7dfe9',
  dim: '#8b97a5',
  accent: '#39c7b8',
  accentSoft: 'rgba(57,199,184,0.16)',
  danger: '#e35d5d',
  warn: '#eab308',
  ok: '#34d399',
  inputBg: '#0e141b',
  rowHover: 'rgba(255,255,255,0.05)',
  rowSelect: 'rgba(57,199,184,0.18)',
};

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ============ إطار UI الفوري ============

interface HotRect {
  id: string;
  x: number; y: number; w: number; h: number;
  kind: 'button' | 'title' | 'resize' | 'icon' | 'row' | 'custom' | 'scroll';
  cursor: 'default' | 'pointer' | 'text';
  onClick?: (opts: VosPointerOpts) => void;
  onDbl?: () => void;
  onScroll?: (dy: number) => void;
  z: number;
}

export class UiFrame {
  rects: HotRect[] = [];
  keyHandler: ((ev: VosKeyEvent) => boolean) | null = null; // true = استُهلك
  hoverId: string | null = null;

  add(r: HotRect): void {
    this.rects.push(r);
  }

  hit(x: number, y: number): HotRect | null {
    // الأعلى z أولًا وعند التساوي الأحدث (ترتيب الإضافة يطابق ترتيب الرسم فوق بعضه)
    let best: HotRect | null = null;
    for (const r of this.rects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        if (!best || r.z >= best.z) best = r;
      }
    }
    return best;
  }
}

// ============ أدوات ============

export interface ButtonOpts {
  color?: string;
  fg?: string;
  disabled?: boolean;
  font?: string;
  align?: 'center' | 'left' | 'right';
}

export interface ScrollState {
  offset: number;
  max: number;
}

// ============ المحرك ============

const TASKBAR_H = 44;
const ICON_AREA = { x: 14, y: 14, cellW: 92, cellH: 96, colW: 104 };

export class VirtualOS {
  readonly W: number;
  readonly H: number;
  private ctx: CanvasRenderingContext2D;

  /** وضع البيئة: سطح مكتب / برنامج ثابت / معالج تثبيت / استرداد */
  mode: 'desktop' | 'firmware' | 'setup' | 'recovery' = 'desktop';

  windows: VosWindow[] = [];

  /** (إصلاح تدقيق V6) نظام ملفات الجلسة المشترك بين التطبيقات — يبقى حيًا بعد إغلاق المستكشف
   *  (كان الحفظ في المفكرة وأوامر dir/type تقرأ شجرة معزولة جديدة عند غياب نافذة المستكشف) */
  fsRoot: object | null = null;
  private zCounter = 10;
  private nextWinId = 1;

  apps = new Map<string, VosAppDef>();
  desktopIcons: string[] = [];

  startOpen = false;
  cursor = { x: 640, y: 300, visible: false };
  cursorKind: 'default' | 'pointer' | 'text' = 'default';
  // (v9) تغذية راجعة بصرية للنقر: انضغاط المؤشر + نبضة دائرية عند موضع الضغط
  private cursorPressed = false;
  private clickPulse: { x: number; y: number; at: number } | null = null;
  /** وقت الإطار الحالي (يُحدّث في render/drawSetupWith — تستخدمه نبضة النقر) */
  private nowMs = 0;

  toasts: Array<{ titleAr: string; bodyAr: string; at: number }> = [];

  /** مربع النص المركّز عليه (للتوجيه اللوحي)
   *  (إصلاح B3) id: هوية عدّاد ثابتة تقارن بها التطبيقات بدل هوية الإغلاق (كانت تفشل دائمًا).
   *  (إصلاح B2) winId: النافذة المالكة — يُلغى الالتقاط عند إغلاقها أو تغيّر وضع البيئة. */
  focusedTextbox: { id: number; winId: string | null; get: () => string; set: (t: string) => void; onEnter?: () => void } | null = null;
  private tbCounter = 1;
  private blinkAt = 0;

  private frame: UiFrame = new UiFrame();
  private lastFrame: UiFrame | null = null;
  private activeId: string | null = null;
  private activeStart = { x: 0, y: 0 };
  private dragWin: { id: string; dx: number; dy: number } | null = null;
  private dragResize: { id: string; sx: number; sy: number; w0: number; h0: number } | null = null;
  private downAt = 0;
  private lastClickId: string | null = null;
  private lastClickAt = 0;
  /** (إصلاح B1) آخر مزدوج نقر: نفس المستطيل خلال 350ms يُتجاهل — كان يُطلق onDbl مرتين
   *  (كشف الفاصل داخل pointer('up') + حدث dblclick الحقيقي عبر pointer('dbl')). */
  private lastDbl: { key: string; at: number } | null = null;
  /** (إصلاح B2) وضع البيئة عند آخر فحص تركيز — تغيّره يُلغي الالتقاط اللوحي العالق */
  private lastFocusMode: VirtualOS['mode'] = 'desktop';
  dirty = true;

  constructor(ctx: CanvasRenderingContext2D, W: number, H: number) {
    this.ctx = ctx;
    this.W = W;
    this.H = H;
  }

  registerApp(app: VosAppDef): void {
    this.apps.set(app.id, app);
  }

  /** (إصلاح B3) تركيز مربع نص بهوية ثابتة (عداد داخلي) — تستخدمه apps.ts و installer.ts */
  focusTextbox(tb: { winId?: string | null; get: () => string; set: (t: string) => void; onEnter?: () => void }): void {
    this.focusedTextbox = { id: this.tbCounter++, winId: tb.winId ?? null, get: tb.get, set: tb.set, onEnter: tb.onEnter };
    this.dirty = true;
  }

  /** (إصلاح B2) هل يلتقط النظام الافتراضي لوحة المفاتيح الآن؟
   *  يستدعيه الطبقة الخارجية (PCScene) عند Escape ليقرر توجيه المفتاح بدل خروج وضع الشاشة فورًا. */
  hasKeyboardFocus(): boolean {
    return !!this.focusedTextbox || this.startOpen || !!this.ctxMenu;
  }

  /** (إصلاح B2) فحص صلاحية الالتقاط اللوحي: يُلغى إذا أُغلقت نافذته أو تغيّر وضع البيئة
   *  (سطح مكتب ⇄ برنامج ثابت ⇄ معالج تثبيت ⇄ استرداد) — كان يخطف كل الكتابة بعدها. */
  validateFocus(): void {
    if (this.focusedTextbox) {
      const winId = this.focusedTextbox.winId;
      const winOpen = winId ? this.windows.some((w) => w.id === winId) : true;
      if (!winOpen || this.mode !== this.lastFocusMode) this.focusedTextbox = null;
    }
    this.lastFocusMode = this.mode;
  }

  // ============ النوافذ ============

  openApp(appId: string, args?: Record<string, unknown>): VosWindow | null {
    const app = this.apps.get(appId);
    if (!app) return null;
    const existing = this.windows.find((w) => w.appId === appId);
    if (existing && !args) {
      existing.minimized = false;
      existing.z = ++this.zCounter;
      this.dirty = true;
      return existing;
    }
    const offset = (this.windows.length % 5) * 26;
    const win: VosWindow = {
      id: `win-${this.nextWinId++}`,
      appId,
      titleAr: app.titleAr,
      x: Math.round(this.W * 0.18) + offset,
      y: Math.round(this.H * 0.12) + offset,
      w: Math.min(app.defaultW, this.W - 40),
      h: Math.min(app.defaultH, this.H - TASKBAR_H - 40),
      minimized: false,
      maximized: false,
      z: ++this.zCounter,
      state: { ...(args ?? {}) },
    };
    this.windows.push(win);
    this.dirty = true;
    return win;
  }

  closeWindow(id: string): void {
    const idx = this.windows.findIndex((w) => w.id === id);
    if (idx >= 0) {
      this.windows.splice(idx, 1);
      // (إصلاح B2) الإغلاق يلغي التقاط مربع النص التابع للنافذة ومعالج مفاتيحها
      if (this.focusedTextbox?.winId === id) this.focusedTextbox = null;
      this.frame.keyHandler = null;
      this.dirty = true;
    }
  }

  focusWindow(id: string): void {
    const win = this.windows.find((w) => w.id === id);
    if (win) {
      win.z = ++this.zCounter;
      win.minimized = false;
      this.dirty = true;
    }
  }

  notify(titleAr: string, bodyAr: string): void {
    this.toasts.push({ titleAr, bodyAr, at: Date.now() });
    if (this.toasts.length > 3) this.toasts.shift();
    this.dirty = true;
  }

  /** واجهة التطبيقات: أدوات الرسم الفوري */
  get ui(): UiFrame {
    return this.frame;
  }

  /** أصل محتوى النافذة الحالية (تُضبط قبل رسم كل تطبيق) — يُستخدم لتسجيل مستطيلات التفاعل */
  contentOrigin = { x: 0, y: 0 };

  /** تسجيل مستطيل تفاعل بإحداثيات محلية للتطبيق (يُحول لأحداثيات الشاشة داخليًا) */
  addRect(
    kind: 'button' | 'title' | 'resize' | 'icon' | 'row' | 'custom' | 'scroll',
    x: number, y: number, w: number, h: number,
    handlers: { onClick?: (o?: VosPointerOpts) => void; onDbl?: () => void; onScroll?: (dy: number) => void } ,
    cursor: 'default' | 'pointer' | 'text' = 'pointer',
    z = 20,
  ): string {
    const id = `r${this.rectCounter++}`;
    this.frame.add({
      id,
      x: x + this.contentOrigin.x,
      y: y + this.contentOrigin.y,
      w, h, kind, cursor, z,
      onClick: handlers.onClick ? () => handlers.onClick?.() : undefined,
      onDbl: handlers.onDbl,
      onScroll: handlers.onScroll,
    });
    return id;
  }

  private rectCounter = 1;

  /** هل المؤشر فوق مستطيل محلي؟ (للتحويم داخل التطبيقات) */
  hoverAt(x: number, y: number, w: number, h: number): boolean {
    const cx = this.cursor.x - this.contentOrigin.x;
    const cy = this.cursor.y - this.contentOrigin.y;
    return cx >= x && cx <= x + w && cy >= y && cy <= y + h;
  }

  get ctx2d(): CanvasRenderingContext2D {
    return this.ctx;
  }

  get taskbarH(): number {
    return TASKBAR_H;
  }

  get blink(): boolean {
    return Math.floor(this.blinkAt / 500) % 2 === 0;
  }

  // ============ الإدخال (API الرسمي الوحيد) ============

  pointer(type: 'move' | 'down' | 'up' | 'dbl' | 'right', x: number, y: number, opts: VosPointerOpts = {}): void {
    this.cursor.x = Math.max(0, Math.min(this.W - 1, x));
    this.cursor.y = Math.max(0, Math.min(this.H - 1, y));
    const f = this.lastFrame;
    if (!f) return;

    if (type === 'move') {
      const hit = f.hit(x, y);
      this.cursorKind = hit ? hit.cursor : 'default';
      f.hoverId = hit?.id ?? null;
      this.dirty = true;
      return;
    }

    if (type === 'down') {
      const hit = f.hit(x, y);
      this.cursorPressed = true; // (v9) إحساس الضغط على المؤشر الافتراضي
      this.activeId = hit?.id ?? null;
      this.activeStart = { x, y };
      this.downAt = Date.now();
      if (!hit && this.startOpen) this.startOpen = false;
      if (this.ctxMenu && (!hit || !hit.id.startsWith('ctx'))) this.ctxMenu = null;
      if (hit?.kind === 'title') {
        const win = this.windows.find((w) => w.id === hit.id.split(':')[1]);
        if (win) {
          this.focusWindow(win.id);
          if (!win.maximized) this.dragWin = { id: win.id, dx: x - win.x, dy: y - win.y };
        }
      }
      if (hit?.kind === 'resize') {
        const win = this.windows.find((w) => w.id === hit.id.split(':')[1]);
        if (win) this.dragResize = { id: win.id, sx: x, sy: y, w0: win.w, h0: win.h };
      }
      this.dirty = true;
      return;
    }

    if (type === 'up') {
      const hit = f.hit(x, y);
      const now = Date.now();
      this.cursorPressed = false; // (v9) انفضاض المؤشر
      this.clickPulse = { x, y, at: now }; // (v9) نبضة عند موضع الرفع
      if (this.dragWin) {
        // إن لم يتحرك المؤشر فعليًا فهي نقرة عنوان (تركيز فقط)
        const moved = Math.abs(x - this.activeStart.x) + Math.abs(y - this.activeStart.y) > 4;
        if (!moved) this.dragWin = null;
      }
      this.dragWin = null;
      this.dragResize = null;
      if (this.activeId && hit && hit.id === this.activeId) {
        if (this.lastClickId === hit.id && now - this.lastClickAt < 380) {
          // (إصلاح B1) عبر fireDbl حتى لا يتكرر مع حدث dblclick الحقيقي
          this.fireDbl(hit);
          this.lastClickId = null;
        } else {
          hit.onClick?.(opts);
          this.lastClickId = hit.id;
          this.lastClickAt = now;
        }
      }
      this.activeId = null;
      this.dirty = true;
      return;
    }

    if (type === 'dbl') {
      const hit = f.hit(x, y);
      // (إصلاح B1) نفس المسار المركزي: المزدوج المكرر خلال 350ms على نفس المستطيل يُتجاهل
      if (hit) this.fireDbl(hit);
      return;
    }

    if (type === 'right') {
      const hit = f.hit(x, y);
      // (تنظيف B14) أُزيل onRight الميت — النقر الأيمن فوق عنصر لا يفعل شيئًا (كما كان عمليًا)،
      // وفوق الفراغ يفتح قائمة سياق سطح المكتب.
      if (!hit) this.desktopContextMenu(x, y);
      this.dirty = true;
      return;
    }
  }

  /** (إصلاح B1) إطلاق onDbl مركزي مع إزالة الازدواج: نفس المستطيل خلال 350ms = تجاهل */
  private fireDbl(rect: HotRect): void {
    const now = Date.now();
    if (this.lastDbl && this.lastDbl.key === rect.id && now - this.lastDbl.at < 350) {
      this.lastDbl = { key: rect.id, at: now };
      return;
    }
    this.lastDbl = { key: rect.id, at: now };
    rect.onDbl?.();
  }

  wheel(x: number, y: number, dy: number): void {
    const f = this.lastFrame;
    if (!f) return;
    const hit = f.hit(x, y);
    hit?.onScroll?.(dy);
    this.dirty = true;
  }

  /** لوحة المفاتيح الحقيقية — توجيه V6 §4.3: Enter/Backspace/Tab/Shift/Ctrl/الأسهم/Esc */
  key(ev: VosKeyEvent): void {
    // (إصلاح B2) فحص صلاحية الالتقاط قبل كل مفتاح — لا خطف للكتابة بعد إغلاق النافذة/تغيير الوضع
    this.validateFocus();
    // مربع نص مركّز يلتقط الكتابة أولًا
    if (this.focusedTextbox) {
      const tb = this.focusedTextbox;
      if (ev.key === 'Enter') {
        tb.onEnter?.();
        this.dirty = true;
        return;
      }
      if (ev.key === 'Backspace') {
        tb.set(tb.get().slice(0, -1));
        this.dirty = true;
        return;
      }
      if (ev.key.length === 1 && !ev.ctrl && !ev.alt && !ev.meta) {
        tb.set(tb.get() + (ev.shift ? ev.key.toUpperCase() : ev.key));
        this.dirty = true;
        return;
      }
      if (ev.key === 'Escape') {
        this.focusedTextbox = null;
        this.dirty = true;
        return;
      }
    }

    // عام: Esc يغلق قائمة ابدأ
    if (ev.key === 'Escape' && this.startOpen) {
      this.startOpen = false;
      this.dirty = true;
      return;
    }

    // تمرير إلى معالج مفتاح الإطار (التطبيق النشط)
    if (this.frame.keyHandler && this.frame.keyHandler(ev)) {
      this.dirty = true;
      return;
    }
    this.dirty = true;
  }

  // ============ الرسم ============

  /** يرسم إطارًا كاملًا ويعيد true إذا اكتمل رسم فعلي */
  render(now: number): boolean {
    // (إصلاح B2) تغيّر الوضع (سطح مكتب/ثابت/تثبيت/استرداد) يلغي الالتقاط اللوحي العالق
    this.validateFocus();
    this.frame = new UiFrame();
    // (إصلاح تدقيق V6) معرّفات مستقرة بين الإطارات: كانت r1، r2… تتزايد عالميًا عبر الرسوم،
    // فتتغير هوية المستطيل نفسه بين pointerdown وpointerup (الرسم يحدث بينهما)
    // ويسقط النقر كله على الشاشة المجسمة. التصفير مع كل إطار يجعل الإطارات المتطابقة
// تنتج معرّفات متطابقة — والمطابقة في activeId تنجح.
    this.rectCounter = 1;
    const ctx = this.ctx;
    this.blinkAt = now;
    this.nowMs = now; // (v9) للنبضات الزمنية في drawCursor

    ctx.save();
    ctx.clearRect(0, 0, this.W, this.H);

    if (this.mode === 'desktop') {
      this.drawDesktop(ctx, now);
    } else if (this.mode === 'firmware') {
      this.drawFirmware(ctx, now);
    } else if (this.mode === 'recovery') {
      this.drawRecovery(ctx, now);
    }
    // mode 'setup' يرسمه تطبيق المثبّت عبر drawSetupWith

    this.drawOverlays(ctx, now);
    this.drawCursor(ctx);

    ctx.restore();

    this.lastFrame = this.frame;
    this.dirty = false;
    return true;
  }

  /** يفرض رسم وضع setup عبر تطبيق المثبّت — يستدعى من PCScene قبل render */
  drawSetupWith(fn: (ctx: CanvasRenderingContext2D, os: VirtualOS, now: number) => void, now: number): boolean {
    this.validateFocus(); // (إصلاح B2)
    this.frame = new UiFrame();
    this.rectCounter = 1; // (إصلاح تدقيق V6) نفس سبب render() — معرّفات مستقرة بين الإطارات
    this.nowMs = now; // (v9) للنبضات الزمنية في drawCursor
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.W, this.H);
    fn(ctx, this, now);
    this.drawOverlays(ctx, now);
    this.drawCursor(ctx);
    ctx.restore();
    this.lastFrame = this.frame;
    this.dirty = false;
    return true;
  }

  // ============ سطح المكتب ============

  private drawDesktop(ctx: CanvasRenderingContext2D, now: number): void {
    // خلفية
    const g = ctx.createLinearGradient(0, 0, this.W, this.H);
    g.addColorStop(0, '#0f2e33');
    g.addColorStop(0.5, '#0b2228');
    g.addColorStop(1, '#07161b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
    // شعار هندسي خفيف
    ctx.strokeStyle = 'rgba(57,199,184,0.10)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(this.W - 120, 90, 30 + i * 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(215,223,233,0.55)';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PC Lab OS — بيئة تدريب افتراضية', 18, this.H - TASKBAR_H - 14);
    ctx.fillStyle = 'rgba(139,151,165,0.75)';
    ctx.font = '13px sans-serif';
    ctx.fillText('محاكاة تعليمية — ليست نظام Windows حقيقيًا', 18, this.H - TASKBAR_H + 6);

    // أيقونات سطح المكتب
    let col = 0;
    let row = 0;
    for (const appId of this.desktopIcons) {
      const app = this.apps.get(appId);
      if (!app) continue;
      const ix = ICON_AREA.x + col * ICON_AREA.colW;
      const iy = ICON_AREA.y + row * ICON_AREA.cellH;
      this.drawDesktopIcon(ctx, ix, iy, app.iconGlyph, app.iconColor, app.titleAr, appId);
      row++;
      if (iy + ICON_AREA.cellH > this.H - TASKBAR_H - 100) {
        row = 0;
        col++;
      }
    }

    // شريط تنبيه التعريف المفقود (سيناريو F15) — حالة معلنة حقيقية
    const st = this.storeReader?.();
    if (st && st.os.driversMissing.length > 0) {
      ctx.fillStyle = 'rgba(234,179,8,0.14)';
      roundRect(ctx, this.W / 2 - 260, 14, 520, 40, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(234,179,8,0.5)';
      roundRect(ctx, this.W / 2 - 260, 14, 520, 40, 8);
      ctx.stroke();
      ctx.fillStyle = '#eab308';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('تعريف بطاقة الرسوميات مفقود — الدقة منخفضة (افتح Device Manager لتحديثه)', this.W / 2, 39);
      ctx.textAlign = 'left';
    }

    // النوافذ من الأسفل للأعلى
    const sorted = [...this.windows].sort((a, b) => a.z - b.z);
    for (const win of sorted) {
      if (!win.minimized) this.drawWindow(ctx, win, now);
    }

    this.drawTaskbar(ctx, now);

    if (this.startOpen) this.drawStartMenu(ctx);
  }

  /** قارئ حالة المتجر — يُحقن من الخارج (تفادي استيراد دائري) */
  storeReader: (() => {
    os: { installed: string | null; edition: string | null; driversMissing: string[]; bcdCorrupt: boolean };
    thermal: { cpuTempC: number; gpuTempC: number };
    fans: Array<{ labelAr: string; rpm: number; running: boolean }>;
  }) | null = null;

  private drawDesktopIcon(ctx: CanvasRenderingContext2D, x: number, y: number, glyph: string, color: string, label: string, appId: string): void {
    const id = `icon:${appId}`;
    const w = ICON_AREA.colW - 12;
    const h = 84;
    const hovered = this.frame.hoverId === id;
    if (hovered) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, x, y, w, h, 8);
      ctx.fill();
    }
    ctx.fillStyle = color;
    roundRect(ctx, x + (w - 52) / 2, y + 6, 52, 42, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x + (w - 52) / 2, y + 18, 52, 6);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(glyph, x + w / 2, y + 38);
    ctx.fillStyle = '#e6edf5';
    ctx.font = '13px sans-serif';
    ctx.fillText(label, x + w / 2, y + 70);
    ctx.textAlign = 'left';
    this.frame.add({ id, x, y, w, h, kind: 'icon', cursor: 'pointer', z: 5, onDbl: () => this.openApp(appId), onClick: () => this.openApp(appId) });
  }

  private drawWindow(ctx: CanvasRenderingContext2D, win: VosWindow, now: number): void {
    const app = this.apps.get(win.appId);
    if (!app) return;
    const focused = win.z === this.zCounter;
    const x = win.maximized ? 0 : win.x;
    const y = win.maximized ? 0 : win.y;
    const w = win.maximized ? this.W : win.w;
    const h = win.maximized ? this.H - TASKBAR_H : win.h;

    // سحب النافذة (يُنفذ قبل الرسم — حركة فورية بسيطة وموثوقة)
    if (this.dragWin && this.dragWin.id === win.id) {
      win.x = this.cursor.x - this.dragWin.dx;
      win.y = this.cursor.y - this.dragWin.dy;
      win.x = Math.max(-win.w + 120, Math.min(this.W - 60, win.x));
      win.y = Math.max(0, Math.min(this.H - TASKBAR_H - 30, win.y));
    }
    if (this.dragResize && this.dragResize.id === win.id) {
      const dr = this.dragResize;
      win.w = Math.max(320, dr.w0 + (this.cursor.x - dr.sx));
      win.h = Math.max(200, dr.h0 + (this.cursor.y - dr.sy));
    }

    // ظل
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, x + 4, y + 6, w, h, 10);
    ctx.fill();

    ctx.fillStyle = OS_COLORS.winBg;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = focused ? OS_COLORS.accent : OS_COLORS.winBorder;
    ctx.lineWidth = focused ? 1.6 : 1;
    roundRect(ctx, x, y, w, h, 8);
    ctx.stroke();

    // شريط العنوان
    const titleH = 30;
    ctx.fillStyle = focused ? OS_COLORS.titleFocus : OS_COLORS.titleBg;
    roundRect(ctx, x, y, w, titleH, 8);
    ctx.fill();
    ctx.fillStyle = OS_COLORS.titleText;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(win.titleAr, x + 12, y + 20);

    // أزرار النافذة (سلوك معلن: تصغير/تكبير/إغلاق)
    const btnW = 26;
    const btnY = y + 5;
    const doMax = (): void => {
      if (!win.maximized) {
        win.prev = { x: win.x, y: win.y, w: win.w, h: win.h };
        win.maximized = true;
      } else if (win.prev) {
        win.maximized = false;
        Object.assign(win, win.prev);
      }
      this.dirty = true;
    };
    const btns: Array<{ id: string; label: string; color: string; act: () => void }> = [
      { id: 'min', label: '—', color: '#5a6b7d', act: () => { win.minimized = true; this.dirty = true; } },
      { id: 'max', label: win.maximized ? '❐' : '□', color: '#5a6b7d', act: doMax },
      { id: 'close', label: '✕', color: OS_COLORS.danger, act: () => this.closeWindow(win.id) },
    ];
    let bx = x + w - 10 - btnW;
    for (const b of [...btns].reverse()) {
      ctx.fillStyle = b.color;
      roundRect(ctx, bx, btnY, btnW - 4, 20, 5);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, bx + (btnW - 4) / 2, btnY + 14);
      ctx.textAlign = 'left';
      this.frame.add({ id: `wbtn:${b.id}:${win.id}`, x: bx, y: btnY, w: btnW - 4, h: 20, kind: 'button', cursor: 'pointer', z: win.z + 2, onClick: () => b.act() });
      bx -= btnW;
    }
    this.frame.add({ id: `title:${win.id}`, x, y, w: w - 3 * btnW, h: titleH, kind: 'title', cursor: 'default', z: win.z + 1, onDbl: doMax });

    // محتوى التطبيق (قصّ داخل النافذة)
    ctx.save();
    roundRect(ctx, x + 1, y + titleH, w - 2, h - titleH - 1, 6);
    ctx.clip();
    ctx.translate(x, y + titleH);
    this.contentOrigin = { x, y: y + titleH };
    app.render(this, win, ctx, now);
    this.contentOrigin = { x: 0, y: 0 };
    ctx.restore();

    // مقبض التحجيم — الزاوية اليمنى السفلية
    if (!win.maximized) {
      const rx = x + w - 14;
      const ry = y + h - 14;
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.moveTo(rx + 12, ry);
      ctx.lineTo(rx + 12, ry + 12);
      ctx.lineTo(rx, ry + 12);
      ctx.closePath();
      ctx.fill();
      this.frame.add({ id: `resize:${win.id}`, x: rx, y: ry, w: 14, h: 14, kind: 'resize', cursor: 'default', z: win.z + 3 });
    }
  }

  private drawTaskbar(ctx: CanvasRenderingContext2D, now: number): void {
    const y = this.H - TASKBAR_H;
    ctx.fillStyle = OS_COLORS.taskbar;
    ctx.fillRect(0, y, this.W, TASKBAR_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(this.W, y + 0.5);
    ctx.stroke();

    const startHover = this.frame.hoverId === 'start';
    ctx.fillStyle = this.startOpen ? OS_COLORS.accent : startHover ? 'rgba(57,199,184,0.25)' : 'rgba(255,255,255,0.07)';
    roundRect(ctx, 8, y + 6, 66, 32, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ابدأ', 41, y + 28);
    ctx.textAlign = 'left';
    this.frame.add({ id: 'start', x: 8, y: y + 6, w: 66, h: 32, kind: 'button', cursor: 'pointer', z: 50, onClick: () => { this.startOpen = !this.startOpen; this.dirty = true; } });

    let bx = 86;
    for (const win of [...this.windows].sort((a, b) => a.z - b.z)) {
      const label = win.titleAr.slice(0, 14);
      const w = Math.max(96, 20 + label.length * 8);
      if (bx + w > this.W - 140) break;
      const active = win.z === this.zCounter && !win.minimized;
      ctx.fillStyle = active ? OS_COLORS.accentSoft : win.minimized ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)';
      roundRect(ctx, bx, y + 7, w - 6, 30, 6);
      ctx.fill();
      ctx.fillStyle = OS_COLORS.text;
      ctx.font = '12.5px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, bx + 10, y + 27);
      this.frame.add({
        id: `task:${win.id}`,
        x: bx, y: y + 7, w: w - 6, h: 30, kind: 'button', cursor: 'pointer', z: 50,
        onClick: () => {
          if (win.minimized) { win.minimized = false; this.focusWindow(win.id); }
          else if (win.z === this.zCounter) { win.minimized = true; this.dirty = true; }
          else this.focusWindow(win.id);
        },
      });
      bx += w;
    }

    const d = new Date(now);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    ctx.fillStyle = OS_COLORS.text;
    ctx.font = '14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${hh}:${mm}`, this.W - 16, y + 28);
    ctx.textAlign = 'left';
  }

  private drawStartMenu(ctx: CanvasRenderingContext2D): void {
    const w = 300;
    const h = Math.min(430, this.H - TASKBAR_H - 20);
    const x = 8;
    const y = this.H - TASKBAR_H - h - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, x + 5, y + 6, w, h, 12);
    ctx.fill();
    ctx.fillStyle = '#101820';
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = OS_COLORS.winBorder;
    roundRect(ctx, x, y, w, h, 12);
    ctx.stroke();
    ctx.fillStyle = OS_COLORS.accent;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('قائمة التطبيقات', x + 16, y + 30);

    let iy = y + 50;
    for (const app of this.apps.values()) {
      if (!app.desktop && app.id !== 'about') continue;
      const hovered = this.frame.hoverId === `sm:${app.id}`;
      if (hovered) {
        ctx.fillStyle = OS_COLORS.rowHover;
        roundRect(ctx, x + 8, iy - 4, w - 16, 40, 6);
        ctx.fill();
      }
      ctx.fillStyle = app.iconColor;
      roundRect(ctx, x + 14, iy, 32, 28, 6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(app.iconGlyph, x + 30, iy + 20);
      ctx.textAlign = 'left';
      ctx.fillStyle = OS_COLORS.text;
      ctx.font = '14px sans-serif';
      ctx.fillText(app.titleAr, x + 56, iy + 19);
      this.frame.add({ id: `sm:${app.id}`, x: x + 8, y: iy - 4, w: w - 16, h: 40, kind: 'button', cursor: 'pointer', z: 60, onClick: () => { this.startOpen = false; this.openApp(app.id); } });
      iy += 44;
      if (iy > y + h - 40) break;
    }
  }

  private ctxMenu: { x: number; y: number; items: Array<{ label: string; act: () => void }> } | null = null;

  private desktopContextMenu(x: number, y: number): void {
    const items: Array<{ label: string; act: () => void }> = [
      { label: 'معلومات النظام', act: () => this.openApp('settings') },
      { label: 'فتح مستكشف الملفات', act: () => this.openApp('explorer') },
      { label: 'إغلاق كل النوافذ', act: () => { this.windows = []; this.focusedTextbox = null; this.frame.keyHandler = null; this.dirty = true; } },
    ];
    this.ctxMenu = { x: Math.min(x, this.W - 200), y: Math.min(y, this.H - 130), items };
    this.dirty = true;
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, now: number): void {
    // قائمة السياق المعلقة
    if (this.ctxMenu) {
      const { x, y, items } = this.ctxMenu;
      const w = 190;
      const h = items.length * 34 + 10;
      ctx.fillStyle = '#0e151d';
      roundRect(ctx, x, y, w, h, 8);
      ctx.fill();
      ctx.strokeStyle = OS_COLORS.winBorder;
      roundRect(ctx, x, y, w, h, 8);
      ctx.stroke();
      let iy = y + 8;
      for (let i = 0; i < items.length; i++) {
        const hovered = this.frame.hoverId === `ctx:${i}`;
        if (hovered) {
          ctx.fillStyle = OS_COLORS.rowHover;
          ctx.fillRect(x + 4, iy, w - 8, 32);
        }
        ctx.fillStyle = OS_COLORS.text;
        ctx.font = '13.5px sans-serif';
        ctx.fillText(items[i].label, x + 12, iy + 21);
        const item = items[i];
        this.frame.add({ id: `ctx:${i}`, x: x + 4, y: iy, w: w - 8, h: 32, kind: 'button', cursor: 'pointer', z: 200, onClick: () => { this.ctxMenu = null; item.act(); } });
        iy += 34;
      }
      this.frame.add({ id: 'ctx:backdrop', x: 0, y: 0, w: this.W, h: this.H, kind: 'custom', cursor: 'default', z: 199, onClick: () => { this.ctxMenu = null; } });
    }

    // إشعارات
    let ty = 12;
    const keep: typeof this.toasts = [];
    for (const t of this.toasts) {
      const age = now - t.at;
      if (age > 4600) continue;
      keep.push(t);
      const alpha = age > 4000 ? 1 - (age - 4000) / 600 : 1;
      ctx.globalAlpha = alpha;
      const w = 280;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, this.W - w - 8, ty + 4, w, 74, 10);
      ctx.fill();
      ctx.fillStyle = '#101a24';
      roundRect(ctx, this.W - w - 12, ty, w, 74, 10);
      ctx.fill();
      ctx.strokeStyle = OS_COLORS.accent;
      roundRect(ctx, this.W - w - 12, ty, w, 74, 10);
      ctx.stroke();
      ctx.fillStyle = OS_COLORS.accent;
      ctx.font = 'bold 13.5px sans-serif';
      ctx.fillText(t.titleAr, this.W - w + 4, ty + 24);
      ctx.fillStyle = OS_COLORS.text;
      ctx.font = '12.5px sans-serif';
      this.wrapText(ctx, t.bodyAr, this.W - w + 4, ty + 44, w - 24, 17);
      ctx.globalAlpha = 1;
      ty += 84;
    }
    this.toasts = keep;
  }

  private drawCursor(ctx: CanvasRenderingContext2D): void {
    if (!this.cursor.visible) return;
    const { x, y } = this.cursor;
    // (v9) نبضة النقر: دائرة تتمدد وتتلاشى خلال 280ms عند آخر نقرة
    if (this.clickPulse) {
      const age = this.nowMs - this.clickPulse.at;
      if (age >= 0 && age < 280) {
        const t = age / 280;
        ctx.beginPath();
        ctx.arc(this.clickPulse.x, this.clickPulse.y, 6 + t * 22, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(57,199,184,${(0.75 * (1 - t)).toFixed(3)})`;
        ctx.lineWidth = 2.5 * (1 - t) + 0.6;
        ctx.stroke();
      } else {
        this.clickPulse = null;
      }
    }
    if (this.cursorKind === 'text') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1, y - 9, 2, 18);
      return;
    }
    // (v9) المؤشر ينكمش قليلًا أثناء الضغط — إحساس ملموس كأنظمة التشغيل الحقيقية
    const s = this.cursorPressed ? 0.88 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.translate(-x, -y);
    ctx.fillStyle = this.cursorKind === 'pointer' ? OS_COLORS.accent : '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 17);
    ctx.lineTo(x + 4.5, y + 12.5);
    ctx.lineTo(x + 7.5, y + 18.5);
    ctx.lineTo(x + 10, y + 17.3);
    ctx.lineTo(x + 7, y + 11.5);
    ctx.lineTo(x + 12.5, y + 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ============ برنامج UEFI الثابت (شاشة كاملة تفاعلية) ============

  private fwTab: 'main' | 'boot' | 'security' | 'advanced' = 'main';
  private fwFlash: number | null = null;

  /** بيانات البرنامج الثابت تُحقن من PCScene (قراءة من مصدر الحقيقة الواحد) */
  fwData: {
    cpuAr: string; ramAr: string; boardAr: string;
    tempsAr: string; fansAr: string;
    bootMode: 'bios' | 'uefi';
    bootOrder: string[]; secureBoot: boolean; tpm: boolean; xmp: boolean;
    devicesAr: string[];
    onBootOrder?: (order: string[]) => void;
    onToggle?: (key: 'secureBoot' | 'tpm' | 'xmp') => void;
    onBootMode?: (mode: 'bios' | 'uefi') => void;
    onExit?: (save: boolean) => void;
    onBootDevice?: (id: string) => void;
  } | null = null;

  private drawFirmware(ctx: CanvasRenderingContext2D, _now: number): void {
    const d = this.fwData;
    ctx.fillStyle = '#0a1424';
    ctx.fillRect(0, 0, this.W, this.H);
    if (!d) return;

    ctx.fillStyle = '#12233d';
    ctx.fillRect(0, 0, this.W, 54);
    ctx.fillStyle = '#e8eef7';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(d.bootMode === 'uefi' ? 'PC LAB UEFI SETUP UTILITY' : 'PC LAB BIOS SETUP UTILITY (Legacy/CSM)', 22, 35);
    ctx.fillStyle = OS_COLORS.accent;
    ctx.font = '15px monospace';
    ctx.fillText(d.boardAr, 420, 35);

    const tabs: Array<['main' | 'boot' | 'security' | 'advanced', string]> = [['main', 'Main'], ['boot', 'Boot'], ['security', 'Security'], ['advanced', 'Advanced']];
    let tx = 24;
    for (const [id, label] of tabs) {
      const w = 110;
      const active = this.fwTab === id;
      ctx.fillStyle = active ? '#1d3a5f' : 'rgba(255,255,255,0.04)';
      roundRect(ctx, tx, 68, w, 34, 7);
      ctx.fill();
      ctx.fillStyle = active ? '#ffffff' : '#9fb0c4';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, tx + w / 2, 90);
      ctx.textAlign = 'left';
      this.frame.add({ id: `fwtab:${id}`, x: tx, y: 68, w, h: 34, kind: 'button', cursor: 'pointer', z: 10, onClick: () => { this.fwTab = id; this.dirty = true; } });
      tx += w + 10;
    }

    const bodyY = 118;
    ctx.fillStyle = '#d7dfe9';
    ctx.font = '15px monospace';
    let y = bodyY + 26;

    const row = (label: string, value: string, color = '#d7dfe9'): void => {
      ctx.fillStyle = '#9fb0c4';
      ctx.fillText(label, 40, y);
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(value, this.W - 40, y);
      ctx.textAlign = 'left';
      y += 30;
    };

    if (this.fwTab === 'main') {
      row('Processor', d.cpuAr);
      row('Memory', d.ramAr);
      row('System Temperatures', d.tempsAr, '#7fd7a8');
      row('Fan Speeds (RPM, simulated)', d.fansAr, '#7fd7a8');
      row('Boot Mode', d.bootMode === 'uefi' ? 'UEFI' : 'Legacy BIOS (CSM)', d.bootMode === 'uefi' ? '#d7dfe9' : '#e8c47a');
      ctx.fillStyle = '#8b97a5';
      ctx.font = '13px monospace';
      ctx.fillText('محاكاة تعليمية — البيانات ليست قراءات حقيقية', 40, y + 10);
    } else if (this.fwTab === 'boot') {
      ctx.fillStyle = '#9fb0c4';
      ctx.fillText('Boot Option Priorities — ▲▼ لإعادة الترتيب • نقر مزدوج = الإقلاع من الجهاز الآن:', 40, y);
      y += 34;
      d.bootOrder.forEach((dev, i) => {
        const label = dev === 'usb' ? 'USB Installation Media' : (d.devicesAr.find((x) => x.startsWith(dev)) ?? dev);
        const active = i === 0;
        ctx.fillStyle = active ? '#12233d' : 'rgba(255,255,255,0.03)';
        roundRect(ctx, 36, y - 20, this.W - 76, 34, 6);
        ctx.fill();
        ctx.fillStyle = active ? '#39c7b8' : '#d7dfe9';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(`${i + 1}.  ${label}`, 48, y + 2);
        if (i > 0) {
          ctx.fillStyle = '#9fb0c4';
          ctx.fillText('▲', this.W - 130, y + 2);
          this.frame.add({ id: `fwup:${i}`, x: this.W - 140, y: y - 20, w: 30, h: 34, kind: 'button', cursor: 'pointer', z: 10, onClick: () => { const arr = [...d.bootOrder]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; d.onBootOrder?.(arr); this.dirty = true; } });
        }
        if (i < d.bootOrder.length - 1) {
          ctx.fillStyle = '#9fb0c4';
          ctx.fillText('▼', this.W - 90, y + 2);
          this.frame.add({ id: `fwdn:${i}`, x: this.W - 100, y: y - 20, w: 30, h: 34, kind: 'button', cursor: 'pointer', z: 10, onClick: () => { const arr = [...d.bootOrder]; [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; d.onBootOrder?.(arr); this.dirty = true; } });
        }
        this.frame.add({ id: `fwboot:${dev}`, x: 36, y: y - 20, w: this.W - 200, h: 34, kind: 'button', cursor: 'pointer', z: 9, onDbl: () => d.onBootDevice?.(dev) });
        y += 42;
      });
      ctx.fillStyle = '#8b97a5';
      ctx.font = '13px monospace';
      ctx.fillText('نقر مزدوج على جهاز = الإقلاع منه الآن (Boot Menu)', 40, y);
      y += 36;
      // (V6-D) مفتاح وضع الإقلاع: UEFI ⇄ BIOS/Legacy — يحدد أنماط GPT/MBR المسموحة
      this.fwToggle(ctx, 40, y, 'Boot Mode: UEFI ⇄ Legacy (CSM)', d.bootMode === 'uefi', () => { d.onBootMode?.(d.bootMode === 'uefi' ? 'bios' : 'uefi'); }, d.bootMode === 'uefi' ? 'الوضع الحالي UEFI — يقبل أقراص GPT فقط (XP/Vista لن تققلع منه). النقر يبدّل إلى BIOS/Legacy.' : 'الوضع الحالي BIOS/Legacy — يقبل أقراص MBR فقط (Windows 11 لن يققلع منه). النقر يبدّل إلى UEFI.');
    } else if (this.fwTab === 'security') {
      this.fwToggle(ctx, 40, y, 'Secure Boot', d.secureBoot, () => { d.onToggle?.('secureBoot'); }, 'مطلوب لـ Windows 11 — تعطيله يحجب تثبيتها (متطلب موثق)');
      y += 56;
      this.fwToggle(ctx, 40, y, 'TPM 2.0', d.tpm, () => { d.onToggle?.('tpm'); }, 'وحدة التشفير — شرط موثق لتثبيت Windows 11');
      y += 56;
      ctx.fillStyle = '#8b97a5';
      ctx.font = '13px monospace';
      ctx.fillText('تغيير هذه الإعدادات يؤثر مباشرة على محرك التثبيت والإقلاع في المحاكاة', 40, y + 8);
    } else {
      this.fwToggle(ctx, 40, y, 'XMP Memory Profile', d.xmp, () => { d.onToggle?.('xmp'); }, 'تفعيل ملف الذاكرة العالي (مفهوم تعليمي)');
      y += 56;
      ctx.fillStyle = '#9fb0c4';
      ctx.font = '15px monospace';
      ctx.fillText('Debug LEDs: CPU → DRAM → VGA → BOOT', 40, y);
    }

    ctx.fillStyle = '#12233d';
    ctx.fillRect(0, this.H - 46, this.W, 46);
    ctx.fillStyle = '#9fb0c4';
    ctx.font = '14px monospace';
    const saveMsg = this.fwFlash && Date.now() - this.fwFlash < 2200 ? 'Saved and exiting — أُعيد التشغيل بإعدادات جديدة' : 'Save & Exit (F10) — أو Exit بلا حفظ (Esc)';
    ctx.fillText(saveMsg, 22, this.H - 18);
    ctx.fillStyle = '#1d3a5f';
    roundRect(ctx, this.W - 220, this.H - 38, 96, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Save & Exit', this.W - 172, this.H - 19);
    ctx.fillStyle = '#28374a';
    roundRect(ctx, this.W - 114, this.H - 38, 96, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#c6d2e0';
    ctx.fillText('Exit', this.W - 66, this.H - 19);
    ctx.textAlign = 'left';
    this.frame.add({ id: 'fw:save', x: this.W - 220, y: this.H - 38, w: 96, h: 28, kind: 'button', cursor: 'pointer', z: 10, onClick: () => { this.fwFlash = Date.now(); setTimeout(() => d.onExit?.(true), 500); } });
    this.frame.add({ id: 'fw:exit', x: this.W - 114, y: this.H - 38, w: 96, h: 28, kind: 'button', cursor: 'pointer', z: 10, onClick: () => d.onExit?.(false) });
  }

  private fwToggle(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: boolean, onToggle: () => void, noteAr: string): void {
    ctx.fillStyle = '#9fb0c4';
    ctx.font = '15px monospace';
    ctx.fillText(label, x, y + 8);
    ctx.fillStyle = '#8b97a5';
    ctx.font = '12.5px sans-serif';
    ctx.fillText(noteAr, x, y + 28);
    const kx = this.W - 120;
    ctx.fillStyle = value ? OS_COLORS.ok : '#3a4654';
    roundRect(ctx, kx, y - 6, 58, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(value ? 'ON' : 'OFF', kx + 29, y + 11);
    ctx.textAlign = 'left';
    this.frame.add({ id: `fwt:${label}`, x: kx - 8, y: y - 10, w: 74, h: 34, kind: 'button', cursor: 'pointer', z: 10, onClick: onToggle });
  }

  // ============ بيئة الاسترداد (فشل إقلاع النظام — F16) ============

  recoveryData: {
    attempts: number;
    osNameAr: string;
    onStartupRepair?: () => void;
    onCommandPrompt?: () => void;
    onRestart?: () => void;
  } | null = null;

  /** (إصلاح F16 — تدقيق V6) موجه أوامر مفتوح من بيئة الاسترداد: يبقى مرئيًا ليمكن تنفيذ bootrec */
  recoveryCmdOpen: boolean = false;

  private drawRecovery(ctx: CanvasRenderingContext2D, _now: number): void {
    const d = this.recoveryData;
    ctx.fillStyle = '#06121e';
    ctx.fillRect(0, 0, this.W, this.H);
    if (!d) return;

    ctx.fillStyle = '#0d2233';
    ctx.fillRect(0, 0, this.W, 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('Recovery Environment — بيئة الاسترداد', 40, 52);
    ctx.fillStyle = '#9fb6c9';
    ctx.font = '16px sans-serif';
    ctx.fillText('لم يبدأ نظام التشغيل — بيانات إقلاعه (BCD) تالفة أو مفقودة', 40, 84);

    ctx.fillStyle = '#e8b4b4';
    ctx.font = '15px monospace';
    ctx.fillText('File: \\Boot\\BCD        Status: 0xc000000f        (رسالة محاكاة تعليمية)', 40, 140);

    ctx.fillStyle = '#d7dfe9';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('اختر خيارًا:', 40, 190);

    const opts: Array<{ label: string; note: string; act?: () => void; color?: string }> = [
      { label: 'Startup Repair — إصلاح بدء التشغيل', note: 'محاولة إصلاح تلقائية (قد تفشل وتشرح السبب)', act: () => d.onStartupRepair?.(), color: '#39c7b8' },
      { label: 'Command Prompt — موجه الأوامر', note: 'أوامر إصلاح الإقلاع التعليمية: bootrec /fixmbr /fixboot /scanos /rebuildbcd', act: () => d.onCommandPrompt?.(), color: '#39c7b8' },
      { label: 'Restart — إعادة التشغيل', note: 'أعد تشغيل الجهاز بعد الإصلاح', act: () => d.onRestart?.(), color: '#e8eef7' },
    ];
    let y = 216;
    for (const o of opts) {
      const hovered = this.frame.hoverId === `rec:${o.label}`;
      ctx.fillStyle = hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)';
      roundRect(ctx, 36, y, 560, 64, 9);
      ctx.fill();
      ctx.strokeStyle = o.color ?? '#39c7b8';
      roundRect(ctx, 36, y, 560, 64, 9);
      ctx.stroke();
      ctx.fillStyle = o.color ?? '#39c7b8';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(o.label, 54, y + 28);
      ctx.fillStyle = '#8b97a5';
      ctx.font = '13px sans-serif';
      ctx.fillText(o.note, 54, y + 50);
      this.frame.add({ id: `rec:${o.label}`, x: 36, y, w: 560, h: 64, kind: 'button', cursor: 'pointer', z: 10, onClick: () => o.act?.() });
      y += 76;
    }

    if (d.attempts > 0) {
      ctx.fillStyle = '#eab308';
      ctx.font = '14px sans-serif';
      ctx.fillText(`محاولات Startup Repair: ${d.attempts} — الإصلاح التلقائي لا يصلح تلف BCD العميق هنا؛ استخدم bootrec من موجه الأوامر.`, 40, y + 8);
    }
    ctx.fillStyle = '#5c6b7a';
    ctx.font = '13px sans-serif';
    ctx.fillText('بيئة استرداد محاكاة تعليمية — العتاد سليم: POST نجح بلا أخطاء (العطل F16 الموثق)', 40, this.H - 22);
  }

  wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): number {
    const words = text.split(/\s+/);
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = w;
        yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }
}
