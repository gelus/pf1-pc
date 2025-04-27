import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'posNegNumber'
})
export class PosNegNumberPipe implements PipeTransform {

  transform(value: number): string {
    return `${value >= 0 ?'+':'-'}${value}`;
  }

}
