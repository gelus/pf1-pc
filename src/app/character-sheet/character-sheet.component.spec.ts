import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CharacterSheetComponent } from './character-sheet.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';
import { MeleeAttack } from '../utils/attack.class';
import { CLASS_PRESETS, classLevelFromPreset } from '../rules/class-presets';
import { abilityModifier } from '../ability-mod.pipe';

describe('CharacterSheetComponent', () => {
  let component: CharacterSheetComponent;
  let fixture: ComponentFixture<CharacterSheetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharacterSheetComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CharacterSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // the AC stats share a row, in the order of AC - touch - flat-footed
  const showCharacter = (mutate: (char: Character) => void = () => {}): Element => {
    const char = new Character();
    mutate(char);
    TestBed.inject(ApplyCharacterService).initializeCharacter(char);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.defense div');
  };

  const feature = (name: string, adjustments: any): Feature => new Feature({name, active: true, adjustments});

  // the tooltip of a stat shows up while it is hovered
  const tooltipOf = (stat: Element): string[] => {
    stat.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const tooltip = Array.from(stat.querySelectorAll('.tooltip li'), li => text(li));
    stat.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    return tooltip;
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows a bonus to one maneuver (improved grapple) as a variant of CMB and CMD, not in their totals', () => {
    const stat = (name: string): Element => fixture.nativeElement.querySelector(`stat[stat="${name}"]`);
    showCharacter(char => char.feats.push(feature('Improved Grapple', {'cmb[grapple]': 2, 'cmd[grapple]': 2})));
    const [cmb, cmd] = [text(stat('cmb')), text(stat('cmd'))];
    showCharacter();
    expect([text(stat('cmb')), text(stat('cmd'))]).toEqual([cmb, cmd]);
    showCharacter(char => char.feats.push(feature('Improved Grapple', {'cmb[grapple]': 2, 'cmd[grapple]': 2})));
    // the variant shows the total with its bonus: grappling, CMB 0 is 2 and CMD 10 is 12
    for (const [name, total] of [['cmb', Number(cmb) + 2], ['cmd', Number(cmd) + 2]] as const) {
      stat(name).dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      expect(text(stat(name).querySelector('.variant-header')!)).withContext(name).toBe(`grapple ${total}`);
    }
  });

  it('shows the abilities\' own modifiers, and a penalty to ability checks (shaken) on a line of its own', () => {
    const modifiers = (): string[] => Array.from(fixture.nativeElement.querySelectorAll('.ability-modifier'), (e: Element) => text(e));
    const checks = (): Element | null => fixture.nativeElement.querySelector('.ability-checks');
    showCharacter(char => {
      char.abilityScores = {str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 18};
      char.abilityDamage = {str: 2};
    });
    expect(modifiers()).toEqual(['2', '2', '1', '0', '-1', '4']);
    expect(checks()).toBeNull();

    showCharacter(char => {
      char.abilityScores = {str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 18};
      char.conditions.push(feature('Shaken', {abilityCheckBonus: -2, savingThrowBonus: -2}));
    });
    expect(modifiers()).toEqual(['3', '2', '1', '0', '-1', '4']);
    expect(text(checks()!.querySelector('stat')!)).toBe('-2');
    expect(tooltipOf(checks()!.querySelector('stat')!)).toContain('-2 Shaken');
  });

  it('shows how many languages the character knows of those it may know, in red when it knows too many', () => {
    const count = (): Element => fixture.nativeElement.querySelector('.language-count');
    showCharacter(char => {
      char.languages = ['Elven'];
      char.race.features.push(feature('Human', {languages: 'Common'}));
      char.abilityScores.int = 12;
    });
    expect(text(count())).toBe('(2 / 2)');
    expect(count().classList).not.toContain('over');

    showCharacter(char => {
      char.languages = ['Elven', 'Dwarven'];
      char.race.features.push(feature('Human', {languages: 'Common'}));
    });
    expect(text(count())).toBe('(3 / 1)');
    expect(count().classList).toContain('over');
  });

  it('should display touch and flat-footed AC alongside AC', () => {
    const acRow = showCharacter(char => {
      char.abilityScores.dex = 14;
      char.feats.push(
        feature('Chainmail', {ac: {value: 6, type: 'armor'}}),
        feature('Dodge', {ac: {value: 1, type: 'dodge'}}),
      );
    });

    expect(text(acRow)).toBe('AC: 19 Touch: 13 Flat-Footed: 16');

    const [ac, touch, flatFooted] = acRow.querySelectorAll('stat');

    // every AC lists the base it starts from, the dex modifier it uses and the adjustments that reached it
    expect(tooltipOf(ac)).toEqual(['10base', '2 dex', '6 (armor)Chainmail', '1 (dodge)Dodge']);
    // touch AC ignores the armor bonus
    expect(tooltipOf(touch)).toEqual(['10base', '2 dex', '1 (dodge)Dodge']);
    // a flat-footed character keeps neither its dodge bonus nor its dex bonus
    expect(tooltipOf(flatFooted)).toEqual(['10base', '6 (armor)Chainmail']);
  });

  it('should keep a dex penalty in the flat-footed AC', () => {
    const acRow = showCharacter(char => char.abilityScores.dex = 6);

    expect(text(acRow)).toBe('AC: 8 Touch: 8 Flat-Footed: 8');

    const [, , flatFooted] = acRow.querySelectorAll('stat');
    expect(tooltipOf(flatFooted)).toEqual(['10base', '-2 dex']);
  });

  it('should cap the dex bonus of AC and touch AC by the max dex bonus of worn armor', () => {
    const acRow = showCharacter(char => {
      char.abilityScores.dex = 18;
      char.feats.push(feature('Breastplate', {ac: {value: 6, type: 'armor'}, maxDexBonus: 3}));
    });

    expect(text(acRow)).toBe('AC: 19 Touch: 13 Flat-Footed: 16');

    const [, touch] = acRow.querySelectorAll('stat');
    expect(tooltipOf(touch)).toEqual(['10base', '3 (max 3)dex']);
  });

  it('caps the dex bonus at 0 for armor with a max dex bonus of 0', () => {
    const acRow = showCharacter(char => {
      char.abilityScores.dex = 16;
      char.feats.push(feature('Hellknight Plate', {ac: {value: 9, type: 'armor'}, maxDexBonus: {value: 0, mode: 'min'}}));
    });

    expect(text(acRow)).toBe('AC: 19 Touch: 10 Flat-Footed: 19');
    const [, touch] = acRow.querySelectorAll('stat');
    expect(tooltipOf(touch)).toEqual(['10base', '0 (max 0)dex']);
  });

  it('uses the lowest max dex bonus when armor and a shield both cap it', () => {
    const acRow = showCharacter(char => {
      char.abilityScores.dex = 18;
      char.feats.push(
        feature('Breastplate', {ac: {value: 6, type: 'armor'}, maxDexBonus: {value: 3, mode: 'min'}}),
        feature('Tower Shield', {ac: {value: 4, type: 'shield'}, maxDexBonus: {value: 2, mode: 'min'}}),
      );
    });

    expect(text(acRow)).toBe('AC: 22 Touch: 12 Flat-Footed: 20');
  });

  it('does not cap the dex bonus without anything capping it', () => {
    const acRow = showCharacter(char => {
      char.abilityScores.dex = 18;
    });

    expect(text(acRow)).toBe('AC: 14 Touch: 14 Flat-Footed: 10');
    const [ac] = acRow.querySelectorAll('stat');
    expect(tooltipOf(ac)).toEqual(['10base', '4 dex']);
  });

  it('shows how adjustments with a mode combine in the tooltip', () => {
    showCharacter(char => {
      char.race.features.push(feature('racial-stats', {'speed.land': {value: 30, mode: 'set'}}));
      char.feats.push(feature('Fast Movement', {'speed.land': 10}));
      char.conditions.push(feature('Slowed', {'speed.land': {value: 35, mode: 'min'}}));
      char.conditions.push(feature('Hasted', {'speed.land': {value: 20, mode: 'max'}}));
    });

    const speed = fixture.nativeElement.querySelector('.offense div stat');
    expect(text(speed)).toBe('35');
    // race features apply before conditions, and those before feats
    expect(tooltipOf(speed)).toEqual(['=30 racial-stats', '≤35 Slowed', '≥20 Hasted', '10 Fast Movement']);
  });

  it('denies positive dex bonus to AC, Touch AC, and CMD once while keeping dex penalties and showing sources in tooltips', () => {
    const acRow = showCharacter(char => {
      char.abilityScores.dex = 18; // +4 mod
      char.feats.push(feature('Breastplate', { ac: { value: 6, type: 'armor' }, maxDexBonus: 3 }));
      char.conditions.push(
        feature('Blinded', { ac: -2, 'denyDexBonus.ac': true }),
        feature('Stunned', { ac: -2, 'denyDexBonus.ac': true })
      );
    });

    // AC: 10 + 6 (armor) - 2 - 2 = 12 (loses +3 dex bonus once, not twice)
    // Touch: 10 - 2 - 2 = 6
    // Flat-Footed: 10 + 6 - 2 - 2 = 12
    expect(text(acRow)).toBe('AC: 12 Touch: 6 Flat-Footed: 12');

    const [ac, touch] = acRow.querySelectorAll('stat');
    expect(tooltipOf(ac)).toContain('denied dexBlinded');
    expect(tooltipOf(ac)).toContain('denied dexStunned');
    expect(tooltipOf(touch)).toContain('denied dexBlinded');
    expect(tooltipOf(touch)).toContain('denied dexStunned');

    // Dex penalty is still kept when denied dex bonus
    const penaltyRow = showCharacter(char => {
      char.abilityScores.dex = 6; // -2 penalty
      char.conditions.push(feature('Flat-Footed', { 'denyDexBonus.ac': true, 'denyDexBonus.cmd': true }));
    });
    expect(text(penaltyRow)).toBe('AC: 8 Touch: 8 Flat-Footed: 8');
  });

  it('should include the base 10 in CMD', () => {
    showCharacter(char => {
      char.abilityScores.str = 14;
      char.abilityScores.dex = 12;
    });

    const cmd = fixture.nativeElement.querySelector('stat[stat="cmd"]') as HTMLElement;
    // CMD: 10 + 2 (str) + 1 (dex) + 0 (bab) = 13
    expect(text(cmd)).toBe('13');
    expect(tooltipOf(cmd)).toEqual(['10base', '2 str', '1 dex']);
  });

  it('displays Senses perception as a stat with variants, ability check totals, spellFailureChance, and suppressed conditions', () => {
    const char = new Character();
    char.abilityScores.wis = 14; // +2
    char.abilityScores.str = 16; // +3
    char.skills['perception'].ranks = 1;
    char.classLevels.push({
      name: 'Barbarian',
      level: 1,
      hitDice: 12,
      rolledHp: 0,
      classSkills: ['perception'],
      skillRanks: 4,
      startingWealth: 0,
      features: [],
    });
    char.conditions.push(
      feature('Shaken', { attackRollBonus: -2, savingThrowBonus: -2, skillCheckBonus: -2, abilityCheckBonus: -2 }),
      feature('Panicked', {
        savingThrowBonus: -2,
        skillCheckBonus: -2,
        abilityCheckBonus: -2,
        'skills.perception.value[sight]': 'auto-fail',
      }),
      feature('Deafened', { 'spellFailureChance[verbal]': 20 })
    );
    TestBed.inject(ApplyCharacterService).initializeCharacter(char);
    fixture.detectChanges();

    // Senses line uses stat element for perception: 1 rank + 3 classSkill + 2 wis - 2 skillCheckBonus (from Panicked only) = 4
    const bioStats = fixture.nativeElement.querySelectorAll('.bio stat');
    const perceptionStat = bioStats[1] as HTMLElement;
    expect(text(perceptionStat)).toBe('4');
    perceptionStat.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(text(perceptionStat.querySelector('.variant-header')!)).toBe('sight auto-fail');
    perceptionStat.dispatchEvent(new MouseEvent('mouseleave'));

    // the Str modifier stays +3, the -2 of Panicked on ability checks is a line of its own (Shaken is suppressed)
    expect(text(fixture.nativeElement.querySelector('.statistics .ability-modifier'))).toBe('3');
    expect(text(fixture.nativeElement.querySelector('.statistics .ability-checks stat'))).toBe('-2');

    // Spell Failure Chance stat exists with verbal 20 variant
    const sfcStat = fixture.nativeElement.querySelector('stat[stat="spellFailureChance"]') as HTMLElement;
    expect(sfcStat).toBeTruthy();
    expect(text(sfcStat)).toBe('0');
    sfcStat.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(text(sfcStat.querySelector('.variant-header')!)).toBe('verbal 20');

    // Shaken shows as suppressed in the conditions list while Panicked does not
    const conditionSpans = fixture.nativeElement.querySelectorAll('.conditions app-feature-list > span');
    expect(conditionSpans[0].classList.contains('suppressed')).toBeTrue();
    expect(conditionSpans[1].classList.contains('suppressed')).toBeFalse();
  });

  describe('attacks', () => {
    const attackNames = () => Array.from(fixture.nativeElement.querySelectorAll('.offense app-attack .name') as NodeListOf<Element>)
      .map(text);

    it('lists the attacks with the best first attack roll first', () => {
      showCharacter(char => {
        char.abilityScores.str = 14;
        char.bab = 3;
        // the claws come first in the character, but hit worse: secondary next to the axe
        char.melee = [
          Object.assign(new MeleeAttack(), {type: 'natural', name: 'Claw', damage: '1d4', toHitAbility: 'str'}),
          Object.assign(new MeleeAttack(), {name: 'Great Axe', damage: '1d12', toHitAbility: 'str', hand: 'two-handed'}),
          Object.assign(new MeleeAttack(), {name: 'Dagger', damage: '1d4', toHitAbility: 'str', toHitBonus: 1}),
        ];
      });
      expect(attackNames()).toEqual(['Dagger', 'Great Axe', 'Claw']);
      // the character keeps its own order
      expect(TestBed.inject(ApplyCharacterService).applied().melee.map(a => a.name)).toEqual(['Claw', 'Great Axe', 'Dagger']);
    });
  });

  describe('hit points and damage', () => {
    const service = () => TestBed.inject(ApplyCharacterService);
    const enter = (selector: string, value: number) => {
      const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
      input.value = String(value);
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const hitPoints = () => text(fixture.nativeElement.querySelector('.hit-points'));
    // the conditions the rules put the character under, as the conditions section lists them
    const conditionList = () => Array.from(fixture.nativeElement.querySelectorAll('.conditions .rule-condition') as NodeListOf<Element>)
      .map(text).join(' ');
    const fighter = (char: Character) => {
      char.abilityScores.con = 12;
      char.classLevels.push({name: 'Fighter', level: 1, hitDice: 10, rolledHp: 0, classSkills: [], skillRanks: 2,
        startingWealth: 0, features: []});
    };

    it('stores the damage taken when the current hp is entered, and lists the conditions it leads to', async () => {
      showCharacter(fighter);
      await fixture.whenStable();
      expect((fixture.nativeElement.querySelector('.current-hp') as HTMLInputElement).value).toBe('11');

      enter('.current-hp', 4);
      expect(service().raw().damageTaken).toBe(7);
      expect(conditionList()).not.toContain('Disabled');

      enter('.current-hp', 0);
      expect(service().raw().damageTaken).toBe(11);
      expect(conditionList()).toContain('Disabled (from hit points: 0 hp)');
      // they are shown by the hit points too, with what the condition does in a tooltip
      expect(hitPoints()).toContain('Disabled');
      const shown = fixture.nativeElement.querySelector('.hit-points .hp-rule-condition') as HTMLElement;
      expect(shown.getAttribute('title')).toContain('Disabled (from hit points: 0 hp)');
      expect(shown.getAttribute('title')).toContain('disabled');

      enter('.current-hp', -2);
      expect(conditionList()).toContain('Dying');
    });

    it('stabilizes a dying character, and makes it dying again when it takes more damage', async () => {
      showCharacter(fighter);
      await fixture.whenStable();
      enter('.current-hp', -2);
      (fixture.nativeElement.querySelector('.conditions .stabilize') as HTMLElement).click();
      fixture.detectChanges();
      expect(service().raw().stable).toBeTrue();
      expect(conditionList()).toContain('Stable (from hit points');
      expect(conditionList()).not.toContain('Dying');

      enter('.current-hp', -3);
      expect(service().raw().stable).toBeFalse();
      expect(conditionList()).toContain('Dying');
    });

    it('stores nonlethal damage', () => {
      showCharacter(fighter);
      enter('.nonlethal-damage', 11);
      expect(service().raw().nonlethalDamage).toBe(11);
      expect(conditionList()).toContain('Staggered (from nonlethal damage: 11 nonlethal damage = 11 hp)');
    });

    it('stores ability damage and drain apart from the score', () => {
      showCharacter(fighter);
      enter('.ability-damage-str .damage', 4);
      enter('.ability-damage-str .drain', 1);
      expect(service().raw().abilityDamage).toEqual({str: 4});
      expect(service().raw().abilityDrain).toEqual({str: 1});
      expect(service().raw().abilityScores.str).toBe(10);
      // the drain lowers the score, the damage only its modifier
      expect(service().applied().abilityScores.str).toBe(9);
      expect(abilityModifier(service().applied(), 'str')).toBe(-3);
    });

    describe('rest', () => {
      const button = (kind: string) => fixture.nativeElement.querySelector(`.rest .rest-${kind}`) as HTMLButtonElement;
      const click = (selector: string) => {
        (fixture.nativeElement.querySelector(selector) as HTMLElement).click();
        fixture.detectChanges();
      };

      it('rests for a night, without a summary on the sheet', () => {
        showCharacter(char => {
          fighter(char);
          char.damageTaken = 5;
          char.nonlethalDamage = 3;
          char.abilityDamage = {str: 2};
          char.feats = [new Feature({name: 'Rage', adjustments: {}, charges: {current: 0, total: 3, label: 'rounds per day'}})];
        });
        click('.rest .rest-night');
        expect(service().raw().damageTaken).toBe(4);
        expect(service().raw().nonlethalDamage).toBe(0);
        expect(service().raw().abilityDamage).toEqual({str: 1});
        // what the rest did stays on the character for whoever reads it, the sheet shows the result only
        expect(service().lastRest()?.rested).toBeTrue();
        expect(text(fixture.nativeElement.querySelector('.rest'))).not.toContain('hp');
      });

      it('says in a tooltip what each rest does', () => {
        showCharacter(fighter);
        expect(button('night').title).toContain('8 hours of rest. Heals 1 hp per character level, 8 nonlethal damage');
        expect(button('bedRest').title).toContain('24 hours of complete bed rest. Heals 2 hp per character level, 24 nonlethal');
        expect(button('night').title).toContain('Temporary hit points are left as they are');
        expect(button('night').title).not.toContain('Long-term care');
        click('.rest .rest-long-term-care');
        expect(button('night').title).toContain('Long-term care doubles the hit points and ability damage healed.');
      });

      it('doubles the healing with long-term care, for a full day of bed rest', () => {
        showCharacter(char => { fighter(char); char.damageTaken = 10; });
        click('.rest .rest-long-term-care');
        click('.rest .rest-bedRest');
        // 1st level: 4 hp for a day of bed rest with long-term care
        expect(service().raw().damageTaken).toBe(6);
      });

      it('can not rest a dying character, and says why', () => {
        showCharacter(char => { fighter(char); char.damageTaken = 13; });
        expect(button('night').disabled).toBeTrue();
        expect(button('bedRest').disabled).toBeTrue();
        expect(button('night').title).toBe('A dying character can not rest, stabilize it first.');
      });
    });
  });

  describe('proficiencies', () => {
    const proficiencies = (): Element => fixture.nativeElement.querySelector('.statistics .proficiencies');
    const shown = () => Array.from(proficiencies().querySelectorAll('.proficiency'), p => [text(p), p.getAttribute('title')]);

    it('lists the weapon and armor proficiencies with what granted each one', () => {
      showCharacter(char => {
        char.classLevels = [
          classLevelFromPreset(CLASS_PRESETS.find(p => p.name === 'Sorcerer')!, 1, true),
          classLevelFromPreset(CLASS_PRESETS.find(p => p.name === 'Cleric')!, 1, false),
        ];
        char.feats.push(feature('Martial Weapon Proficiency (longsword)', {'proficiencies.weapons': 'Longsword'}));
      });
      expect(text(proficiencies())).toBe('Proficiencies Weapons: simple, longsword; Armor: light, medium, shield');
      expect(shown()).toEqual([
        ['simple', 'from Sorcerer (proficiencies), Cleric (proficiencies)'],
        ['longsword', 'from Martial Weapon Proficiency (longsword)'],
        ['light', 'from Cleric (proficiencies)'],
        ['medium', 'from Cleric (proficiencies)'],
        ['shield', 'from Cleric (proficiencies)'],
      ]);
    });

    it('shows none without any proficiency', () => {
      showCharacter();
      expect(text(proficiencies())).toBe('Proficiencies none');
    });
  });
});

const text = (element: Element): string => element.textContent!.replace(/\s+/g, ' ').trim();
