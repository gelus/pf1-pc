import { Pipe, PipeTransform } from '@angular/core';
import { evaluateVal } from './utils/object.util';

@Pipe({
  name: 'evaluateValue'
})
export class EvaluateValuePipe implements PipeTransform {

  transform(value: string|number, ob: any): number {
    return evaluateVal(value.toString(), ob);
  }

}
