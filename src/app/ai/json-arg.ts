// the JSON the AI writes in a tool's string argument (tools take no free-form objects with every provider). the AI
// often gets the JSON right and then runs on past its end ("[...]}" or "[...],good_saves:"), and sends the same
// broken call again when told: what it meant is the first whole JSON value, so that is what is read, and only when
// there is none is it refused

// the end of the JSON value starting at the first character, or -1 when it does not close
const endOfValue = (text: string): number => {
  const open = text[0];
  if (open !== '[' && open !== '{') return -1;
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') stack.push(c === '[' ? ']' : '}');
    else if (c === ']' || c === '}') {
      if (stack.pop() !== c) return -1;
      if (!stack.length) return i;
    }
  }
  return -1;
};

export const parseJsonArg = (value: unknown, what: string): {value?: any, error?: string} => {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'string') return {value};
  const text = value.trim();
  try {
    return {value: JSON.parse(text)};
  } catch (e) {
    const end = endOfValue(text);
    if (end > 0) {
      try {
        return {value: JSON.parse(text.slice(0, end + 1))};
      } catch { /* not JSON even up to its end */ }
    }
    return {error: `${what} is not valid JSON: ${(e as Error).message}. Write it again as plain JSON, nothing after its last bracket`};
  }
};

// a list the AI wrote: a JSON array as a string, an array, or an array of JSON strings (it sends each element as
// its own JSON when the declaration says the argument is a string)
// the values of a string that holds more than one, comma separated ("{...}, {...}"), else undefined
const severalValues = (text: string): unknown[] | undefined => {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return undefined;
  try { JSON.parse(trimmed); return undefined; } catch { /* not one value */ }
  try {
    const values = JSON.parse(`[${trimmed}]`);
    return Array.isArray(values) && values.length > 1 ? values : undefined;
  } catch { return undefined; }
};

export const parseJsonList = (value: unknown, what: string): {value?: any, error?: string} => {
  const read = parseJsonArg(value, what);
  if (read.error || !Array.isArray(read.value)) return read;
  const items: unknown[] = [];
  for (const item of read.value) {
    // (an element that is several values, "{...}, {...}", is all of them: read as its first one, a kit of six items
    // was priced as its first, 0 gp)
    const several = typeof item === 'string' ? severalValues(item) : undefined;
    if (several) { items.push(...several); continue; }
    const one = typeof item === 'string' ? parseJsonArg(item, `an element of ${what}`) : {value: item};
    if (one.error) return {error: one.error};
    items.push(one.value);
  }
  return {value: items};
};
