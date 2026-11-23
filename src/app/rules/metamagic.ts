import {Feature} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';

// metamagic (Core Rulebook, chapter 5: metamagic feats), for any metamagic feat: a feat with its spell level adjustment
// (Feature.metamagic, from its page: Empower Spell +2, Extend Spell +1, Quicken Spell +4). a spell with metamagic takes
// a slot that many levels higher: a prepared caster prepares it there, a spontaneous caster spends a slot of that level
// and casts it as a full-round action (a standard action spell; a quickened one stays as it was). Heighten Spell raises
// the spell's own level to the slot's (its DC and its level effects), any number of levels. what each metamagic does
// to the spell is written on its feat, judged at the table

export interface Metamagic {
  // the levels it adds to the slot
  levels: number;
  // it raises the spell's own level to the slot's (Heighten Spell), as many levels as the caster chooses
  heightens?: boolean;
}

export const metamagicFeats = (applied: Character): Feature[] => (applied.feats || []).filter(f => f.metamagic);

// the slot a spell of baseLevel takes with these metamagic feats (by name), or what is wrong: a feat the character does
// not have, or a heightened spell's slot below its own level
export const metamagicSlot = (
  applied: Character, baseLevel: number, names: string[], heightenedTo?: number,
): {level?: number, error?: string} => {
  const feats = metamagicFeats(applied);
  let level = baseLevel;
  for (const name of names) {
    const feat = feats.find(f => (f.name || '').toLowerCase() === name.trim().toLowerCase());
    if (!feat) return {error: `the character has no metamagic feat ${name}${feats.length ? ` (it has ${feats.map(f => f.name).join(', ')})` : ''}`};
    level += Number(feat.metamagic!.levels) || 0;
  }
  const heighten = names.some(n => feats.find(f => (f.name || '').toLowerCase() === n.trim().toLowerCase())?.metamagic?.heightens);
  if (heighten) {
    if (heightenedTo === undefined) return {error: 'a heightened spell needs the level it is heightened to'};
    if (heightenedTo < baseLevel) return {error: `a spell is heightened to its own level (${baseLevel}) or higher`};
    level += heightenedTo - baseLevel;
  }
  return {level};
};

// "Fireball (Empower Spell, Extend Spell)"
export const metamagicName = (spell: string, names: string[] | undefined): string =>
  names?.length ? `${spell} (${names.join(', ')})` : spell;
