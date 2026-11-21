import {TestBed} from '@angular/core/testing';
import {ApplyCharacterService} from '../apply-character.service';
import {Character} from '../utils/character.class';
import {allowsAlignment, checkCreatedCharacter, checkCreationStep, stepRequirements} from './character-check';
import {finishCharacter} from './finished-character.spec-helper';

// a slayer the AI created (a player's, trimmed): no speed, no proficiencies, blank racial traits, scale mail as light
// armor that never slowed it
const KUROK = {"id":"6bcfaf9e-ee9a-4993-b4a9-56ac4ccf6bb5","init":0,"classLevels":[{"name":"Slayer","features":[{"id":"63c40a2b-3a1b-4422-bebe-049e68a76f7a","name":"Studied Target","description":"Source: https://aonprd.com/ClassDisplay.aspx?ItemName=Slayer","adjustments":{"specialAttack":{"active":false,"adjustments":{"melee.*.damageBonus":1,"melee.*.toHitBonus":1,"ranged.*.damageBonus":1,"ranged.*.toHitBonus":1},"description":"Study target as a move action (+1 attack/damage).","name":"Studied Target"}}},{"id":"4ec216d8-1f62-457a-897f-a7559243b461","name":"Sneak Attack","description":"Source: https://aonprd.com/ClassDisplay.aspx?ItemName=Slayer","adjustments":{"specialQuality":{"descriptionOnly":"+1d6 sneak attack damage against flat-footed or flanked foes.","name":"Sneak Attack","adjustments":{}}}},{"id":"c6b931a5-8556-4eb4-90f9-2608331ecb6e","name":"Track","description":"Source: https://aonprd.com/ClassDisplay.aspx?ItemName=Slayer","adjustments":{"specialQuality":{"adjustments":{"skills.survival.value[follow tracks]":"floor({level.slayer}/2)"},"description":"+1/2 level to Survival checks to follow tracks.","name":"Track"}}}],"hitDice":10,"rolledHp":0,"classSkills":["acrobatics","bluff","climb","craft","disguise","heal","intimidate","knowledge (dungeoneering)","knowledge (geography)","knowledge (local)","perception","profession","ride","sense motive","stealth","survival","swim"],"skillRanks":6,"startingWealth":175,"level":1,"babProgression":"full","goodSaves":["fort","ref"],"favoredClassBonus":"hp"}],"name":"Kurok","race":{"name":"Half-Orc","subtype":"Humanoid (human, orc)","features":[{"id":"4fb5","name":"Ability Score Increase","description":"","adjustments":{"abilityScores.str":2}},{"id":"fceec1d1","name":"Darkvision","description":"","adjustments":{"senses":"darkvision 60 ft."}},{"id":"0c68","name":"Intimidating","description":"","adjustments":{"skills.intimidate.value":{"value":2,"type":"racial"}}},{"id":"4c68","name":"Orc Blood","description":"","adjustments":{}},{"id":"da3d","name":"Orc Ferocity","description":"","adjustments":{}}]},"alignment":"CN","size":4,"speed":{"land":0,"swim":0,"fly":0},"abilityScores":{"str":18,"dex":15,"con":12,"int":7,"wis":12,"cha":7},"feats":[{"id":"f80f","name":"Power Attack","description":"","adjustments":{"availableCombatOptions.powerAttack":true},"active":true}],"conditions":[],"skills":{"climb":{"name":"climb","ranks":1,"value":0,"classSkill":false,"baseAbility":"str"},"intimidate":{"name":"intimidate","ranks":1,"value":0,"classSkill":false,"baseAbility":"cha"},"stealth":{"name":"stealth","ranks":1,"value":0,"classSkill":false,"baseAbility":"dex"},"survival":{"name":"survival","ranks":1,"value":0,"classSkill":false,"baseAbility":"wis"}},"languages":["common"],"inventory":[{"id":"96e7","name":"Scale Mail","type":"armor","cost":{"pp":0,"gp":50,"sp":0,"cp":0},"description":"","features":[{"id":"506a","name":"Scale Mail","description":"","adjustments":{"ac":{"type":"armor","value":5},"armorCheckPenalty":-4,"maxDexBonus":{"mode":"min","value":3}}}],"weight":30,"quantity":1,"equipped":true,"carried":true,"slot":"armor","proficiency":"","size":"Medium","speed":[],"armorCategory":"light"},{"id":"c9d1","name":"Greatsword","type":"weapon","cost":{"pp":0,"gp":50,"sp":0,"cp":0},"description":"","features":[{"id":"f7fa","name":"Greatswordya","description":"","adjustments":{"melee":[{"type":"iterative","name":"Greatswordya","damage":"2d6","toHitAbility":"str","toHitBonus":0,"damageAbility":"str","damageBonus":0,"crit":19,"critMultiplier":2,"range":0,"damageType":["S"],"hand":"primary","light":false,"secondary":false,"count":1,"usesHands":false,"masterwork":false,"enhancement":0,"thrown":false,"bow":"","compositeRating":0,"ammunitionId":"","touch":false}]}}],"weight":8,"quantity":1,"equipped":true,"carried":true,"slot":"held","proficiency":"martial","size":"Medium","category":"","special":[],"hands":2},{"id":"9361","name":"Shortbow","type":"weapon","cost":{"pp":0,"gp":30,"sp":0,"cp":0},"description":"","features":[{"id":"9361f","name":"Shortbow","description":"","adjustments":{"ranged":[{"type":"iterative","name":"Shortbow","damage":"1d6","toHitAbility":"dex","toHitBonus":0,"damageAbility":"","damageBonus":0,"crit":20,"critMultiplier":3,"range":60,"damageType":["P"],"hand":"primary","light":false,"secondary":false,"count":1,"usesHands":false,"masterwork":false,"enhancement":0,"thrown":false,"bow":"bow","compositeRating":0,"ammunitionId":"","touch":false}]}}],"weight":2,"quantity":1,"equipped":false,"carried":true,"slot":"held","proficiency":"martial","size":"Medium","category":"","special":[],"hands":2}],"wealth":{"pp":0,"gp":0,"sp":0,"cp":0},"experience":0,"advancementTrack":"medium","favoredClasses":["Slayer"],"deity":"Gorum","traits":[{"id":"724c","name":"Reactionary","description":"","adjustments":{"init":{"value":2,"type":"trait"}}},{"id":"12b6","name":"Armor Expert","description":"","adjustments":{"armorCheckPenalty":1}}]};

describe('the check of a created character', () => {
  let service: ApplyCharacterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(new Character());
  });

  it('passes a character with everything set', () => {
    finishCharacter(service);
    expect(checkCreatedCharacter(service)).toEqual({errors: [], warnings: []});
  });

  it('lists everything a blank character is missing', () => {
    const {errors} = checkCreatedCharacter(service);
    expect(errors).toEqual(jasmine.arrayContaining([
      'the character has no name (set_character_details name)', 'the ability scores are not set',
      'the character has no class level', 'the character has no gear',
    ]));
  });

  it('finds what the AI left wrong in a slayer', () => {
    service.initializeCharacter(JSON.parse(JSON.stringify(KUROK)));
    const {errors, warnings} = checkCreatedCharacter(service);
    expect(errors).toEqual([
      'the race gives no land speed (its racial stats need "speed.land": {"value": 30, "mode": "set"})',
      'Orc Blood, Orc Ferocity: a racial trait with no adjustments and no description of its rules',
      'Slayer gives no weapon proficiencies (every class has some: its page\'s "Weapon and Armor Proficiency")',
    ]);
    // by step, as each step's completion checks it
    expect(checkCreationStep(service, 'race').errors.length).toBe(2);
    expect(checkCreationStep(service, 'skills').errors).toEqual([]);
    expect(warnings).toEqual(jasmine.arrayContaining([
      'the character is not proficient with Greatsword (-4 to hit)',
      'Shortbow shoots ammunition the kit has none of', 'the kit has no outfit (the first is free: an explorer\'s outfit)',
    ]));
  });

  it('holds a point buy to its points, a paladin to lawful good, and ranks to one per level', () => {
    finishCharacter(service);
    service.update({creation: {step: 'details', decisions: {'ability-scores': 'ability scores str 16 (15-point buy)'}}, alignment: 'CN'});
    Object.assign(service.raw().classLevels[0], {name: 'Paladin', alignment: 'lawful good'});
    service.raw().skills.climb.ranks = 2;
    service.update();
    const {errors} = checkCreatedCharacter(service);
    expect(errors).toEqual(jasmine.arrayContaining([
      jasmine.stringContaining('more than the 15-point buy'), 'a paladin is lawful good, not CN', 'at most 1 rank per skill: climb',
    ]));
  });

  it('tells each step what it requires, from the same checks', () => {
    expect(stepRequirements('race')).toContain('its base land speed and size, "mode": "set"');
    expect(stepRequirements('class')).toContain('its weapon and armor proficiencies');
    expect(stepRequirements('concept')).toEqual([]);
  });

  it('reads a class\'s alignment the way class pages write it', () => {
    expect(['LG', 'LN', 'CG'].map(a => allowsAlignment('any lawful', a))).toEqual([true, true, false]);
    expect(['LN', 'CN', 'N', 'NG', 'CG'].map(a => allowsAlignment('any nonlawful', a))).toEqual([false, true, true, true, true]);
    expect(['LN', 'NG', 'CG'].map(a => allowsAlignment('any neutral', a))).toEqual([true, true, false]);
    expect(['LG', 'LN', 'NG'].map(a => allowsAlignment('lawful good or lawful neutral', a))).toEqual([true, true, false]);
    // a rule it can not read allows any
    expect(allowsAlignment('within one step of its deity', 'CE')).toBeTrue();
  });
});
