/**
 * fans.ts — منظومة المراوح (V6 §3): تعريف مستقل لكل مروحة.
 * ============================================================================
 * لكل مروحة: معرّف وموقع، عقدة الـRotor الفعلية، المحور المحلي للدوران،
 * إشارة الاتجاه، مركز الدوران (Pivot مُعاد تمركزه لمنع الاهتزاز)، متجه تدفق
 * الهواء، سرعة مرجعية، والحالة (متوقفة/بطيئة/طبيعية/سريعة).
 *
 * قواعد ميكانيكية (توجيه V6 §3.3):
 *  - يُدوَّر الريش/الـRotor فقط — لا الإطار ولا الهيكل ولا المشتت.
 *  - الدوران حول المحور المحلي الصحيح المستخرج من بنية كل نموذج (لا محور موحد).
 *  - اتجاه الدوران (sign) لكل مروحة على حدة — لا يُفترض توحيده.
 *  - تدفق الهواء متجه مستقل عن إشارة الدوران، وأسهمه ملوّنة: سماوي = سحب
 *    (Intake)، كهرماني = طرد (Exhaust)، أخضر = مسار داخلي عبر مشتت.
 */
import * as THREE from 'three';
import type { SimulationState } from '../types';
import type { PartVisuals } from './visualTypes';

export type FanLocation = 'cpu' | 'gpu' | 'front' | 'rear' | 'psu' | 'top';
export type FanKind = 'intake' | 'exhaust' | 'internal';
export type FanRunState = 'stopped' | 'slow' | 'normal' | 'fast';

export interface FanDef {
  id: string;
  labelAr: string;
  location: FanLocation;
  kind: FanKind;
  /** المحور المحلي للدوران على عقدة الـpivot (يُستخرج من العقدة نفسها — GLB أو إجرائية) */
  axis: 'x' | 'y' | 'z';
  /** إشارة الاتجاه المرئي (+1 / −1) — تحقق بصري لكل مروحة (توجيه §3.4) */
  sign: 1 | -1;
  /** متجه تدفق الهواء في فضاء المشهد (اتجاه دفع الهواء) */
  airflow: [number, number, number];
  /** سرعة مرجعية عند التشغيل الطبيعي */
  baseRpm: number;
  pivot: THREE.Object3D;
  angle: number;
  rpm: number;
}

/** مصدر ظروف التشغيل (يُمرر من PCScene من حالة المحاكاة) */
export interface FanConditions {
  powered: boolean;          // الجهاز يعمل كهربائيًا
  cpuCoolerOk: boolean;      // المبرد مثبت ومروحته موصولة
  gpuOk: boolean;            // البطاقة مثبتة وطاقتها موصولة
  caseFansOk: boolean;       // مراوح الهيكل مثبتة ورؤوسها موصولة
  psuOk: boolean;            // المزود حي
  cpuLoad: number;           // 0..1 (حرارة مُحاكاة)
  gpuLoad: number;
}

const AIRFLOW_INTAKE = 0x22d3ee;
const AIRFLOW_EXHAUST = 0xfbbf24;
const AIRFLOW_INTERNAL = 0x34d399;

export class FanSystem {
  fans: FanDef[] = [];
  private group: THREE.Group;
  private arrows: THREE.Group;
  private arrowMats: THREE.MeshStandardMaterial[] = [];

  constructor(visuals: PartVisuals) {
    this.group = new THREE.Group();
    this.group.name = 'fan-pivots';
    this.arrows = new THREE.Group();
    this.arrows.name = 'airflow-arrows-v6';
    this.arrows.visible = false;
    // (إصلاح تدقيق V6) الإضافة للجذر قبل بناء الأسهم حتى يعمل worldToLocal فعليًا
    visuals.root.add(this.group);
    visuals.root.add(this.arrows);
    this.buildFans(visuals);
    this.buildArrows();
  }

  /** محور الدوران الفعلي لعقدة الريش: الريش الإجرائي يعلن spinAxis، وGLB تحمل extras.spinAxis
   *  (cooler/fan = x، gpu/psu = y) — الافتراضي أدناه يطابقها ويُستخدم فقط عند غيابها */
  private spinAxisOf(rotor: THREE.Object3D, glbDefault: 'x' | 'y' | 'z'): 'x' | 'y' | 'z' {
    const declared = rotor.userData['spinAxis'];
    return declared === 'x' || declared === 'y' || declared === 'z' ? declared : glbDefault;
  }

  /** بناء التعريفات من عقد الـRotor المسماة في النماذج الحقيقية (+ المجسمات الإجرائية المسماة عند الفشل) */
  private buildFans(visuals: PartVisuals): void {
    const find = (root: THREE.Object3D, name: string): THREE.Object3D | null => root.getObjectByName(name) ?? null;

    // 1) مروحة مبرد المعالج — تدفع الهواء عبر الزعانف نحو مخرج الخلف (−Z)
    const coolerRotor = find(visuals.dynamic.cooler, 'cooler_fan_rotor');
    if (coolerRotor) {
      this.addFan({
        id: 'cooler', labelAr: 'مروحة مبرد المعالج', location: 'cpu', kind: 'internal',
        axis: this.spinAxisOf(coolerRotor, 'x'), sign: 1, airflow: [0, 0, -1], baseRpm: 1150,
        rotor: coolerRotor, parent: coolerRotor.parent ?? visuals.dynamic.cooler,
      });
    }

    // 2) مراوح بطاقة الرسوميات — تسحب الهواء من الأسفل عبر مشتت البطاقة (+Y)
    for (const name of ['gpu_fan_rotor_1', 'gpu_fan_rotor_2']) {
      const rotor = find(visuals.dynamic.gpu, name);
      if (rotor) {
        this.addFan({
          id: name, labelAr: name.endsWith('1') ? 'مروحة البطاقة 1' : 'مروحة البطاقة 2', location: 'gpu', kind: 'internal',
          axis: this.spinAxisOf(rotor, 'y'), sign: -1, airflow: [0, 1, 0], baseRpm: 1050,
          rotor, parent: rotor.parent ?? visuals.dynamic.gpu,
        });
      }
    }

    // 3) مراوح الهيكل: الأمام سحب (−Z داخل الهيكل) والخلف طرد (−Z خارج)
    const front1 = find(visuals.dynamic.fans, 'fan_rotor_front-1');
    const front2 = find(visuals.dynamic.fans, 'fan_rotor_front-2');
    const rear = find(visuals.dynamic.fans, 'fan_rotor_rear');
    if (front1) {
      this.addFan({ id: 'front-1', labelAr: 'مروحة أمامية علوية', location: 'front', kind: 'intake', axis: this.spinAxisOf(front1, 'x'), sign: 1, airflow: [0, 0, -1], baseRpm: 800, rotor: front1, parent: front1.parent ?? visuals.dynamic.fans });
    }
    if (front2) {
      this.addFan({ id: 'front-2', labelAr: 'مروحة أمامية سفلية', location: 'front', kind: 'intake', axis: this.spinAxisOf(front2, 'x'), sign: 1, airflow: [0, 0, -1], baseRpm: 800, rotor: front2, parent: front2.parent ?? visuals.dynamic.fans });
    }
    if (rear) {
      this.addFan({ id: 'rear', labelAr: 'مروحة خلفية (طرد)', location: 'rear', kind: 'exhaust', axis: this.spinAxisOf(rear, 'x'), sign: -1, airflow: [0, 0, -1], baseRpm: 900, rotor: rear, parent: rear.parent ?? visuals.dynamic.fans });
    }

    // 4) مروحة مزود الطاقة — تسحب من جهة المكوّنات وتطرد خلف المزود
    const psuRotor = find(visuals.dynamic.psu, 'psu_fan_rotor');
    if (psuRotor) {
      this.addFan({
        id: 'psu', labelAr: 'مروحة مزود الطاقة', location: 'psu', kind: 'exhaust',
        axis: this.spinAxisOf(psuRotor, 'y'), sign: -1, airflow: [0, -1, 0], baseRpm: 1300,
        rotor: psuRotor, parent: psuRotor.parent ?? visuals.dynamic.psu,
      });
    }
  }

  /**
   * إعادة تمركز الـRotor داخل Pivot عند مركزه الهندسي: يضمن دورانًا حول المركز
   * بلا انزياح أو اهتزاز (توجيه §3.4) — ثم يدور الـPivot على محوره المحلي.
   */
  private addFan(def: Omit<FanDef, 'pivot' | 'angle' | 'rpm'> & { rotor: THREE.Object3D; parent: THREE.Object3D }): void {
    const rotor = def.rotor;
    const parent = def.parent;

    // مركز صندوق إحاطة الشفرات في فضاء الأب
    parent.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rotor);
    const center = new THREE.Vector3();
    if (isFinite(box.min.x)) {
      box.getCenter(center);
      parent.worldToLocal(center);
    } else {
      center.set(0, 0, 0);
    }

    const pivot = new THREE.Object3D();
    pivot.name = `fan-pivot-${def.id}`;
    pivot.position.copy(center);
    parent.add(pivot);
    pivot.attach(rotor); // يحافظ على الوضع العالمي — الشفرات تصير أبناء الـPivot

    this.fans.push({
      id: def.id, labelAr: def.labelAr, location: def.location, kind: def.kind,
      axis: def.axis, sign: def.sign, airflow: def.airflow, baseRpm: def.baseRpm,
      pivot, angle: 0, rpm: 0,
    });
  }

  /** أسهم تدفق الهواء لكل مروحة — ملونة حسب الدور (سحب/طرد/داخلي) */
  private buildArrows(): void {
    const makeMat = (hex: number): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.6, transparent: true, opacity: 0.85, depthWrite: false });
      this.arrowMats.push(m);
      return m;
    };
    const matIntake = makeMat(AIRFLOW_INTAKE);
    const matExhaust = makeMat(AIRFLOW_EXHAUST);
    const matInternal = makeMat(AIRFLOW_INTERNAL);

    const shaftGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 8);
    const headGeo = new THREE.ConeGeometry(0.12, 0.22, 10);

    for (const fan of this.fans) {
      const mat = fan.kind === 'intake' ? matIntake : fan.kind === 'exhaust' ? matExhaust : matInternal;
      const dir = new THREE.Vector3(...fan.airflow).normalize();
      // موقع المروحة في فضاء الجذر
      fan.pivot.updateWorldMatrix(true, false);
      const pos = fan.pivot.getWorldPosition(new THREE.Vector3());
      this.arrows.parent?.worldToLocal(pos);

      const arrow = new THREE.Group();
      const len = 0.85;
      const shaft = new THREE.Mesh(shaftGeo, mat);
      shaft.scale.y = len;
      arrow.add(shaft);
      const head = new THREE.Mesh(headGeo, mat);
      // (إصلاح تدقيق V6-G) الرأس عند +Y دون قلب: رأس المخروط يشير باتجاه متجه التدفق
      // نفسه (الـquaternion أدناه يحوّل +Y إلى dir) — كان مقلوبًا فتُقرأ الأسهم
      // عكس الهواء (سحب يبدو طردًا)
      head.position.y = len / 2 + 0.1;
      arrow.add(head);
      // +Y الافتراضي للسهم → متجه التدفق
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      arrow.position.copy(pos).addScaledVector(dir, len / 2 + 0.15);
      arrow.name = `airflow-${fan.id}`;
      this.arrows.add(arrow);
    }
  }

  setArrowsVisible(on: boolean): void {
    this.arrows.visible = on;
  }

  /** حالات المراوح للعرض التعليمي (HUD/UEFI/إدارة المهام) */
  report(): Array<{ id: string; labelAr: string; rpm: number; running: boolean; state: FanRunState; stateAr: string; location: FanLocation; kind: FanKind; airflowAr: string }> {
    return this.fans.map((f) => {
      const state: FanRunState = f.rpm < 5 ? 'stopped' : f.rpm < f.baseRpm * 0.55 ? 'slow' : f.rpm < f.baseRpm * 1.15 ? 'normal' : 'fast';
      return {
        id: f.id,
        labelAr: f.labelAr,
        rpm: Math.round(f.rpm),
        running: f.rpm > 5,
        state,
        stateAr: f.rpm < 5 ? 'متوقفة' : f.rpm < f.baseRpm * 0.55 ? 'بطيئة' : f.rpm < f.baseRpm * 1.15 ? 'طبيعية' : 'سريعة',
        location: f.location,
        kind: f.kind,
        airflowAr: f.kind === 'intake' ? 'سحب من الأمام' : f.kind === 'exhaust' ? 'طرد للخلف/خارج' : 'عبر مشتت القطعة',
      };
    });
  }

  /**
   * تحديث زمني: السرعات من الظروف والحرارة المُحاكاة ثم الدوران على المحور الصحيح.
   * المراوح تدور فقط عند توفر الطاقة فعليًا (مصدر الحقيقة الواحد — توجيه §7).
   */
  update(dt: number, c: FanConditions): void {
    for (const fan of this.fans) {
      let running = false;
      let load = 0.35;
      switch (fan.location) {
        case 'cpu': running = c.powered && c.cpuCoolerOk; load = c.cpuLoad; break;
        case 'gpu': running = c.powered && c.gpuOk; load = c.gpuLoad; break;
        case 'front':
        case 'rear':
        case 'top': running = c.powered && c.caseFansOk; load = 0.3; break;
        case 'psu': running = c.powered && c.psuOk; load = 0.4; break;
      }
      const target = running ? fan.baseRpm * (0.55 + 0.65 * load) : 0;
      fan.rpm += (target - fan.rpm) * Math.min(1, dt * 2.5); // قصور ذاتي واقعي
      if (fan.rpm > 5) {
        fan.angle += fan.sign * ((fan.rpm / 60) * Math.PI * 2) * dt;
        fan.pivot.rotation.set(0, 0, 0);
        fan.pivot.rotation[fan.axis] = fan.angle;
      } // خلاف ذلك: angle يتجمد أخيرًا عند توقف الدوران (لا اهتزاز)
    }
    // نبض خفيف لأسهم الهواء (حية بصريًا دون كلفة تُذكر)
    if (this.arrows.visible) {
      const t = performance.now() / 1000;
      const pulse = 0.72 + Math.sin(t * 4) * 0.18;
      for (const m of this.arrowMats) m.opacity = pulse;
    }
  }
}
