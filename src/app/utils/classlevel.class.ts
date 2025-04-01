import { Feature } from  '../interfaces/character.interface';

export class ClassLevel {
  name: string = '';
  features: Feature[] = [];
  hitDice: number = 6;
  rolledHp:number = 0;
  classSkills: string[] = [];
  skillRanks: number = 0;
  startingWealth: number = 0;
  level: number = 1;

  constructor(initialValues?: Partial<ClassLevel>) {
    if(initialValues) Object.assign(this, initialValues)
  }
}
