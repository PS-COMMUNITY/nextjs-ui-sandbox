/**
 * apps.ts — تطبيقات النظام الافتراضي (V6-C): مستكشف ملفات، مفكرة، موجه أوامر
 * Sandbox، إدارة الأجهزة، إدارة الأقراص، الإعدادات، إدارة المهام.
 * ============================================================================
 * كل تطبيق يرسم نفسه بإحداثيات محلية (0,0 = أعلى يسار محتوى النافذة) ويسجّل
 * مستطيلات تفاعله عبر os.addRect — لا DOM ولا HTML ولا eval (توجيه §4.4).
 * قراءة/كتابة حالة الجهاز تمر من المتجر فقط (مصدر الحقيقة الواحد — توجيه §7).
 */
import { useLabStore } from '../store/labStore';
import { isInstalled } from '../types';
import type { ComponentId, VirtualDisk, VirtualPartition } from '../types';
import { OS_COLORS, roundRect, type VosAppDef, type VirtualOS, type VosKeyEvent, type VosWindow } from './vos';

// ============ أدوات مشتركة ============

function btn(
  os: VirtualOS, ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, label: string,
  onClick: () => void,
  opts: { color?: string; fg?: string; disabled?: boolean; small?: boolean } = {},
): void {
  const hovered = !opts.disabled && os.hoverAt(x, y, w, h);
  ctx.fillStyle = opts.disabled ? '#222b35' : hovered ? (opts.color ?? OS_COLORS.accent) : 'rgba(255,255,255,0.09)';
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = opts.disabled ? '#2a3440' : hovered ? 'rgba(255,255,255,0.35)' : OS_COLORS.winBorder;
  roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.fillStyle = opts.disabled ? '#5a6774' : (opts.fg ?? (hovered ? '#06231f' : OS_COLORS.text));
  ctx.font = opts.small ? '12px sans-serif' : 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + 4.5);
  ctx.textAlign = 'left';
  if (!opts.disabled) {
    os.addRect('button', x, y, w, h, { onClick }, 'pointer');
  }
}

interface TextboxState { text: string; }

function textbox(
  os: VirtualOS, ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  state: TextboxState,
  opts: { mono?: boolean; onEnter?: () => void; placeholder?: string; autoFocus?: boolean } = {},
): void {
  const focused = os.focusedTextbox?.get === (() => state.text);
  const hovered = os.hoverAt(x, y, w, h);
  ctx.fillStyle = OS_COLORS.inputBg;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = focused ? OS_COLORS.accent : hovered ? '#3d4c5c' : OS_COLORS.winBorder;
  roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 5);
  ctx.clip();
  ctx.fillStyle = OS_COLORS.text;
  ctx.font = opts.mono ? '13px monospace' : '13.5px sans-serif';
  const show = state.text || (opts.placeholder && !focused ? opts.placeholder : '');
  if (show) ctx.fillText(show, x + 10, y + h / 2 + 4.5);
  if (focused && os.blink) {
    const tw = ctx.measureText(state.text).width;
    ctx.fillStyle = OS_COLORS.accent;
    ctx.fillRect(x + 10 + tw + 1, y + 6, 2, h - 12);
  }
  ctx.restore();
  const focus = (): void => {
    os.focusedTextbox = {
      get: () => state.text,
      set: (t) => { state.text = t; },
      onEnter: opts.onEnter,
    };
    os.dirty = true;
  };
  os.addRect('custom', x, y, w, h, { onClick: focus }, 'text');
  if (opts.autoFocus && !os.focusedTextbox) focus();
}

function panelHeader(ctx: CanvasRenderingContext2D, w: number, titleAr: string, subAr?: string): number {
  ctx.fillStyle = OS_COLORS.text;
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(titleAr, 14, 24);
  if (subAr) {
    ctx.fillStyle = OS_COLORS.dim;
    ctx.font = '12px sans-serif';
    ctx.fillText(subAr, 14, 42);
  }
  ctx.strokeStyle = OS_COLORS.winBorder;
  ctx.beginPath();
  ctx.moveTo(0, 52.5);
  ctx.lineTo(w, 52.5);
  ctx.stroke();
  return 64;
}

// ============ نظام الملفات الافتراضي ============

export interface FsNode {
  name: string;
  kind: 'folder' | 'txt' | 'log';
  children?: FsNode[];
  content?: string;
}

function seedFs(): FsNode {
  return {
    name: 'C:',
    kind: 'folder',
    children: [
      { name: 'Windows', kind: 'folder', children: [{ name: 'System32', kind: 'folder', children: [{ name: 'drivers.log', kind: 'log', content: '[00:01] boot start ok\n[00:02] display driver: basic\n[00:03] storage ok' }] }] },
      { name: 'Program Files', kind: 'folder', children: [{ name: 'PC Lab Tools', kind: 'folder', children: [] }] },
      {
        name: 'Users', kind: 'folder',
        children: [{
          name: 'Student', kind: 'folder',
          children: [
            {
              name: 'Documents', kind: 'folder',
              children: [
                { name: 'readme.txt', kind: 'txt', content: 'مرحبًا بك في PC Lab OS.\nهذا ملف نصي حقيقي قابل للتعديل داخل المحاكاة:\nاكتب به من لوحة المفاتيح الحقيقية ثم احفظه من قائمة ملف.' },
                { name: 'notes.txt', kind: 'txt', content: 'ملاحظات التدريب:\n- POST != إقلاع\n- افصل الطاقة قبل أي عمل داخلي\n- المسامير في الصينية لا على الأرض :)' },
              ],
            },
            { name: 'Desktop', kind: 'folder', children: [] },
            { name: 'Downloads', kind: 'folder', children: [] },
          ],
        }],
      },
    ],
  };
}

function fsGet(root: FsNode, path: string[]): FsNode | null {
  let cur: FsNode = root;
  for (const seg of path) {
    const next = cur.children?.find((c) => c.name === seg);
    if (!next) return null;
    cur = next;
  }
  return cur;
}

/** (إصلاح تدقيق V6) نظام ملفات الجلسة المشترك: يبقى حيًا حتى بعد إغلاق المستكشف */
function sharedFs(os: VirtualOS): FsNode {
  if (!os.fsRoot) os.fsRoot = seedFs();
  return os.fsRoot as FsNode;
}

// ============ 1) مستكشف الملفات ============

const explorerApp: VosAppDef = {
  id: 'explorer',
  titleAr: 'مستكشف الملفات',
  iconColor: '#d9a03f',
  iconGlyph: '🗂',
  defaultW: 560,
  defaultH: 380,
  desktop: true,
  render: (os, win, ctx) => {
    if (!win) return;
    const w = win.maximized ? os.W : win.w;
    const h = (win.maximized ? os.H - os.taskbarH : win.h) - 30;
    if (!win.state['path']) win.state['path'] = ['Users', 'Student', 'Documents'];
    const fs = sharedFs(os);
    const path = win.state['path'] as string[];
    const sel = win.state['sel'] as string | null;

    const top = panelHeader(ctx, w, 'مستكشف الملفات — القرص C:', 'محاكاة تعليمية: ملفات وهمية داخل Sandbox');
    // شريط المسار + زر أعلى
    btn(os, ctx, 14, top, 64, 26, '⬆ أعلى', () => { if (path.length) { path.pop(); win.state['sel'] = null; os.dirty = true; } }, { small: true });
    ctx.fillStyle = OS_COLORS.inputBg;
    roundRect(ctx, 86, top, w - 100, 26, 6);
    ctx.fill();
    ctx.strokeStyle = OS_COLORS.winBorder;
    roundRect(ctx, 86, top, w - 100, 26, 6);
    ctx.stroke();
    ctx.fillStyle = OS_COLORS.text;
    ctx.font = '12.5px monospace';
    ctx.fillText('C:\\' + path.join('\\'), 96, top + 18);

    // قائمة العناصر
    const node = fsGet(fs, path);
    const listY = top + 38;
    if (!node) {
      ctx.fillStyle = OS_COLORS.dim;
      ctx.fillText('المسار غير موجود', 20, listY + 20);
      return;
    }
    const items = node.children ?? [];
    const rowH = 30;
    let iy = listY + 8;
    for (const item of items) {
      const hovered = os.hoverAt(10, iy, w - 20, rowH);
      if (sel === item.name || hovered) {
        ctx.fillStyle = sel === item.name ? OS_COLORS.rowSelect : OS_COLORS.rowHover;
        roundRect(ctx, 10, iy, w - 20, rowH, 5);
        ctx.fill();
      }
      ctx.font = '14px sans-serif';
      ctx.fillStyle = item.kind === 'folder' ? '#e2b355' : '#9fd6c8';
      ctx.fillText(item.kind === 'folder' ? '📁' : '📄', 20, iy + 20);
      ctx.fillStyle = OS_COLORS.text;
      ctx.fillText(item.name, 46, iy + 20);
      ctx.fillStyle = OS_COLORS.dim;
      ctx.font = '11.5px sans-serif';
      ctx.fillText(item.kind === 'folder' ? 'مجلد' : item.kind === 'log' ? 'سجل' : 'ملف نصي', w - 90, iy + 20);
      const captured = item;
      os.addRect('row', 10, iy, w - 20, rowH, {
        onClick: () => { win.state['sel'] = captured.name; os.dirty = true; },
        onDbl: () => {
          if (captured.kind === 'folder') { path.push(captured.name); win.state['sel'] = null; os.dirty = true; }
          else {
            const n = os.openApp('notepad', { fileName: captured.name, content: captured.content ?? '', path: [...path] });
            if (n) n.titleAr = `${captured.name} — المفكرة`;
          }
        },
      });
      iy += rowH;
    }
    if (items.length === 0) {
      ctx.fillStyle = OS_COLORS.dim;
      ctx.fillText('المجلد فارغ', 20, listY + 24);
    }
  },
};

// ============ 2) المفكرة ============

const notepadApp: VosAppDef = {
  id: 'notepad',
  titleAr: 'المفكرة',
  iconColor: '#5f9fd9',
  iconGlyph: '📝',
  defaultW: 540,
  defaultH: 360,
  desktop: true,
  render: (os, win, ctx) => {
    if (!win) return;
    const w = win.maximized ? os.W : win.w;
    const h = (win.maximized ? os.H - os.taskbarH : win.h) - 30;
    if (typeof win.state['text'] !== 'string') {
      win.state['text'] = (win.state['content'] as string) ?? '';
      win.state['saved'] = (win.state['content'] as string) ?? '';
    }
    const st = win.state as { text: string; saved: string };
    const top = panelHeader(ctx, w, 'المفكرة — الكتابة بلوحة المفاتيح الحقيقية', 'ملف: حفظ يكتب في Documents — Enter/Backspace/الأسهم تعمل داخل الشاشة المجسمة');

    btn(os, ctx, 14, top, 84, 26, 'حفظ في Documents', () => {
      const store = useLabStore.getState();
      const fsRoot = sharedFs(os);
      const docs = fsGet(fsRoot, ['Users', 'Student', 'Documents']);
      const name = (win.state['fileName'] as string) ?? `note-${Date.now() % 10000}.txt`;
      if (docs) {
        const existing = docs.children?.find((c) => c.name === name);
        if (existing) existing.content = st.text;
        else docs.children?.push({ name, kind: 'txt', content: st.text });
      }
      st.saved = st.text;
      os.notify('تم الحفظ', `الحفظ تعليمي داخل المحاكاة: Documents\\${name}`);
    }, { small: true });
    btn(os, ctx, 106, top, 56, 26, 'جديد', () => { st.text = ''; os.focusedTextbox = null; os.dirty = true; }, { small: true });
    btn(os, ctx, 170, top, 56, 26, 'مسح', () => { st.text = ''; os.dirty = true; }, { small: true });

    // منطقة النص متعددة الأسطر
    const ty = top + 38;
    const th = h - ty - 26;
    ctx.fillStyle = OS_COLORS.inputBg;
    roundRect(ctx, 10, ty, w - 20, th, 6);
    ctx.fill();
    ctx.strokeStyle = os.focusedTextbox ? OS_COLORS.accent : OS_COLORS.winBorder;
    roundRect(ctx, 10, ty, w - 20, th, 6);
    ctx.stroke();

    const lines = st.text.split('\n');
    ctx.fillStyle = OS_COLORS.text;
    ctx.font = '13.5px sans-serif';
    let ly = ty + 22;
    for (const line of lines.slice(-Math.floor((th - 16) / 19))) {
      ctx.fillText(line, 20, ly);
      ly += 19;
    }
    if (os.blink && os.focusedTextbox) {
      const lastW = ctx.measureText(lines[lines.length - 1] ?? '').width;
      ctx.fillStyle = OS_COLORS.accent;
      ctx.fillRect(20 + lastW + 1, ty + th - 24, 2, 16);
    }

    // توجيه الكتابة: التطبيق النشط يلتقط المفاتيح (النقر داخل المنطقة يفعّل التركيز)
    const areaState: TextboxState = { text: st.text };
    const keyHandler = (ev: VosKeyEvent): boolean => {
      if (ev.key === 'Backspace') { st.text = st.text.slice(0, -1); os.dirty = true; return true; }
      if (ev.key === 'Enter') { st.text += '\n'; os.dirty = true; return true; }
      if (ev.key === 'Tab') { st.text += '    '; os.dirty = true; return true; }
      if (ev.key.length === 1 && !ev.ctrl && !ev.alt && !ev.meta) {
        st.text += ev.shift ? ev.key.toUpperCase() : ev.key;
        os.dirty = true;
        return true;
      }
      return false;
    };
    os.addRect('custom', 10, ty, w - 20, th, { onClick: () => { os.ui.keyHandler = keyHandler; os.dirty = true; } }, 'text');
    // التركيز الافتراضي: نافذة المفكرة المركزة تستقبل الكتابة مباشرة
    if (os.windows.length > 0 && win.z === Math.max(...os.windows.map((x) => x.z))) {
      os.ui.keyHandler = keyHandler;
    }
    ctx.fillStyle = OS_COLORS.dim;
    ctx.font = '11.5px sans-serif';
    ctx.fillText(`${st.text.length} حرف${st.text !== st.saved ? ' — غير محفوظ' : ''}`, 14, h - 10);
  },
};

// ============ 3) موجه الأوامر (Sandbox) ============

const cmdApp: VosAppDef = {
  id: 'cmd',
  titleAr: 'موجه الأوامر — Sandbox تعليمي',
  iconColor: '#3d3d3d',
  iconGlyph: '⌨',
  defaultW: 620,
  defaultH: 400,
  desktop: true,
  render: (os, win, ctx) => {
    if (!win) return;
    const w = win.maximized ? os.W : win.w;
    const h = (win.maximized ? os.H - os.taskbarH : win.h) - 30;
    if (!win.state['lines']) {
      win.state['lines'] = [
        'PC Lab Command Sandbox — محاكاة أوامر تعليمية آمنة',
        'الأوامر المنفذة هنا داخل المحاكاة فقط ولا تلمس نظامك الحقيقي.',
        'اكتب help لعرض الأوامر المتاحة.',
        '',
      ];
      win.state['input'] = '';
      win.state['cwd'] = 'C:\\Users\\Student';
    }
    const st = win.state as unknown as { lines: string[]; input: string; cwd: string };

    const maxLines = Math.floor((h - 60) / 18);
    ctx.fillStyle = '#0a0f14';
    roundRect(ctx, 0, 0, w, h, 0);
    ctx.fill();
    ctx.font = '13px monospace';
    let y = 22;
    for (const line of st.lines.slice(-maxLines)) {
      ctx.fillStyle = line.startsWith('!!') ? '#e35d5d' : line.startsWith('OK') || line.includes('مكتمل') ? '#34d399' : '#c9d6e4';
      ctx.fillText(line, 12, y);
      y += 18;
    }
    // سطر الإدخال
    const prompt = `${st.cwd}> `;
    ctx.fillStyle = '#39c7b8';
    ctx.fillText(prompt + st.input, 12, y);
    if (os.blink) {
      const tw = ctx.measureText(prompt + st.input).width;
      ctx.fillStyle = '#39c7b8';
      ctx.fillRect(12 + tw + 1, y - 12, 7, 14);
    }

    const exec = (): void => {
      const cmdLine = st.input.trim();
      st.lines.push(`${st.cwd}> ${cmdLine}`);
      st.input = '';
      if (cmdLine) runCommand(os, win!, st, cmdLine);
      os.dirty = true;
    };

    const keyHandler = (ev: VosKeyEvent): boolean => {
      if (ev.key === 'Enter') { exec(); return true; }
      if (ev.key === 'Backspace') { st.input = st.input.slice(0, -1); os.dirty = true; return true; }
      if (ev.key.length === 1 && !ev.ctrl && !ev.alt && !ev.meta) {
        st.input += ev.key;
        os.dirty = true;
        return true;
      }
      return false;
    };
    os.addRect('custom', 0, 0, w, h, { onClick: () => { os.ui.keyHandler = keyHandler; os.dirty = true; } }, 'text');
    if (win.z === Math.max(...os.windows.map((x) => x.z))) {
      os.ui.keyHandler = keyHandler;
    }
    ctx.fillStyle = '#4a5a68';
    ctx.font = '11.5px sans-serif';
    ctx.fillText('Sandbox تعليمي: help • dir • cd • ver • systeminfo • ipconfig • driverquery • diskpart • sfc • chkdsk • exit', 12, h - 10);
  },
};

/** منفذ الأوامر التعليمي — كل الأوامر داخل المحاكاة فقط (توجيه §12: لا أوامر نظام حقيقية) */
function runCommand(os: VirtualOS, win: VosWindow, st: { lines: string[]; input: string; cwd: string }, raw: string): void {
  const store = useLabStore.getState();
  const [cmd, ...rest] = raw.split(/\s+/);
  const arg = rest.join(' ');
  const out = (...lines: string[]): void => { st.lines.push(...lines); };
  switch ((cmd ?? '').toLowerCase()) {
    case 'help':
      out('الأوامر المتاحة (محاكاة تعليمية):',
        '  help, cls, echo, ver, systeminfo, ipconfig, ping',
        '  dir, cd <folder>, type <file.txt>',
        '  driverquery, diskpart, tasklist',
        '  sfc /scannow, chkdsk C:',
        '  bootrec /fixmbr | /fixboot | /rebuildbcd   (فقط من بيئة الاسترداد)',
        '  shutdown /r — إعادة تشغيل الجهاز الافتراضي, exit');
      break;
    case 'cls':
      st.lines = [];
      break;
    case 'echo':
      out(arg || '');
      break;
    case 'ver':
      out(store.sim.os.installed ? `PC Lab OS (محاكاة تعليمية بنمط ${store.sim.os.installed}) — Build 6.0.0-sim` : 'لا نظام مثبت — وسيط التثبيت مطلوب');
      break;
    case 'systeminfo': {
      const t = store.sim.thermal;
      out('Host Name:                 PC-LAB-01',
        `OS Name:                   ${store.sim.os.installed ? 'Virtual Windows (' + store.sim.os.installed + ')' : '—'}`,
        'System Model:              Reference ATX Build (simulated)',
        'Processor:                 LGA1700 — 6C/12T (reference)',
        'Total Physical Memory:     32 GB DDR5',
        `CPU Temperature:           ${t.cpuTempC.toFixed(0)} °C (simulated)`,
        `GPU Temperature:           ${t.gpuTempC.toFixed(0)} °C (simulated)`,
        'ملاحظة: كل القيم بيانات محاكاة تعليمية وليست قراءات حقيقية.');
      break;
    }
    case 'ipconfig':
      out('Ethernet adapter Virtual Lab NIC:',
        '   IPv4 Address. . . : 192.168.10.50',
        '   Subnet Mask . . . : 255.255.255.0',
        '   Default Gateway . : 192.168.10.1',
        '   DNS . . . . . . . : 192.168.10.1 (بيئة افتراضية معزولة)');
      break;
    case 'ping':
      out(`Pinging ${arg || 'gateway'} [192.168.10.1] with 32 bytes of data:`,
        'Reply from 192.168.10.1: bytes=32 time<1ms TTL=64',
        'Reply from 192.168.10.1: bytes=32 time<1ms TTL=64',
        '(محاكاة شبكة افتراضية معزولة — لا اتصال خارجي)');
      break;
    case 'dir': {
      const fsRoot = sharedFs(os);
      const rel = st.cwd.replace('C:\\', '').split('\\').filter(Boolean);
      const node = fsGet(fsRoot, rel);
      if (!node?.children) { out('!! المجلد غير موجود'); break; }
      out(` Directory of ${st.cwd}`, '');
      for (const c of node.children) out(`  ${c.kind === 'folder' ? '<DIR>         ' : '        ' + String((c.content?.length ?? 0)).padStart(5)}  ${c.name}`);
      break;
    }
    case 'cd': {
      if (!arg || arg === '\\') { st.cwd = 'C:\\'; break; }
      if (arg === '..') { const parts = st.cwd.split('\\'); if (parts.length > 1) parts.pop(); st.cwd = parts.join('\\') || 'C:\\'; break; }
      const target = arg.replace(/^C:\\?/, '');
      const fsRoot = sharedFs(os);
      const rel = st.cwd.replace('C:\\', '').split('\\').filter(Boolean);
      const node = fsGet(fsRoot, [...rel, ...target.split('\\').filter(Boolean)]);
      if (node && node.kind === 'folder') st.cwd = 'C:\\' + [...rel, ...target.split('\\').filter(Boolean)].join('\\');
      else out('!! The system cannot find the path specified.');
      break;
    }
    case 'type': {
      const fsRoot = sharedFs(os);
      const rel = st.cwd.replace('C:\\', '').split('\\').filter(Boolean);
      const node = fsGet(fsRoot, [...rel, arg]) ?? fsGet(fsRoot, arg.replace(/^C:\\/, '').split('\\').filter(Boolean));
      if (node && node.kind !== 'folder') out(...(node.content ?? '').split('\n'));
      else out('!! File not found.');
      break;
    }
    case 'driverquery': {
      out('Module Name    Status', '-----------    ------');
      const missing = store.sim.os.driversMissing;
      out(`display        ${missing.includes('gpu') ? 'MISSING — مثلث أصفر في Device Manager' : 'OK'}`);
      out('storage        OK', 'network        OK', 'audio          OK',
        'ملاحظة: لتثبيت التعريف افتح Device Manager ← تحديث التعريف.');
      break;
    }
    case 'diskpart':
      out('Disk Management أفضل place لهذه العمليات — افتحها من قائمة ابدأ.',
        'Disk ###  Status     Size',
        'Disk 0    Online     1000 GB  (M.2 NVMe)',
        'Disk 1    Online     1000 GB  (SATA)');
      break;
    case 'tasklist':
      out('Image Name           PID   Mem Usage',
        'System                 4   0.1 MB',
        'explorer.exe        1244   42 MB',
        'pclab-sandbox.exe   2080   18 MB  (هذه المحاكاة)');
      break;
    case 'sfc':
      out('Starting system scan. This process will take some time...',
        'Verification 45% complete...',
        'Verification 100% complete.',
        'OK: Windows Resource Protection did not find any integrity violations. (محاكاة تعليمية)');
      break;
    case 'chkdsk':
      out(`Stage 1: Examining basic file system structure ... OK`,
        'Stage 2: Examining file name linkage ... OK',
        'Stage 3: Examining security descriptors ... OK',
        'OK: No further action is required. (محاكاة تعليمية — SMART/فحص الأقراص هنا بيانات تدريب)');
      break;
    case 'bootrec': {
      if (!win.state['recovery']) {
        out('!! bootrec متاح فقط من بيئة الاسترداد (Recovery) — أعد التشغيل واختر Command Prompt من هناك.');
        break;
      }
      const opt = (rest[0] ?? '').toLowerCase();
      if (opt === '/fixmbr' || opt === '/fixboot' || opt === '/rebuildbcd') {
        useLabStore.getState().repairBcd();
        out(`OK: ${opt} completed successfully. (محاكاة تعليمية)`,
          'أعد تشغيل الجهاز الآن — shutdown /r');
      } else {
        out('الاستخدام: bootrec /fixmbr | /fixboot | /rebuildbcd | /scanos');
      }
      break;
    }
    case 'shutdown':
      if (rest[0] === '/r') {
        // (إصلاح تدقيق V6) /r تعني إعادة تشغيل — كانت تُطفئ الجهاز فقط
        useLabStore.getState().warmRestart();
        out('OK: الجهاز الافتراضي يُعيد التشغيل...');
      } else out('الاستخدام: shutdown /r — إعادة تشغيل الجهاز الافتراضي');
      break;
    case 'exit':
      os.closeWindow(win.id);
      break;
    default:
      out(`'${cmd}' is not recognized as an internal or external command.`,
          'هذه Sandbox تعليمية: اكتب help لعرض الأوامر المتاحة.');
      break;
  }
}

// ============ 4) إدارة الأجهزة ============

interface DevNode { id: string; nameAr: string; componentId: ComponentId | null; present: boolean; missing: boolean; }

const devmgrApp: VosAppDef = {
  id: 'devmgr',
  titleAr: 'إدارة الأجهزة — Device Manager',
  iconColor: '#7a6bd9',
  iconGlyph: '🧩',
  defaultW: 560,
  defaultH: 400,
  desktop: true,
  render: (os, win, ctx) => {
    if (!win) return;
    const w = win.maximized ? os.W : win.w;
    const h = (win.maximized ? os.H - os.taskbarH : win.h) - 30;
    const store = useLabStore.getState();
    const top = panelHeader(ctx, w, 'Device Manager', 'قراءة حية من حالة الجهاز الفعلية في المحاكاة (مصدر الحقيقة الواحد)');

    const groups: Array<{ catAr: string; nodes: DevNode[] }> = [
      {
        catAr: 'معالجات',
        nodes: [{ id: 'cpu', nameAr: 'LGA1700 — 6C/12T (مرجعي)', componentId: 'cpu', present: isInstalled(store.sim.parts.cpu), missing: false }],
      },
      {
        catAr: 'الذاكرة',
        nodes: [{ id: 'ram', nameAr: 'DDR5 32GB (2×16) @5200', componentId: 'ram', present: isInstalled(store.sim.parts.ram), missing: false }],
      },
      {
        catAr: 'محولات العرض',
        nodes: [{ id: 'gpu', nameAr: 'بطاقة رسوميات PCIe x16 (مرجعية)', componentId: 'gpu', present: isInstalled(store.sim.parts.gpu), missing: store.sim.os.driversMissing.includes('gpu') }],
      },
      {
        catAr: 'محركات الأقراص',
        nodes: [
          { id: 'ssd', nameAr: 'M.2 NVMe SSD 1000GB', componentId: 'ssd', present: isInstalled(store.sim.parts.ssd), missing: false },
          { id: 'hdd', nameAr: 'SATA HDD 3.5" 1000GB', componentId: 'hdd', present: isInstalled(store.sim.parts.hdd), missing: false },
        ],
      },
      {
        catAr: 'التخزين والمنافذ',
        nodes: [
          { id: 'sataData', nameAr: 'SATA Controller (كابل البيانات)', componentId: 'sataData', present: isInstalled(store.sim.parts.sataData), missing: false },
          { id: 'frontPanel', nameAr: 'USB/Front Panel Headers', componentId: null, present: !store.sim.flags.frontPanelDisconnected, missing: false },
        ],
      },
    ];

    if (typeof win.state['sel'] !== 'string') win.state['sel'] = '';
    const sel = win.state['sel'] as string;

    const listW = Math.min(330, w * 0.62);
    let y = top + 8;
    ctx.font = '13.5px sans-serif';
    for (const g of groups) {
      ctx.fillStyle = OS_COLORS.dim;
      ctx.font = 'bold 12.5px sans-serif';
      ctx.fillText(`▸ ${g.catAr}`, 14, y + 14);
      y += 26;
      for (const node of g.nodes) {
        const selected = sel === node.id;
        if (selected || os.hoverAt(12, y, listW, 26)) {
          ctx.fillStyle = selected ? OS_COLORS.rowSelect : OS_COLORS.rowHover;
          roundRect(ctx, 12, y, listW, 26, 5);
          ctx.fill();
        }
        ctx.font = '13px sans-serif';
        if (node.missing) {
          ctx.fillStyle = OS_COLORS.warn;
          ctx.fillText('⚠', 18, y + 18);
        } else if (!node.present) {
          ctx.fillStyle = OS_COLORS.danger;
          ctx.fillText('✖', 18, y + 18);
        } else {
          ctx.fillStyle = OS_COLORS.ok;
          ctx.fillText('✔', 18, y + 18);
        }
        ctx.fillStyle = OS_COLORS.text;
        ctx.fillText(node.nameAr, 38, y + 18);
        os.addRect('row', 12, y, listW, 26, { onClick: () => { win.state['sel'] = node.id; os.dirty = true; } });
        y += 28;
      }
    }

    // لوحة التفاصيل والأفعال (يمين)
    const dx = listW + 26;
    const dw = w - dx - 14;
    ctx.strokeStyle = OS_COLORS.winBorder;
    ctx.beginPath();
    ctx.moveTo(dx - 10, top);
    ctx.lineTo(dx - 10, h);
    ctx.stroke();
    const node = groups.flatMap((g) => g.nodes).find((n) => n.id === sel);
    ctx.font = '13px sans-serif';
    if (!node) {
      ctx.fillStyle = OS_COLORS.dim;
      ctx.fillText('اختر جهازًا من القائمة لعرض حالته وأفعاله.', dx, top + 24);
      return;
    }
    let dy = top + 6;
    ctx.fillStyle = OS_COLORS.text;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(node.nameAr, dx, dy + 14);
    dy += 30;
    const status = node.missing ? '⚠ يعمل بتعريف أساسي — التعريف المخصص مفقود' : node.present ? '✔ يعمل بشكل صحيح' : '✖ غير مثبت في الجهاز (غياب فعلي)';
    ctx.fillStyle = node.missing ? OS_COLORS.warn : node.present ? OS_COLORS.ok : OS_COLORS.danger;
    ctx.fillText(status, dx, dy);
    dy += 30;
    ctx.fillStyle = OS_COLORS.dim;
    ctx.font = '12px sans-serif';
    ctx.fillText('الأفعال هنا محاكاة تعليمية آمنة داخل Sandbox.', dx, dy);
    dy += 26;

    if (node.missing) {
      btn(os, ctx, dx, dy, Math.min(dw, 190), 30, 'تحديث التعريف (Update)', () => {
        const s = useLabStore.getState();
        if (node.componentId) s.fixDriver(node.componentId);
        os.notify('تم تحديث التعريف', `${node.nameAr}: استُبدل التعريف الأساسي بالتعريف الكامل (محاكاة تعليمية).`);
      });
      dy += 40;
    }
    if (!node.present && node.componentId) {
      ctx.fillStyle = OS_COLORS.warn;
      ctx.font = '12px sans-serif';
      const lines = [
        'الجهاز غائب فعليًا عن اللوحة — التعريف لن يحل المشكلة.',
        'الإصلاح الصحيح: أعد تركيب القطعة (من المختبر 3D) ثم أعد الفحص.',
      ];
      for (const l of lines) { ctx.fillText(l, dx, dy); dy += 18; }
    }
    if (node.present && !node.missing) {
      btn(os, ctx, dx, dy, Math.min(dw, 150), 28, 'تحديث التعريف', () => os.notify('Device Manager', 'التعريف محدث بالفعل — أحدث إصدار (محاكاة).'), { small: true });
      btn(os, ctx, dx + 160, dy, 130, 28, 'إلغاء التثبيت', () => os.notify('Device Manager', 'الإلغاء التعليمي: الجهاز سيُكتشف مجددًا عند إعادة الفحص (لا تغيير فعلي).'), { small: true });
    }
  },
};

// ============ 5) إدارة الأقراص ============

const diskmgmtApp: VosAppDef = {
  id: 'diskmgmt',
  titleAr: 'إدارة الأقراص — Disk Management',
  iconColor: '#3f9d6b',
  iconGlyph: '💽',
  defaultW: 640,
  defaultH: 420,
  desktop: true,
  render: (os, win, ctx) => {
    if (!win) return;
    const w = win.maximized ? os.W : win.w;
    const h = (win.maximized ? os.H - os.taskbarH : win.h) - 30;
    const store = useLabStore.getState();
    const top = panelHeader(ctx, w, 'Disk Management — Sandbox', 'كل العمليات على أقراص المحاكاة الافتراضية فقط — لا تلمس أقراصك الحقيقية إطلاقًا');

    if (typeof win.state['dialog'] !== 'object') win.state['dialog'] = null;
    const dialog = win.state['dialog'] as null | { kind: string; diskId?: string; partId?: string };

    let y = top + 6;
    for (const disk of store.sim.disks) {
      const available = disk.bus === 'nvme' ? isInstalled(store.sim.parts.ssd) : (isInstalled(store.sim.parts.hdd) && isInstalled(store.sim.parts.sataData) && isInstalled(store.sim.parts.sataPower));
      ctx.fillStyle = OS_COLORS.text;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`قرص ${disk.id === 'm2-1' ? '0' : '1'} — ${disk.labelAr} (${disk.sizeGB} GB)`, 14, y + 14);
      ctx.fillStyle = available ? OS_COLORS.dim : OS_COLORS.danger;
      ctx.font = '12px sans-serif';
      ctx.fillText(available ? `${disk.bus.toUpperCase()} • ${disk.style ? (disk.style === 'gpt' ? 'GPT' : 'MBR') : 'غير مهيأ (Not Initialized)'}` : 'غير متاح: القطعة مفصولة (افحص المختبر)', 14, y + 32);
      y += 44;

      if (!available) { y += 18; continue; }

      // شريط القرص
      const barX = 14;
      const barW = w - 150;
      const barH = 54;
      ctx.fillStyle = '#0d141b';
      roundRect(ctx, barX, y, barW, barH, 6);
      ctx.fill();
      ctx.strokeStyle = OS_COLORS.winBorder;
      roundRect(ctx, barX, y, barW, barH, 6);
      ctx.stroke();

      if (!disk.style) {
        ctx.fillStyle = '#4a3a18';
        ctx.fillRect(barX + 2, y + 2, barW - 4, barH - 4);
        ctx.fillStyle = '#eab308';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Unallocated — غير مهيأ', barX + barW / 2, y + 26);
        ctx.font = '12px sans-serif';
        ctx.fillText(`(${disk.sizeGB} GB)`, barX + barW / 2, y + 42);
        ctx.textAlign = 'left';
        btn(os, ctx, barX + barW + 10, y + 10, 118, 30, 'تهيئة القرص…', () => { win.state['dialog'] = { kind: 'init', diskId: disk.id }; os.dirty = true; }, { small: true });
      } else {
        const total = disk.parts.reduce((a, p) => a + p.sizeGB, 0);
        const unalloc = Math.max(0, disk.sizeGB - total);
        let px = barX + 2;
        const availW = barW - 4;
        for (const part of disk.parts) {
          const pw = Math.max(6, (part.sizeGB / disk.sizeGB) * availW);
          const colors: Record<string, string> = { efi: '#2d6b4f', msr: '#2b3a4a', recovery: '#5a4a2b', primary: '#22698a' };
          ctx.fillStyle = colors[part.kind] ?? '#22698a';
          ctx.fillRect(px, y + 2, pw - 2, barH - 4);
          if (pw > 40) {
            ctx.fillStyle = '#eaf3f8';
            ctx.font = 'bold 11.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(part.letter ? `(${part.letter})` : '', px + pw / 2, y + 18);
            ctx.fillText(part.kind === 'efi' ? 'EFI' : part.kind === 'msr' ? 'MSR' : part.label.slice(0, 10), px + pw / 2, y + 33);
            ctx.font = '10.5px sans-serif';
            ctx.fillText(`${part.sizeGB.toFixed(part.sizeGB < 1 ? 2 : 0)} GB`, px + pw / 2, y + 46);
            ctx.textAlign = 'left';
          }
          const captured = part;
          os.addRect('row', px, y, pw - 2, barH, {
            onClick: () => { win.state['dialog'] = { kind: 'part', diskId: disk.id, partId: captured.id }; os.dirty = true; },
          });
          px += pw;
        }
        if (unalloc > 0.01) {
          const uw = Math.max(6, (unalloc / disk.sizeGB) * availW);
          ctx.fillStyle = '#23303c';
          ctx.fillRect(px, y + 2, uw - 2, barH - 4);
          ctx.fillStyle = '#9fb0c4';
          ctx.font = '11.5px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Unallocated', px + uw / 2, y + 22);
          ctx.fillText(`${unalloc.toFixed(0)} GB`, px + uw / 2, y + 38);
          ctx.textAlign = 'left';
          const capDisk = disk;
          os.addRect('row', px, y, uw - 2, barH, {
            onClick: () => { win.state['dialog'] = { kind: 'newvol', diskId: capDisk.id }; os.dirty = true; },
          });
        }
        y += barH + 8;
        btn(os, ctx, 14, y, 120, 26, 'قسم جديد…', () => { win.state['dialog'] = { kind: 'newvol', diskId: disk.id }; }, { small: true });
        btn(os, ctx, 142, y, 110, 26, 'تحديث', () => { os.dirty = true; }, { small: true });
        y += 40;
      }
      y += 6;
    }

    // ============ الحوارات (تهيئة/قسم جديد/تفاصيل قسم) ============
    if (dialog) drawDiskDialog(os, win, ctx, w, h, dialog);
  },
};

function drawDiskDialog(os: VirtualOS, win: VosWindow, ctx: CanvasRenderingContext2D, w: number, h: number, dialog: { kind: string; diskId?: string; partId?: string }): void {
  const store = useLabStore.getState();
  const disk = store.sim.disks.find((d) => d.id === dialog.diskId);
  const part = disk?.parts.find((p) => p.id === dialog.partId);
  const dw = Math.min(420, w - 60);
  const dh = 210;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#131c26';
  roundRect(ctx, dx, dy, dw, dh, 10);
  ctx.fill();
  ctx.strokeStyle = OS_COLORS.accent;
  roundRect(ctx, dx, dy, dw, dh, 10);
  ctx.stroke();

  const close = (): void => { win.state['dialog'] = null; os.dirty = true; };

  if (dialog.kind === 'init' && disk) {
    if (typeof win.state['initStyle'] !== 'string') win.state['initStyle'] = 'gpt';
    ctx.fillStyle = OS_COLORS.text;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`تهيئة القرص ${disk.id} (${disk.sizeGB} GB)`, dx + 16, dy + 28);
    ctx.fillStyle = OS_COLORS.dim;
    ctx.font = '12.5px sans-serif';
    ctx.fillText('اختر نمط التقسيم — يجب أن يطابق وضع إقلاع الجهاز:', dx + 16, dy + 50);
    const style = win.state['initStyle'] as string;
    btn(os, ctx, dx + 16, dy + 66, 130, 32, 'GPT (UEFI)', () => { win.state['initStyle'] = 'gpt'; os.dirty = true; }, { color: style === 'gpt' ? OS_COLORS.accent : undefined, small: true });
    btn(os, ctx, dx + 156, dy + 66, 130, 32, 'MBR (Legacy)', () => { win.state['initStyle'] = 'mbr'; os.dirty = true; }, { color: style === 'mbr' ? OS_COLORS.accent : undefined, small: true });
    ctx.fillStyle = '#eab308';
    ctx.font = '12px sans-serif';
    ctx.fillText(style === 'gpt' ? 'GPT: مطلوب للإقلاع UEFI (يدعم أقراصًا أكبر وأقسامًا أكثر).' : 'MBR: للإقلاع BIOS/Legacy — حد 2TB و 4 أقسام رئيسية.', dx + 16, dy + 122);
    btn(os, ctx, dx + 16, dy + dh - 44, 120, 32, 'تهيئة الآن', () => {
      useLabStore.getState().initDisk(disk.id, style === 'gpt' ? 'gpt' : 'mbr');
      os.notify('تمت تهيئة القرص', `${disk.id}: نمط ${style.toUpperCase()} (محاكاة تعليمية)`);
      close();
    });
    btn(os, ctx, dx + dw - 136, dy + dh - 44, 120, 32, 'إلغاء', close);
  } else if (dialog.kind === 'newvol' && disk) {
    if (typeof win.state['nvSize'] !== 'string') win.state['nvSize'] = String(Math.floor(disk.sizeGB / 2));
    if (typeof win.state['nvFs'] !== 'string') win.state['nvFs'] = 'ntfs';
    const total = disk.parts.reduce((a, p) => a + p.sizeGB, 0);
    const unalloc = Math.max(0, disk.sizeGB - total);
    ctx.fillStyle = OS_COLORS.text;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`قسم جديد — المساحة المتاحة ${unalloc.toFixed(0)} GB`, dx + 16, dy + 28);
    ctx.fillStyle = OS_COLORS.dim;
    ctx.font = '12.5px sans-serif';
    ctx.fillText('الحجم (GB):', dx + 16, dy + 54);
    textbox(os, ctx, dx + 110, dy + 38, 110, 28, { get text() { return win.state['nvSize'] as string; }, set text(t: string) { win.state['nvSize'] = t.replace(/[^0-9]/g, ''); } }, { mono: true, autoFocus: true });
    ctx.fillText('نظام الملفات:', dx + 16, dy + 88);
    const fsSel = win.state['nvFs'] as string;
    btn(os, ctx, dx + 110, dy + 74, 84, 28, 'NTFS', () => { win.state['nvFs'] = 'ntfs'; os.dirty = true; }, { color: fsSel === 'ntfs' ? OS_COLORS.accent : undefined, small: true });
    btn(os, ctx, dx + 200, dy + 74, 84, 28, 'FAT32', () => { win.state['nvFs'] = 'fat32'; os.dirty = true; }, { color: fsSel === 'fat32' ? OS_COLORS.accent : undefined, small: true });
    ctx.fillStyle = '#eab308';
    ctx.font = '12px sans-serif';
    ctx.fillText('⚠ قسم جديد على قرص يقع غير مهيأ يحتاج تهيئة القرص أولًا. هذه العملية محاكاة آمنة.', dx + 16, dy + 122);
    btn(os, ctx, dx + 16, dy + dh - 44, 120, 32, 'إنشاء القسم', () => {
      const sizeGB = Math.min(unalloc, Math.max(0.1, Number(win.state['nvSize']) || 10));
      useLabStore.getState().createPartition(disk.id, sizeGB, fsSel === 'fat32' ? 'fat32' : 'ntfs');
      os.notify('قسم جديد', `أُنشئ قسم ${sizeGB.toFixed(1)} GB بملفات ${fsSel.toUpperCase()} (محاكاة)`);
      close();
    });
    btn(os, ctx, dx + dw - 136, dy + dh - 44, 120, 32, 'إلغاء', close);
  } else if (dialog.kind === 'part' && part && disk) {
    ctx.fillStyle = OS_COLORS.text;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`القسم: ${part.label}${part.letter ? ` (${part.letter}:)` : ''}`, dx + 16, dy + 28);
    ctx.fillStyle = OS_COLORS.dim;
    ctx.font = '12.5px sans-serif';
    ctx.fillText(`${part.kind.toUpperCase()} • ${part.fs.toUpperCase()} • ${part.sizeGB.toFixed(2)} GB • المستخدم ${(part.usedGB).toFixed(1)} GB`, dx + 16, dy + 50);
    ctx.fillText(part.hasOs ? '⚠ يحتوي ملفات نظام مثبت — حذفه يعني فقدان النظام (محاكاة).' : 'قسم بيانات — الحذف/التهيئة محاكاة تعليمية آمنة.', dx + 16, dy + 70);
    btn(os, ctx, dx + 16, dy + 96, 130, 30, 'تهيئة القسم…', () => {
      if (part.kind === 'efi' || part.kind === 'msr') {
        os.notify('غير مسموح', 'لا يمكن تهيئة أقسام EFI/MSR النظامية — سلوك موثق من سلوك إدارة الأقراص.');
        return;
      }
      useLabStore.getState().formatPartition(disk.id, part.id);
      os.notify('تمت التهيئة', `${part.label}: أعيدت التهيئة (${part.fs.toUpperCase()}) — البيانات السابقة «فُقدت» داخل المحاكاة فقط.`);
      close();
    }, { small: true });
    btn(os, ctx, dx + 156, dy + 96, 130, 30, 'حذف القسم…', () => {
      useLabStore.getState().deletePartition(disk.id, part.id);
      os.notify('تم الحذف', `${part.label}: أُزيل وأصبحت المساحة Unallocated (محاكاة — تأكيد مطلوب دائمًا في العمل الحقيقي).`);
      close();
    }, { small: true, color: OS_COLORS.danger });
    btn(os, ctx, dx + dw - 116, dy + dh - 44, 100, 32, 'إغلاق', close);
  }
}

// ============ 6) الإعدادات / معلومات النظام ============

const settingsApp: VosAppDef = {
  id: 'settings',
  titleAr: 'الإعدادات — حول النظام',
  iconColor: '#8a939e',
  iconGlyph: '⚙',
  defaultW: 520,
  defaultH: 380,
  desktop: true,
  render: (os, _win, ctx) => {
    const store = useLabStore.getState();
    const w = 520;
    const top = panelHeader(ctx, w, 'الإعدادات — حول هذا النظام', 'كل البيانات من مصدر الحقيقة الواحد (المحاكاة)');
    let y = top + 4;
    const row = (label: string, value: string): void => {
      ctx.fillStyle = OS_COLORS.dim;
      ctx.font = '13px sans-serif';
      ctx.fillText(label, 16, y + 16);
      ctx.fillStyle = OS_COLORS.text;
      ctx.textAlign = 'right';
      ctx.fillText(value, w - 16, y + 16);
      ctx.textAlign = 'left';
      y += 28;
    };
    row('إصدار النظام', store.sim.os.installed ? `Virtual Windows (${store.sim.os.installed}) — ${store.sim.os.edition ?? ''}` : 'لا نظام مثبت');
    row('المعالج', 'LGA1700 6C/12T (منصة مرجعية)');
    row('الذاكرة', '32GB DDR5' + (store.sim.firmware.xmp ? ' — XMP مفعّل' : ''));
    row('بطاقة الرسوميات', isInstalled(store.sim.parts.gpu) ? (store.sim.os.driversMissing.includes('gpu') ? 'تعريف أساسي (Basic Display)' : 'PCIe x16 — تعريف كامل') : 'غير مثبتة');
    row('حرارة CPU / GPU', `${store.sim.thermal.cpuTempC.toFixed(0)}°C / ${store.sim.thermal.gpuTempC.toFixed(0)}°C (محاكاة)`);
    row('Secure Boot / TPM', `${store.sim.firmware.secureBoot ? 'مفعل' : 'معطل'} / ${store.sim.firmware.tpm ? 'موجود' : 'غير موجود'}`);
    y += 8;
    btn(os, ctx, 16, y, 150, 30, 'Windows Update', () => os.notify('Windows Update', 'أنت محدث — آخر التحديثات مثبتة (محاكاة تعليمية).'), { small: true });
    btn(os, ctx, 174, y, 150, 30, 'فحص سلامة النظام', () => os.notify('فحص النظام', 'لا مشاكل اكتشفها الفحص (sfc محاكاة تعليمية).'), { small: true });
    y += 42;
    ctx.fillStyle = '#8b97a5';
    ctx.font = '12px sans-serif';
    os.wrapText(ctx, 'تنبيه أمانة: هذه واجهة محاكاة تدريب خاصة بالمشروع — ليست نظام Windows حقيقيًا ولا تعرض أو تخزن أي مفاتيح منتجات.', 16, y, w - 32, 17);
  },
};

// ============ 7) إدارة المهام ============

const taskmgrApp: VosAppDef = {
  id: 'taskmgr',
  titleAr: 'إدارة المهام',
  iconColor: '#4d7ec9',
  iconGlyph: '📊',
  defaultW: 520,
  defaultH: 360,
  desktop: true,
  render: (os, win, ctx, now) => {
    const store = useLabStore.getState();
    const w = win!.maximized ? os.W : win!.w;
    const h = (win!.maximized ? os.H - os.taskbarH : win!.h) - 30;
    const top = panelHeader(ctx, w, 'إدارة المهام — الأداء (محاكاة)', 'القيم مشتقة من حالة المراوح والحرارة في المحاكاة');
    const load = Math.min(1, Math.max(0.08, (store.sim.thermal.cpuTempC - 26) / 70));
    const gpuLoad = Math.min(1, Math.max(0.05, (store.sim.thermal.gpuTempC - 26) / 70));

    const meter = (label: string, value: number, yy: number, note: string): void => {
      ctx.fillStyle = OS_COLORS.dim;
      ctx.font = '12.5px sans-serif';
      ctx.fillText(`${label} — ${(value * 100).toFixed(0)}%`, 16, yy);
      ctx.fillStyle = '#0d141b';
      roundRect(ctx, 16, yy + 8, w - 32, 16, 5);
      ctx.fill();
      ctx.fillStyle = value > 0.85 ? OS_COLORS.danger : OS_COLORS.accent;
      roundRect(ctx, 16, yy + 8, Math.max(8, (w - 32) * value), 16, 5);
      ctx.fill();
      ctx.fillStyle = '#5c6b7a';
      ctx.font = '11px sans-serif';
      ctx.fillText(note, 16, yy + 40);
    };
    meter('CPU', load, top + 4, 'يعكس الحرارة المُحاكاة للمبرد الحالي');
    meter('GPU', gpuLoad, top + 60, 'يعمل بتعريف أساسي إن كان التعريف مفقودًا');
    meter('Memory', 0.42, top + 116, '32GB DDR5 — استهلاك تدريبي ثابت');

    let y = top + 172;
    ctx.fillStyle = OS_COLORS.text;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('العمليات:', 16, y);
    y += 20;
    ctx.font = '12.5px monospace';
    const procs: Array<[string, string]> = [
      ['System Idle Process', '0%'],
      ['pclab-desktop.exe', `${(load * 100).toFixed(0)}%`],
      ['explorer.exe', '2%'],
      ['antimalware-sim.exe', '1%'],
    ];
    for (const [name, cpu] of procs) {
      ctx.fillStyle = OS_COLORS.text;
      ctx.fillText(name, 20, y);
      ctx.textAlign = 'right';
      ctx.fillText(cpu, w - 20, y);
      ctx.textAlign = 'left';
      y += 18;
    }
    ctx.fillStyle = '#5c6b7a';
    ctx.font = '11.5px sans-serif';
    ctx.fillText(`آخر تحديث: ${new Date(now).toLocaleTimeString()} — زمن حقيقي للواجهة، قيم محاكاة`, 16, h - 10);
  },
};

const aboutApp: VosAppDef = {
  id: 'about',
  titleAr: 'حول PC Lab OS',
  iconColor: '#39c7b8',
  iconGlyph: 'ℹ',
  defaultW: 420,
  defaultH: 250,
  render: (os, _win, ctx) => {
    const top = panelHeader(ctx, 420, 'PC Lab OS v6.0', 'بيئة تدريب فني الصيانة');
    ctx.fillStyle = OS_COLORS.text;
    ctx.font = '13px sans-serif';
    os.wrapText(ctx, 'نظام افتراضي تعليمي داخل مختبر صيانة ثلاثي الأبعاد: سطح مكتب ونوافذ وأوامر Sandbox وإدارة أقراص افتراضية. لا يمس نظامك الحقيقي ولا يجمع أي بيانات.', 16, top, 420 - 32, 19);
  },
};

// ============ التسجيل ============

export function registerVosApps(os: VirtualOS): void {
  for (const app of [explorerApp, notepadApp, cmdApp, devmgrApp, diskmgmtApp, settingsApp, taskmgrApp, aboutApp]) {
    os.registerApp(app);
  }
  os.desktopIcons = ['explorer', 'notepad', 'cmd', 'devmgr', 'diskmgmt', 'settings', 'taskmgr'];
}
