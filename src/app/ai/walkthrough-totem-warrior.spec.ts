import {TestBed} from '@angular/core/testing';
import {ApplyCharacterService} from '../apply-character.service';
import {Character} from '../utils/character.class';
import {AI_PROVIDER, AiChatService} from './ai-chat.service';
import {AiInput, AiPageRequest, AiPageResult, AiProvider, AiSessionOptions, AiToolCall, AiTurn} from './ai-provider';
import {clearLookups} from './rules-lookup';

// a whole creation and a level up through the chat, as the AI would make them: the app's own tools, gates, steps and
// checks, with the AI's turns scripted and the rules pages read from the texts below (what Archives of Nethys gives,
// read the reader's way). a human totem warrior barbarian, the character of the audited log made right: its +2 asked
// for, its archetype trading nothing, its rage switched on, its name and story asked before it is done
const PAGES: {[url: string]: string} = {
  'RacesDisplay.aspx?ItemName=Human': [
    '* **Ability Score Racial Traits:** +2 to one ability score of the player\'s choice.',
    '* **Size:** Medium. **Speed:** 30 ft.',
    '* **Languages:** Common, bonus languages any but secret ones.',
    '* **Bonus Feat:** one extra feat at 1st level.',
    '* **Skilled:** an additional skill rank at first level and one at each level after.',
    'FACT: racial traits = Ability Score Racial Traits, Bonus Feat, Skilled',
    'FACT: alternate racial traits = none',
  ].join('\n'),
  'ClassDisplay.aspx?ItemName=Barbarian': [
    '* **Fast Movement (Ex):** +10 ft. to land speed while wearing no armor, light or medium armor and not carrying a heavy load.',
    '* **Rage (Ex):** 4 + Con modifier rounds per day at 1st level, 2 more rounds each level after. While raging +4 morale bonus to Str and Con, +2 morale bonus on Will saves, -2 penalty to AC. Free action to start.',
    '* **Rage Powers (Ex):** one at 2nd level and every two levels after.',
    '* **Uncanny Dodge (Ex):** at 2nd level, not caught flat-footed, keeps its Dex bonus to AC.',
    '* **Table:** 1st: BAB +1, Fort +2, Ref +0, Will +0, Fast movement, rage. 2nd: BAB +2, Fort +3, Ref +0, Will +0, Rage power, uncanny dodge.',
    'FACT: hit die = d12',
    'FACT: skill ranks = 4',
    'FACT: starting wealth = 3d6 x 10 gp',
    'FACT: class skills = Acrobatics, Climb, Craft, Handle Animal, Intimidate, Knowledge (nature), Perception, Ride, Survival, Swim',
    'FACT: weapon proficiencies = simple, martial',
    'FACT: armor proficiencies = light, medium, shields (except tower shields)',
    'FACT: alignment = any nonlawful',
    'FACT: requirements = none',
  ].join('\n'),
  'ArchetypeDisplay.aspx?FixedName=Barbarian%20Totem%20Warrior': [
    '* **Totem Warrior (APG):** the barbarian\'s tribe has a totem; the totem rage powers (beast, spirit, superstition, ...) are open to it, and a totem rage power keeps the barbarian from taking those of another totem.',
    '* Complementary rage powers: animal fury, low-light vision, night vision, raging climber, raging leaper, raging swimmer, swift foot.',
    'FACT: replaced features = none',
  ].join('\n'),
  'FeatDisplay.aspx?ItemName=Power%20Attack': [
    '* **Prerequisites:** Str 13, base attack bonus +1.',
    '* **Benefit:** -1 on melee attack rolls and combat maneuver checks for +2 on melee damage (+50% two-handed); grows every 4 points of BAB.',
    'FACT: prerequisites = Str 13, base attack bonus +1',
  ].join('\n'),
  'FeatDisplay.aspx?ItemName=Toughness': [
    '* **Benefit:** +3 hit points, and +1 hit point for every Hit Die beyond 3.',
    'FACT: prerequisites = none',
  ].join('\n'),
  'EquipmentWeaponsDisplay.aspx?ItemName=Greataxe': '* **Greataxe:** martial two-handed melee, 20 gp, 1d12 slashing, x3, 12 lbs.',
  'EquipmentArmorDisplay.aspx?ItemName=Hide': '* **Hide armor:** medium armor, 15 gp, +4 armor bonus, max Dex +4, armor check penalty -3, arcane spell failure 20%, speed 20 ft. (30 ft. base), 25 lbs.',
  'BarbarianRagePowers.aspx': '* **Animal Fury (Ex):** while raging, a bite attack (1d4 for a Medium barbarian) at the full attack bonus -5 as part of a full attack.',
};

class ScriptedAi implements AiProvider {
  name = 'scripted';
  turns: AiTurn[] = [];
  sent: AiInput[] = [];
  reads: string[] = [];
  startSession(_: AiSessionOptions) {
    return {send: async (input: AiInput): Promise<AiTurn> => {
      this.sent.push(input);
      return this.turns.shift() ?? {text: '(the script ran out)', toolCalls: []};
    }};
  }
  async readPages(request: AiPageRequest): Promise<AiPageResult> {
    const url = request.urls.find(u => Object.keys(PAGES).some(key => u.endsWith(key)));
    this.reads.push(request.urls[0]);
    const key = url && Object.keys(PAGES).find(k => url.endsWith(k));
    return key ? {text: `FOUND ${url}\n${PAGES[key]}`, pages: request.urls.map(u => ({url: u, read: true}))}
      : {text: 'NOT FOUND', pages: request.urls.map(u => ({url: u, read: true}))};
  }
}

const call = (name: string, args: object = {}): AiToolCall => ({name, args: args as {[k: string]: unknown}});
const turn = (text: string, ...toolCalls: AiToolCall[]): AiTurn => ({text, toolCalls});
const json = (value: unknown) => JSON.stringify(value);

describe('a creation and a level up through the chat: a human totem warrior barbarian', () => {
  let ai: ScriptedAi;
  let chat: AiChatService;
  let character: ApplyCharacterService;
  // every tool the turn called, with what it gave back
  type Result = {name: string, error?: string, problems?: string[], done?: string, held?: string};
  const results = (from = 0): Result[] => (chat as any).trace.slice(from).filter((e: any) => e.kind === 'tool')
    .map((e: any) => ({name: e.name, error: e.result?.error, problems: e.result?.problems, done: e.result?.done, held: e.heldBy}));
  const say = async (text: string, ...turns: AiTurn[]) => {
    const from = (chat as any).trace.length;
    ai.turns.push(...turns);
    await chat.send(text);
    return results(from);
  };

  beforeEach(() => {
    clearLookups();
    ai = new ScriptedAi();
    TestBed.configureTestingModule({providers: [{provide: AI_PROVIDER, useValue: () => ai}]});
    character = TestBed.inject(ApplyCharacterService);
    character.initializeCharacter(new Character());
    chat = TestBed.inject(AiChatService);
    chat.startCreation();
  });
  afterEach(() => clearLookups());

  it('is made step by step, held to what the player said, and checked before it ends', async () => {
    // the concept, all of it answered at once
    let r = await say('A human barbarian, Totem Warrior archetype, a guardian of the old forest. 20 point buy, no traits, 1st level, average gold.',
      turn('', call('get_creation_step')),
      turn('', call('complete_creation_step', {step: 'concept', decisions: 'human Totem Warrior barbarian, forest guardian; 20-point buy; no traits; 1st level; average gold'})),
      turn('', call('offer_point_buy', {budget: 20, scores: json({str: 17, dex: 14, con: 14, int: 10, wis: 12, cha: 7}), raise: 'str, con', lower: 'cha'})),
      turn('Strength and Constitution first for rage, some Wisdom for Perception and Will. Change it below and confirm.'));
    expect(r.map(x => x.error).filter(Boolean)).toEqual([]);
    const widget = chat.messages().find(m => m.role === 'pointBuy')!;
    expect(widget).toBeTruthy();

    // the player confirms; the AI tries to put the human's +2 itself, and is held to ask
    ai.turns.push(
      // read from their pages (a url skips the app's library, which has the core races and classes: this is the path
      // of a rule the library lacks, library-tools.spec.ts the library's)
      turn('', call('look_up_rules', {kind: 'race', url: 'https://aonprd.com/RacesDisplay.aspx?ItemName=Human'})),
      turn('', call('set_race', {name: 'Human', subtype: 'Humanoid (human)', based_on: 'looked up', source_url: 'https://aonprd.com/RacesDisplay.aspx?ItemName=Human',
        features: json([
          {name: 'Human racial stats', adjustments: {'abilityScores.str': 2, 'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common'}},
          {name: 'Ability Score Racial Traits', description: '+2 to one ability score of the player\'s choice', adjustments: {}},
          {name: 'Bonus Feat', description: 'one extra feat at 1st level', adjustments: {bonusFeats: 1}},
          {name: 'Skilled', description: 'an additional skill rank at each level', adjustments: {bonusSkillRanks: '{level}'}},
        ])})),
      turn('Your scores are set. As a human, which ability gets your +2?'));
    const from = (chat as any).trace.length;
    await chat.confirmPointBuy(widget, widget.pointBuy!.scores, 20);
    r = results(from);
    const race = r.find(x => x.name === 'set_race')!;
    expect(race.error).withContext(JSON.stringify(r)).toContain('which ability gets the race\'s +2');
    expect(character.raw().race.features.length).toBe(0);

    // the +2 where the player put it
    const humanRace = (stat: string) => call('set_race', {name: 'Human', subtype: 'Humanoid (human)', based_on: 'looked up',
      source_url: 'https://aonprd.com/RacesDisplay.aspx?ItemName=Human', player_answer: 'Put the +2 on Strength.',
      features: json([
        {name: 'Human racial stats', adjustments: {[`abilityScores.${stat}`]: 2, 'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common'}},
        {name: 'Ability Score Racial Traits', description: '+2 to Strength (the player\'s choice)', adjustments: {}},
        {name: 'Bonus Feat', description: 'one extra feat at 1st level', adjustments: {bonusFeats: 1}},
        {name: 'Skilled', description: 'an additional skill rank at each level', adjustments: {bonusSkillRanks: '{level}'}},
      ])});
    r = await say('Put the +2 on Strength.', turn('', humanRace('str')),
      turn('Human it is, +2 Strength. Barbarian with the Totem Warrior archetype: +1 hit point or +1 skill rank as your favored class bonus?'));
    expect(r.find(x => x.name === 'set_race')?.error).withContext(JSON.stringify(r)).toBeUndefined();
    expect(character.applied().abilityScores.str).toBe(19);

    // the class, with an archetype that replaces nothing (the audited log's AI was made to invent what it replaced)
    const rage = {name: 'Rage', gained_at: 1,
      description: '4 + Con modifier rounds per day, +2 rounds per level after 1st. While raging +4 morale bonus to Str and Con, +2 morale bonus on Will saves, -2 to AC',
      adjustments: {'abilityScores.str[raging]': {value: 4, type: 'morale'}, 'abilityScores.con[raging]': {value: 4, type: 'morale'},
        'saves.will[raging]': {value: 2, type: 'morale'}, 'ac[raging]': -2},
      uses_by_level: {at: {1: 4, 2: 6, 3: 8, 4: 10, 5: 12}, plus: 'con', per: 'day', label: 'rounds'}, shown_in: 'specialAttack'};
    const fast = {name: 'Fast Movement', gained_at: 1, description: '+10 ft. land speed in no, light or medium armor and no heavy load',
      adjustments: {'speed.land': 10}, shown_in: 'specialQuality'};
    r = await say('+1 hit point',
      turn('', call('look_up_rules', {kind: 'class', url: 'https://aonprd.com/ClassDisplay.aspx?ItemName=Barbarian', focus: 'level 1'}),
        call('look_up_rules', {kind: 'archetype', url: 'https://aonprd.com/ArchetypeDisplay.aspx?FixedName=Barbarian%20Totem%20Warrior'})),
      turn('', call('add_class_level', {class_name: 'Barbarian', favored_class_bonus: 'hp', based_on: 'looked up',
        source_url: 'https://aonprd.com/ClassDisplay.aspx?ItemName=Barbarian',
        archetypes: json([{name: 'Totem Warrior', source_url: 'https://aonprd.com/ArchetypeDisplay.aspx?FixedName=Barbarian%20Totem%20Warrior', replaces: 'none'}]),
        features: json([fast, rage])})),
      turn('Barbarian 1, Totem Warrior. You have skill ranks to spend: Perception, Survival, Climb and Intimidate fit a forest guardian. Where do they go?'));
    const added = r.find(x => x.name === 'add_class_level')!;
    expect(added.error).withContext(JSON.stringify(added.problems)).toBeUndefined();
    const level1 = character.raw().classLevels[0];
    expect(level1.archetypes).toEqual([{name: 'Totem Warrior', replaces: [], sourceUrl: 'https://aonprd.com/ArchetypeDisplay.aspx?FixedName=Barbarian%20Totem%20Warrior'} as any]);
    // rage is the player's to switch on, its bonuses plain on its entry, its rounds counted
    const rageEntry = (level1.features.find(f => f.name === 'Rage')!.adjustments as any).specialAttack;
    expect(rageEntry.active).toBeFalse();
    expect(Object.keys(rageEntry.adjustments)).toEqual(['abilityScores.str', 'abilityScores.con', 'saves.will', 'ac']);
    // d12 + Con 1 (13) + favored class 1
    expect(character.applied().hp).toBe(12 + 1 + 1);

    // skills: 4 + Int 0 + 1 (Skilled)
    r = await say('Perception, Survival, Climb, Intimidate and Handle Animal.',
      turn('', call('get_level_up_status')),
      turn('', call('set_skill_ranks', {ranks: json({perception: 1, survival: 1, climb: 1, intimidate: 1, 'handle animal': 1})})),
      turn('Ranks in. Two feats (1st level and human): Power Attack and Toughness suit a front-liner. Which?'));
    expect(r.find(x => x.name === 'set_skill_ranks')?.error).withContext(JSON.stringify(r)).toBeUndefined();

    // feats
    r = await say('Power Attack and Toughness.',
      turn('', call('look_up_rules', {kind: 'feat', url: 'https://aonprd.com/FeatDisplay.aspx?ItemName=Power%20Attack'}), call('look_up_rules', {kind: 'feat', url: 'https://aonprd.com/FeatDisplay.aspx?ItemName=Toughness'})),
      turn('', call('create_feature', {list: 'feats', name: 'Power Attack', based_on: 'looked up', source_url: 'https://aonprd.com/FeatDisplay.aspx?ItemName=Power%20Attack',
        prerequisites: 'Str 13, base attack bonus +1', description: '-1 melee attack for +2 melee damage (+3 two-handed), grows with BAB',
        adjustments: json({'availableCombatOptions.powerAttack': true})}),
        call('create_feature', {list: 'feats', name: 'Toughness', based_on: 'looked up', source_url: 'https://aonprd.com/FeatDisplay.aspx?ItemName=Toughness',
          description: '+3 hit points, +1 per Hit Die beyond 3', adjustments: json({}), grows: json({hp: Object.fromEntries(Array.from({length: 20}, (_, i) => [i + 1, Math.max(3, i + 1)]))})})),
      turn('Both taken. Starting gold: 105 gp on average. A greataxe, hide armor and an explorer\'s kit?'));
    expect(r.filter(x => x.error || x.problems).map(x => x.problems ?? x.error)).toEqual([]);
    expect(character.applied().hp).toBe(14 + 3);
    expect(character.raw().feats.find(f => f.name === 'Toughness')!.adjustments['hp']).toBe('max(3, {level})');

    // gear, and the AI going quiet with the step open: it is sent back to finish it
    const from2 = (chat as any).trace.length;
    r = await say('Yes, the greataxe, hide armor, a backpack, bedroll, waterskin, trail rations and rope.',
      turn('', call('price_gear', {items: [{name: 'Greataxe', cost_gp: 20}, {name: 'Hide armor', cost_gp: 15}, {name: 'Backpack', cost_gp: 2},
        {name: 'Bedroll', cost_gp: 0.1}, {name: 'Waterskin', cost_gp: 1}, {name: 'Trail rations', cost_gp: 0.5, quantity: 5}, {name: 'Hempen rope (50 ft.)', cost_gp: 1},
        {name: 'Explorer\'s outfit', cost_gp: 0}]}),
        call('look_up_rules', {names: 'Greataxe, Hide', kind: 'weapon'})),
      turn('', call('create_items', {based_on: 'looked up', items: json([
        {name: 'Greataxe', type: 'weapon', cost_gp: 20, weight: 12, damage: '1d12', critical: 'x3', attack_kind: 'melee', handedness: 'two-handed', proficiency: 'martial', weapon_groups: 'axes', equipped: true},
        {name: 'Hide armor', type: 'armor', armor_category: 'medium', cost_gp: 15, weight: 25, equipped: true,
          features: json([{name: 'Hide armor', adjustments: {ac: {value: 4, type: 'armor'}, maxDexBonus: {value: 4, mode: 'min'}, armorCheckPenalty: -3, arcaneSpellFailureChance: 20}}])},
        {name: 'Explorer\'s outfit', type: 'other', slot: 'body', cost_gp: 0, weight: 8, equipped: true},
        {name: 'Backpack', type: 'other', cost_gp: 2, weight: 2}, {name: 'Bedroll', type: 'other', cost_gp: 0.1, weight: 5},
        {name: 'Waterskin', type: 'other', cost_gp: 1, weight: 4}, {name: 'Trail rations', type: 'other', cost_gp: 0.5, weight: 1, quantity: 5},
        {name: 'Hempen rope (50 ft.)', type: 'other', cost_gp: 1, weight: 10}])})),
      turn('Your barbarian is ready!'),
      turn('', call('complete_creation_step', {step: 'equipment', decisions: 'greataxe, hide armor, explorer\'s kit'})),
      turn('The gear is in. Now who are they: a name, age, height and weight, alignment and deity, looks, personality and backstory?'));
    const sentBack = (chat as any).trace.slice(from2).find((e: any) => e.kind === 'note');
    expect(sentBack?.text).toContain('is at "Equipment"');
    expect(r.filter(x => x.error || x.problems).map(x => x.problems ?? x.error)).toEqual([]);
    expect(character.raw().creation?.step).toBe('details');
    // the gold left: 105 - 41.6, put in the purse when the creation ends
    const spent = character.raw().inventory.reduce((gp, item) => gp + (item.cost.gp + item.cost.sp / 10 + item.cost.cp / 100) * (item.quantity ?? 1), 0);
    expect(spent).toBeCloseTo(41.6, 2);

    // the details end the creation once the whole character passes the app's check
    r = await say('Brakka Oakenshield, 24, 6\'2", 220 lbs, chaotic neutral, no god but the forest. Broad, quiet, moss-green war paint. Raised by the Thornback tribe, sworn to the grove her mother died guarding.',
      turn('', call('set_character_details', {name: 'Brakka Oakenshield', age: 24, height: 74, weight: 220, alignment: 'CN', deity: 'none (the old forest)',
        description: 'Broad-shouldered and quiet, moss-green war paint across her face.',
        backstory: 'Raised by the Thornback tribe, sworn to guard the grove her mother died defending.',
        player_answer: 'Brakka Oakenshield, 24, 6\'2", 220 lbs, chaotic neutral'})),
      turn('', call('get_character_summary')),
      turn('Brakka is done: anything to change?'));
    expect(r.filter(x => x.error || x.problems).map(x => x.problems ?? x.error)).toEqual([]);
    expect(character.raw().creation).toBeUndefined();
    const purse = character.raw().wealth;
    expect(purse.gp + purse.sp / 10 + purse.cp / 100).toBeCloseTo(105 - 41.6, 2);

    // the sheet's numbers, as the AI reads them (character-reader.ts, the sheet's totals)
    const summary = await import('./ai-tools').then(m => m.runAiTool('get_character_summary', {}, {character})) as any;
    expect(summary.speed.land).withContext('30 + fast movement 10, slowed by medium armor to 30').toBe(30);
    expect(summary.ac.ac).toBe(10 + 4 + 2);
    expect(summary.saves).toEqual({fort: 2 + 1, ref: 0 + 2, will: 0 + 1});
    expect(summary.bab).toBe(1);
    expect(summary.melee[0]).toEqual(jasmine.objectContaining({name: 'Greataxe', attack: '+5', damage: '1d12+6'}));

    // a level up: 2nd, a rage power (Animal Fury, a totem warrior's complementary one) and uncanny dodge
    character.update({experience: 2000});
    r = await say('Level up! I rolled a 9. Animal Fury for the rage power, the hit point for favored class, ranks in Perception, Survival, Climb, Intimidate and Stealth.',
      turn('', call('get_level_up_step')),
      turn('', call('look_up_rules', {kind: 'rage power', name: 'Animal Fury'})),
      turn('', call('add_class_level', {class_name: 'Barbarian', rolled_hp: 9, favored_class_bonus: 'hp', based_on: 'looked up',
        source_url: 'https://aonprd.com/ClassDisplay.aspx?ItemName=Barbarian', player_answer: 'Animal Fury for the rage power, the hit point for favored class',
        features: json([
          {name: 'Uncanny Dodge', gained_at: 2, description: 'not caught flat-footed, keeps its Dex bonus to AC', adjustments: {defensiveAbilities: {name: 'Uncanny Dodge', description: 'cannot be caught flat-footed'}}, shown_in: 'defensiveAbilities'},
          {name: 'Animal Fury', gained_at: 2, description: 'rage power: while raging, a bite attack (1d4) at the full attack bonus -5 as part of a full attack', shown_in: 'specialAttack',
            adjustments: {specialAttack: {name: 'Animal Fury', description: 'bite 1d4 while raging', active: false}}, descriptionOnly: 'no path: an attack while raging'},
        ])})),
      turn('', call('set_skill_ranks', {ranks: json({perception: 2, survival: 2, climb: 2, intimidate: 2, 'handle animal': 1, stealth: 1})})),
      turn('Barbarian 2: uncanny dodge and Animal Fury. Anything else?'));
    const errors = r.filter(x => x.error || x.problems).map(x => `${x.name}: ${JSON.stringify(x.problems ?? x.error)}`);
    // logged for the report: what the app refused in the level up
    expect(errors).toEqual([]);
    expect(character.raw().levelUp).withContext(JSON.stringify(r) + JSON.stringify((chat as any).trace.slice(-6))).toBeUndefined();
    const two = await import('./ai-tools').then(m => m.runAiTool('get_character_summary', {}, {character})) as any;
    // 14 at 1st, then 9 rolled + Con 1 + favored 1, and Toughness 3
    expect(two.hp.max).toBe(14 + 11 + 3);
    expect(two.bab).toBe(2);
    expect(two.saves.fort).toBe(3 + 1);
    // rage: 6 rounds at 2nd + Con 1
    const rageNow = character.applied().specialAttack.find(f => f.name === 'Rage')!;
    expect(rageNow.charges?.total).toBe(7);
    expect(character.applied().defensiveAbilities.map(f => f.name)).toContain('Uncanny Dodge');
    expect(character.applied().specialAttack.find(f => f.name === 'Animal Fury')?.active).toBeFalse();
    // switching rage on: +4 Str and Con (morale), +2 Will, -2 AC
    character.setFeatureActive(rageNow, true);
    const raging = await import('./ai-tools').then(m => m.runAiTool('get_character_summary', {}, {character})) as any;
    expect(raging.abilities.str.score).toBe(23);
    expect(raging.ac.ac).toBe(16 - 2);
    expect(raging.saves.will).toBe(1 + 2);
    character.setFeatureActive(character.applied().specialAttack.find(f => f.name === 'Rage')!, false);
    // the character, to look at in the app (e2e/walkthrough.spec.ts)
    console.log(`WALKTHROUGH_CHARACTER ${JSON.stringify(character.raw())}`);
  });
});
