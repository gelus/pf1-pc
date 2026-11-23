import {Character} from '../utils/character.class';

// making a magic item (Core Rulebook, chapter 15: creating magic items), for any item: what it takes, told and never
// held back (the table decides), its gold paid only when the player says so (the retraining's payGold). its
// requirements (the feat that makes it, the spells, the caster level) come from its page:
//  - cost: half its base price in materials, the masterwork part of a magic weapon or armor in full
//  - time: a day for each 1,000 gp of its base price; a potion or scroll of 250 gp or less in 2 hours
//  - the check: Spellcraft (or the Craft skill the item needs) at DC 5 + its caster level, +5 for each requirement the
//    crafter lacks besides the feat; failing by 5 or more makes a cursed item

export interface CraftRequest {
  // its base (market) price in gp, and the masterwork part of it for a magic weapon or armor
  price: number;
  masterwork?: number;
  casterLevel: number;
  // the requirements (spells, a caster level) the crafter lacks, by count
  missing?: number;
  // a potion or scroll (its 2 hours)
  brewedOrScribed?: boolean;
  // the feat that makes it, as its page names it
  feat?: string;
}

export interface CraftQuote {
  cost: number;
  time: string;
  dc: number;
  notes: string[];
}

export const craftQuote = (crafter: Character, request: CraftRequest): CraftQuote => {
  const masterwork = Math.max(0, Number(request.masterwork) || 0);
  const price = Math.max(0, Number(request.price) || 0);
  const magic = Math.max(0, price - masterwork);
  const cost = Math.round((magic / 2 + masterwork) * 100) / 100;
  const quick = request.brewedOrScribed && price <= 250;
  const days = Math.max(1, Math.ceil(magic / 1000));
  const dc = 5 + Math.max(1, Number(request.casterLevel) || 1) + 5 * Math.max(0, Number(request.missing) || 0);
  const notes = [`failing the check by 5 or more makes a cursed item`];
  const feat = (request.feat || '').trim();
  if (feat && !(crafter.feats || []).some(f => (f.name || '').toLowerCase() === feat.toLowerCase())) {
    notes.unshift(`the character does not have ${feat}, which makes it`);
  }
  if (request.missing) notes.unshift(`${request.missing} requirement${request.missing > 1 ? 's' : ''} missing: +${5 * request.missing} to the DC`);
  return {cost, time: quick ? '2 hours' : `${days} day${days > 1 ? 's' : ''}`, dc, notes};
};
