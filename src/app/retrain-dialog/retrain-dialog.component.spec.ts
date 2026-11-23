import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetrainDialogComponent } from './retrain-dialog.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { CLASS_PRESETS, classLevelFromPreset } from '../rules/class-presets';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { ChatRequestsService } from '../ai-chat/chat-requests.service';

// retraining by hand: what it takes, the change, and the gold paid only from the Pay button
describe('RetrainDialogComponent', () => {
  let fixture: ComponentFixture<RetrainDialogComponent>;
  let component: RetrainDialogComponent;
  let service: ApplyCharacterService;
  const el = (selector: string): HTMLElement => fixture.nativeElement.querySelector(selector);

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [RetrainDialogComponent]}).compileComponents();
    service = TestBed.inject(ApplyCharacterService);
    const char = new Character();
    const fighter = CLASS_PRESETS.find(p => p.name === 'Fighter')!;
    char.classLevels = [1, 2, 3, 4].map(n => new ClassLevel({...classLevelFromPreset(fighter, n, n === 1), rolledHp: 5, ...(n === 4 ? {abilityIncrease: 'str'} : {})}));
    char.feats = [new Feature({name: 'Power Attack', description: 'trade attack for damage', adjustments: {'availableCombatOptions.powerAttack': true}})];
    char.wealth = {pp: 0, gp: 500, sp: 0, cp: 0};
    service.initializeCharacter(char);
    fixture = TestBed.createComponent(RetrainDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('says what a retraining takes for the character\'s level', () => {
    expect(el('.retrain-cost').textContent).toContain('5 days, 200 gp');
  });

  it('moves an ability increase, and pays only when Pay is clicked', () => {
    component.pickKind('ability increase');
    component.level = 4;
    component.ability = 'con';
    component.retrainNumbers();
    fixture.detectChanges();
    expect(service.raw().classLevels[3].abilityIncrease).toBe('con');
    expect(el('.retrain-done').textContent).toContain('from str to con');
    expect(service.raw().wealth.gp).toBe(500);
    el('.retrain-pay').click();
    fixture.detectChanges();
    expect(service.raw().wealth.gp).toBe(300);
    expect(el('.retrain-pay')).toBeNull();
  });

  it('trades a feat for one written in the feature editor', () => {
    component.target = service.raw().feats[0].id;
    component.openFeatureEditor({openModal: () => {}} as any);
    component.featureWritten(new Feature({name: 'Toughness', description: '+3 hp', adjustments: {hp: 3}}));
    expect(service.raw().feats.map(f => f.name)).toEqual(['Toughness']);
    expect(component.outcome()!.done).toBe('retrained Power Attack into Toughness');
  });

  it('retrains a class level into a core class from its preset', () => {
    component.pickKind('class level');
    component.target = 'Fighter';
    component.toClass = 'Rogue';
    component.rolledHp = 6;
    component.retrainLevel();
    expect(service.raw().classLevels.map(l => `${l.name} ${l.level}`)).toEqual(['Fighter 1', 'Fighter 2', 'Fighter 3', 'Rogue 1']);
    expect(service.raw().classLevels[3].abilityIncrease).toBe('str');
  });

  it('hands it to the AI', () => {
    component.target = service.raw().feats[0].id;
    component.askAi();
    expect(TestBed.inject(ChatRequestsService).asked()!.question).toContain('Retrain my feat Power Attack');
  });
});
