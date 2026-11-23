import {FLY_MANEUVERABILITY, Feature} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {RuleModule, ruleFeature} from './rule-module';

// what the rules attach to a creature's speeds (Core Rulebook, the Climb, Swim and Fly skills; Bestiary, universal
// monster rules), whatever gives them (a race, a class feature, a spell, a form):
//  - a climb speed gives a +8 racial bonus on Climb checks (and it can always take 10 on them)
//  - a swim speed gives a +8 racial bonus on Swim checks (it can always take 10, and use the run action in a line)
//  - a fly speed's maneuverability adjusts its Fly checks: clumsy -8, poor -4, average +0, good +4, perfect +8

// the best maneuverability its features gave: given as text it can come more than once ("poor good")
export const maneuverabilityOf = (char: Pick<Character, 'flyManeuverability'>): string | undefined => {
  const named = String(char.flyManeuverability || '').toLowerCase().split(/[^a-z]+/).filter(word => word in FLY_MANEUVERABILITY);
  return named.sort((a, b) => FLY_MANEUVERABILITY[b] - FLY_MANEUVERABILITY[a])[0];
};

export const movementRule: RuleModule = {
  name: 'movement',
  // the speeds as every other feature left them
  final(_raw, applied): Feature[] {
    const speed = applied.speed || {};
    const features: Feature[] = [];
    if ((Number(speed.climb) || 0) > 0) {
      features.push(ruleFeature('climb speed', {'skills.climb.value': {value: 8, type: 'racial'}}));
    }
    if ((Number(speed.swim) || 0) > 0) {
      features.push(ruleFeature('swim speed', {'skills.swim.value': {value: 8, type: 'racial'}}));
    }
    const maneuverability = (Number(speed.fly) || 0) > 0 ? maneuverabilityOf(applied) : undefined;
    if (maneuverability && FLY_MANEUVERABILITY[maneuverability]) {
      features.push(ruleFeature(`${maneuverability} maneuverability`, {'skills.fly.value': FLY_MANEUVERABILITY[maneuverability]}));
    }
    return features;
  },
};
