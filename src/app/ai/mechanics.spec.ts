import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { createFeature } from './builders';
import { addClassLevel } from './level-up';
import { runAiTool } from './ai-tools';
import { mechanicsProblems, normalizedFeature } from './mechanics';

// the AI writing the rules of a feature as adjustments, shown where the player reads them: a slayer's first level
describe('feature mechanics', () => {
  let service: ApplyCharacterService;
  const slayer = (features: object[]) => addClassLevel(service, {
    class_name: 'Slayer', hit_die: 10, bab: 'full', good_saves: 'fort,ref', skill_ranks: 6, weapon_proficiencies: 'simple, martial', armor_proficiencies: 'light, medium, shield',
    class_skills: 'perception,survival,bluff', based_on: 'own knowledge', starting_gold: 175,
    // a 1st level's features, gained at 1st unless a spec says otherwise
    features: JSON.stringify(features.map(f => ({gained_at: 1, ...f}))),
  }) as any;
  const studiedTarget = {
    name: 'Studied Target', description: 'move action: bonuses against one creature',
    adjustments: {specialAttack: {
      name: 'Studied Target', description: '+1 attack, damage and some skills vs. the target', active: false,
      adjustments: {'melee.*.toHitBonus': '1+floor({level.slayer}/5)', 'ranged.*.toHitBonus': '1+floor({level.slayer}/5)',
        'skills.perception.value': '1+floor({level.slayer}/5)'},
    }},
  };
  const track = {
    name: 'Track', description: '+1/2 level on Survival to follow tracks',
    adjustments: {
      'skills.survival.value[follow tracks]': 'max(1, floor({level.slayer}/2))',
      specialQuality: {name: 'Track', description: '+1/2 slayer level to follow tracks'},
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(new Character());
  });

  it('refuses class features that adjust nothing, with how to write them', () => {
    const result = slayer([{name: 'Studied Target', description: 'bonuses vs. a target', adjustments: {}}, {name: 'Track', description: 'x'}]);
    expect(result.error).toContain('need their rules as adjustments');
    expect(result.problems.join(' ')).toContain('Studied Target adjusts nothing');
    expect(result.problems.join(' ')).toContain('Track adjusts nothing');
    expect(result.how).toContain('"grows"');
    expect(service.raw().classLevels.length).toBe(0);
  });

  it('refuses a class feature that would not show on the sheet, or whose toggle would hide it', () => {
    // one with no entry gets one, in the list its text points to
    expect(slayer([{name: 'Track', description: 'adds to Survival to follow tracks', adjustments: {'skills.survival.value[follow tracks]': 1}}]).done).toContain('Track');
    expect((service.raw().classLevels[0].features[0].adjustments as any).specialQuality).toEqual({name: 'Track', description: jasmine.any(String)});
    service.initializeCharacter(new Character());
    // one the player switches on gets its toggle and bonuses moved onto its entry
    expect(slayer([{name: 'Studied Target', description: 'study a foe as a move action', active: false, adjustments: {'skills.perception.value': 1, specialAttack: {name: 'Studied Target'}}}]).done)
      .toContain('Studied Target');
    expect((service.raw().classLevels[0].features[0].adjustments as any).specialAttack)
      .toEqual({name: 'Studied Target', active: false, adjustments: {'skills.perception.value': 1}});
    service.initializeCharacter(new Character());
    // a class feature the player does not switch on can not hide behind a toggle
    const toggled = slayer([{name: 'Iron Skin', active: false, adjustments: {ac: 1, defensiveAbilities: {name: 'Iron Skin'}}}]);
    expect(toggled.problems[0]).toContain('its toggle would hide it');
    // a bonus feat is counted, not shown
    expect(slayer([{name: 'Bonus Feat', adjustments: {bonusFeats: 1}}]).done).toContain('Slayer 1');
  });

  it('takes studied target as a special attack the player switches on, and track as a special quality', async () => {
    expect(slayer([studiedTarget, track]).done).toBe('level 1: Slayer 1 with Studied Target, Track (from memory, check it)');
    let applied = service.applied();
    expect(applied.specialAttack.map(f => [f.name, f.active])).toEqual([['Studied Target', false]]);
    expect(applied.specialQuality.map(f => f.name)).toEqual(['Track']);
    expect(applied.skills.perception.value).toBe(0);
    expect(await runAiTool('set_feature_active', {name: 'Studied Target', active: true}, {character: service} as any))
      .toEqual({done: 'Studied Target is on'});
    applied = service.applied();
    expect(applied.skills.perception.value).toBe(1);
    service.setFeatureActive(applied.specialAttack[0], false);
    expect(service.applied().skills.perception.value).toBe(0);
  });

  it('keeps a feature that changes no number only when it says why, without the mark', () => {
    expect(slayer([{name: 'Weapon Proficiency', adjustments: {}, descriptionOnly: 'the class level gives it'}]).done).toContain('Slayer 1');
    expect(Object.keys(service.raw().classLevels[0].features[0])).not.toContain('descriptionOnly');
    expect((createFeature(service, {list: 'feats', name: 'Mask of Virtue', adjustments: '{}', based_on: 'own knowledge'}) as any).problems[0])
      .toContain('adjusts nothing');
    // spelled the way the tools' arguments are
    expect(mechanicsProblems([normalizedFeature({name: 'Weapon and Armor Proficiency', adjustments: {}, description_only: 'the class level gives it'})]))
      .toEqual([]);
    expect(mechanicsProblems([normalizedFeature({name: 'Elf Blood', description: 'counts as an elf and a human', description_only: true})]))
      .toEqual([]);
  });

  it('refuses description only for a feature whose text gives numbers a path holds', () => {
    const feat = (name: string, description: string, why = 'situational') => createFeature(service, {
      list: 'feats', name, description, adjustments: '{}', description_only: why, based_on: 'own knowledge',
    }) as any;
    expect(feat('Point-Blank Shot', '+1 bonus on attack and damage rolls with ranged weapons within 30 feet').problems[0])
      .toContain('its bonus is a path');
    expect(feat('Spell Focus (Evocation)', '+1 to the DC of evocation spells').problems[0]).toContain('spellSchoolDcBonus');
    expect(feat('Precise Shot', 'no -4 penalty for shooting into melee').done).toContain('Precise Shot');
    // when no path can hold it, the AI says so
    expect(feat('Bloodline Arcana', '+1 damage on each fire spell', 'no path: spell damage').done).toContain('Bloodline Arcana');
    expect(slayer([{name: 'Bonus Feat', description: 'a bonus combat feat', adjustments: {}, descriptionOnly: 'chosen later'}]).problems[0])
      .toContain('"bonusFeats": 1');
  });

  it('refuses a bonus its text says applies only sometimes, written as one that applies always', () => {
    const hardy = (adjustments: object, active?: boolean) => createFeature(service, {
      list: 'traits', name: 'Hardy', description: '+2 on saves vs. poison, spells and spell-like abilities',
      adjustments: JSON.stringify(adjustments), based_on: 'own knowledge', ...(active ? {can_turn_off: true} : {}),
    }) as any;
    expect(hardy({'saves.fort': 2, 'saves.will': 2}).problems[0]).toContain('saves.fort, saves.will apply always');
    expect(hardy({'saves.fort[vs. poison]': 2, 'saves.will[vs. spells]': 2}).done).toContain('Hardy');
  });

  it('adds a class feature the player switches on as its entry, toggle on, however the AI wrote it', () => {
    const result = slayer([{name: 'Studied Target', description: 'move action: +1 on attack and damage rolls against the studied target',
      adjustments: {'melee.*.toHitBonus[vs. studied target]': 1, 'ranged.*.toHitBonus[vs. studied target]': 1,
        'melee.*.damageBonus': 1, 'ranged.*.damageBonus': 1}}]);
    expect(result.done).toContain('Studied Target');
    const feature = service.raw().classLevels[0].features[0];
    expect(feature.active).toBeUndefined();
    expect((feature.adjustments as any).specialAttack).toEqual({
      name: 'Studied Target', description: 'move action: +1 on attack and damage rolls against the studied target', active: false,
      adjustments: {'melee.*.toHitBonus': 1, 'ranged.*.toHitBonus': 1, 'melee.*.damageBonus': 1, 'ranged.*.damageBonus': 1},
    });
    expect(service.applied().specialAttack.map(f => [f.name, f.active])).toEqual([['Studied Target', false]]);
  });

  it('refuses a toggled entry whose bonuses are a variant of its own situation', () => {
    // a class feature is put right as it is added
    expect(slayer([{name: 'Studied Target', adjustments: {specialAttack: {name: 'Studied Target', active: false,
      adjustments: {'ranged.*.toHitBonus[vs. studied target]': 1, 'melee.*.toHitBonus[vs. studied target]': 1}}}}]).done).toContain('Studied Target');
    expect((service.raw().classLevels[0].features[0].adjustments as any).specialAttack.adjustments)
      .toEqual({'ranged.*.toHitBonus': 1, 'melee.*.toHitBonus': 1});
    // another feature is refused
    const result = createFeature(service, {list: 'specialAttack', name: 'Challenge', can_turn_off: true, based_on: 'own knowledge',
      adjustments: '{"melee.*.damageBonus[vs. challenge]": 1, "ranged.*.damageBonus[vs. challenge]": 1}'}) as any;
    expect(result.problems[0]).toContain('its bonuses are plain paths');
  });

  it('refuses a feature that only shows on the sheet when its text gives numbers', () => {
    const shown = slayer([{name: 'Studied Target', adjustments: {specialQuality: {name: 'Studied Target',
      description: '+1 on weapon attack and damage rolls against the studied target'}}}]);
    expect(shown.problems[0]).toContain('shows on the sheet but adjusts nothing');
    expect(slayer([{name: 'Weapon Familiarity', adjustments: {specialQuality: {name: 'Weapon Familiarity', description: 'dwarven weapons are martial'}}}]).done)
      .toContain('Weapon Familiarity');
  });

  it('refuses what the text gives that the adjustments leave out', () => {
    const studied = slayer([{name: 'Studied Target', adjustments: {specialAttack: {name: 'Studied Target', active: false,
      description: '+1 on attack and damage rolls and on Perception and Survival checks against the target',
      adjustments: {'ranged.*.toHitBonus': 1, 'ranged.*.damageBonus': 1, 'skills.perception.value': 1}}}}]);
    expect(studied.problems).toEqual([
      'Studied Target: its text gives the bonus to every attack, but only ranged.*.toHitBonus has it: add melee.*.toHitBonus too',
      'Studied Target: its text gives the bonus to every attack, but only ranged.*.damageBonus has it: add melee.*.damageBonus too',
      'Studied Target: its text gives a bonus on survival, which no path has: add "skills.<skill>.value" for each (every Knowledge: "skills.knowledge.subSkills.*.value", one: "skills.knowledge.subSkills.religion.value")',
    ]);
    const steady = createFeature(service, {list: 'traits', name: 'Slow and Steady', description: 'speed 20 ft., never modified by armor or encumbrance',
      adjustments: '{"speed.land": {"value": 20, "mode": "set"}}', based_on: 'own knowledge'}) as any;
    expect(steady.problems[0]).toContain('speedUnslowedByArmorAndLoad');
  });

  it('makes a combat option feat available instead of writing its numbers', () => {
    const power = (adjustments: object) => createFeature(service, {
      list: 'feats', name: 'Power Attack', adjustments: JSON.stringify(adjustments), based_on: 'own knowledge',
    }) as any;
    expect(power({attackRollBonus: -1}).problems[0]).toContain('"availableCombatOptions.powerAttack": true');
    expect(power({'availableCombatOptions.powerAttack': true}).done).toContain('Power Attack');
  });

  it('takes features written the way the AI writes them: nested groups, the entry next to the adjustments', () => {
    const result = slayer([
      {name: 'Studied Target', description: 'move action', specialAttack: {name: 'Studied Target', active: false,
        adjustments: {'melee.*.toHitBonus': '1+floor({level.slayer}/5)'}}},
      {name: 'Tough', adjustments: {saves: {fort: 1}, '"specialQuality"': {name: 'Tough'}}},
    ]);
    expect(result.done).toContain('Studied Target, Tough');
    expect(service.raw().classLevels[0].features[1].adjustments).toEqual({'saves.fort': 1, specialQuality: {name: 'Tough', adjustments: {}}} as any);
  });

  it('takes a feature the AI marks switched on as its entry, its bonuses plain, and refuses a toggle that would hide it', () => {
    const paths = ['melee.*.toHitBonus', 'melee.*.damageBonus', 'ranged.*.toHitBonus', 'ranged.*.damageBonus', 'skills.bluff.value',
      'skills.knowledge.subSkills.*.value', 'skills.perception.value', 'skills.sense motive.value', 'skills.survival.value'];
    const description = '+2 bonus on Bluff, Knowledge, Perception, Sense Motive and Survival checks and on attack and damage rolls against undead';
    // switched on on the feature itself: it would hide its entry
    const hidden = slayer([{name: 'Favored Enemy', active: true, description,
      adjustments: Object.fromEntries(paths.map(path => [`${path}[vs. undead]`, 2]))}]);
    expect(hidden.problems.join(' ')).toContain('its toggle would hide it');
    // switched on on its entry, as the recipe has it: the variants of its one situation are its plain bonuses
    const result = slayer([{name: 'Favored Enemy', description, adjustments: {specialAttack: {name: 'Favored Enemy', active: false,
      adjustments: Object.fromEntries(paths.map(path => [`${path}[vs. undead]`, 2]))}}}]);
    expect(result.done).toContain('Favored Enemy');
    const entry = (service.raw().classLevels[0].features[0].adjustments as any).specialAttack;
    expect(entry.active).toBeFalse();
    expect(entry.adjustments['melee.*.toHitBonus']).toBe(2);
    expect(Object.keys(entry.adjustments).some(path => path.includes('['))).toBeFalse();
  });

  it('gives rage its rounds a day on its entry and its bonuses their morale type', () => {
    const rage = (extra: object) => ({name: 'Rage', adjustments: {'abilityScores.str': 4, 'abilityScores.con': 4, 'saves.will': 2, ac: -2},
      description: '+4 morale bonus to Strength and Constitution, +2 morale bonus on Will saves, -2 penalty to AC, for 4 + Con modifier rounds per day', ...extra});
    expect(slayer([rage({})]).problems).toEqual([jasmine.stringContaining('Rage: its text gives uses a day')]);
    expect(slayer([rage({charges: 6})]).done).toContain('Rage');
    const entry = (service.raw().classLevels[0].features[0].adjustments as any).specialAttack;
    // 4 + Con modifier for Con 10, whatever the AI said
    expect(entry.charges).toEqual({total: 4, current: 4, label: 'per day', per: 'day'});
    expect(entry.active).toBeFalse();
    expect(entry.adjustments['abilityScores.str']).toEqual({value: 4, type: 'morale'});
    expect(entry.adjustments.ac).toBe(-2);
  });

  it('shows a class feature the player uses on the sheet even with no number, with its uses; spells a day are not uses', () => {
    const channel = {name: 'Channel Energy', description: 'heals 1d6 in a 30-ft. burst, 3 + Cha modifier times per day', description_only: 'healing is rolled at the table'};
    expect(slayer([channel]).problems).toEqual([jasmine.stringContaining('Channel Energy: its text gives uses a day')]);
    const spells = {name: 'Spells', description: 'casts divine spells, spells per day from the table', description_only: 'the rules work out spells'};
    // its uses written among the adjustments of its entry are the entry's
    expect(slayer([{...channel, adjustments: {specialAttack: {name: 'Channel Energy', adjustments: {charges: {total: 4}}}}}, spells]).done).toContain('Channel Energy');
    const [channelled, cast] = service.raw().classLevels[0].features;
    expect((channelled.adjustments as any).specialAttack).toEqual(jasmine.objectContaining({name: 'Channel Energy', charges: jasmine.objectContaining({total: 3})}));
    expect(cast.adjustments).toEqual({});
  });

  it('asks for the speed a description-only feature gives', () => {
    const fast = slayer([{name: 'Fast Movement', description: 'land speed is faster by +10 feet', description_only: 'a speed'}]);
    expect(fast.problems[0]).toContain('"speed.land": 10');
  });

  it('asks for each domain\'s granted power, and for the uses a feat adds to another feature', () => {
    const domain = (name: string) => ({name, description: 'a cleric domain', description_only: 'its powers are their own features'});
    const result = slayer([domain('Domain (Healing)'), domain('Domain (Sun)'),
      {name: 'Rebuke Death', description: 'standard action, heal 1d4 + 1 per two levels, 3 + Wis modifier times per day', charges: 6}]);
    expect(result.problems).toEqual([jasmine.stringContaining('1 of 2 are here')]);
    expect(slayer([domain('Domain (Healing)'), domain('Domain (Sun)'),
      {name: 'Rebuke Death', description: 'standard action, heal 1d4, 3 + Wis modifier times per day', charges: 6},
      {name: 'Sun\'s Blessing', description: 'adds the cleric level to channel damage against undead', description_only: 'judged when channeling'}]).done)
      .toContain('Rebuke Death');
    const extra = createFeature(service, {list: 'feats', name: 'Extra Channel', description: 'channel energy two additional times per day',
      adjustments: '{}', description_only: 'more uses', based_on: 'own knowledge'}) as any;
    expect(extra.problems[0]).toContain('"extraUses.channel energy": 2');
  });

  it('works out uses a day from the sheet\'s ability score, not the AI\'s sum', () => {
    service.update({abilityScores: {...service.raw().abilityScores, wis: 18}});
    const result = slayer([{name: 'Rebuke Death', description: 'standard action, heal 1d4, 3 + her Wisdom modifier times per day', charges: 6}]);
    expect(result.notes).toContain('Rebuke Death: 7 per day (3 + wis modifier), not 6');
    expect((service.raw().classLevels[0].features[0].adjustments as any).specialAttack.charges).toEqual(jasmine.objectContaining({total: 7, current: 7}));
  });

  it('keeps a combat option feat to its option, flattens skills and drops an "untyped" type', () => {
    expect(createFeature(service, {list: 'feats', name: 'Power Attack', based_on: 'own knowledge',
      adjustments: '{"availableCombatOptions.powerAttack": true, "melee.*.damageBonus[melee]": 2}'}).done).toContain('Power Attack');
    expect(service.raw().feats.find(f => f.name === 'Power Attack')!.adjustments).toEqual({'availableCombatOptions.powerAttack': true} as any);
    expect(normalizedFeature({name: 'Intimidating', adjustments: {skills: {intimidate: 2}, ac: {value: -2, type: 'untyped'}}}).adjustments)
      .toEqual({'skills.intimidate.value': 2, ac: -2});
  });

  it('works out rage\'s rounds from the table the AI read, whatever uses it wrote', () => {
    service.update({abilityScores: {...service.raw().abilityScores, con: 15}});
    const result = slayer([{name: 'Rage', description: '+4 Strength, +4 Constitution, +2 Will, -2 AC', charges: 7,
      uses_by_level: {at: {1: 4, 2: 6}, plus: 'con', label: 'rounds'},
      adjustments: {specialAttack: {name: 'Rage', adjustments: {'abilityScores.str': 4}}}}]);
    expect(result.byLevel).toContain('Rage: 6 rounds a day at level 1');
    const rage = service.raw().classLevels[0].features[0] as any;
    expect((rage.charges ?? rage.adjustments.specialAttack.charges).total).toBe(6);
  });
});
