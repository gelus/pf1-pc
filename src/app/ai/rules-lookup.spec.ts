import {AiPageRequest, AiPageResult, AiProvider} from './ai-provider';
import {aonUrls, clearLookups, isRuleSite, lookUpRule, nameVariants} from './rules-lookup';

describe('rules lookup', () => {
  beforeEach(() => clearLookups());

  // a provider that reads pages by answering with what it is given, and keeps what it was asked
  const reader = (answer: string, read = true) => {
    const asked: AiPageRequest[] = [];
    const provider: AiProvider = {
      name: 'fake',
      startSession: () => ({send: async () => ({text: '', toolCalls: []})}),
      readPages: async (request): Promise<AiPageResult> => {
        asked.push(request);
        return {text: answer, pages: request.urls.map(url => ({url, read}))};
      },
    };
    return {provider, asked};
  };

  it('tries the name as written and without a bonus or a feat type', () => {
    expect(nameVariants(' Cloak of  Resistance +1 ')).toEqual(['Cloak of Resistance +1', 'Cloak of Resistance']);
    expect(nameVariants('Power Attack (Combat)')).toEqual(['Power Attack (Combat)', 'Power Attack']);
    expect(nameVariants('Bless')).toEqual(['Bless']);
  });

  it('tries the Archives of Nethys pages of the kind, or of every kind, 20 at most', () => {
    expect(aonUrls('Bless', 'spell')).toEqual(['https://aonprd.com/SpellDisplay.aspx?ItemName=Bless']);
    expect(aonUrls('Power Attack', 'feat')).toEqual(['https://aonprd.com/FeatDisplay.aspx?ItemName=Power%20Attack']);
    const all = aonUrls('Cloak of Resistance +1');
    expect(all.length).toBeLessThanOrEqual(20);
    expect(all).toContain('https://aonprd.com/EquipmentMiscDisplay.aspx?ItemName=Cloak%20of%20Resistance');
    expect(aonUrls('Cloak of Resistance', 'magic item')).toEqual([]);
  });

  it('asks for a link to a magic item at once, without reading anything', async () => {
    const {provider, asked} = reader('FOUND');
    const result = await lookUpRule(provider, {name: 'Cloak of Resistance', kind: 'magic item'});
    expect(asked).toEqual([]);
    expect(result.found).toBeFalse();
    expect(result.hint).toContain('a magic item can not be found by name');
  });

  it('reads only the rules sites', () => {
    expect(isRuleSite('https://www.d20pfsrd.com/feats/combat-feats/power-attack-combat/')).toBeTrue();
    expect(isRuleSite('https://aonprd.com/FeatDisplay.aspx?ItemName=Dodge')).toBeTrue();
    expect(isRuleSite('https://example.com/aonprd.com')).toBeFalse();
    expect(isRuleSite('not a url')).toBeFalse();
  });

  it('gives the rules text and the page it is on', async () => {
    const {provider, asked} = reader('FOUND https://aonprd.com/SpellDisplay.aspx?ItemName=Bless\nBless\nSchool enchantment');
    const result = await lookUpRule(provider, {name: 'Bless', kind: 'spell'});
    expect(result).toEqual({found: true, url: 'https://aonprd.com/SpellDisplay.aspx?ItemName=Bless', text: 'Bless\nSchool enchantment'});
    expect(asked[0].urls).toEqual(['https://aonprd.com/SpellDisplay.aspx?ItemName=Bless']);
    expect(asked[0].instructions).toContain('"Bless"');
  });

  it('reads a page found once only, a lookup not found is tried again', async () => {
    const {provider, asked} = reader('FOUND https://aonprd.com/SpellDisplay.aspx?ItemName=Bless\nBless');
    await lookUpRule(provider, {name: 'Bless', kind: 'spell'});
    expect((await lookUpRule(provider, {name: 'bless', kind: 'spell'})).found).toBeTrue();
    expect(asked.length).toBe(1);
    const missing = reader('NOT FOUND');
    await lookUpRule(missing.provider, {name: 'Nothing', kind: 'feat'});
    await lookUpRule(missing.provider, {name: 'Nothing', kind: 'feat'});
    expect(missing.asked.length).toBe(2);
  });

  it('reads the page of a link, and keeps no link the model made up', async () => {
    const link = 'https://www.d20pfsrd.com/magic-items/wondrous-items/c-d/cloak-of-resistance/';
    const {provider, asked} = reader('**FOUND** https://evil.example.com/x\nAura faint abjuration');
    const result = await lookUpRule(provider, {url: link});
    expect(asked[0].urls).toEqual([link]);
    expect(asked[0].instructions).toContain('Read the Pathfinder 1st edition rules on the page below');
    expect(result.url).toBe(link);
  });

  it('says what it tried and to ask for a link when nothing has it', async () => {
    const {provider} = reader('NOT FOUND');
    const result = await lookUpRule(provider, {name: 'Mask of Virtue', kind: 'feat'});
    expect(result.found).toBeFalse();
    expect(result.tried).toEqual(['https://aonprd.com/FeatDisplay.aspx?ItemName=Mask%20of%20Virtue']);
    expect(result.hint).toContain('Ask the player for a link');
  });

  it('refuses other sites, and a provider that can not read pages', async () => {
    const {provider} = reader('FOUND');
    expect((await lookUpRule(provider, {url: 'https://example.com/feat'})).error).toContain('only pages of aonprd.com and d20pfsrd.com');
    expect((await lookUpRule(provider, {})).error).toContain('give the name');
    expect((await lookUpRule({name: 'x', startSession: provider.startSession}, {name: 'Bless'})).error).toBe('this AI can not read web pages');
  });
});
