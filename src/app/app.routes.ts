import { Routes } from '@angular/router';
import { CharacterSelectionComponent } from './character-selection/character-selection.component';
import { CharacterSheetComponent } from './character-sheet/character-sheet.component';
import { NewCharacterComponent } from './new-character/new-character.component';

export const routes: Routes = [
  {path: 'new-character', component: NewCharacterComponent},
  {path: ':characterid', component: CharacterSheetComponent},
  {path: '', component: CharacterSelectionComponent},
];
