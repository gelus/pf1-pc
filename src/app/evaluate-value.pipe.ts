import { Pipe, PipeTransform } from '@angular/core';
import { evaluateVal } from './utils/object.util';

@Pipe({
  name: 'evaluateValue'
})
export class EvaluateValuePipe implements PipeTransform {

  transform(value: any, ob: any): number | string {
    if (value === 'auto-fail' || value === 'half') return value;
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'string') {
      const evaluated = evaluateVal(value, ob);
      return Number.isNaN(evaluated) ? value : evaluated;
    }
    return String(value ?? '');
  }

}
