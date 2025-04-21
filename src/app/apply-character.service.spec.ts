import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from './apply-character.service';

describe('ApplyCharacterService', () => {
  let service: ApplyCharacterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
