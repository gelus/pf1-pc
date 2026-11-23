import {ApplyCharacterService, SpellCastingType} from './apply-character.service';
import {Feature} from './interfaces/character.interface';
import {itemSpellUse} from './rules/spell-items';

// using an item that casts (rules/spell-items.ts), the sheet's and the AI's: one step of the undo history each. a
// wand's or staff's charges spent, a scroll or potion used up (gone with its last), a spell on the user put on as a
// condition; what the rules would have the player know told, nothing held back. a staff recharged from a slot

export interface SpellItemResult {
  done?: string;
  error?: string;
  casterLevel?: number;
  dc?: number;
  notes?: string[];
}

export const useSpellItem = (
  service: ApplyCharacterService, itemId: string, spellName?: string, options: {onSelf?: boolean} = {},
): SpellItemResult => {
  const raw = service.raw();
  const item = (raw.inventory || []).find(i => i.id === itemId);
  const casts = item?.casts;
  if (!item || !casts?.spells?.length) return {error: 'that item casts no spell'};
  const itemSpell = spellName ? casts.spells.find(s => s.spell.name.toLowerCase() === spellName.trim().toLowerCase()) : casts.spells[0];
  if (!itemSpell) return {error: `${item.name} casts ${casts.spells.map(s => s.spell.name).join(', ')}`};
  const cost = casts.kind === 'staff' ? Math.max(1, Number(itemSpell.charges) || 1) : 1;
  const charged = casts.kind === 'wand' || casts.kind === 'staff';
  if (charged && (Number(casts.charges?.current) || 0) < cost) return {error: `${item.name} has ${casts.charges?.current ?? 0} charges, ${itemSpell.spell.name} takes ${cost}`};
  if (!charged && (Number(item.quantity) || 0) < 1) return {error: `there is no ${item.name} left`};
  const use = itemSpellUse(service.applied(), casts, itemSpell);
  return service.labelled(`use ${item.name}: ${itemSpell.spell.name}`, () => {
    let inventory = raw.inventory;
    if (charged) {
      casts.charges = {...casts.charges!, current: (Number(casts.charges!.current) || 0) - cost};
    } else {
      item.quantity = (Number(item.quantity) || 1) - 1;
      // a scroll or potion used up is gone
      if (item.quantity <= 0) inventory = inventory.filter(i => i !== item);
    }
    const conditions = options.onSelf && itemSpell.spell.adjustments
      ? [...(raw.conditions || []), new Feature({name: itemSpell.spell.name, description: itemSpell.spell.description,
        adjustments: JSON.parse(JSON.stringify(itemSpell.spell.adjustments)), active: true})]
      : raw.conditions;
    service.update({inventory: [...inventory], conditions});
    return {
      done: `used ${item.name}: ${itemSpell.spell.name}, caster level ${use.casterLevel}${use.dc ? `, DC ${use.dc}` : ''}${charged ? `, ${casts.charges!.current} charges left` : ''}`,
      casterLevel: use.casterLevel, dc: use.dc, ...(use.notes.length ? {notes: use.notes} : {}),
    };
  });
};

// a staff recharged: a spellcaster spends a slot of the level of the staff's highest spell or above, once a day, for a
// charge (told: the once a day and the level are the player's to keep)
export const rechargeStaff = (service: ApplyCharacterService, itemId: string, origin: string, level: number): SpellItemResult => {
  const item = (service.raw().inventory || []).find(i => i.id === itemId);
  const casts = item?.casts;
  if (!item || casts?.kind !== 'staff' || !casts.charges) return {error: 'that is no staff'};
  if ((Number(casts.charges.current) || 0) >= (Number(casts.charges.total) || 0)) return {error: `${item.name} is fully charged`};
  const highest = Math.max(...casts.spells.map(s => s.level));
  return service.labelled(`recharge ${item.name}`, () => {
    if (!service.consumeSpellLevel('spells' as SpellCastingType, origin, level)) return {error: `no level ${level} ${origin} slot left`};
    casts.charges = {...casts.charges!, current: (Number(casts.charges!.current) || 0) + 1};
    service.update({inventory: [...service.raw().inventory]});
    return {done: `recharged ${item.name}: ${casts.charges.current}/${casts.charges.total}`,
      notes: [`once a day, from a slot of level ${highest} or higher (its highest spell)${level < highest ? `: a level ${level} slot is below it` : ''}`]};
  });
};
