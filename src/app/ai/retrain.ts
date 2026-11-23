import {ApplyCharacterService} from '../apply-character.service';
import {Feature} from '../interfaces/character.interface';
import {formatProblems, hasErrors, validateFeature} from '../rules/adjustment-schema';
import {dependentsOf, unmetPrerequisitesOf, unqualifiedFeats} from '../rules/prerequisites';
import {RETRAIN_KINDS, RetrainDetail, retrainKindOf, retrainQuote} from '../rules/retraining';
import {
  RetrainResult, retrainAbilityIncrease, retrainArchetype, retrainClassLevel, retrainHitPoints, retrainLanguage,
  retrainSkillRanks, retrainSpellKnown, retrainable,
} from '../retraining';
import {archetypesFrom} from './archetypes';
import {editFeature} from './editors';
import {fromForm} from './feature-form';
import {parseJsonList} from './json-arg';
import {addClassLevel} from './level-up';
import {mechanicsProblems, normalizedFeature, withoutMarks} from './mechanics';
import {addSpells} from './spells';

// the AI's retrain tool (retraining.ts does the change, the sheet's retrain dialog does the same): one kind of
// retraining by the Ultimate Campaign rules, made at once with what it takes. never refused for its time, cost or
// rules (the table decides): the AI tells the player the days, the gold (the chat offers to pay it) and the warnings

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const listOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value.map(String) : text(value).split(/,|;/)).map(v => v.trim()).filter(Boolean);

const told = (result: RetrainResult & {[more: string]: unknown}, what: string): object => {
  if (!result.done || !result.quote) return result;
  return {
    ...result,
    // the chat shows a Pay button for it: the gold leaves the purse only if the player clicks it
    pay: {gp: result.quote.cost, what},
    tell: `Tell the player: ${result.quote.days} days of training and ${result.quote.cost} gp (${result.quote.notes.join('; ')}); `
      + 'the Pay button in the chat takes the gold from the purse, if they want it to'
      + (result.warnings?.length ? `; and what the rules say: ${result.warnings.join('; ')}` : ''),
  };
};

export const retrain = (service: ApplyCharacterService, args: {[name: string]: unknown}): object => {
  const kind = retrainKindOf(args['kind']);
  if (!kind) return {error: `kind is one of ${RETRAIN_KINDS.join(', ')}`};
  const detail: RetrainDetail = {
    ...(Number(args['features']) > 0 ? {features: Math.floor(Number(args['features']))} : {}),
    ...(args['synergy'] === true ? {synergy: true} : {}),
    ...(args['npc_class'] === true ? {npcClass: true} : {}),
    ...(args['no_trainer'] === true ? {noTrainer: true} : {}),
  };
  // what it would take, without changing anything (to tell the player before they decide)
  if (args['quote_only'] === true) return {quote: retrainQuote(service.raw(), kind, detail)};
  const raw = service.raw();
  const name = text(args['name']);

  if (kind === 'feat' || kind === 'class feature' || kind === 'racial trait') {
    const old = retrainable(raw, kind, name);
    if (!old) return {error: `the character has no ${kind} "${name}"`};
    if (!text(args['new_name'])) return {error: 'new_name is the name of what it is retrained into, with its description and adjustments as edit_feature takes them'};
    const before = service.applied();
    const oldName = old.name;
    return service.labelled(`retrain ${oldName} into ${text(args['new_name'])}`, () => {
      const changed = editFeature(service, {...args, name: oldName}) as {done?: string, error?: string};
      if (!changed.done) return changed;
      const now = retrainable(service.raw(), kind, old.id) ?? retrainable(service.raw(), kind, text(args['new_name']));
      const prerequisites = text(args['prerequisites']);
      const replaces = listOf(args['replaces']);
      if (now && (prerequisites || replaces.length)) {
        if (prerequisites && !/^none$/i.test(prerequisites)) now.prerequisites = prerequisites;
        if (replaces.length) now.replaces = replaces;
        service.update();
      }
      const warnings = [
        ...dependentsOf(before, {name: oldName}).map(n => `${n} has ${oldName} as a prerequisite: the rules retrain ${n} first`),
        ...(prerequisites && !/^none$/i.test(prerequisites) ? unmetPrerequisitesOf(service.applied(), prerequisites).map(p => `${text(args['new_name'])} needs ${p}`) : []),
        ...(kind === 'racial trait' && (old.replaces || []).join() !== replaces.join() ? [`a racial trait retrains into one replacing the same standard trait (${(old.replaces || []).join(', ') || 'none'})`] : []),
        ...unqualifiedFeats(service.applied()),
      ];
      return told({done: `retrained ${oldName} into ${text(args['new_name'])}`, quote: retrainQuote(service.raw(), kind, detail),
        ...(warnings.length ? {warnings} : {})}, `retraining ${oldName}`);
    });
  }
  if (kind === 'ability increase') {
    return told(retrainAbilityIncrease(service, Math.floor(Number(args['level'])), text(args['ability'])), 'retraining an ability increase');
  }
  if (kind === 'skill ranks') {
    const read = parseJsonList(args['moves'], 'moves');
    if (read.error) return {error: read.error};
    const moves = (Array.isArray(read.value) ? read.value : read.value ? [read.value] : [])
      .map((m: any) => ({from: text(m?.from), to: text(m?.to), ranks: Number(m?.ranks)}));
    if (!moves.length) return {error: 'moves is a JSON array of the ranks moved, [{"from": "climb", "to": "perception", "ranks": 1}]'};
    return told(retrainSkillRanks(service, moves), 'retraining skill ranks');
  }
  if (kind === 'hit points') {
    return told(retrainHitPoints(service, Number(args['level']) > 0 ? Math.floor(Number(args['level'])) : undefined), 'retraining hit points');
  }
  if (kind === 'language') return told(retrainLanguage(service, text(args['language']) || name), 'learning a language');
  if (kind === 'spells known') {
    const origin = text(args['caster']).toLowerCase();
    const level = Math.floor(Number(args['level']));
    return told(retrainSpellKnown(service, origin, level, name, () => addSpells(service, {...args, caster: origin})), `retraining ${name}`);
  }
  if (kind === 'class level') {
    const into = text(args['new_class']);
    if (!into) return {error: 'new_class is the class the level is retrained into, with its level as add_class_level takes it (features, rolled_hp, ...)'};
    return told(retrainClassLevel(service, text(args['class_name']) || name, () => addClassLevel(service, {...args, class_name: into}), detail),
      `retraining a ${text(args['class_name']) || name} level`);
  }
  // an archetype taken after the fact or given up: its record, the features it takes off and puts on
  const className = text(args['class_name']);
  const taken = archetypesFrom(args['archetypes'], className);
  if (taken.problems.length) return {error: 'nothing was changed', problems: taken.problems};
  const read = args['features'] === undefined || args['features'] === '' ? {value: []} : parseJsonList(args['features'], 'features');
  if ((read as {error?: string}).error) return {error: (read as {error: string}).error};
  const level = `{level.${className.toLowerCase()}}`;
  const problems: string[] = [];
  const add: {classLevel: number, feature: Feature}[] = [];
  for (const given of (Array.isArray(read.value) ? read.value : [read.value]).filter(Boolean)) {
    const written = normalizedFeature(given) ?? {};
    const at = Math.floor(Number(written.gained_at));
    if (!(at >= 1)) problems.push(`${written.name || 'a feature'}: gained_at is the ${className} level it comes at`);
    const form = fromForm(written as Feature, {level, className, classLevel: at || 1, applied: service.applied()});
    problems.push(...form.problems);
    delete written.gained_at;
    const [feature] = withoutMarks([new Feature({...written, adjustments: written.adjustments ?? {}})]);
    const invalid = validateFeature(JSON.parse(JSON.stringify(feature)), {reference: service.applied()}, feature.name || 'feature');
    if (hasErrors(invalid)) problems.push(formatProblems(invalid.filter(p => p.severity !== 'warning')));
    add.push({classLevel: at, feature});
  }
  problems.push(...mechanicsProblems(add.map(a => a.feature), {classFeatures: true}));
  if (problems.length) return {error: 'nothing was changed: fix every one of these, all in one call', problems};
  return told(retrainArchetype(service, className, {
    take: taken.archetypes, giveUp: listOf(args['give_up']), remove: listOf(args['remove_features']), add,
  }), `retraining ${className}'s archetype`);
};
