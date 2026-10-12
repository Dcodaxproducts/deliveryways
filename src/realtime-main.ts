import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { RealtimeAdapterReadinessService } from './realtime/realtime-adapter-readiness.service';
import { RealtimeAppModule } from './realtime/realtime-app.module';
import { RedisBoundedSocketIoAdapter } from './realtime/redis-bounded-socket-io.adapter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('RealtimeBootstrap');
  const app = await NestFactory.create(RealtimeAppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const config = app.get(ConfigService);
  const adapter = new RedisBoundedSocketIoAdapter(
    app,
    config.get<string>('REDIS_URL', 'redis://redis:6379'),
  );
  await adapter.connect();
  app.get(RealtimeAdapterReadinessService).register(adapter);
  app.useWebSocketAdapter(adapter);
  app.enableShutdownHooks();
  app.use((request: Request, response: Response, next: NextFunction): void => {
    if (
      request.path === '/health' ||
      request.path === '/ready' ||
      request.path.startsWith('/socket.io')
    ) {
      next();
      return;
    }
    response.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Realtime process exposes no API' },
      meta: {},
    });
  });
  app.enableCors({ origin: true, credentials: true });
  const port = config.get<number>('REALTIME_PORT', 3001);
  const host = config.get<string>('HOST', '0.0.0.0');
  const shutdown = async (): Promise<void> => {
    await app.close();
    await adapter.close();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
  await app.listen(port, host);
  logger.log('Realtime gateway listening on ' + host + ':' + port);
}

void bootstrap();
