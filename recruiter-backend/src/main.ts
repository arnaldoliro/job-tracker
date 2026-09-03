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
  await app.listen(port);

  Logger.log(`Worker ouvindo em http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
