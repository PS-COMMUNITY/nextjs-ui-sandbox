/**
 * محرك المهام الموجهة — يتحقق آليًا من خطوات المهام مقابل حالة المحاكاة.
 */
import type { Mission, MissionStep, SimulationState, VerifySpec } from '@/lib/types';
import { LESSONS } from '@/lib/data/lessons';

export function isVerifyDone(v: VerifySpec, s: SimulationState, lastDiagnosis: string | null): boolean {
  switch (v.kind) {
    case 'flag-on':
      return s.flags[v.target] === true;
    case 'flag-off':
      return s.flags[v.target] === false;
    case 'part-removed':
      return s.parts[v.target] === 'removed';
    case 'part-installed':
      return s.parts[v.target] === 'installed';
    case 'post-result':
      return lastDiagnosis === v.target;
  }
}

export function isStepDone(step: MissionStep, s: SimulationState, lastDiagnosis: string | null): boolean {
  return isVerifyDone(step.verify, s, lastDiagnosis);
}

/** ابحث عن أول خطوة غير منجزة (مع السماح للخطوات المنجزة سلفًا بالتجاوز) */
export function currentPendingStepIndex(mission: Mission, s: SimulationState, lastDiagnosis: string | null): number {
  for (let i = 0; i < mission.steps.length; i++) {
    if (!isStepDone(mission.steps[i], s, lastDiagnosis)) return i;
  }
  return -1; // المهمة مكتملة
}

export function isMissionComplete(mission: Mission, s: SimulationState, lastDiagnosis: string | null): boolean {
  return currentPendingStepIndex(mission, s, lastDiagnosis) === -1;
}

export function getMission(id: string | null): Mission | undefined {
  if (!id) return undefined;
  return LESSONS.find((m) => m.id === id);
}
