// a character's senses (Core Rulebook: darkvision, low-light vision; Bestiary, universal monster rules: blindsense,
// blindsight, scent, tremorsense, see in darkness, ...), as data: each sense by its name with its range in feet, 0 for
// one without a range. two sources of a sense give its longest range, never their sum (a race's darkvision 60 ft. and
// a goggle's 120 ft. are 120 ft.): the engine keeps the larger of a senses.<sense> adjustment and what is there.
// a text of them ("low-light vision, darkvision 60 ft.", as saves and features kept them before) is read into them

export type Senses = {[sense: string]: number};

const RANGED = /^(.+?)\s+(\d+)\s*(?:ft\.?|feet|')?$/i;

// "low-light vision, darkvision 60 ft., scent" -> {'low-light vision': 0, darkvision: 60, scent: 0}
export const parseSenses = (text: string): Senses => {
  const senses: Senses = {};
  for (const part of String(text || '').split(/[,;]|\band\b/).map(p => p.trim().replace(/\.$/, '')).filter(Boolean)) {
    const ranged = RANGED.exec(part);
    const name = (ranged ? ranged[1] : part).trim().toLowerCase();
    const range = ranged ? Number(ranged[2]) : 0;
    if (name) senses[name] = Math.max(senses[name] ?? 0, range);
  }
  return senses;
};

// {darkvision: 60, 'low-light vision': 0} -> "darkvision 60 ft., low-light vision"
export const sensesText = (senses: Senses | string | undefined): string => {
  if (typeof senses === 'string') return senses;
  return Object.entries(senses || {}).map(([name, range]) => (Number(range) > 0 ? `${name} ${range} ft.` : name)).join(', ');
};

// the senses of a character as it is saved: a text of an older save read into them
export const sensesOf = (value: unknown): Senses =>
  typeof value === 'string' ? parseSenses(value) : value && typeof value === 'object' ? {...(value as Senses)} : {};
