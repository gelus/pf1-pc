// data with the player's picks filled in (a library entry's, a favored class option's): every {choice:<id>} becomes
// the pick, in a path (lower case, as the paths are: "abilityScores.{choice:ability}" with con is "abilityScores.con") and in any text or formula (Skill
// Focus's name and its "+6 at 10 ranks" formula name the skill). a skill of a family picked as the rules write it,
// "Knowledge (nature)", is its path in a path ("skills.{choice:skill}.classSkill" is
// "skills.knowledge.subSkills.nature.classSkill"). a copy, the data is never changed
const inPath = (pick: string): string => {
  const lower = pick.trim().toLowerCase();
  const family = /^([a-z ]+?)\s*\(([^)]+)\)$/.exec(lower);
  return family ? `${family[1]}.subSkills.${family[2].trim()}` : lower;
};
export const withChoices = <T>(data: T, picks: {[choice: string]: string} = {}): T => {
  const fill = (text: string, lower: boolean): string => text.replace(/\{choice:([^}]+)\}/g, (whole, id) =>
    picks[id] === undefined ? whole : lower ? inPath(String(picks[id])) : String(picks[id]).trim());
  const copy = (value: unknown, path = false): unknown => {
    if (typeof value === 'string') return fill(value, path);
    if (Array.isArray(value)) return value.map(item => copy(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, inner]) =>
      (key === 'adjustments' || key === 'grows') && inner && typeof inner === 'object' && !Array.isArray(inner)
        ? [key, Object.fromEntries(Object.entries(inner).map(([adjusted, given]) => [fill(adjusted, true), copy(given, /\{[a-z]+\./.test(String(given)))]))]
        : [key, copy(inner)]));
  };
  return copy(data) as T;
};

// the choices of a rule a set of picks leaves unpicked, or picked out of its options
export const missingPicks = (choices: {id: string; label: string; options?: string[]}[] = [], picks: {[choice: string]: string} = {}): string[] =>
  choices.flatMap(choice => {
    const pick = String(picks[choice.id] ?? '').trim();
    if (!pick) return [`${choice.id}: ${choice.label}${choice.options?.length ? ` (${choice.options.join(', ')})` : ''}`];
    return choice.options?.length && !choice.options.some(option => option.toLowerCase() === pick.toLowerCase())
      ? [`${choice.id}: ${pick} is not one of ${choice.options.join(', ')}`] : [];
  });
