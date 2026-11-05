/**
 * screenTexture.ts — رسّام نسيج الشاشة الافتراضية (CanvasTexture ديناميكي).
 *
 * يرسم الحالات الثماني للمواصفة (§5): إطفاء / لا إشارة / شعار بدء / رسائل POST /
 * إعدادات UEFI / تحذير / نجاح / نظام افتراضي مبسّط مع دفتر ملاحظات تستهدفه
 * إدخال نص حقيقي من حقل الواجهة (توجيه v3 أ.2).
 *
 * الرسم يحدث فقط عند الطلب (dirty) — لا إنشاء كائنات داخل حلقة الرسم عدا النصوص.
 *
 * (v9) الدقة: الكانفس الفيزيائي 1280×720 (16:9) بينما فضاء الرسم المنطقي
 * 1024×576 — تحويل مقياس أساسي 1.25 يجعل كل الإحداثيات القديمة صحيحة
 * ويُحدّة حدة النص والخطوط. النسبة 16:9 تام تطابق سطح العرض المجسم.
 */

import * as THREE from 'three';
import type { MonitorView } from '../simulation/monitorEngine';

export interface ScreenPainter {
  texture: THREE.CanvasTexture;
  /** يعيد true إذا تغيرت الصورة فعلاً (لتقليل رفع النسيج) */
  draw(view: MonitorView, notepad: string, nowMs: number): boolean;
  dispose(): void;
}

/** فضاء الرسم المنطقي (كل إحداثيات الرسم وVOS بهذه الأبعاد) */
export const SCREEN_LOGICAL_W = 1024;
export const SCREEN_LOGICAL_H = 576;
/** دقة الكانفس الفيزيائية — 16:9 تام مطابق لنسبة سطح العرض المجسم */
export const SCREEN_PHYS_W = 1280;
export const SCREEN_PHYS_H = 720;

const W = SCREEN_LOGICAL_W;
const H = SCREEN_LOGICAL_H;

const BG = '#04070c';
const PANEL = '#0b1420';
const CYAN = '#22d3ee';
const AMBER = '#fbbf24';
const GREEN = '#34d399';
const RED = '#f87171';
const TEXT = '#d7dee8';
const DIM = '#7c8794';

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): number {
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

/** يرسم إطار جهاز UEFI بسيط */
function drawBiosChrome(ctx: CanvasRenderingContext2D, title: string): void {
  ctx.fillStyle = '#0e2a4a';
  ctx.fillRect(0, 0, W, 56);
  ctx.fillStyle = '#e8eaed';
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillText('UEFI SETUP UTILITY', 24, 38);
  ctx.fillStyle = CYAN;
  ctx.fillText(title, 340, 38);
  ctx.fillStyle = '#0e2a4a';
  ctx.fillRect(0, H - 46, W, 46);
  ctx.fillStyle = DIM;
  ctx.font = '20px monospace';
  ctx.fillText('F10: Save & Exit      ESC: Exit      ↑↓: Select', 24, H - 16);
}

export function createScreenPainter(): ScreenPainter | null {
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_PHYS_W;
  canvas.height = SCREEN_PHYS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // (v9) تحويل المقياس الأساسي: كل الرسم المنطقي 1024×576 يُ rasterized عند 1280×720
  // — save/restore داخل الرسّام/‏VOS تحافظ على هذا التحويل لأنه خارج أي زوج save/restore
  ctx.scale(SCREEN_PHYS_W / SCREEN_LOGICAL_W, SCREEN_PHYS_H / SCREEN_LOGICAL_H);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  let lastSig = '';

  const painter: ScreenPainter = {
    texture,
    draw(view: MonitorView, notepad: string, nowMs: number): boolean {
      const blink = Math.floor(nowMs / 500) % 2 === 0;
      const sig = `${view.screen}|${view.postLinesAr.length}|${view.bootDevicesAr.length}|${view.canType ? 1 : 0}|${notepad}|${blink ? 1 : 0}|${Math.round(view.bootProgress * 40)}`;
      if (sig === lastSig) return false;
      lastSig = sig;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = 'alphabetic';
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';

      switch (view.screen) {
        // ============ 1) إطفاء ============
        case 'off': {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, W, H);
          // انعكاس زجاجي خافت
          const g = ctx.createLinearGradient(0, 0, W, H);
          g.addColorStop(0, 'rgba(120,140,170,0.05)');
          g.addColorStop(0.4, 'rgba(120,140,170,0.0)');
          g.addColorStop(1, 'rgba(120,140,170,0.03)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
          break;
        }

        // ============ 2) لا إشارة ============
        case 'noSignal': {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = 'rgba(90,120,160,0.35)';
          ctx.lineWidth = 3;
          ctx.strokeRect(W / 2 - 210, H / 2 - 70, 420, 140);
          ctx.fillStyle = '#8fb6d9';
          ctx.font = 'bold 44px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('No Signal', W / 2, H / 2 - 8);
          ctx.font = '22px monospace';
          ctx.fillStyle = '#5c7b99';
          ctx.fillText('HDMI / DisplayPort', W / 2, H / 2 + 36);
          ctx.textAlign = 'left';
          break;
        }

        // ============ 3) شعار بدء التشغيل ============
        case 'booting': {
          ctx.fillStyle = '#050b12';
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = CYAN;
          ctx.textAlign = 'center';
          ctx.font = 'bold 64px monospace';
          ctx.fillText('P C  L A B', W / 2, H / 2 - 40);
          ctx.font = '20px monospace';
          ctx.fillStyle = DIM;
          ctx.fillText('Training Platform — Reference Build', W / 2, H / 2 + 4);
          // حلقة تحميل
          ctx.strokeStyle = 'rgba(34,211,238,0.25)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(W / 2, H / 2 + 70, 22, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = CYAN;
          ctx.beginPath();
          ctx.arc(W / 2, H / 2 + 70, 22, 0, Math.PI * 2 * Math.min(1, Math.max(0.05, view.bootProgress)));
          ctx.stroke();
          ctx.textAlign = 'left';
          break;
        }

        // ============ 4) رسائل POST ============
        case 'post': {
          ctx.fillStyle = PANEL;
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = TEXT;
          ctx.font = '22px monospace';
          let y = 60;
          for (const line of view.postLinesAr) {
            ctx.fillStyle = line.includes('FAILED') || line.includes('!!') ? RED : line.startsWith('Detect') || line.startsWith('Memory') || line.startsWith('Init') ? GREEN : TEXT;
            ctx.fillText(line, 32, y);
            y += 34;
          }
          if (blink) {
            ctx.fillStyle = CYAN;
            ctx.fillRect(32, y - 16, 12, 20);
          }
          break;
        }

        // ============ 5) إعدادات UEFI (لا جهاز إقلاع) ============
        case 'bios': {
          ctx.fillStyle = '#071120';
          ctx.fillRect(0, 0, W, H);
          drawBiosChrome(ctx, 'Boot Menu');
          ctx.fillStyle = TEXT;
          ctx.font = 'bold 24px monospace';
          ctx.fillText('Boot Option Priorities:', 32, 108);
          let y = 150;
          if (view.bootDevicesAr.length === 0) {
            ctx.fillStyle = RED;
            ctx.font = '22px monospace';
            ctx.fillText('!! No bootable device found !!', 48, y);
            y += 40;
            ctx.fillStyle = DIM;
            ctx.fillText('Insert bootable media or enter Setup', 48, y);
          } else {
            for (let i = 0; i < view.bootDevicesAr.length; i++) {
              ctx.fillStyle = i === 0 ? CYAN : TEXT;
              ctx.font = '22px monospace';
              ctx.fillText(`${i + 1}.  ${view.bootDevicesAr[i]}`, 48, y);
              y += 38;
            }
          }
          break;
        }

        // ============ 6) تحذير بعد POST ناجح ============
        case 'warning': {
          ctx.fillStyle = '#0b0e06';
          ctx.fillRect(0, 0, W, H);
          // مثلث تحذير
          ctx.strokeStyle = AMBER;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(W / 2, H / 2 - 120);
          ctx.lineTo(W / 2 + 90, H / 2 + 40);
          ctx.lineTo(W / 2 - 90, H / 2 + 40);
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = AMBER;
          ctx.font = 'bold 64px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('!', W / 2, H / 2 + 24);
          ctx.font = 'bold 30px monospace';
          ctx.fillStyle = TEXT;
          ctx.fillText('POST OK — WARNING', W / 2, H / 2 + 110);
          ctx.font = '22px monospace';
          ctx.fillStyle = AMBER;
          if (view.postLinesAr.length > 0) {
            const warn = view.postLinesAr[view.postLinesAr.length - 1].replace('POST OK with warning — ', '');
            wrapText(ctx, warn, W / 2, H / 2 + 152, W - 160, 30);
          }
          ctx.textAlign = 'left';
          break;
        }

        // ============ 7) نجاح ============
        case 'success': {
          ctx.fillStyle = '#04120a';
          ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = GREEN;
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.arc(W / 2, H / 2 - 30, 54, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(W / 2 - 26, H / 2 - 24);
          ctx.lineTo(W / 2 - 6, H / 2 - 2);
          ctx.lineTo(W / 2 + 30, H / 2 - 52);
          ctx.stroke();
          ctx.fillStyle = TEXT;
          ctx.textAlign = 'center';
          ctx.font = 'bold 34px monospace';
          ctx.fillText('ALL CHECKS PASSED', W / 2, H / 2 + 80);
          ctx.font = '22px monospace';
          ctx.fillStyle = DIM;
          ctx.fillText('Booting to virtual OS ...', W / 2, H / 2 + 122);
          ctx.textAlign = 'left';
          break;
        }

        // ============ 8) نظام افتراضي مبسّط + دفتر الملاحظات ============
        case 'os': {
          // خلفية سطح المكتب
          const g = ctx.createLinearGradient(0, 0, W, H);
          g.addColorStop(0, '#123a3f');
          g.addColorStop(0.55, '#0d2b33');
          g.addColorStop(1, '#081c22');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);

          // أيقونات سطح المكتب
          const icons: Array<[string, string]> = [['MyPC', '#38bdf8'], ['Docs', '#fbbf24'], ['Tools', '#34d399']];
          icons.forEach(([label, color], i) => {
            const ix = 60 + i * 110;
            ctx.fillStyle = color;
            ctx.fillRect(ix - 26, 48, 52, 40);
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillRect(ix - 26, 60, 52, 6);
            ctx.fillStyle = '#d7dee8';
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(label, ix, 112);
          });
          ctx.textAlign = 'left';

          // نافذة دفتر الملاحظات
          const nx = 190;
          const ny = 70;
          const nw = 640;
          const nh = 350;
          ctx.fillStyle = '#101820';
          ctx.fillRect(nx, ny, nw, nh);
          ctx.fillStyle = '#1b2a3a';
          ctx.fillRect(nx, ny, nw, 40);
          ctx.fillStyle = '#e8eaed';
          ctx.font = 'bold 18px monospace';
          ctx.fillText('notepad.txt — الكتابة من لوحة مفاتيحك', nx + 14, ny + 27);
          // زر إغلاق زخرفي
          ctx.fillStyle = '#e35d5d';
          ctx.fillRect(nx + nw - 30, ny + 10, 20, 20);
          // نص المفكرة (يدعم العربية)
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.fillStyle = '#c9d6e4';
          ctx.font = '22px sans-serif';
          const body = notepad.length > 0 ? notepad : 'اكتب في حقل «دفتر النظام» أسفل المشهد ليظهر النص هنا…';
          wrapText(ctx, body, nx + nw - 18, ny + 78, nw - 40, 34);
          if (blink) {
            ctx.fillStyle = CYAN;
            ctx.fillRect(nx + nw - 18 - ctx.measureText(body).width - 16, ny + 58, 10, 24);
          }
          ctx.direction = 'ltr';
          ctx.textAlign = 'left';

          // شريط المهام
          ctx.fillStyle = 'rgba(8,14,20,0.92)';
          ctx.fillRect(0, H - 52, W, 52);
          ctx.fillStyle = CYAN;
          ctx.fillRect(14, H - 42, 60, 32);
          ctx.fillStyle = '#04141a';
          ctx.font = 'bold 18px monospace';
          ctx.fillText('START', 22, H - 20);
          // الساعة
          const d = new Date(nowMs);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          ctx.fillStyle = '#c9d6e4';
          ctx.font = '18px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(`${hh}:${mm}`, W - 20, H - 20);
          ctx.textAlign = 'left';
          break;
        }
      }

      // فينيت زجاجي خفيف موحد
      const vg = ctx.createRadialGradient(W / 2, H / 2, H / 2.4, W / 2, H / 2, H / 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      texture.needsUpdate = true;
      return true;
    },
    dispose(): void {
      texture.dispose();
    },
  };

  return painter;
}
