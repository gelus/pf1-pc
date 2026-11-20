import {parseJsonArg, parseJsonList} from './json-arg';

// the AI writes the JSON right and runs on past its end: what it meant is the first whole value
describe('JSON arguments', () => {
  it('reads plain JSON, an object given as is, and nothing', () => {
    expect(parseJsonArg('{"a": 1}', 'x')).toEqual({value: {a: 1}});
    expect(parseJsonArg({a: 1}, 'x')).toEqual({value: {a: 1}});
    expect(parseJsonArg('', 'x')).toEqual({});
  });

  it('reads the first whole value of JSON the AI ran on past', () => {
    expect(parseJsonArg('[{"name": "Bonus Feat"}],good_saves:', 'features').value).toEqual([{name: 'Bonus Feat'}]);
    expect(parseJsonArg('[{"name": "a ] in [ text"}]}', 'features').value).toEqual([{name: 'a ] in [ text'}]);
  });

  it('reads a list of JSON strings as the list of what they hold', () => {
    expect(parseJsonList(['{"name": "Bonus Feat"}', {name: 'Bravery'}], 'features').value).toEqual([{name: 'Bonus Feat'}, {name: 'Bravery'}]);
    expect(parseJsonList('[{"name": "Track"}]', 'features').value).toEqual([{name: 'Track'}]);
  });

  it('refuses what is not JSON, saying how to write it', () => {
    expect(parseJsonArg('[{"name": }]', 'features').error).toContain('features is not valid JSON');
    expect(parseJsonArg('[{"name": "x"}', 'features').error).toContain('nothing after its last bracket');
  });
});
