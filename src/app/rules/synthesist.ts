import {Feature, sizes} from '../interfaces/character.interface';
import {sensesOf} from './senses';
import {Character} from '../utils/character.class';
import type {AdjustmentMapEntry} from '../apply-character.service';

// the synthesist (Ultimate Magic, summoner archetype; d20pfsrd and Archives of Nethys read 2026-11-23): fused with its
// eidolon, the summoner wears it like living armor. while fused it uses the eidolon's Strength, Dexterity and
// Constitution and its base attack bonus, gains its armor and natural armor bonuses, its evolutions and special
// abilities, perceives through its senses, and has its hit points as temporary hit points; it keeps its own Int, Wis
// and Cha, saves, skills, feats and gear, but not its worn armor. its own archetype features apply while fused (each
// written with "if": "Fused")
//
// the fusion is a form of the summoner (rules/forms.ts: one at a time, its race's attacks, movement and senses set
// aside, its armor melded), its numbers a copy of the eidolon as it is, refreshed by CharacterRegistry whenever either
// changes: the eidolon keeps its own sheet, where it is managed (its evolutions, its hit points)

export const FUSED = 'Fused';
// what the copy carries itself: the evolutions' other adjustments come along as they are
const COPIED = /^(abilityScores\.|ac$|size$|speed\.|flyManeuverability$|melee$|ranged$|senses($|\.)|bab$)/;

const sum = (entries: AdjustmentMapEntry[] | undefined, types: string[]): number => (entries || [])
  .filter(e => e.variant === undefined && !e.mode && !e.overwritten && types.includes(String(e.type || '').toLowerCase()))
  .reduce((total, e) => total + (Number(e.value) || 0), 0);

// the summoner's Fused form, from its eidolon as it is now (its raw, applied and what adjusted it)
// masterBab: the summoner's base attack bonus from its class levels, which the eidolon's replaces (the class's is added
// on top of a set, so the form gives the difference)
export const fusedForm = (
  eidolon: Character, applied: Character, map: {[path: string]: AdjustmentMapEntry[]}, existing?: Feature, masterBab = 0,
): Feature => {
  const speeds = Object.entries(applied.speed || {}).filter(([, v]) => (Number(v) || 0) > 0);
  const naturalAttacks = (applied.melee || []).filter(a => a.type === 'natural').map(a => {
    const {result: _, ...attack} = a as typeof a & {result?: unknown};
    return {...attack, sizedFor: attack.sizedFor || sizes[applied.size] || ''};
  });
  const evolutions = (eidolon.race?.features || []).filter(f => f.cost !== undefined).map(f => new Feature({
    id: `fused:${f.id}`, name: f.name, description: f.description,
    adjustments: Object.fromEntries(Object.entries(f.adjustments || {}).filter(([path]) => !COPIED.test(path.replace(/\[.*\]$/, '')))) as Feature['adjustments'],
  }));
  const natural = sum(map['ac'], ['natural armor', 'natural armor increase']);
  return new Feature({
    id: existing?.id ?? `fused:${eidolon.id}`,
    name: FUSED,
    description: `Fused with ${eidolon.name}: its Str, Dex and Con, base attack bonus, natural armor, evolutions and senses; its hit points as temporary hit points (taken on its own sheet). Worn armor does not work.`,
    active: existing?.active ?? false,
    form: {fusedWith: eidolon.id, meldsArmor: true, from: 'Synthesist'},
    adjustments: {
      'abilityScores.str': {value: applied.abilityScores.str, mode: 'set'},
      'abilityScores.dex': {value: applied.abilityScores.dex, mode: 'set'},
      'abilityScores.con': {value: applied.abilityScores.con, mode: 'set'},
      bab: (Number(applied.bab) || 0) - masterBab,
      size: {value: applied.size, mode: 'set'},
      ...(natural ? {ac: {value: natural, type: 'natural armor'}} : {}),
      tempHp: Math.max(0, Number(applied.currentHp) || 0),
      ...Object.fromEntries(speeds.map(([kind, v]) => [`speed.${kind}`, {value: v, mode: 'set'}])),
      ...(applied.flyManeuverability ? {flyManeuverability: applied.flyManeuverability} : {}),
      ...Object.fromEntries(Object.entries(sensesOf(applied.senses)).map(([sense, range]) => [`senses.${sense}`, range])),
      ...(naturalAttacks.length ? {melee: naturalAttacks} : {}),
      ...(evolutions.length ? {specialQuality: evolutions} : {}),
    } as Feature['adjustments'],
  });
};
