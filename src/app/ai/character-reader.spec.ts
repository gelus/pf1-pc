import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {ApplyCharacterService} from '../apply-character.service';
import {CharacterSheetComponent} from '../character-sheet/character-sheet.component';
import {Feature} from '../interfaces/character.interface';
import {statTotal} from '../stat-display/stat-total';
import {Character} from '../utils/character.class';
import {ClassLevel} from '../utils/classlevel.class';
import exampleCharacter from '../example-character.json';
import exampleCleric from '../example-cleric.json';
import {
  activeConditions, characterSummary, explainAttack, explainStat, findFeature, resolveStat, sheetStats,
  StatExplanation,
} from './character-reader';
import {aiTools, referenceTopic, runAiTool} from './ai-tools';

const feature = (name: string, adjustments: any): Feature => new Feature({name, active: true, adjustments});
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
// a saved character the way the sheet loads it: over the defaults of a new character
const load = (value: object): Character => Object.assign(new Character(), copy(value));

// a fighter in chainmail with a high dex, so the max dex bonus caps it, and a few typed bonuses that do not stack
const armoredFighter = (): Character => {
  const char = new Character();
  char.name = 'Valeros';
  char.abilityScores.dex = 18;
  char.abilityScores.str = 16;
  char.classLevels = [new ClassLevel({name: 'Fighter', hitDice: 10}), new ClassLevel({name: 'Fighter', hitDice: 10})];
  char.feats.push(
    feature('Chainmail', {ac: {value: 6, type: 'armor'}, maxDexBonus: {value: 2, mode: 'min'}, armorCheckPenalty: -5}),
    feature('Ring of Protection +1', {ac: {value: 1, type: 'deflection'}}),
    feature('Shield of Faith', {ac: {value: 2, type: 'deflection'}}),
    feature('Iron Will', {'saves.will': 2, 'saves.will[vs. fear]': {value: 2, type: 'morale'}}),
    feature('Skill Focus (Stealth)', {'skills.stealth.value': 3}),
  );
  char.skills['stealth'].ranks = 2;
  return char;
};

describe('character reader', () => {
  let service: ApplyCharacterService;

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideRouter([])]});
    service = TestBed.inject(ApplyCharacterService);
  });

  const show = (char: object): Character => {
    service.initializeCharacter(load(char));
    return service.applied();
  };

  describe('gives the numbers the sheet shows', () => {
    const characters: [string, () => object][] = [
      ['the example barbarian', () => exampleCharacter],
      ['the example cleric', () => exampleCleric],
      ['a fighter in chainmail', armoredFighter],
      ['a flat-footed character with a dex penalty', () => {
        const char = armoredFighter();
        char.abilityScores.dex = 7;
        char.feats.push(feature('Flat-Footed', {'denyDexBonus.ac': true}));
        return char;
      }],
    ];
    for (const [description, make] of characters) {
      it(`for ${description}`, () => {
        const fixture = TestBed.createComponent(CharacterSheetComponent);
        service.initializeCharacter(load(make()));
        fixture.detectChanges();
        const char = service.applied();
        let compared = 0;
        for (const [name, {spec}] of Object.entries(sheetStats)) {
          const shown = fixture.nativeElement.querySelector(`stat[stat="${name}"]`) as HTMLElement | null;
          if (!shown) continue;
          compared++;
          expect(Number(shown.textContent!.trim())).withContext(name).toBe(statTotal(char, spec(char)));
        }
        const perception = fixture.nativeElement.querySelector('stat[stat="skills.perception.value"]') as HTMLElement;
        expect(Number(perception.textContent!.trim())).toBe(statTotal(char, resolveStat(char, 'perception')!.spec));
        expect(compared).toBeGreaterThanOrEqual(18);
      });
    }
  });

  describe('explains a stat', () => {
    it('line by line, with the bonuses that do not count and the base value', () => {
      show(armoredFighter());
      const ac = explainStat(service, 'AC') as StatExplanation;
      expect(ac.stat).toBe('ac');
      expect(ac.total).toBe(10 + 6 + 2 + 2);
      expect(ac.lines).toContain({value: 2, source: 'dex modifier (capped at 2 by the max Dex bonus)'});
      expect(ac.lines).toContain({value: 6, source: 'Chainmail', type: 'armor'});
      expect(ac.lines).toContain({value: 2, source: 'Shield of Faith', type: 'deflection'});
      expect(ac.lines).toContain({value: 1, source: 'Ring of Protection +1', type: 'deflection', notApplied: 'a larger bonus of the same type applies instead'});
      expect(ac.note).toBe('+10 is the character\'s own value, not from any feature (the base 10)');
    });

    it('with the situational bonuses and what every save takes', () => {
      show(armoredFighter());
      const will = explainStat(service, 'will') as StatExplanation;
      expect(will.stat).toBe('saves.will');
      expect(will.lines).toContain({value: 2, source: 'Iron Will'});
      expect(will.situational.map(s => [s.name, s.total])).toEqual([['vs. fear', (will.total as number) + 2]]);
    });

    it('of a skill, with its ranks, ability and the armor check penalty', () => {
      show(armoredFighter());
      const stealth = explainStat(service, 'Stealth') as StatExplanation;
      expect(stealth.stat).toBe('skills.stealth.value');
      expect(stealth.total).toBe(2 + 3 + 4 - 5);
      expect(stealth.lines).toContain({value: 2, source: 'ranks'});
      expect(stealth.lines).toContain({value: 4, source: 'dex modifier'});
      expect(stealth.lines).toContain({value: -5, source: 'armor check penalty from Chainmail'});
    });

    it('with a denied dex bonus', () => {
      const char = armoredFighter();
      char.feats.push(feature('Flat-Footed', {'denyDexBonus.ac': true}));
      show(char);
      const ac = explainStat(service, 'ac') as StatExplanation;
      expect(ac.total).toBe(10 + 6 + 2);
      expect(ac.lines).toContain(jasmine.objectContaining({source: jasmine.stringMatching(/^dex modifier/), notApplied: 'the dex bonus is denied'}));
    });

    it('finds stats by the names a player uses', () => {
      const char = show(exampleCharacter);
      expect(resolveStat(char, 'Fortitude')!.stat).toBe('saves.fort');
      expect(resolveStat(char, 'flat-footed')!.stat).toBe('flatFootedAc');
      expect(resolveStat(char, 'Strength')!.stat).toBe('abilityScores.str');
      expect(resolveStat(char, 'Sense Motive')!.stat).toBe('skills.sense motive.value');
      expect(resolveStat(char, 'Knowledge (Arcana)')!.stat).toBe('skills.knowledge.subSkills.arcana.value');
      expect(resolveStat(char, 'skills.knowledge.subSkills.arcana.value')!.stat).toBe('skills.knowledge.subSkills.arcana.value');
      expect(resolveStat(char, 'skills.stealth.value')!.stat).toBe('skills.stealth.value');
      expect(resolveStat(char, 'luck')).toBeUndefined();
      expect((explainStat(service, 'luck') as {error: string}).error).toContain('there is no stat "luck"');
    });
  });

  it('sums the sheet up with the numbers it shows', () => {
    const char = show(armoredFighter());
    const summary = characterSummary(service) as any;
    expect(summary.name).toBe('Valeros');
    expect(summary.level).toBe(2);
    expect(summary.classes).toEqual({Fighter: 2});
    expect(summary.ac).toEqual({ac: 20, touch: 14, flatFooted: 18});
    expect(summary.abilities.dex).toEqual({score: 18, modifier: 4});
    expect(summary.saves.will).toBe(statTotal(char, sheetStats['saves.will'].spec(char)));
    expect(summary.skills['stealth']).toBe(4);
    expect(summary.features).toContain('Chainmail (feats)');
    expect(summary.maxDexBonus).toBe(2);
  });

  it('explains an attack part by part', () => {
    show(exampleCharacter);
    const [axe] = (explainAttack(service, 'great axe') as any[]);
    expect(axe.name).toBe('Great Axe');
    expect(axe.kind).toBe('melee');
    expect(axe.toHit.length).toBeGreaterThan(0);
    expect(axe.damage).toMatch(/^\dd\d+/);
    expect((explainAttack(service, 'bow') as any).error).toContain('there is no attack "bow"');
  });

  it('finds a feature with what it adjusts and where it comes from', () => {
    show(exampleCharacter);
    const [intimidating] = findFeature(service, 'intimidating') as any[];
    expect(intimidating.where).toBe('race (Half-Orc)');
    expect(intimidating.adjustments).toEqual({'skills.intimidate.value': 2});
    expect((findFeature(service, 'Wings') as any).error).toContain('no active feature "Wings"');
  });

  it('lists the conditions the character is under, those of the rules included', () => {
    const char = armoredFighter();
    char.conditions.push(feature('Shaken', {}), new Feature({name: 'Sickened', active: false, adjustments: {}}));
    char.damageTaken = 1000;
    show(char);
    const names = activeConditions(service).map(c => c.name);
    expect(names).toContain('Shaken');
    expect(names).not.toContain('Sickened');
    expect(activeConditions(service).find(c => c.name === 'Dead')?.source).toBe('from hit points');
  });

  describe('tools', () => {
    it('are declared for the AI with their parameters', () => {
      for (const tool of aiTools) {
        expect(tool.name).toMatch(/^[a-z_]{1,64}$/);
        expect(tool.description.length).toBeGreaterThan(40);
        for (const required of tool.parameters?.required || []) {
          expect(tool.parameters!.properties![required]).withContext(`${tool.name}.${required}`).toBeDefined();
        }
      }
    });

    it('give the adjustment reference by topic, the rules part when none is asked', async () => {
      const rules = (referenceTopic('rules') as any).reference as string;
      const all = (referenceTopic('all') as any).reference as string;
      expect(rules).toContain('### Variants');
      expect(rules).not.toContain('## What can be adjusted');
      expect((referenceTopic('paths') as any).reference).toContain('## What can be adjusted');
      expect(rules.length).toBeLessThan(all.length / 3);
      expect(((await runAiTool('get_adjustment_reference', {}, {character: service})) as any).otherTopics).toEqual(['paths', 'examples', 'all']);
      expect((referenceTopic('everything') as any).error).toContain('topic is one of');
    });

    it('run against the character and always give an object back', async () => {
      show(exampleCharacter);
      const context = {character: service};
      expect((await runAiTool('explain_stat', {stat: 'ac'}, context) as StatExplanation).stat).toBe('ac');
      expect(Array.isArray((await runAiTool('get_feature', {name: 'Rage'}, context) as any).results)).toBeTrue();
      expect((await runAiTool('roll_dice', {}, context) as any).error).toContain('there is no tool roll_dice');
      expect((await runAiTool('explain_stat', {}, context) as any).error).toContain('there is no stat ""');
      expect(JSON.stringify(await runAiTool('get_character_summary', {}, context)).length).toBeLessThan(20000);
    });
  });
});
