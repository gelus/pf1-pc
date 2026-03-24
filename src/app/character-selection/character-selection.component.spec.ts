import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CharacterSelectionComponent } from './character-selection.component';

describe('CharacterSelectionComponent', () => {
  let component: CharacterSelectionComponent;
  let fixture: ComponentFixture<CharacterSelectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharacterSelectionComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CharacterSelectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
