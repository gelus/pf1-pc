import {abilityModifier} from '../ability-mod.pipe';
import {CombatOption, alwaysAvailableCombatOptions, notStacking, sizes} from '../interfaces/character.interface';
import {Attack, AttackPart, AttackResult} from '../utils/attack.class';
import {Character} from '../utils/character.class';
import {handsFor, HANDS} from '../utils/equipment.util';
import {clampSize, scaleDamageDice} from '../utils/size.util';
import {levelReference} from '../utils/object.util';
import {RuleContext, RuleModule} from './rule-module';
import {
  baseSizeOf, criticalText, damageExpression, iterativeAttackCount, multipliedModifier, partsOf, powerAttackSteps,
  proficiencyKey, totalOf,
} from './attacks.util';

type AttackList = 'melee' | 'ranged';

// the proficiency groups of weapons, a weapon naming none of them is taken to be one the character can use
const WEAPON_GROUPS = ['simple', 'martial', 'exotic'];

// a combat option is in effect when it is on and the character can use it
const inEffect = (applied: Character, option: CombatOption): boolean =>
  Boolean(applied.combatOptions?.[option]) &&
  (alwaysAvailableCombatOptions.includes(option) || Boolean(applied.availableCombatOptions?.[option]));

const abilitiesOf = (abilities: string): string[] => (abilities || '').split(/\s*,\s*/).filter(Boolean);

// what the attacks rule knows of the character as a whole while it works out each attack
interface AttackSituation {
  raw: Character;
  applied: Character;
  context: RuleContext;
  baseSize: number;
  // the character makes manufactured melee attacks, so all its natural attacks are secondary
  manufactured: boolean;
  // the character has a single natural attack (and no manufactured one): 1 1/2 str to it
  singleNatural: boolean;
  twoWeaponFighting: boolean;
  lightOffHand: boolean;
  // the attack rolls of each natural attack once the hands holding weapons are taken out, by attack
  naturalRolls: Map<Attack, number>;
  // what holds the hands, "Greataxe", for the notes of the natural attacks it leaves out
  heldBy: string[];
}

const isNatural = (attack: Attack): boolean => attack.type === 'natural';
const countOf = (attack: Attack): number => Math.max(1, Math.floor(Number(attack.count) || 1));

// the hands held while the character attacks: every equipped held item (handsFor: a two-handed weapon takes both,
// a shield or torch one, a buckler none), and a manufactured melee weapon given by no item (2 two-handed, else 1).
// an unarmed strike holds nothing
const handsHeld = (melee: Attack[], raw: Character): {hands: number, by: string[]} => {
  let hands = 0;
  const by: string[] = [];
  for (const item of raw.inventory || []) {
    if (!item?.equipped) continue;
    const held = handsFor(item);
    if (!held) continue;
    hands += held;
    by.push(item.name || 'an item');
  }
  for (const attack of melee) {
    if (!attack || isNatural(attack) || attack.itemId || /unarmed/i.test(attack.name || '')) continue;
    hands += attack.hand === 'two-handed' ? 2 : 1;
    by.push(attack.name || 'a weapon');
  }
  return {hands, by};
};

// the rolls of every natural attack: those made with hands share the hands the weapons leave free, in order
// (core rulebook, universal monster rules: a creature can not attack with a claw of a hand holding a weapon)
const naturalRollsOf = (attacks: Attack[], freeHands: number): Map<Attack, number> => {
  const rolls = new Map<Attack, number>();
  let free = Math.max(0, freeHands);
  for (const attack of attacks) {
    if (!attack || !isNatural(attack)) continue;
    if (!attack.usesHands) { rolls.set(attack, countOf(attack)); continue; }
    const made = Math.min(countOf(attack), free);
    free -= made;
    rolls.set(attack, made);
  }
  return rolls;
};
const isThrown = (attack: Attack, list: AttackList): boolean => list === 'ranged' && Boolean(attack.thrown);

// the multiplier of the strength bonus to damage, and why
//  natural: primary 1, a single natural attack 1 1/2, secondary 1/2 (core rulebook, universal monster rules)
//  manufactured: primary hand 1, off hand 1/2, two-handed 1 1/2, a light weapon in two hands only 1 (combat)
//  a projectile 1: its strength is limited by the bow, see strengthDamage
const strengthMultiplier = (attack: Attack, list: AttackList, s: AttackSituation): [number, string] => {
  if (isNatural(attack)) {
    if (attack.secondary || s.manufactured) return [0.5, 'secondary natural attack'];
    if (s.singleNatural) return [1.5, 'single natural attack'];
    return [1, ''];
  }
  if (list === 'ranged' && !isThrown(attack, list)) return [1, ''];
  if (attack.hand === 'off') return [0.5, 'off hand'];
  if (attack.hand === 'two-handed') return attack.light ? [1, 'light weapon in two hands'] : [1.5, 'two-handed'];
  return [1, ''];
};

const multiplierText = (multiplier: number): string => multiplier === 1.5 ? 'x1 1/2' : multiplier === 0.5 ? 'x1/2' : '';

// the abilities an attack adds to damage. thrown weapons and bows take str whatever damageAbility says
const damageAbilities = (attack: Attack, list: AttackList): string[] => {
  const abilities = abilitiesOf(attack.damageAbility);
  if ((isThrown(attack, list) || attack.bow) && !abilities.includes('str')) abilities.unshift('str');
  return abilities;
};

// the strength to the damage of an attack (core rulebook, strength and the bow descriptions)
const strengthDamage = (attack: Attack, list: AttackList, s: AttackSituation): AttackPart => {
  const modifier = abilityModifier(s.applied, 'str');
  if (list === 'ranged' && !isThrown(attack, list)) {
    if (attack.bow === 'bow') return {value: Math.min(0, modifier), origin: 'str (bow: penalty only)'};
    if (attack.bow === 'composite') {
      const rating = Math.max(0, Number(attack.compositeRating) || 0);
      return {value: Math.min(rating, modifier), origin: `str (composite +${rating})`};
    }
    return {value: modifier, origin: 'str'};
  }
  const [multiplier, why] = strengthMultiplier(attack, list, s);
  return {value: multipliedModifier(modifier, multiplier), origin: why ? `str ${multiplierText(multiplier)} (${why})` : 'str'};
};

// whether the character is proficient with the weapon of an attack (core rulebook, weapon proficiency): with its
// name or its group in proficiencies.weapons. natural attacks, unarmed strikes and attacks of no weapon item (or a
// weapon naming no group) always are
const isProficient = (attack: Attack, s: AttackSituation): boolean => {
  if (isNatural(attack) || /unarmed/i.test(attack.name || '')) return true;
  const item: any = (s.raw.inventory || []).find(i => i.id === attack.itemId);
  if (!item) return true;
  const group = proficiencyKey(item.proficiency);
  if (!WEAPON_GROUPS.includes(group)) return true;
  const known = new Set((s.applied.proficiencies?.weapons || []).map(proficiencyKey));
  return known.has(group) || known.has(proficiencyKey(item.name)) || known.has(proficiencyKey(attack.name));
};

// the masterwork and enhancement bonus of the weapon, against the enhancement bonuses given to every attack (magic
// weapon, ...): those do not stack, the larger applies (core rulebook, combining magical effects)
const enhancementParts = (weapon: AttackPart | undefined, parts: AttackPart[]): AttackPart[] => {
  if (!weapon) return parts;
  const enhancements = parts.filter(p => !p.overwritten && (p.type || '').toLowerCase() === 'enhancement');
  const best = enhancements.reduce((max, p) => Math.max(max, p.value), -Infinity);
  if (weapon.value > best) {
    for (const p of enhancements) p.overwritten = true;
    return [...parts, weapon];
  }
  return [...parts, {...weapon, overwritten: true}];
};

const twoWeaponPenalty = (
  attack: Attack, s: AttackSituation, reductionPath: string, reduction: number,
): AttackPart[] => {
  const offHand = attack.hand === 'off';
  const penalty = offHand ? (s.lightOffHand ? -8 : -10) : (s.lightOffHand ? -4 : -6);
  const parts: AttackPart[] = [{
    value: penalty,
    origin: `two-weapon fighting (${offHand ? 'off hand' : 'primary hand'}${s.lightOffHand ? ', light off-hand weapon' : ''})`,
  }];
  const reductions = partsOf(s.context.adjustmentsMap[reductionPath] || [], reduction, s.applied, 'two-weapon fighting');
  parts.push(...reductions);
  // what lessens the penalty never turns it into a bonus
  const excess = penalty + totalOf(reductions);
  if (excess > 0) parts.push({value: -excess, origin: 'two-weapon fighting (no bonus)'});
  return parts;
};

const workOutAttack = (attack: Attack, list: AttackList, index: number, s: AttackSituation): AttackResult => {
  const {applied, context} = s;
  const notes: string[] = [];
  const bab = Number(applied.bab) || 0;
  const natural = isNatural(attack);
  const hpDamage = Boolean((attack.damage || '').trim()) && !attack.touch;
  const steps = powerAttackSteps(bab);
  const [strMultiplier] = strengthMultiplier(attack, list, s);

  // to hit
  const toHit: AttackPart[] = [{value: bab, origin: 'base attack bonus'}];
  for (const ability of abilitiesOf(attack.toHitAbility)) {
    toHit.push({value: abilityModifier(applied, ability), origin: ability});
  }
  toHit.push(...partsOf(context.adjustmentsMap['attackRollBonus'] || [], applied.attackRollBonus, applied, 'all attacks'));
  const listBonus = list === 'melee' ? 'meleeAttackRollBonus' : 'rangedAttackRollBonus';
  toHit.push(...partsOf(context.adjustmentsMap[listBonus] || [], (applied as any)[listBonus], applied, `${list} attacks`));
  const ownToHit = partsOf(
    [...(context.adjustmentsMap[`${list}.*.toHitBonus`] || []), ...(context.adjustmentsMap[`${list}.${index}.toHitBonus`] || [])],
    attack.toHitBonus, applied, 'bonus',
  );
  const weaponToHit = Math.max(attack.masterwork ? 1 : 0, Number(attack.enhancement) || 0);
  toHit.push(...enhancementParts(weaponToHit > 0 ? {
    value: weaponToHit,
    origin: (Number(attack.enhancement) || 0) > 0 ? `+${attack.enhancement} weapon` : 'masterwork',
    type: 'enhancement',
  } : undefined, ownToHit));
  if (natural && (attack.secondary || s.manufactured)) {
    toHit.push({value: -5, origin: attack.secondary ? 'secondary natural attack' : 'secondary natural attack (with manufactured weapons)'});
  }
  if (!isProficient(attack, s)) toHit.push({value: -4, origin: 'nonproficient'});
  if (attack.bow === 'composite' && list === 'ranged' && abilityModifier(applied, 'str') < (Number(attack.compositeRating) || 0)) {
    toHit.push({value: -2, origin: `str below the composite rating (+${attack.compositeRating})`});
  }
  if (s.twoWeaponFighting && !natural && (attack.hand === 'primary' || attack.hand === 'off')) {
    const off = attack.hand === 'off';
    toHit.push(...twoWeaponPenalty(
      attack, s,
      off ? 'twoWeaponFighting.offHandPenaltyReduction' : 'twoWeaponFighting.primaryPenaltyReduction',
      off ? applied.twoWeaponFighting?.offHandPenaltyReduction : applied.twoWeaponFighting?.primaryPenaltyReduction,
    ));
  }

  // damage: the dice of the attack's level when they grow with it, else its own
  const baseDice = diceAtLevel(attack, applied) || attack.damage || '';
  const size = clampSize(applied.size);
  // the dice are for the race's size, or the size the attack says (a form's bite as the creature's stat block has it)
  const named = sizes.findIndex(name => name.toLowerCase() === String(attack.sizedFor || '').trim().toLowerCase());
  const sizedFor = named >= 0 ? named : s.baseSize;
  const dice = sizedFor === size ? baseDice : scaleDamageDice(baseDice, sizedFor, size);
  if (dice !== baseDice) notes.push(`${baseDice} at ${sizes[sizedFor]}, ${dice} at ${sizes[size]}`);
  const damage: AttackPart[] = [];
  for (const ability of damageAbilities(attack, list)) {
    damage.push(ability === 'str' ? strengthDamage(attack, list, s) : {value: abilityModifier(applied, ability), origin: ability});
  }
  const ownDamage = partsOf(
    [...(context.adjustmentsMap[`${list}.*.damageBonus`] || []), ...(context.adjustmentsMap[`${list}.${index}.damageBonus`] || [])],
    attack.damageBonus, applied, 'bonus',
  );
  const enhancement = Number(attack.enhancement) || 0;
  damage.push(...enhancementParts(
    enhancement > 0 ? {value: enhancement, origin: `+${enhancement} weapon`, type: 'enhancement'} : undefined, ownDamage,
  ));

  // power attack and deadly aim (core rulebook, feats): -1 to hit every 4 bab, +2 damage for each, power attack
  // +50% where str adds 1 1/2 and -50% where it adds 1/2 (off hand, secondary natural attacks)
  if (hpDamage && list === 'melee' && inEffect(applied, 'powerAttack')) {
    toHit.push({value: -steps, origin: 'power attack'});
    damage.push({value: Math.floor(2 * steps * strMultiplier), origin: `power attack${strMultiplier !== 1 ? ` ${multiplierText(strMultiplier)}` : ''}`});
  }
  if (hpDamage && list === 'ranged' && inEffect(applied, 'deadlyAim')) {
    toHit.push({value: -steps, origin: 'deadly aim'});
    damage.push({value: 2 * steps, origin: 'deadly aim'});
  }

  // bonuses of one type from different paths (a morale bonus on every attack roll and one on this weapon) do not stack
  // either: the larger counts, the other is crossed out
  for (const parts of [toHit, damage]) for (const loser of notStacking(parts, p => p.value)) loser.overwritten = true;

  // the attack rolls of a full attack
  const first = totalOf(toHit);
  let rolls: number;
  if (natural) {
    rolls = s.naturalRolls.get(attack) ?? countOf(attack);
    const count = countOf(attack);
    const held = s.heldBy.join(' and ');
    if (!rolls) notes.push(`no free hand to make it: ${held} ${s.heldBy.length > 1 ? 'hold' : 'holds'} both hands`);
    else if (rolls < count) notes.push(`${rolls} of ${count}: ${held} ${s.heldBy.length > 1 ? 'hold' : 'holds'} the other ${count - rolls > 1 ? 'hands' : 'hand'}`);
  }
  else if (attack.hand === 'off') rolls = 1 + (s.twoWeaponFighting ? Math.max(0, Math.floor(applied.twoWeaponFighting?.extraOffHandAttacks || 0)) : 0);
  else rolls = iterativeAttackCount(bab);
  const attackBonuses = Array.from({length: rolls}, (_, i) => natural ? first : first - 5 * i);
  if (!natural && attack.hand === 'off' && !s.twoWeaponFighting) notes.push('an off-hand attack is made with two-weapon fighting');

  const result: AttackResult = {
    attackBonuses,
    toHit: {total: first, parts: toHit},
    damage: {dice, baseDice, bonus: totalOf(damage), parts: damage, expression: ''},
    critical: criticalText(attack.crit, attack.critMultiplier),
    notes,
  };
  result.damage.expression = damageExpression(dice, result.damage.bonus);

  // range (core rulebook, combat, range): -2 per increment beyond the first, thrown weapons 5 increments, projectiles 10
  const increment = Number(attack.range) || 0;
  if (increment > 0) {
    const kind = list === 'melee' || attack.thrown ? 'thrown' : 'projectile';
    const maxIncrements = kind === 'thrown' ? 5 : 10;
    result.range = {increment, maxIncrements, maxRange: increment * maxIncrements, kind};
    notes.push(`-2 per range increment beyond the first, ${maxIncrements} increments at most (${increment * maxIncrements} ft.)`);
  }

  if (attack.ammunitionId) {
    const item = (s.raw.inventory || []).find(i => i.id === attack.ammunitionId);
    if (!item) notes.push('its ammunition is not in the inventory');
    else {
      const quantity = Math.max(0, Number(item.quantity) || 0);
      result.ammunition = {itemId: item.id, name: item.name, quantity};
      if (!quantity) notes.push('out of ammunition');
    }
  }
  return result;
};

// works out the final numbers of every attack of the character, onto the attack as its result (see AttackResult):
// iterative attacks, two-weapon fighting, natural attacks, power attack and deadly aim, proficiency, masterwork and
// enhancement, bows, size and range. the applied attacks are replaced by copies carrying the result, the attacks
// in the features they come from stay as they are
// the dice an attack's table gives at the character's level of its class (damageByLevel), the last it reached
const diceAtLevel = (attack: Attack, applied: Character): string | undefined => {
  const table = Object.entries(attack.damageByLevel || {}).map(([level, dice]) => [Number(level), String(dice)] as const)
    .filter(([level, dice]) => level > 0 && dice).sort((a, b) => a[0] - b[0]);
  if (!table.length) return undefined;
  const level = levelReference(applied, attack.damageLevel ? `level.${attack.damageLevel.trim().toLowerCase()}` : 'level') ?? 0;
  return table.filter(([at]) => at <= level).pop()?.[1];
};

export const attacksRule: RuleModule = {
  name: 'attacks',
  finalize: (raw, applied, context) => {
    const melee = applied.melee || [];
    const ranged = applied.ranged || [];
    const all = [...melee, ...ranged];
    const offHand = all.filter(a => !isNatural(a) && a.hand === 'off');
    // anyone can fight with two weapons, with an off-hand weapon the option shows (core rulebook, combat)
    if (offHand.length) applied.availableCombatOptions = {...applied.availableCombatOptions, twoWeaponFighting: true};
    const held = handsHeld(melee, raw);
    // the copies carry the results, the rolls are worked out on them so they can be looked up by attack
    const copies = {
      melee: melee.map(a => a && typeof a === 'object' ? {...new Attack(), ...a} : a),
      ranged: ranged.map(a => a && typeof a === 'object' ? {...new Attack(), ...a} : a),
    };
    const rollsByAttack = naturalRollsOf([...copies.melee, ...copies.ranged], HANDS - held.hands);
    const naturalRolls = [...rollsByAttack.values()].reduce((n, r) => n + r, 0);
    const manufactured = melee.some(a => !isNatural(a));
    const situation: AttackSituation = {
      raw, applied, context,
      baseSize: baseSizeOf(raw, applied, context.adjustmentsMap['size']),
      manufactured,
      singleNatural: naturalRolls === 1 && !manufactured,
      twoWeaponFighting: offHand.length > 0 && inEffect(applied, 'twoWeaponFighting'),
      lightOffHand: Boolean(offHand[0]?.light),
      naturalRolls: rollsByAttack,
      heldBy: held.by,
    };
    for (const list of ['melee', 'ranged'] as AttackList[]) {
      const attacks = applied[list] || [];
      attacks.forEach((attack, index) => {
        if (!attack || typeof attack !== 'object') return;
        const copy = copies[list][index];
        attacks[index] = {...copy, result: workOutAttack(copy, list, index, situation)};
      });
    }
  },
};
