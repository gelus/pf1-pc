import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Attack } from '../utils/attack.class';

import { AttackComponent } from './attack.component';

describe('AttackComponent', () => {
  let component: AttackComponent;
  let fixture: ComponentFixture<AttackComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AttackComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AttackComponent);
    component = fixture.componentInstance;
    component.attack = new Attack();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
