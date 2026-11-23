import {Charges, Spell} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {abilityModifier} from '../ability-mod.pipe';

// items that cast spells (Core Rulebook, chapter 15: potions, scrolls, staves, wands), for any spell: what an item
// holds (Item.casts) and what using it works out. a wand or a staff spends its charges (a staff's spells may cost more
// than one), a scroll or a potion is used up. its save DC is 10 + the spell's level + the least ability modifier that
// casts a spell of that level; a staff uses its wielder's caster level and casting ability instead when they are
// higher. using a wand, staff or scroll of a spell that is not on the user's class lists takes Use Magic Device, a
// scroll above the user's caster level a caster level check: told, never held back

export type SpellItemKind = 'wand' | 'scroll' | 'staff' | 'potion';
export const SPELL_ITEM_KINDS: SpellItemKind[] = ['wand', 'scroll', 'staff', 'potion'];

export interface ItemSpell {
  spell: Spell;
  level: number;
  casterLevel: number;
  // a staff's spell: the charges one use takes (1 unless its page says more)
  charges?: number;
}

export interface SpellItem {
  kind: SpellItemKind;
  spells: ItemSpell[];
  // a wand's (50 when new) or a staff's (10)
  charges?: Charges;
}

// the least ability modifier that casts a spell of a level: its score is 10 + the level
const leastModifier = (level: number): number => Math.floor(level / 2);

// the highest caster level the character casts with, and the best casting ability modifier among its casters
const casterOf = (applied: Character): {casterLevel: number, modifier: number} => {
  const casters = Object.values(applied.spells || {}).filter(c => c?.classLevel || c?.casterLevel);
  return {
    casterLevel: Math.max(0, ...casters.map(c => Number(c.casterLevel) || 0)),
    modifier: Math.max(-5, ...casters.map(c => (c.ability ? abilityModifier(applied, String(c.ability).toLowerCase()) : -5))),
  };
};

// what a use of an item's spell works out to: its caster level and save DC, and what the rules would have the player
// know (Use Magic Device, a caster level check)
export const itemSpellUse = (applied: Character, item: SpellItem, itemSpell: ItemSpell): {casterLevel: number, dc: number, notes: string[]} => {
  const user = casterOf(applied);
  const staff = item.kind === 'staff';
  const casterLevel = staff ? Math.max(itemSpell.casterLevel, user.casterLevel) : itemSpell.casterLevel;
  const dc = 10 + itemSpell.level + (staff ? Math.max(leastModifier(itemSpell.level), user.modifier) : leastModifier(itemSpell.level));
  const notes: string[] = [];
  const onAList = Object.values(applied.spells || {}).some(c => (c?.spells || []).some(l => (l?.spells || [])
    .some(s => s.name.toLowerCase() === itemSpell.spell.name.toLowerCase())));
  if (item.kind !== 'potion' && !onAList) {
    notes.push(`if ${itemSpell.spell.name} is not on one of the character's class spell lists, using it takes a Use Magic Device check (DC ${item.kind === 'scroll' ? 20 + itemSpell.casterLevel : 20})`);
  }
  if (item.kind === 'scroll' && onAList && user.casterLevel < itemSpell.casterLevel) {
    notes.push(`the scroll's caster level (${itemSpell.casterLevel}) is above the character's (${user.casterLevel}): a caster level check, DC ${itemSpell.casterLevel + 1}; a failure may mishap`);
  }
  return {casterLevel, dc, notes};
};

export const spellItemSummary = (item: SpellItem): string =>
  `${item.kind}${item.charges ? ` (${item.charges.current}/${item.charges.total} charges)` : ''}: `
  + item.spells.map(s => `${s.spell.name} (level ${s.level}, CL ${s.casterLevel}${s.charges && s.charges > 1 ? `, ${s.charges} charges` : ''})`).join(', ');
