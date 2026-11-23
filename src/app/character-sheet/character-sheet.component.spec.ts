import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CharacterSheetComponent } from './character-sheet.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';
import { MeleeAttack } from '../utils/attack.class';
import { CLASS_PRESETS, classLevelFromPreset } from '../rules/class-presets';
import { abilityModifier } from '../ability-mod.pipe';
import { ChatRequestsService } from '../ai-chat/chat-requests.service';
import { hpBarParts, hpSummaryOf } from '../hit-points/hit-points';

// the description tooltip an element shows while hovered (pfTip): its label and text, then it is put away
const tipOf = (element: Element): string => {
  element.dispatchEvent(new MouseEvent('mouseenter'));
  const tip = document.querySelector('.tooltip.pf-tip');
  const text = tip ? [...tip.children].map(c => c.textContent!.trim()).join(': ') : '';
  element.dispatchEvent(new MouseEvent('mouseleave'));
  return text;
};

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

  // leveling up goes through the AI: the link asks the chat for the next level
  it('asks the AI to level the character up from the level up link', () => {
    showCharacter(char => {
      char.classLevels = [classLevelFromPreset(CLASS_PRESETS.find(p => p.name === 'Fighter')!, 1, true)];
      char.experience = 2000;
    });
    const link: HTMLElement = fixture.nativeElement.querySelector('.level-up');
    expect(link.textContent).toContain('Level up available');
    link.click();
    expect(TestBed.inject(ChatRequestsService).asked()?.question).toBe('Level my character up to level 2.');
  });

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

  it('turns feats on and off and spends their uses, and removes only the character\'s own', async () => {
    const service = TestBed.inject(ApplyCharacterService);
    const feats = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('.featureList .feat'));
    showCharacter(char => {
      char.feats.push(new Feature({name: 'Power Attack', active: true, adjustments: {'availableCombatOptions.powerAttack': true}}));
      char.feats.push(new Feature({name: 'Stunning Fist', adjustments: {}, charges: {current: 2, total: 2, label: 'per day'}}));
      char.race.features.push(feature('Bonus Feat', {feats: new Feature({name: 'Toughness', active: true, adjustments: {hp: 3}})}));
    });
    expect(feats().map(f => text(f.querySelector('span')!))).toEqual(['Power Attack', 'Stunning Fist', 'Toughness']);
    expect(feats().map(f => !!f.querySelector('.remove-feat'))).toEqual([true, true, false]);
    expect(feats().map(f => !!f.querySelector('.feat-active'))).toEqual([true, false, true]);

    // ngModel puts the checked state on the box once the page is stable
    const toggle = async (feat: HTMLElement) => {
      await fixture.whenStable();
      const box = feat.querySelector('.feat-active') as HTMLInputElement;
      expect(box.checked).toBeTrue();
      box.click();
      fixture.detectChanges();
    };
    await toggle(feats()[0]);
    expect(service.raw().feats[0].active).toBeFalse();
    const hp = service.applied().hp;
    await toggle(feats()[2]);
    expect(service.applied().hp).toBe(hp - 3);

    (feats()[1].querySelector('.use-feat') as HTMLElement).click();
    fixture.detectChanges();
    expect(service.raw().feats[1].charges!.current).toBe(1);
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

    // Senses line (under the name) uses stat element for perception: 1 rank + 3 classSkill + 2 wis - 2 skillCheckBonus (from Panicked only) = 4
    const perceptionStat = fixture.nativeElement.querySelector('.sheet-senses stat') as HTMLElement;
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
    // the hit points are set in their dialog, opened from the hp button
    const enter = (selector: string, value: number) => {
      if (!fixture.nativeElement.querySelector('.hp-dialog')) {
        (fixture.nativeElement.querySelector('.hp-button') as HTMLElement).click();
        fixture.detectChanges();
      }
      const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
      input.value = String(value);
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
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
      expect(text(fixture.nativeElement.querySelector('.hp-button__current'))).toBe('11');

      enter('.hp-current-input', 4);
      expect(service().raw().damageTaken).toBe(7);
      expect(conditionList()).not.toContain('Disabled');

      enter('.hp-current-input', 0);
      expect(service().raw().damageTaken).toBe(11);
      expect(conditionList()).toContain('Disabled (from hit points: 0 hp)');

      enter('.hp-current-input', -2);
      expect(conditionList()).toContain('Dying');
    });

    it('stabilizes a dying character, and makes it dying again when it takes more damage', async () => {
      showCharacter(fighter);
      await fixture.whenStable();
      enter('.hp-current-input', -2);
      (fixture.nativeElement.querySelector('.conditions .stabilize') as HTMLElement).click();
      fixture.detectChanges();
      expect(service().raw().stable).toBeTrue();
      expect(conditionList()).toContain('Stable (from hit points');
      expect(conditionList()).not.toContain('Dying');

      enter('.hp-current-input', -3);
      expect(service().raw().stable).toBeFalse();
      expect(conditionList()).toContain('Dying');
    });

    it('stores nonlethal damage', () => {
      showCharacter(fighter);
      enter('.hp-nonlethal-input', 11);
      expect(service().raw().nonlethalDamage).toBe(11);
      expect(conditionList()).toContain('Staggered (from nonlethal damage: 11 nonlethal damage = 11 hp)');
    });

    it('stores ability damage and drain apart from the score', () => {
      showCharacter(fighter);
      // they are set in the ability's dialog, opened from its name, which turns red once the ability took any
      const strName = () => fixture.nativeElement.querySelectorAll('.ability-name')[0] as HTMLElement;
      expect(strName().classList).not.toContain('damaged');
      strName().click();
      fixture.detectChanges();
      enter('.ability-damage-str .damage', 4);
      enter('.ability-damage-str .drain', 1);
      expect(service().raw().abilityDamage).toEqual({str: 4});
      expect(service().raw().abilityDrain).toEqual({str: 1});
      expect(service().raw().abilityScores.str).toBe(10);
      // the drain lowers the score, the damage only its modifier
      expect(service().applied().abilityScores.str).toBe(9);
      expect(abilityModifier(service().applied(), 'str')).toBe(-3);
      expect(strName().classList).toContain('damaged');
      expect(strName().title).toBe('Strength: 4 damage, 1 drain');
    });

    describe('rest', () => {
      // the rests are in a dialog, opened from the Rest button under the name
      const open = () => {
        if (fixture.nativeElement.querySelector('.rest')) return;
        (fixture.nativeElement.querySelector('.rest-open') as HTMLElement).click();
        fixture.detectChanges();
      };
      const button = (kind: string) => {
        open();
        return fixture.nativeElement.querySelector(`.rest .rest-${kind}`) as HTMLButtonElement;
      };
      const click = (selector: string) => {
        open();
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
        // what the rest did stays on the character for whoever reads it, the sheet shows the result: the dialog closes
        expect(service().lastRest()?.rested).toBeTrue();
        expect(fixture.nativeElement.querySelector('.rest-dialog')).toBeNull();
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

  describe('health bar', () => {
    const bar = (hp: number, currentHp: number, tempHp: number, nonlethalDamage: number) =>
      hpBarParts({nonlethalDamage} as any, {hp, currentHp, tempHp} as any);

    it('shows the current hp out of the max, the temporary hp over them from the left', () => {
      expect(bar(20, 15, 5, 0)).toEqual({current: 75, temp: 25, nonlethalFrom: 75, nonlethal: 0});
    });

    it('lays the nonlethal damage over the end of the current hp, never past them', () => {
      expect(bar(20, 15, 0, 5)).toEqual({current: 75, temp: 0, nonlethalFrom: 50, nonlethal: 25});
      expect(bar(20, 4, 0, 10)).toEqual({current: 20, temp: 0, nonlethalFrom: 0, nonlethal: 20});
    });

    it('keeps every part inside the bar', () => {
      expect(bar(10, -3, 30, 0)).toEqual({current: 0, temp: 100, nonlethalFrom: 0, nonlethal: 0});
    });

    it('sums them up for its title', () => {
      expect(hpSummaryOf({nonlethalDamage: 3} as any, {hp: 17, currentHp: 11, tempHp: 5} as any))
        .toBe('11 of 17 hp, 5 temporary, 3 nonlethal');
    });
  });

  describe('bio', () => {
    it('shows and edits who the character is: age, height, weight, deity, description and backstory', async () => {
      showCharacter(char => Object.assign(char, {age: 22, height: 74, weight: 240, deity: 'Gorum', description: 'Scarred and quiet.', backstory: 'Raised by wolves.'}));
      fixture.componentInstance.tab.set('bio');
      fixture.detectChanges();
      await fixture.whenStable();
      const el = (selector: string) => fixture.nativeElement.querySelector(selector);
      expect([el('.age-input').value, el('.height-input').value, el('.weight-input').value, el('.deity-input').value]).toEqual(['22', '74', '240', 'Gorum']);
      expect(el('.height-feet').textContent.trim()).toBe('6 ft. 2 in.');
      expect([el('.description-input').value, el('.backstory-input').value]).toEqual(['Scarred and quiet.', 'Raised by wolves.']);
      el('.backstory-input').value = 'Raised by wolves, then by monks.';
      el('.backstory-input').dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(TestBed.inject(ApplyCharacterService).raw().backstory).toBe('Raised by wolves, then by monks.');
    });
  });

  describe('race and alignment', () => {
    const el = (selector: string): HTMLElement => fixture.nativeElement.querySelector(selector);

    // the dialogs load when first opened (@defer)
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('opens the race editor from the race, as a button', async () => {
      showCharacter(char => char.race.name = 'Dwarf');
      const race = el('.sheet-subtitle button.race');
      expect(race.textContent!.trim()).toBe('Dwarf');
      expect(race.getAttribute('aria-label')).toContain('Dwarf');
      expect(el('app-race-modal')).toBeNull();
      race.click();
      await settle();
      expect(el('app-race-modal .race-name')).toBeTruthy();
      el('app-race-modal .race-cancel').click();
      fixture.detectChanges();
      expect(el('app-race-modal')).toBeNull();
    });

    it('describes the alignment in its tooltip, and opens the chart that changes it', async () => {
      showCharacter(char => char.alignment = 'LG');
      const alignment = el('.sheet-subtitle button.alignment');
      expect(alignment.textContent!.trim()).toBe('LG');
      expect(tipOf(alignment)).toMatch(/^Lawful Good: /);
      expect(alignment.getAttribute('aria-label')).toContain('Lawful Good');
      alignment.click();
      await settle();
      expect(el('app-alignment-modal .alignment-cell[aria-pressed="true"]').getAttribute('aria-label')).toBe('Lawful Good');
      (Array.from(fixture.nativeElement.querySelectorAll('app-alignment-modal .alignment-cell')) as HTMLElement[])
        .find(c => c.getAttribute('aria-label') === 'Chaotic Evil')!.click();
      fixture.detectChanges();
      expect(el('app-alignment-modal')).toBeNull();
      expect(TestBed.inject(ApplyCharacterService).raw().alignment).toBe('CE');
      expect(el('.sheet-subtitle button.alignment').textContent!.trim()).toBe('CE');
      expect(tipOf(el('.sheet-subtitle button.alignment'))).toMatch(/^Chaotic Evil: /);
    });
  });
});

const text = (element: Element): string => element.textContent!.replace(/\s+/g, ' ').trim();
