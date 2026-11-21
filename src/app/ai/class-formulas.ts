import {Feature} from '../interfaces/character.interface';

// the formulas of class features whose rules are known, put right by the app whatever the AI wrote: the AI kept
// writing Track's half level without its minimum (+0 at 1st level), and Studied Target as a flat +1. the right
// formula goes on every path the feature adjusts, in the feature or on its sheet entry, and the AI is told what was
// put right. any other feature whose text says "minimum 1" gets its halved level kept to at least 1

interface Known {
  name: RegExp;
  // the paths whose numbers the rule gives, and the paths that must be there
  paths: RegExp;
  required?: string[];
  formula: (level: string) => string;
  said: string;
}

const STUDIED = (level: string) => `1+floor(${level}/5)`;
const KNOWN: Known[] = [
  {name: /^track$/i, paths: /^skills\.survival\.value/, formula: level => `max(1, floor(${level}/2))`,
    said: 'half its class level, minimum 1, on Survival to follow tracks'},
  {name: /^studied target$/i, paths: /^((melee|ranged)\.\*\.(toHitBonus|damageBonus)|skills\.(bluff|perception|sense motive|survival|knowledge)\b.*)$/,
    required: ['melee.*.toHitBonus', 'melee.*.damageBonus', 'ranged.*.toHitBonus', 'ranged.*.damageBonus', 'skills.bluff.value',
      'skills.knowledge.subSkills.*.value', 'skills.perception.value', 'skills.sense motive.value', 'skills.survival.value'],
    formula: STUDIED, said: '+1, +1 more at 5th level and every 5 levels after, on attack and damage rolls and on Bluff, Knowledge, Perception, Sense Motive and Survival against the target'},
];

const MINIMUM_ONE = /\b(minimum|min\.?) (of )?1\b|\bat least 1\b/i;
const HALVED = /^floor\(\s*(\{level(?:\.[^}]+)?\})\s*\/\s*(\d+)\s*\)$/;

type Adjustments = {[path: string]: unknown};

// the adjustments a feature's numbers are on: its own, or its sheet entry's (a toggled feature keeps them there)
const holders = (feature: Feature): Adjustments[] => {
  const own = (feature.adjustments || {}) as Adjustments;
  const entries = Object.values(own).filter((v): v is {adjustments: Adjustments} =>
    !!v && typeof v === 'object' && !Array.isArray(v) && !!(v as any).adjustments && typeof (v as any).adjustments === 'object');
  return [own, ...entries.map(e => e.adjustments)];
};

const valueOf = (value: unknown): unknown => (value && typeof value === 'object' && 'value' in (value as object) ? (value as any).value : value);
const withValue = (old: unknown, formula: string): unknown =>
  old && typeof old === 'object' && 'value' in (old as object) ? {...(old as object), value: formula} : formula;

// puts the feature's formulas right in place; what was put right, for the AI
export const formulasPutRight = (feature: Feature, className: string): string[] => {
  const level = `{level.${className.trim().toLowerCase()}}`;
  const notes: string[] = [];
  const known = KNOWN.find(k => k.name.test((feature.name || '').trim()));
  const all = holders(feature);
  if (known) {
    const formula = known.formula(level);
    // the numbers go where the AI put them: the entry when it made one, else the feature
    const target = all.find(h => Object.keys(h).some(p => known.paths.test(p))) ?? all[all.length - 1];
    const changed: string[] = [];
    for (const holder of all) {
      for (const [path, value] of Object.entries(holder)) {
        if (!known.paths.test(path) || String(valueOf(value)).replace(/\s/g, '') === formula.replace(/\s/g, '')) continue;
        holder[path] = withValue(value, formula);
        changed.push(path);
      }
    }
    // the paths it must have are added only to the entry the player switches on: always on, they would apply to
    // every attack and check
    const entry = Object.values(feature.adjustments || {}).find((v: any) => v && typeof v === 'object' && v.adjustments === target);
    const toggled = !!entry && (entry as {active?: unknown}).active !== undefined;
    const added = toggled ? (known.required || []).filter(path => !all.some(h => Object.keys(h).some(p => p === path || p.startsWith(`${path}[`)))) : [];
    for (const path of added) target[path] = formula;
    if (changed.length || added.length) {
      notes.push(`${feature.name}: ${known.said}, so "${formula}"${changed.length ? ` on ${changed.join(', ')}` : ''}${added.length ? `${changed.length ? ', and ' : ' '}added on ${added.join(', ')}` : ''}`);
    }
    return notes;
  }
  // a halved level whose text says minimum 1
  const text = [feature.description, ...Object.values(feature.adjustments || {}).map(v => (v as any)?.description)].filter(Boolean).join(' ');
  if (!MINIMUM_ONE.test(text)) return notes;
  for (const holder of all) {
    for (const [path, value] of Object.entries(holder)) {
      const halved = HALVED.exec(String(valueOf(value)).trim());
      if (!halved) continue;
      const formula = `max(1, floor(${halved[1]}/${halved[2]}))`;
      holder[path] = withValue(value, formula);
      notes.push(`${feature.name}: its text says minimum 1, so ${path} is "${formula}"`);
    }
  }
  return notes;
};
