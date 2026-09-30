import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // A páciens-portál (külön origin) számára engedélyezett CORS.
  app.enableCors({
    origin: process.env.PORTAL_ORIGIN?.split(',') ?? true,
  });

  // A DTO-validációt a Zod-alapú ZodValidationPipe végzi végpontonként
  // (lásd common/zod-validation.pipe.ts), így nincs szükség globális
  // class-validator alapú ValidationPipe-ra.

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API elindult: http://localhost:${port}`);
}

void bootstrap();
