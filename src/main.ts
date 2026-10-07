import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

async function bootstrap() {
  const logger = new Logger('MadhavBackend');
  const app = await NestFactory.create(AppModule, { logger: ['warn', 'error', 'log'] });

  // Set global API prefix (/api)
  app.setGlobalPrefix('api');

  // Enable CORS for development
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Enable global DTO validation & transformation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  // Listen on 0.0.0.0 so local network devices (e.g. physical Android phone) can connect
  await app.listen(port, '0.0.0.0');

  logger.log(`=================================================================`);
  logger.log(`🕉️  Madhav.ai Backend running at: http://localhost:${port}/api`);
  logger.log(`📱 Physical Phone Access: http://<YOUR_LOCAL_IP>:${port}/api`);
  logger.log(`=================================================================`);
}

bootstrap();
