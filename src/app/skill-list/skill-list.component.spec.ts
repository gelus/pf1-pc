import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SkillListComponent } from './skill-list.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';
import exampleCharacter from '../example-character.json';

describe('SkillListComponent', () => {
  let component: SkillListComponent;
  let fixture: ComponentFixture<SkillListComponent>;
  let charService: ApplyCharacterService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkillListComponent]
    })
    .compileComponents();

    charService = TestBed.inject(ApplyCharacterService);
    fixture = TestBed.createComponent(SkillListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders skill families without inputs/totals, indents specialties, applies ACP and skillCheckBonus once, and stores specialty ranks on raw', () => {
    const char = Object.assign(new Character(), JSON.parse(JSON.stringify(exampleCharacter))) as Character;
    char.conditions.push(
      new Feature({
        name: 'Shaken',
        active: true,
        adjustments: { skillCheckBonus: -2 },
      })
    );
    char.feats.push(
      new Feature({
        name: 'Pottery Feat',
        active: true,
        adjustments: { 'skills.craft.subSkills.pottery.value': 0 },
      })
    );
    charService.initializeCharacter(char);
    fixture.detectChanges();

    // Families have no rank input and no stat element
    const familyRows = fixture.nativeElement.querySelectorAll('.skill-family') as NodeListOf<HTMLElement>;
    expect(familyRows.length).toBe(4);
    for (const famRow of Array.from(familyRows)) {
      expect(famRow.querySelector('input')).toBeNull();
      expect(famRow.querySelector('stat')).toBeNull();
      expect(famRow.querySelector('button')).toBeNull();
    }

    // 10 knowledge sub-skills + 1 craft sub-skill (pottery) = 11 sub-skill rows
    const subSkillRows = fixture.nativeElement.querySelectorAll('.sub-skill') as NodeListOf<HTMLElement>;
    expect(subSkillRows.length).toBe(11);

    // Acrobatics on exampleCharacter: ranks 1 + classSkill 3 + dexMod 2 + skillCheckBonus (-2) + ACP (-4) = 0
    const allSkillRows = Array.from(
      fixture.nativeElement.querySelectorAll('.skill:not(.skill-family)')
    ) as HTMLElement[];
    const acrobaticsRow = allSkillRows.find(r => r.querySelector('label')?.textContent?.trim() === 'acrobatics')!;
    expect(acrobaticsRow.querySelector('stat')!.textContent!.trim()).toBe('0');

    // Enter ranks in pottery and verify stored on raw and reflected in total and remaining ranks
    component.onSubSkillRanksChange('craft', 'pottery', 1);
    charService.update();
    fixture.detectChanges();

    expect(charService.raw().skills['craft'].subSkills!['pottery'].ranks).toBe(1);
    const potteryRow = Array.from(
      fixture.nativeElement.querySelectorAll('.sub-skill')
    ).find((r: any) => r.querySelector('label')?.textContent?.trim() === 'pottery') as HTMLElement;
    // Pottery: ranks 1 + classSkill 3 (Barbarian has craft) + intMod (-2 for int 7) + skillCheckBonus (-2) = 0
    expect(potteryRow.querySelector('stat')!.textContent!.trim()).toBe('0');
  });
});
