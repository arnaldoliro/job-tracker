import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });

  const port = config.get('PORT', { infer: true });
  const host = config.get('API_HOST', { infer: true });

  // Com host explícito: o padrão do Nest é 0.0.0.0, e esta API não tem
  // autenticação. Ver `API_HOST` em config/env.ts.
  await app.listen(port, host);

  Logger.log(`Worker ouvindo em http://${host}:${port}`, 'Bootstrap');
}

void bootstrap();
