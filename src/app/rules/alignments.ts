import {Alignment} from '../interfaces/character.interface';

// the nine alignments (core rulebook, chapter 7, alignment), summed up from
// https://www.d20pfsrd.com/alignment-description/additional-rules/
// the chart lays them out with law to chaos across and good to evil down
export interface AlignmentInfo {
  id: Alignment;
  name: string;
  description: string;
}

export const ALIGNMENTS: Record<Alignment, AlignmentInfo> = {
  LG: {id: 'LG', name: 'Lawful Good', description:
    'Honor with compassion: acts as a good person is expected to, keeps its word, helps those in need and opposes evil '
    + 'with discipline. It works within the law and changes unjust laws rather than break them.'},
  NG: {id: 'NG', name: 'Neutral Good', description:
    'Does what is good and right without a bias for or against order. It helps others, works with authorities when '
    + 'that helps, and ignores unjust laws and tyrants when it does not.'},
  CG: {id: 'CG', name: 'Chaotic Good', description:
    'A good heart with a free spirit: follows its own conscience with little regard for laws or what others expect. '
    + 'Kind and benevolent, it resents being bullied and trusts that people do good when left free.'},
  LN: {id: 'LN', name: 'Lawful Neutral', description:
    'Reliable and honorable without being a zealot: acts by the law, tradition or a personal code. It values order and '
    + 'organization, without leaning to good or evil.'},
  N: {id: 'N', name: 'Neutral', description:
    'Acts naturally, without prejudice or compulsion, doing what seems a good idea at the time. It feels no strong pull '
    + 'toward good or evil, law or chaos, and some hold the balance between them as a philosophy.'},
  CN: {id: 'CN', name: 'Chaotic Neutral', description:
    'Free of both society\'s rules and a do-gooder\'s zeal: an individualist who follows its whims and prizes its own '
    + 'liberty. It is unpredictable, but neither random nor out to tear society down.'},
  LE: {id: 'LE', name: 'Lawful Evil', description:
    'Methodical, organized evil: takes what it wants within a code of conduct, caring for order, loyalty and tradition '
    + 'but not for the freedom or lives of others. It keeps its promises and is at home in a hierarchy.'},
  NE: {id: 'NE', name: 'Neutral Evil', description:
    'Pure evil without honor or variation: does whatever it can get away with, caring only for itself and feeling no '
    + 'remorse. It has no use for laws or codes, and is colder and less impulsive than chaotic evil.'},
  CE: {id: 'CE', name: 'Chaotic Evil', description:
    'Destruction of life, beauty and the order they rest on: driven by greed, hatred and bloodlust. It is vicious, '
    + 'unpredictable and seldom organized, swept along by its passions.'},
};

// the chart's rows (good, neutral, evil), each from lawful to chaotic
export const ALIGNMENT_CHART: Alignment[][] = [
  ['LG', 'NG', 'CG'],
  ['LN', 'N', 'CN'],
  ['LE', 'NE', 'CE'],
];
export const ALIGNMENT_COLUMNS = ['Lawful', 'Neutral', 'Chaotic'];
export const ALIGNMENT_ROWS = ['Good', 'Neutral', 'Evil'];

// "Lawful Good: Honor with ..." for a tooltip; an alignment the chart does not know shows as it is
export function alignmentTooltip(alignment: string | undefined): string {
  const info = ALIGNMENTS[alignment as Alignment];
  return info ? `${info.name}: ${info.description}` : alignment || 'No alignment';
}

// the full name of an alignment, "Lawful Good" for LG
export function alignmentName(alignment: string | undefined): string {
  return ALIGNMENTS[alignment as Alignment]?.name || alignment || 'No alignment';
}
