// >>> SANAD-BRANDS: the AI first draft (Task 4 fills write()).
import { Injectable } from '@nestjs/common';
import type { Draft, DraftInput } from '@gitroom/helpers/brands/idea.rules';

@Injectable()
export class BrandDraftService {
  async write(_input: DraftInput): Promise<Draft | null> {
    return null;
  }
}
// <<< SANAD-BRANDS
