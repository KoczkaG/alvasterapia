import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { patientFormSchema, type PatientForm } from '@somnoshop/shared';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PatientsService } from './patients.service';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  /**
   * GET /patients/search?birthDate=1956-03-22
   * GET /patients/search?partnerCode=P-000123
   * Régi ügyfél diszkrét előhívása (I/A 3. pont).
   */
  @Get('search')
  async search(
    @Query('birthDate') birthDate?: string,
    @Query('partnerCode') partnerCode?: string,
  ) {
    if (!birthDate && !partnerCode) {
      throw new BadRequestException({
        error: {
          code: 'MISSING_QUERY',
          message: 'Adjon meg születési dátumot vagy partnerkódot.',
        },
      });
    }
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_BIRTHDATE',
          message: 'A születési dátum formátuma: ÉÉÉÉ-HH-NN.',
        },
      });
    }
    return this.patients.searchPartner({ birthDate, partnerCode });
  }

  /**
   * POST /patients/form?channel=online|kiosk
   * Az online / tabletes adatlap beküldése. A hozzájárulás jogi metaadatait
   * (IP, user-agent, időbélyeg) a szerver tölti ki — a kliens nem adhatja meg.
   */
  @Post('form')
  async submit(
    @Body(new ZodValidationPipe(patientFormSchema)) form: PatientForm,
    @Query('channel') channel: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const resolvedChannel = channel === 'kiosk' ? 'kiosk' : 'online';
    const userAgent = req.headers['user-agent'] ?? 'unknown';

    return this.patients.submitForm(form, {
      channel: resolvedChannel,
      ip,
      userAgent: Array.isArray(userAgent) ? userAgent.join(' ') : userAgent,
    });
  }
}
