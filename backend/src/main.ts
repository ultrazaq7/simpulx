import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  // ── Redis WebSocket adapter (enables PM2 cluster mode) ──
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(configService);
  app.useWebSocketAdapter(redisIoAdapter);
  console.log(`🔄 Redis WebSocket adapter attached (pid: ${process.pid})`);

  // Security (disable CORP for uploads so frontend can read uploaded media)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Static uploads directory
  const uploadsDir =
    configService.get<string>('UPLOAD_DIR') ??
    configService.get<string>('UPLOADS_DIR', '/var/lib/simpulx/uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  // CORS
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3000');
  app.enableCors({
    origin: corsOrigins.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Global prefix
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['webhook/whatsapp'], // Webhook has no prefix
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger API documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Simpulx API')
    .setDescription('Omnichannel WhatsApp Business Platform API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('chat', 'Chat & messaging endpoints')
    .addTag('contacts', 'Contact management endpoints')
    .addTag('webhooks', 'WhatsApp webhook endpoints')
    .addTag('automation', 'Automation rules endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // Start server
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`Simpulx API running on http://localhost:${port} (pid: ${process.pid})`);
  console.log(`📚 API Docs at http://localhost:${port}/docs`);
}

bootstrap();
