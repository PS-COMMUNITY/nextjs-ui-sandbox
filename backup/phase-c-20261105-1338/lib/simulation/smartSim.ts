/**
 * smartSim.ts — محاكاة SMART التعليمية (S.M.A.R.T لتفسيره الشائع: تقنيات
 * المراقبة الذاتية لأقراص التخزين).
 *
 * قيم حتمية ثابتة لكل سيناريو — لا قراءة من أي قرص حقيقي ولا أي عشوائية.
 * الشارة (badgeAr) تؤكد في كل نتيجة أنها محاكاة تعليمية فقط.
 */

import type { SmartSimResult } from '../types';

type SmartScenario = SmartSimResult['scenario'];

const BADGE_AR = 'محاكاة تعليمية — ليست قراءة من قرص حقيقي';

const DATA: Record<SmartScenario, Omit<SmartSimResult, 'badgeAr'>> = {
  healthy: {
    scenario: 'healthy',
    healthPercent: 99,
    temperatureC: 38,
    reallocatedSectors: 0,
    powerOnHours: 4200,
    interpretationAr:
      'قرص بحالة ممتازة ضمن المحاكاة: صحة مرتفعة، حرارة طبيعية، لا قطاعات معاد تخصيصها، وساعات تشغيل قليلة نسبيًا — النمط المتوقع لقرص حديث يُستخدم بشكل سليم مع تهوية جيدة. تذكّر: هذه أرقام تعليمية ولا تتنبأ بصحة أي قرص فعلي.',
  },
  aging: {
    scenario: 'aging',
    healthPercent: 76,
    temperatureC: 44,
    reallocatedSectors: 12,
    powerOnHours: 18000,
    interpretationAr:
      'قرص في مرحلة تقادم ضمن المحاكاة: القيمة المرجعية الثابتة 76٪ مع قطاعات معاد تخصيصها قليلة وساعات تشغيل طويلة — هذا مؤشر للمراقبة لا للذعر: النسخ الاحتياطي المنتظم ومتابعة اتجاه الأرقام هما الخطوة الصحيحة. النتيجة محاكاة ببذرة ثابتة (تتكرر في كل تشغيل) ولا تعكس حالة أي قرص حقيقي.',
  },
  failing: {
    scenario: 'failing',
    healthPercent: 41,
    temperatureC: 52,
    reallocatedSectors: 486,
    powerOnHours: 31000,
    interpretationAr:
      'قرص في حالة فشل محتمل ضمن المحاكاة: صحة منخفضة وقطاعات معاد تخصيصها كثيرة وحرارة مرتفعة وساعات تشغيل طويلة جدًا — في وضع مماثل على قرص حقيقي تكون الخطوة الفورية: انسخ بياناتك ثم استبدل القرص، ولا تعتمد عليه لأي عمل مهم. النتيجة تعليمية بحتة ولا تتنبأ بصحة قرص فعلي.',
  },
};

/** يعيد قراءة SMART حتمية ثابتة للسيناريو المطلوب — شارة «محاكاة تعليمية» دائمًا. */
export function simulateSmart(scenario: 'healthy' | 'aging' | 'failing'): SmartSimResult {
  return { ...DATA[scenario], badgeAr: BADGE_AR };
}
