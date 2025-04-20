export interface SourceObj<init> {
  value: init;
  origin: string;
  type?: string;
  operand?: string;
}

export type SourceItem<init> = init | SourceObj<init>;

export type Source<init> = init | SourceItem<init>[];

export const getByPath = (obj: any, path:string): any => path.split('.').reduce((cur, path) => cur[path], obj)

export const assignByPath = (obj: any, path:string|string[], val:any) => {
  const arPath = Array.isArray(path) ? path : path.split('.');
  const key: string = arPath.shift() as string;
  if (arPath.length === 0) {
    if (typeof obj[key] === 'undefined') obj[key] = (val.value ?? val);
    else if (typeof obj[key] === 'number') obj[key] += (val.value ?? val);
    else if (typeof obj[key] === 'string') obj[key] += ' ' + (val.value ?? val);
    else if (Array.isArray(obj[key])) obj[key].push(val.value ?? val);
  } else {
    if (key === '*' && Array.isArray(obj)) {
      for (let t of obj) assignByPath(t, arPath, val)
    } else assignByPath(obj[key], arPath, val) ;
  }
}
