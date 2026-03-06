import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression = require('compression');
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters';
import { ResponseInterceptor } from './common/interceptors';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    const configService = app.get(ConfigService);

    // Security
    app.use(helmet());
    app.use(compression());

    // CORS
    app.enableCors({
      origin: configService.get<string>('CORS_ORIGINS', '*').split(','),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    });

    // Global prefix
    app.setGlobalPrefix('api/v1');

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

    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());

    // Swagger
    if (configService.get<string>('NODE_ENV') !== 'production') {
      const swaggerConfig = new DocumentBuilder()
        .setTitle('DeliveryWays API')
        .setDescription('DeliveryWays Backend API Documentation')
        .setVersion('1.0')
        .addBearerAuth()
        .build();

      const document = SwaggerModule.createDocument(app, swaggerConfig);
      SwaggerModule.setup('docs', app, document);
    }

    const port = configService.get<number>('PORT', 3000);

    await app.listen(port);

    logger.log(`✅ Server started successfully on port ${port}`);
    logger.log(`🌐 API Base URL: http://localhost:${port}/api/v1`);
    logger.log(`📚 Swagger docs: http://localhost:${port}/docs`);
  } catch (error) {
    const message =
      error instanceof Error ? error.stack ?? error.message : 'Unknown startup error';
    logger.error(`❌ Server startup failed: ${message}`);
    process.exit(1);
  }
}

void bootstrap();
