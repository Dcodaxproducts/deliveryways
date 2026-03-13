import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compressionModule from 'compression';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters';
import { ResponseInterceptor } from './common/interceptors';

const compression: typeof import('compression') = (
  'default' in compressionModule ? compressionModule.default : compressionModule
) as typeof import('compression');

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    const configService = app.get(ConfigService);

    // Security
    app.use(
      helmet({
        // Swagger UI requires inline scripts/styles and can render a blank page with strict CSP
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      }),
    );
    app.use(compression());

    // CORS
    app.enableCors({
      origin: true,
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

    const host = configService.get<string>('HOST', '0.0.0.0');
    const port = configService.get<number>('PORT', 3000);

    await app.listen(port, host);

    logger.log(`✅ Server started successfully on ${host}:${port}`);
    logger.log(`🌐 API Base URL: http://${host}:${port}/api/v1`);
    logger.log(`📚 Swagger docs: http://${host}:${port}/docs`);
  } catch (error) {
    const message =
      error instanceof Error
        ? (error.stack ?? error.message)
        : 'Unknown startup error';
    logger.error(`❌ Server startup failed: ${message}`);
    process.exit(1);
  }
}

void bootstrap();
