import {ApplyCharacterService} from '../apply-character.service';
import {ABILITIES} from '../rules/class-progression';
import {CompanionLink, companionLevel, masterClassLevel} from '../rules/companions';

// a companion's link to its master, the sheet's and the AI's (set_companion), one step of the undo history:
//  classes: the master's classes whose levels count for it (its master class level), by their names on the master
//  levelOffset: what the class feature granting it adds to that (a ranger's animal companion: -3)
//  increases: the abilities its ability score increases raised, in the order of its levels
//  without: the abilities of its kind the class feature takes away (a cavalier's mount: Share Spells)
export interface CompanionChange {
  classes?: string[];
  levelOffset?: number;
  increases?: string[];
  without?: string[];
  goodSaves?: string[];
  unchained?: boolean;
  synthesist?: boolean;
}

export const setCompanion = (service: ApplyCharacterService, change: CompanionChange): {done?: string, error?: string} => {
  const link = service.raw().master;
  if (!link) return {error: `${service.raw().name} is no companion`};
  const next: CompanionLink = {...link};
  if (change.classes) {
    const masters = Object.keys(link.copy?.classes || {});
    const picked = change.classes.map(c => c.trim()).filter(Boolean).map(c => masters.find(m => m.toLowerCase() === c.toLowerCase()) ?? c);
    const unknown = picked.filter(c => !masters.includes(c));
    if (unknown.length) return {error: `${link.copy?.name ?? 'its master'} has no ${unknown.join(', ')} levels: its classes are ${masters.join(', ') || 'none'}`};
    next.classes = picked;
  }
  if (change.levelOffset !== undefined) {
    const offset = Math.floor(Number(change.levelOffset));
    if (!Number.isFinite(offset)) return {error: 'level_offset is a whole number, what the class feature adds to the master class level (-3 for a ranger\'s)'};
    next.levelOffset = offset || undefined;
  }
  if (change.increases) {
    const picked = change.increases.map(a => a.trim().toLowerCase().slice(0, 3)).filter(Boolean);
    const wrong = picked.filter(a => !ABILITIES.includes(a));
    if (wrong.length) return {error: `increases are abilities, ${ABILITIES.join(', ')}: not ${wrong.join(', ')}`};
    next.increases = picked;
  }
  if (change.without) next.without = change.without.map(w => w.trim()).filter(Boolean);
  if (change.goodSaves) {
    const saves = change.goodSaves.map(s => s.trim().toLowerCase().slice(0, 4).replace(/^refl$/, 'ref').replace(/^forti?$/, 'fort'))
      .map(s => s.startsWith('fort') ? 'fort' : s.startsWith('ref') ? 'ref' : s.startsWith('will') ? 'will' : s).filter(Boolean);
    const wrong = saves.filter(s => !['fort', 'ref', 'will'].includes(s));
    if (wrong.length) return {error: `good_saves are fort, ref and will: not ${wrong.join(', ')}`};
    next.goodSaves = [...new Set(saves)] as CompanionLink['goodSaves'];
  }
  if (change.unchained !== undefined) next.unchained = change.unchained || undefined;
  // a synthesist's eidolon: its summoner gets a Fused form of it (CharacterRegistry)
  if (change.synthesist !== undefined) next.synthesist = change.synthesist || undefined;
  return service.labelled(`${service.raw().name}: its link to ${link.copy?.name ?? 'its master'}`, () => {
    service.update({master: next});
    return {done: `${service.raw().name} counts ${(next.classes || []).join(', ') || 'no class'}: master class level ${masterClassLevel(next)}`
      + `${next.levelOffset ? `, its own level ${companionLevel(next)}` : ''}${next.increases?.length ? `, increases ${next.increases.join(', ')}` : ''}`};
  });
};

// the classes alone (the familiar's sheet and specs)
export const setCompanionClasses = (service: ApplyCharacterService, classes: string[]) => setCompanion(service, {classes});
