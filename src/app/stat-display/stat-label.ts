// what a stat path is called on the sheet: the tooltip's title and the question the tooltip asks the AI

const NAMES: Record<string, string> = {
  ac: 'AC', touchAc: 'touch AC', flatFootedAc: 'flat-footed AC', hp: 'hit points', bab: 'BAB', cmb: 'CMB', cmd: 'CMD',
  init: 'initiative', fort: 'Fortitude save', ref: 'Reflex save', will: 'Will save',
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
  land: 'speed', fly: 'fly speed', swim: 'swim speed', climb: 'climb speed', burrow: 'burrow speed',
  spellFailureChance: 'spell failure chance', arcaneSpellFailureChance: 'arcane spell failure chance',
  abilityCheckBonus: 'ability check bonus',
};

const words = (key: string): string => key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

export function statLabel(path: string | undefined): string {
  if (!path) return 'Total';
  const parts = path.split('.');
  // skills.<skill>.value, skills.<family>.subSkills.<sub>.value
  if (parts[0] === 'skills') {
    const sub = parts.indexOf('subSkills');
    return sub > 0 ? `${words(parts[1])} (${words(parts[sub + 1])})` : words(parts[1]);
  }
  const last = parts[parts.length - 1] === 'value' ? parts[parts.length - 2] : parts[parts.length - 1];
  return NAMES[last] ?? words(last);
}
