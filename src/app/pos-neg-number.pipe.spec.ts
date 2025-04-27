import { PosNegNumberPipe } from './pos-neg-number.pipe';

describe('PosNegNumberPipe', () => {
  it('create an instance', () => {
    const pipe = new PosNegNumberPipe();
    expect(pipe).toBeTruthy();
  });
});
