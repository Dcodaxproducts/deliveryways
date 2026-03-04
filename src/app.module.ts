import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { DatabaseModule } from './database/database.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // CLS (Continuation Local Storage) for request-scoped context
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
      },
    }),

    // Database
    DatabaseModule,

    // Feature Modules (add as created)
  ],
})
export class AppModule {}
