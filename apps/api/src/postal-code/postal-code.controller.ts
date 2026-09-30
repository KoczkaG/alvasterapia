import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PostalCodeService } from './postal-code.service';

@Controller('postal-codes')
export class PostalCodeController {
  constructor(private readonly postalCode: PostalCodeService) {}

  /**
   * GET /postal-codes/1145  →  { zip, city, alternatives }
   * A páciens-portál ezt hívja, amikor a felhasználó beírja az irányítószámot.
   */
  @Get(':zip')
  resolve(@Param('zip') zip: string) {
    const result = this.postalCode.resolve(zip);
    if (!result) {
      throw new NotFoundException({
        error: {
          code: 'ZIP_NOT_FOUND',
          message: 'Az irányítószám nem található. Kérjük, adja meg a települést kézzel.',
        },
      });
    }
    return result;
  }
}
