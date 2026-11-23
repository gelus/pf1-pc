import {ApplyCharacterService} from '../apply-character.service';
import {StatSpec, statTotal} from '../stat-display/stat-total';

// the numbers asked for most in a fight, of any character by its own service (a companion's side bar pop-out shows
// them without its sheet open): initiative, AC and the saves, totalled as the sheet totals them
export interface QuickStats {
  init: number;
  ac: number;
  fort: number;
  ref: number;
  will: number;
}

export const quickStats = (service: ApplyCharacterService): QuickStats => {
  const char = service.applied();
  const total = (spec: StatSpec) => statTotal(char, {...spec, notStacking: service.notStackingTotal(spec.stat, char)});
  return {
    init: total({stat: 'init', abilities: ['dex']}),
    // the character's ac holds its base 10 already (the sheet shows it as a line of the tooltip only)
    ac: total({stat: 'ac', abilities: ['dex'], maxAbilityBonus: char.maxDexBonus}),
    fort: total({stat: 'saves.fort', abilities: ['con']}),
    ref: total({stat: 'saves.ref', abilities: ['dex']}),
    will: total({stat: 'saves.will', abilities: ['wis']}),
  };
};

export const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));
