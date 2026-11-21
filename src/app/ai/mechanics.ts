import {sizes} from '../interfaces/character.interface';
import {combatOptionLabels} from '../interfaces/character.interface';
import {CHARGES_PER, Charges, Feature} from '../interfaces/character.interface';
import {parseJsonArg} from './json-arg';

// what the builders hold the AI to when it writes a feature: the rules of a feature become adjustments, so the
// sheet works them out, instead of staying in the description where nothing applies them. a feature that changes no
// number says so (descriptionOnly, with why), the rest is refused. a class feature does not show on the sheet by
// itself: what the player reads and uses goes in an entry it gives (specialAttack, defensiveAbilities,
// specialQuality), and a feature the player turns on and off (studied target, a stance, rage) has its toggle and
// its bonuses on that entry, where the sheet shows the checkbox

// where a feature shows on the sheet, and what goes there
export const DISPLAY_LISTS = ['specialAttack', 'defensiveAbilities', 'specialQuality'] as const;
const DISPLAY_GUIDE = 'specialAttack for what it does in a fight (sneak attack, studied target, smite, rage), '
  + 'defensiveAbilities for what protects it (evasion, uncanny dodge, trap sense), specialQuality for the rest (track, '
  + 'wild empathy, darkvision)';

// adjustments the sheet keeps count of without showing them as a feature: a bonus feat, skill ranks, proficiencies
const BOOKKEEPING = /^(bonusFeats|bonusSkillRanks|proficiencies\.|classSkills|languages|favoredClass)/;

// the paths the rules need most, which the AI gets wrong when it guesses: in the creation instructions and in
// every refusal, so the first try can be right
export const PATHS_GUIDE = 'Paths the rules need most: a bonus feat "bonusFeats": 1; the human\'s Skilled '
  + '"bonusSkillRanks": "{level}"; attack and damage "melee.*.toHitBonus" and "melee.*.damageBonus" ("ranged.*." for '
  + 'bows); a feat that is a combat option "availableCombatOptions.powerAttack": true (deadlyAim, combatExpertise); '
  + 'Spell Focus "spellSchoolDcBonus.evocation": 1; "energyResistance.fire": 5; "senses": "darkvision 60 ft."; '
  + 'saves "saves.will", skills "skills.perception.value" (Knowledge "skills.knowledge.subSkills.*.value"), "init", '
  + '"ac", "cmb", "cmd", a faster speed "speed.land": 10. A typed bonus is {"value": 4, "type": "morale"}. A bonus only '
  + 'in a situation is a variant of the path: "saves.fort[vs. poison]", "ranged.*.toHitBonus[within 30 ft.]". Uses a '
  + 'day go on the entry the sheet shows: "charges": {"total": 3, "label": "per day"}; uses a feat adds to another '
  + 'feature "extraUses.channel energy": 2.';

// how a feature's rules become adjustments, for the AI: given with every refusal, so the next try fixes it
export const MECHANICS_GUIDE = [
  'Write every number the rules give as adjustments: an always-on bonus as the path ("saves.will": 1), one that '
    + 'applies only in a situation the sheet can not know of as a variant ("skills.survival.value[follow tracks]"), '
    + 'and one the player turns on (while studying a target, in a stance, raging) on a feature with "active": false, '
    + 'so the sheet shows a checkbox and the bonuses while it is on.',
  'A number that grows with level goes in "grows", its value by level as the rules table lists it '
    + '({"<path>": {"1": 1, "5": 2}}): the app writes the formula. Never write one yourself.',
  `A class feature shows on the sheet through the entry it gives: ${DISPLAY_GUIDE}. The toggle ("active") and the `
    + 'bonuses go on that entry: {"name": "Studied Target", "gained_at": 1, "adjustments": {"specialAttack": {"name": '
    + '"Studied Target", "description": "move action, one creature", "active": false}}, "grows": {"melee.*.toHitBonus": '
    + '{"1": 1, "5": 2, "10": 3, "15": 4, "20": 5}, ... the same for its damage and each skill it names}}.',
  PATHS_GUIDE,
  'Only a feature that changes no number (a proficiency the class already gives, a rule that is judged at the table) '
    + 'is description only: give it "descriptionOnly": "why".',
].join(' ');

const isObject = (value: unknown): value is {[key: string]: unknown} =>
  !!value && typeof value === 'object' && !Array.isArray(value);

// what the engine takes as one adjustment given as an object ({"value": 2, "type": "racial"})
const isValueObject = (value: {[key: string]: unknown}): boolean => 'value' in value;

// the groups the AI writes nested ({"abilityScores": {"con": 2}}) where the engine takes paths ("abilityScores.con")
const NESTED_GROUPS = ['abilityScores', 'saves', 'speed', 'energyResistance', 'spellSchoolDcBonus', 'availableCombatOptions', 'damageReduction'];

const flattened = (adjustments: {[path: string]: unknown}): {[path: string]: unknown} => {
  const flat: {[path: string]: unknown} = {};
  for (const [written, value] of Object.entries(adjustments)) {
    // a key the AI quoted once more inside the JSON ("\"bonusFeats\"")
    const path = written.trim().replace(/^["'](.*)["']$/, '$1');
    if (NESTED_GROUPS.includes(path) && isObject(value) && !isValueObject(value)) {
      for (const [key, inner] of Object.entries(value)) flat[`${path}.${key}`] = inner;
    } else if (path === 'skills' && isObject(value) && !isValueObject(value)) {
      // {"skills": {"intimidate": 2}}: a bonus on each skill
      for (const [key, inner] of Object.entries(value)) flat[`skills.${key.toLowerCase()}${/\.(value|ranks|classSkill)$/.test(key) ? '' : '.value'}`] = inner;
    } else if (isObject(value) && isValueObject(value) && typeof value['type'] === 'string' && /^(untyped|none|no type|)$/i.test(value['type'].trim())) {
      // "untyped" is no bonus type: the plain value is the untyped bonus
      const {type, ...rest} = value;
      flat[path] = Object.keys(rest).length === 1 ? rest['value'] : rest;
    } else if ((DISPLAY_LISTS as readonly string[]).includes(path) && isObject(value)) {
      flat[path] = normalizedFeature(value, true);
    } else {
      flat[path] = value;
    }
  }
  return flat;
};

// a feature as the AI wrote it, in the shape the engine and the checks take: adjustments as an object of flat paths,
// descriptionOnly however it was spelled (the tools' arguments are snake_case, so the AI writes description_only),
// and an entry it gives (specialAttack, ...) inside its adjustments where the AI put it next to them
// the fields of the form the AI fills from a rules page, see feature-form.ts
const FORM_FIELDS = ['gained_at', 'grows', 'uses_by_level'];

export const normalizedFeature = (given: unknown, nested = false): any => {
  if (!isObject(given)) return given;
  const feature: {[key: string]: unknown} = {...given};
  for (const spelling of ['description_only', 'descriptiononly', 'description only']) {
    if (spelling in feature) {
      feature['descriptionOnly'] ??= feature[spelling];
      delete feature[spelling];
    }
  }
  // "descriptionOnly": true says it changes no number without saying why: its description says what it does
  if (feature['descriptionOnly'] === true) feature['descriptionOnly'] = String(feature['description'] || 'it changes no number');
  if (feature['descriptionOnly'] === false || feature['descriptionOnly'] === '') delete feature['descriptionOnly'];
  let adjustments: unknown = feature['adjustments'];
  if (typeof adjustments === 'string') adjustments = parseJsonArg(adjustments, 'adjustments').value;
  const kept: {[path: string]: unknown} = isObject(adjustments) ? {...adjustments} : {};
  // what belongs to the feature written among its adjustments: its uses and its toggle, and its form (feature-form.ts)
  for (const key of ['charges', 'uses', 'uses_per_day', 'usesPerDay', 'active', ...FORM_FIELDS]) {
    if (key in kept) {
      feature[key] ??= kept[key];
      delete kept[key];
    }
  }
  // the form written on the feature's sheet entry is the feature's
  for (const value of Object.values(kept)) {
    if (!isObject(value)) continue;
    for (const key of FORM_FIELDS) {
      if (key in value) {
        feature[key] ??= value[key];
        delete (value as {[key: string]: unknown})[key];
      }
    }
  }
  if ('gainedAt' in feature) {
    feature['gained_at'] ??= feature['gainedAt'];
    delete feature['gainedAt'];
  }
  for (const list of DISPLAY_LISTS) {
    if (isObject(feature[list]) && !(list in kept)) kept[list] = feature[list];
    delete feature[list];
  }
  feature['adjustments'] = flattened(kept);
  // a size by its name, as a race page says it ("Medium"): the engine keeps it as the index of the size, set
  const written = feature['adjustments'] as {[path: string]: unknown};
  const sizeOf = (value: unknown) => typeof value === 'string' ? sizes.findIndex(size => size.toLowerCase() === value.trim().toLowerCase()) : -1;
  const size = isObject(written['size']) ? (written['size'] as {value?: unknown}).value : written['size'];
  if (sizeOf(size) >= 0) written['size'] = {value: sizeOf(size), mode: 'set'};
  // the uses a day however they were written (a number, "uses", charges without current)
  for (const spelling of ['uses', 'uses_per_day', 'usesPerDay', 'uses_total']) {
    if (spelling in feature) {
      feature['charges'] ??= feature[spelling];
      delete feature[spelling];
    }
  }
  // a combat option feat (Power Attack) is the option and nothing else: the sheet works its numbers out, and the
  // AI's own would count them twice
  const option = combatOptionOf(String(feature['name'] || ''));
  const flat = feature['adjustments'] as {[path: string]: unknown};
  if (option && flat[`availableCombatOptions.${option}`] === true) feature['adjustments'] = {[`availableCombatOptions.${option}`]: true};
  const charges = chargesOf(feature['charges']);
  if (charges) feature['charges'] = charges;
  else delete feature['charges'];
  if (!nested) typedAsWritten(feature);
  return feature;
};

// charges as the engine keeps them, from a number of uses or charges with only some of their fields
const chargesOf = (value: unknown): Charges | undefined => {
  const given: {[key: string]: unknown} = isObject(value) ? value : {total: value};
  const total = Math.floor(Number(given['total'] ?? given['max'] ?? given['uses']));
  if (!(total > 0)) return undefined;
  const current = Math.floor(Number(given['current']));
  const label = typeof given['label'] === 'string' && given['label'].trim() ? given['label'].trim() : 'per day';
  const per = CHARGES_PER.includes(given['per'] as NonNullable<Charges['per']>) ? given['per'] as Charges['per']
    : /encounter|combat/i.test(label) ? 'encounter' : /\bday|daily/i.test(label) ? 'day' : undefined;
  return {total, current: current >= 0 && current <= total ? current : total, label, ...(per ? {per} : {})};
};

// the bonus type the text names, on the bonuses written without it: rage's "+4 morale bonus to Strength" written as
// "abilityScores.str": 4 would stack with every other morale bonus. only when the text names one type, and only on
// bonuses (a penalty, "ac": -2, is no morale bonus)
const BONUS_TYPE = /\b(alchemical|circumstance|competence|deflection|dodge|enhancement|insight|luck|morale|profane|racial|resistance|sacred|trait) bonus/gi;
const TYPED_PATH = /^(abilityScores\.|hp\b)/;
const typedAsWritten = (feature: {[key: string]: unknown}): void => {
  const text = textOf(feature as unknown as Feature);
  const types = [...new Set([...text.matchAll(BONUS_TYPE)].map(m => m[1].toLowerCase()))];
  if (types.length !== 1) return;
  const type = types[0];
  const typed = (adjustments: unknown) => {
    if (!isObject(adjustments)) return;
    for (const [path, value] of Object.entries(adjustments)) {
      // a race's ability modifiers are no racial bonus
      if (!(BONUS_PATH.test(path) || (TYPED_PATH.test(path) && type !== 'racial'))) continue;
      const bonus = typeof value === 'number' ? value > 0 : typeof value === 'string' && !!value.trim() && !value.trim().startsWith('-');
      if (bonus) adjustments[path] = {value, type};
    }
  };
  typed(feature['adjustments']);
  for (const entry of entriesGiven(feature as unknown as Feature)) typed(entry['adjustments']);
};

const entriesGiven = (feature: Feature): {[key: string]: unknown}[] => DISPLAY_LISTS.flatMap(list => {
  const given = (feature.adjustments as {[path: string]: unknown} | undefined)?.[list];
  return (Array.isArray(given) ? given : [given]).filter(isObject);
});

// every path of a feature, those of the entries it gives included
const allPaths = (feature: Feature): string[] => [
  ...Object.keys(feature.adjustments || {}),
  ...entriesGiven(feature).flatMap(entry => Object.keys(isObject(entry['adjustments']) ? entry['adjustments'] : {})),
];

// whether the player turns the feature (or an entry it gives) on and off
const isToggled = (feature: Feature): boolean =>
  feature.active !== undefined || entriesGiven(feature).some(entry => entry['active'] !== undefined);

// the rules text of a feature: its name and descriptions, without the app's notes on where it came from ("check it
// against the rules" read as a situational bonus, and refused every racial trait built from memory)
const APP_NOTES = /(^|\n)\s*(source: \S+|built by the ai from (memory|the player's description)[^\n]*)\s*$/gim;
const textOf = (feature: Feature): string => [
  feature.name, feature.description, (feature as {descriptionOnly?: unknown}).descriptionOnly,
  // the rules its page gave, when it was looked up (see rulesTextFor): never stored on the sheet
  (feature as {rulesText?: unknown}).rulesText,
  ...entriesGiven(feature).map(entry => entry['description']),
].filter(v => typeof v === 'string').map(v => (v as string).replace(APP_NOTES, '')).join(' ');

// what a description-only feature's text says it does, which a path holds: the description-only mark is for a rule
// judged at the table, not for one the AI did not find the path of. undefined when nothing in the text asks for one
const pathsItNeeds = (text: string): string | undefined => {
  const needs: string[] = [];
  if (/\b(bonus|extra|additional) feats?\b|\bgains? (a|one) (bonus )?feat\b/i.test(text)) {
    needs.push('a bonus feat is "bonusFeats": 1 (the feat itself is added at the feats step)');
  }
  if (/\bskill ranks?\b/i.test(text)) needs.push('skill ranks are "bonusSkillRanks" ("{level}" for one per level)');
  if (/\bDC\b/.test(text) && /abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation/i.test(text)) {
    needs.push('a school\'s DC is "spellSchoolDcBonus.<school>"');
  }
  if (/(never|not) (modified|reduced)[^.]{0,20}\b(armor|encumbrance|load)/i.test(text)) {
    needs.push('a speed armor and loads do not reduce is "speedUnslowedByArmorAndLoad": true');
  }
  if (/\bspeed\b[^.]{0,50}\+\s?\d+\s?(ft\.?|feet)|\+\s?\d+\s?(ft\.?|feet)[^.]{0,30}\bspeed\b|\bspeed\b[^.]{0,30}\bfaster\b/i.test(text)) {
    needs.push('a faster speed is "speed.land": 10 (the feet it adds)');
  }
  if (/\badditional (times|uses?)\b|\bextra (times|uses?)\b|\b(times|uses?) more\b/i.test(text)) {
    needs.push('uses added to another feature are "extraUses.<its name>" (Extra Channel: "extraUses.channel energy": 2)');
  }
  if (/armor check penalt/i.test(text)) needs.push('a lower armor check penalty is "armorCheckPenalty": 1 (it adds to the negative penalty)');
  if (/\b(fire|cold|acid|electricity|sonic) resistance \d+|resist(ance)? (to )?(fire|cold|acid|electricity|sonic) \d+/i.test(text)) {
    needs.push('energy resistance is "energyResistance.<energy>"');
  }
  if (!/per (die|dice)/i.test(text) && /\+\s?\d+[^.;]{0,40}\b(attack|damage|saves?|saving throws?|AC|armor class|initiative|CMB|CMD|checks?|hit points)\b/i.test(text)) {
    needs.push('its bonus is a path (a variant for when it applies)');
  }
  return needs.length ? needs.join('; ') : undefined;
};

const SKILL_NAMES = ['acrobatics', 'appraise', 'bluff', 'climb', 'craft', 'diplomacy', 'disable device', 'disguise',
  'escape artist', 'fly', 'handle animal', 'heal', 'intimidate', 'knowledge', 'linguistics', 'perception', 'perform',
  'profession', 'ride', 'sense motive', 'sleight of hand', 'spellcraft', 'stealth', 'survival', 'swim', 'use magic device'];

// what the text gives that the adjustments leave out: a bonus to every attack written for melee only (studied
// target written for the bow), skills it names with their bonus and no path for them, a speed armor does not slow
// every path a feature's text gives a bonus on: its attacks (melee and ranged, to hit and damage, when it names no one
// kind) and each skill it names. a feature with no numbers yet is told all of them at once, not one a refusal
const pathsTheTextNames = (text: string): string[] => {
  const bonuses = text.match(/\+\s?\d+[^.;]*/g) || [];
  const attacks = bonuses.some(clause => /\battacks?\b/i.test(clause));
  const damage = bonuses.some(clause => /\bdamage\b/i.test(clause));
  const kinds = /\b(melee|ranged|bows?|thrown|rays?)\b/i.test(text) ? [] : ['melee', 'ranged'];
  const skills = [...new Set(bonuses.flatMap(clause => SKILL_NAMES.filter(skill => new RegExp(`\\b${skill}\\b`, 'i').test(clause))))];
  return [
    ...(attacks ? kinds.map(k => `${k}.*.toHitBonus`) : []),
    ...(attacks && damage ? kinds.map(k => `${k}.*.damageBonus`) : []),
    ...skills.map(skill => skill === 'knowledge' ? 'skills.knowledge.subSkills.*.value (every Knowledge)' : `skills.${skill}.value`),
  ];
};

const coverageProblems = (name: string, text: string, paths: string[]): string[] => {
  const problems: string[] = [];
  const bonuses = text.match(/\+\s?\d+[^.;]*/g) || [];
  if (bonuses.some(clause => /\battacks?\b/i.test(clause)) && !/\b(melee|ranged|bows?|thrown|rays?|weapon focus)\b/i.test(text)) {
    for (const field of ['toHitBonus', 'damageBonus']) {
      const melee = paths.some(p => p.startsWith(`melee.*.${field}`));
      const ranged = paths.some(p => p.startsWith(`ranged.*.${field}`));
      if (melee !== ranged) {
        problems.push(`${name}: its text gives the bonus to every attack, but only ${melee ? 'melee' : 'ranged'}.*.${field} has it: add ${melee ? 'ranged' : 'melee'}.*.${field} too`);
      }
    }
  }
  const named = [...new Set(bonuses.flatMap(clause => SKILL_NAMES.filter(skill => new RegExp(`\\b${skill}\\b`, 'i').test(clause))))];
  const covers = (skill: string) => paths.some(p => p.startsWith(`skills.${skill}`) || p.startsWith('skills.@') || p.startsWith('skillCheckBonus'));
  const left = named.filter(skill => !covers(skill));
  if (left.length && paths.some(p => p.startsWith('skills.') || BONUS_PATH.test(p))) {
    problems.push(`${name}: its text gives a bonus on ${left.join(', ')}, which no path has: add "skills.<skill>.value" for each (every Knowledge: "skills.knowledge.subSkills.*.value", one: "skills.knowledge.subSkills.religion.value")`);
  }
  if (/(never|not) (modified|reduced)[^.]{0,20}\b(armor|encumbrance|load)/i.test(text) && !paths.includes('speedUnslowedByArmorAndLoad')) {
    problems.push(`${name}: a speed armor and loads do not reduce needs "speedUnslowedByArmorAndLoad": true`);
  }
  return problems;
};

// uses a day the sheet counts: rounds of rage, channel energy, a domain power used 3 + Wis times a day
const PER_DAY = /\b(times|rounds?|uses?) (per|a|each) day\b|\bper day\b|\/day\b/i;
// the spells a day of a caster are worked out by the rules, not counted on a feature
const usesADay = (text: string): boolean => PER_DAY.test(text.replace(/\b(spells?|orisons?|cantrips?|slots?)( of each level)? (per|a|each) day\b/gi, ''));

// when the text says the bonus applies only sometimes: "vs. poison", "against giants", "while raging"
const SITUATIONAL = /\b(vs\.?|versus|against|while|within \d+|up to \d+ (ft|feet)|when (wearing|wielding|using|fighting|flanking|charging|mounted))\b/i;
const BONUS_PATH = /^(saves|savingThrowBonus|ac|touchAc|flatFootedAc|attackRollBonus|meleeAttackRollBonus|rangedAttackRollBonus|melee|ranged|skills|skillCheckBonus|cmb|cmd|init|abilityCheckBonus)\b/;

// a feat that is a combat option the rules work out (Power Attack): made available, never its numbers. the feat of
// two-weapon fighting lowers its penalties, it is not the option itself
const FEAT_OPTIONS = ['powerAttack', 'deadlyAim', 'combatExpertise'];
const combatOptionOf = (name: string): string | undefined => {
  const plain = name.toLowerCase().replace(/[^a-z]/g, '');
  return Object.entries(combatOptionLabels).filter(([key]) => FEAT_OPTIONS.includes(key)).find(([key, label]) =>
    key.toLowerCase() === plain || label.toLowerCase().replace(/[^a-z]/g, '') === plain)?.[0];
};

// what is wrong with how the features were written, undefined when nothing is. features are what the AI gave, with
// descriptionOnly still on them: strip it with withoutMarks before keeping them. class features are checked for
// where they show and where their toggle is too
export const mechanicsProblems = (
  features: Feature[], options: {classFeatures?: boolean} = {},
): string[] => {
  const problems: string[] = [];
  for (const feature of features) {
    const name = feature.name || 'a feature';
    const reason = (feature as {descriptionOnly?: unknown}).descriptionOnly;
    const paths = Object.keys(feature.adjustments || {});
    const option = combatOptionOf(name);
    if (option && !paths.includes(`availableCombatOptions.${option}`)) {
      problems.push(`${name} is a combat option the sheet works out: its adjustments are {"availableCombatOptions.${option}": true}, nothing else`);
      continue;
    }
    if (!paths.length) {
      if (typeof reason !== 'string' || !reason.trim()) {
        // its rules written and no number in them: it is description only, as the AI meant (Orc Blood, Weapon
        // Familiarity were refused for not saying so, a call each)
        const written = String(feature.description || '').replace(APP_NOTES, '').trim();
        const needs = pathsItNeeds(textOf(feature));
        const numbersImplied = /\b(bonus(es)?|penalt(y|ies)|increases?|decreases?)\b|[+-]\s?\d/i.test(textOf(feature));
        if (written.split(/\s+/).length >= 3 && !needs && !numbersImplied) continue;
        problems.push(needs
          ? `${name} adjusts nothing, and its text gives numbers: ${needs}`
          : `${name} adjusts nothing: write its rules as adjustments, or its rules in its description if it changes no number`);
        continue;
      }
      // a reason that says no path can hold it is taken at its word
      const needs = /^no path\b/i.test(reason.trim()) ? undefined : pathsItNeeds(textOf(feature));
      if (needs) {
        problems.push(`${name} is description only, but its text gives numbers: ${needs}. If no path can hold them, start descriptionOnly with "no path:"`);
      }
      continue;
    }
    const all = allPaths(feature);
    // shown on the sheet and nothing more: its numbers are left out as much as with no adjustments at all
    if (all.every(path => (DISPLAY_LISTS as readonly string[]).includes(path)) && !(typeof reason === 'string' && /^no path\b/i.test(reason.trim()))) {
      const needs = pathsItNeeds(textOf(feature));
      if (needs) {
        const named = pathsTheTextNames(textOf(feature));
        problems.push(`${name} shows on the sheet but adjusts nothing, and its text gives numbers: ${needs}. Put them in the adjustments of the entry it gives`
          + `${named.length ? `, every one its text names: ${named.join(', ')}` : ''}`);
        continue;
      }
    }
    problems.push(...coverageProblems(name, textOf(feature), all));
    const situational = SITUATIONAL.exec(textOf(feature));
    if (situational && !isToggled(feature) && !all.some(path => path.includes('['))) {
      const always = all.filter(path => BONUS_PATH.test(path));
      if (always.length) {
        problems.push(`${name}: its text says it applies only sometimes ("${situational[0]} ..."), but ${always.join(', ')} `
          + 'apply always: make each a variant of when it applies ("saves.fort[vs. poison]", "ac[vs. giants]"), or a '
          + 'feature the player turns on ("active")');
      }
    }
    // a toggled entry is on in its situation: a variant of that same situation would keep its bonuses off the sheet
    const switched = [...entriesGiven(feature), ...(feature.active !== undefined ? [feature as unknown as {[key: string]: unknown}] : [])];
    for (const entry of switched) {
      if (entry['active'] === undefined || !isObject(entry['adjustments'])) continue;
      const own = String(entry['name'] || name).toLowerCase().replace(/[^a-z]/g, '');
      const repeated = Object.keys(entry['adjustments']).filter(path => {
        const variant = /\[(.*)\]$/.exec(path)?.[1]?.toLowerCase().replace(/[^a-z]/g, '');
        return !!variant && !!own && (variant.includes(own) || own.includes(variant));
      });
      if (repeated.length) {
        problems.push(`${name}: the player turns it on while it applies, so its bonuses are plain paths: ${repeated.join(', ')} `
          + 'would show only as situational (write "melee.*.toHitBonus", not "melee.*.toHitBonus[vs. studied target]")');
      }
    }
    if (!options.classFeatures) continue;
    if (feature.active !== undefined) {
      problems.push(`${name}: a class feature does not show on the sheet, its toggle would hide it. Put "active" and the bonuses it turns on in the entry it gives (specialAttack, defensiveAbilities or specialQuality)`);
    }
    const shown = entriesGiven(feature).length > 0;
    const onlyBookkeeping = paths.every(path => BOOKKEEPING.test(path));
    if (!shown && !onlyBookkeeping) {
      problems.push(`${name} does not show on the sheet: give it an entry, ${DISPLAY_GUIDE}`);
    }
    for (const entry of entriesGiven(feature)) {
      if (entry['active'] !== undefined && typeof entry['active'] !== 'boolean') problems.push(`${name}: active is true or false`);
    }
    if (usesADay(textOf(feature)) && !feature.charges && !entriesGiven(feature).some(entry => entry['charges'])) {
      problems.push(`${name}: its text gives uses a day, which the sheet counts: give its entry "charges": {"total": <the uses this character has now>, "label": "rounds per day" or "per day"}`);
    }
  }
  return problems;
};

// a class feature the player switches on while it applies: an action to start it, a target studied, a stance, rounds
// a day (studied target, rage, smite, challenge, favored target)
const ACTIVATED = /\b(move|swift|standard|immediate|free) action\b|\bstance\b|\brounds? (per|a|each) day\b|\bwhile (in|using|active)\b|\bwhen (you|he|she|they) (activate|choose|use)s?\b/i;

const isEntryList = (path: string): boolean => (DISPLAY_LISTS as readonly string[]).includes(path);

// such a class feature as the sheet shows it: its entry (specialAttack, defensiveAbilities or specialQuality) with
// the toggle, off until the player turns it on, and its bonuses on the entry where the toggle switches them. what the
// AI wrote otherwise (no entry, the bonuses next to it, no toggle, a variant of its own situation) is put right
// instead of refused. a feature that is not switched on is as it was
export const toggledWhenActivated = (feature: Feature): Feature => {
  const name = feature.name || 'a feature';
  // switched on by its text (an action, a stance), or by the AI marking the entry it shows through, as the recipe
  // has it (the feature's own "active" is too often its can-turn-off, and would hide the entry)
  const declared = DISPLAY_LISTS.some(list => isObject(feature.adjustments?.[list]) && (feature.adjustments as any)[list].active !== undefined);
  if (!ACTIVATED.test(textOf(feature)) && !declared) return feature;
  const adjustments: {[path: string]: any} = {...(feature.adjustments || {})};
  const listed = DISPLAY_LISTS.find(list => isObject(adjustments[list]));
  const list = listed ?? 'specialAttack';
  const entry: {[key: string]: any} = listed ? {...adjustments[list]} : {name, description: feature.description || ''};
  const bonuses: {[path: string]: unknown} = isObject(entry['adjustments']) ? {...entry['adjustments']} : {};
  // the bonuses next to the entry move onto it, those only kept count of (a bonus feat) stay where they are
  for (const [path, value] of Object.entries(adjustments)) {
    if (isEntryList(path) || BOOKKEEPING.test(path)) continue;
    bonuses[path] = value;
    delete adjustments[path];
  }
  // a variant of its own situation would keep its bonuses off the sheet while it is on
  const own = String(entry['name'] || name).toLowerCase().replace(/[^a-z]/g, '');
  for (const path of Object.keys(bonuses)) {
    const variant = /^(.*)\[(.*)\]$/.exec(path);
    const situation = variant?.[2].toLowerCase().replace(/[^a-z]/g, '');
    if (variant && situation && own && (situation.includes(own) || own.includes(situation))) {
      bonuses[variant[1]] = bonuses[path];
      delete bonuses[path];
    }
  }
  // every bonus a variant of one situation (favored enemy's "[vs. undead]"): the toggle is that situation
  const situations = new Set(Object.keys(bonuses).map(path => /\[(.*)\]$/.exec(path)?.[1].trim().toLowerCase()));
  const plain = Object.keys(bonuses).map(path => path.replace(/\[.*\]$/, ''));
  if (situations.size === 1 && !situations.has(undefined) && new Set(plain).size === plain.length) {
    for (const path of Object.keys(bonuses)) {
      bonuses[path.replace(/\[.*\]$/, '')] = bonuses[path];
      delete bonuses[path];
    }
  }
  // with no bonuses at all there is nothing to switch: the checks say what is missing
  if (!Object.keys(bonuses).length) return feature;
  entry['adjustments'] = bonuses;
  // a class feature just added is off: the player turns it on when it applies (the AI turned favored enemy on)
  entry['active'] = false;
  adjustments[list] = entry;
  const {active, ...kept} = feature as Feature & {active?: boolean};
  return Object.assign(new Feature({...kept, adjustments}), {descriptionOnly: (feature as any).descriptionOnly});
};

// a class feature the player uses (a number of times a day, dice it rolls, an action) shows on the sheet even with no
// number to adjust: channel energy written description only showed nowhere. its entry gets the uses the AI put on
// the feature, where the sheet counts them. the list is guessed from the text when the AI gave none
const USED = /\b\d+d\d+\b|\bper day\b|\b(times|rounds?|uses?) (per|a|each) day\b|\/day\b|\b(move|swift|standard|immediate|free) action\b/i;
const DEFENSIVE = /\b(evasion|uncanny dodge|trap sense|immun|resist|damage reduction|saving throws?|saves?|armor class|AC)\b/i;
const ATTACKING = /\b(attacks?|damage|\d+d\d+)\b/i;
export const shownOnSheet = (feature: Feature): Feature => {
  const adjustments: {[path: string]: any} = {...(feature.adjustments || {})};
  const listed = DISPLAY_LISTS.find(list => isObject(adjustments[list]));
  const charges = feature.charges;
  if (listed) {
    if (!charges || adjustments[listed].charges) return feature;
    adjustments[listed] = {...adjustments[listed], charges};
  } else {
    const paths = Object.keys(adjustments);
    if (paths.length && paths.every(path => BOOKKEEPING.test(path))) return feature;
    const used = USED.test(textOf(feature).replace(/\b(spells?|orisons?|cantrips?|slots?)( of each level)? (per|a|each) day\b/gi, ''));
    if (!paths.length && !charges && !used) return feature;
    const text = textOf(feature);
    const list = ATTACKING.test(text) ? 'specialAttack' : DEFENSIVE.test(text) ? 'defensiveAbilities' : 'specialQuality';
    adjustments[list] = {name: feature.name, description: feature.description || '', ...(charges ? {charges} : {})};
  }
  const {charges: _, ...kept} = feature;
  return Object.assign(new Feature({...kept, adjustments}), {descriptionOnly: (feature as any).descriptionOnly});
};

// a domain gives a granted power at 1st level (Healing: Rebuke Death): a domain written with no power of its own left
// the power off the sheet. a power is a feature of its own, or an entry of the domain named for the power
const DOMAIN = /\bdomains?\b/i;
const CLASS_BASICS = /\b(aura|channel|orisons?|cantrips?|spontaneous|spells?|spellcasting|proficienc(y|ies)|languages?|domains?)\b/i;
export const domainProblems = (features: Feature[]): string[] => {
  const domains = features.filter(f => DOMAIN.test(f.name || ''));
  if (!domains.length) return [];
  // "Domains (Healing and Sun)" is two
  const wanted = domains.reduce((n, f) => n + Math.max(1, (f.name || '').split(/,|\band\b|\//).length), 0);
  const powers = features.filter(f => !CLASS_BASICS.test(f.name || '')).length
    + domains.filter(f => entriesGiven(f).some(entry => String(entry['name'] || '') && entry['name'] !== f.name)).length;
  return powers >= wanted ? [] : [`each domain gives a 1st-level granted power (Healing: Rebuke Death, Sun: Sun's Blessing), ${powers} of ${wanted} are here: add each as its own class feature with its entry and its uses a day, and keep the domain itself description only`];
};

// the features as they are kept: without the marks only the check reads
export const withoutMarks = (features: Feature[]): Feature[] => features.map(feature => {
  const {descriptionOnly, ...kept} = feature as Feature & {descriptionOnly?: unknown};
  return new Feature(kept);
});

// the refusal, with how to fix it: everything wrong at once, so one more call fixes all of it
export const mechanicsRefusal = (problems: string[]): {error: string, problems: string[], how: string} => ({
  error: 'nothing was changed: the features need their rules as adjustments, fix all of these and call again',
  problems,
  how: MECHANICS_GUIDE,
});

// how to turn a class's page into its class features, given where they are built (the class step of a creation, a
// level up): one feature per entry of the table's row for the level, each written by what it does. the AI guessed
// the shape feature by feature (sneak attack a level early as a blank quality, track without its minimum)
export const CLASS_FEATURE_RECIPE = [
  'Class features, from the class page looked up with focus "the table row and class features of level N": one feature',
  'per entry of that row, none from another row, each with "gained_at": N. Never write a formula: a number that grows',
  'goes in "grows", its value at each level where the class table or text changes it ({"<path>": {"1": 1, "5": 2, ...}}),',
  'and uses a day in "uses_by_level" ({"at": {"1": 4, "2": 6, ...}, "plus": "con", "label": "rounds"}): the app writes',
  'the formulas and the uses, and gives them back by level to check against the table. Write each feature by what it does:',
  '- always on: a plain path ("speed.land": 10);',
  '- only in a situation: a variant, "skills.survival.value[follow tracks]";',
  '- switched on by the player (a study, a stance, a judgment): its sheet entry with "active": false and the bonuses on it;',
  '- extra damage dice or another attack (sneak attack, smite): a specialAttack entry, its dice in the description;',
  '- a defense (evasion, uncanny dodge, trap sense): a defensiveAbilities entry; anything else shown a specialQuality one;',
  '- a choice (a domain, bloodline, rage power, bonus feat): ask the player, look the pick up, add what it gives;',
  '- no number at all: a description of its rules, never blank.',
  'Track (half level, minimum 1): {"name": "Track", "gained_at": 1, "description": "+1/2 level (min 1) to follow tracks",',
  '"adjustments": {"specialQuality": {"name": "Track", "description": "+1/2 level to Survival to follow tracks"}},',
  '"grows": {"skills.survival.value[follow tracks]": {"1": 1, "4": 2, "6": 3, "8": 4, "10": 5, "12": 6, "14": 7, "16": 8, "18": 9, "20": 10}}}.',
  'Studied Target (+1, +1 more at 5th and every 5 levels): {"name": "Studied Target", "gained_at": 1, "adjustments":',
  '{"specialAttack": {"name": "Studied Target", "description": "move action, one creature", "active": false}}, "grows":',
  '{"melee.*.toHitBonus": {"1": 1, "5": 2, "10": 3, "15": 4, "20": 5}, "melee.*.damageBonus": {"1": 1, "5": 2, "10": 3, "15": 4, "20": 5}}}',
  '(the same for ranged attacks and its skills). Rage: {"name": "Rage", "gained_at": 1, "uses_by_level": {"at": {"1": 4, "2": 6,',
  '"3": 8}, "plus": "con", "label": "rounds"}, "adjustments": {...}}. get_adjustment_reference examples has more.',
].join(' ');
