import { Routes } from '@angular/router';
import { CharacterSelectionComponent } from './character-selection/character-selection.component';
import { CharacterSheetComponent } from './character-sheet/character-sheet.component';
import { NewCharacterComponent } from './new-character/new-character.component';

export const routes: Routes = [
  {path: 'new-character', component: NewCharacterComponent},
  // before :characterid, which would take it as an id. loaded when opened, off the first bundle
  {path: 'legal', loadComponent: () => import('./legal/legal.component').then(m => m.LegalComponent)},
  {path: ':characterid', component: CharacterSheetComponent},
  {path: '', component: CharacterSelectionComponent},
];
