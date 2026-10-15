import type {FontRole} from '../fonts';

// Typography QA copy. These lines exist to stress shaping, bidi, numerals, marks, and wrapping;
// they are test fixtures, not production scripts.

export type TypographySample = {
  id: string;
  label: string;
  text: string;
  role: FontRole;
  weight: number;
  level: 'display' | 'heading' | 'body' | 'caption';
};

export const typographySamples: readonly TypographySample[] = [
  {id: 'short-display', label: 'Short Arabic · Cairo 900', text: 'ركّز في الأهم', role: 'display', weight: 900, level: 'display'},
  {id: 'colloquial', label: 'Egyptian colloquial · Cairo 700', text: 'يا عم ركّز بقى، الموبايل مش هيطير! خلّص اللي في إيدك الأول.', role: 'display', weight: 700, level: 'heading'},
  {id: 'long-body', label: 'Long Arabic · Plex 400', text: 'القراءة بالعربية أبطأ من الاستماع، لذلك نترك كل سطر على الشاشة وقتًا كافيًا قبل أن ننتقل إلى الفكرة التالية في القصة دون أن نقطع الجملة في منتصفها.', role: 'text', weight: 400, level: 'body'},
  {id: 'mixed', label: 'Arabic + English · Plex 600', text: 'افتح Remotion Studio وراجع الـ MP4 قبل ما تضغط Export.', role: 'text', weight: 600, level: 'body'},
  {id: 'numerals', label: 'Western + Arabic-Indic numerals · Plex 700', text: 'الباقة بـ 250 جنيه أو ٢٥٠ جنيه، خصم 15% لمدة ٣ أيام.', role: 'text', weight: 700, level: 'body'},
  {id: 'diacritics', label: 'Diacritics + punctuation · Cairo 600', text: '«يَكْتُبُ الطَّالِبُ الدَّرْسَ بِهُدُوءٍ»؛ هَلْ تَرَى الفَرْقَ؟ نَعَمْ!', role: 'display', weight: 600, level: 'heading'},
  {id: 'latin', label: 'English · Cairo 800', text: 'Mixed layouts stay aligned at every size.', role: 'display', weight: 800, level: 'heading'},
];

export const weightSpecimen = 'خط عربي واضح Aa 0123 ٤٥٦';

export const kineticSample = 'كل كلمة تظهر كاملة في توقيتها من غير ما نكسر الحروف';

export const subtitleSample = [
  {text: 'ده', startFrame: 0, endFrame: 10},
  {text: 'ترجمة', startFrame: 10, endFrame: 22},
  {text: 'بتتلوّن', startFrame: 22, endFrame: 36},
  {text: 'كلمة', startFrame: 36, endFrame: 46},
  {text: 'بكلمة', startFrame: 46, endFrame: 58},
  {text: 'مع', startFrame: 58, endFrame: 64},
  {text: 'الصوت', startFrame: 64, endFrame: 90},
];

/**
 * Bidi edge cases with explicit expectations, checked structurally by e2e/typography.spec.ts:
 * - Percent signs follow Arabic order in Arabic copy: the sign sits left of the digits for both
 *   15% and ٢٠٪ (Unicode W2 turns digits after Arabic letters into Arabic numbers).
 * - Latin identifiers keep their digits and dots (MP4, H.264, 4K) as one isolated run.
 * - A long mixed line wraps only between words and keeps short Latin names (≤3 words) together.
 */
export const bidiSamples: readonly TypographySample[] = [
  {id: 'percent', label: 'Percent signs in RTL · Plex 700', text: 'خصم 15% على الباقة، و٢٠٪ للطلاب.', role: 'text', weight: 700, level: 'body'},
  {id: 'identifiers', label: 'Latin identifiers · Plex 600', text: 'صدّر الـ MP4 بترميز H.264 وارفعه 4K على YouTube.', role: 'text', weight: 600, level: 'body'},
  {id: 'numerals', label: 'Number order · Cairo 700', text: 'الحلقة 12 من 2026 — الحلقة ١٢ من ٢٠٢٦', role: 'display', weight: 700, level: 'heading'},
  {id: 'mixed-wrap', label: 'Mixed-direction wrapping · Plex 400', text: 'لما تفتح Remotion Studio وتختار Focus Doodle هتلاقي الـ preview بيتحدّث مع كل تعديل في الكود من غير ما تعمل export خالص.', role: 'text', weight: 400, level: 'body'},
];
