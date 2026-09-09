import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const configService = new ConfigService();
const databaseUrl = configService.get<string>('DATABASE_URL');

if (!databaseUrl) {
  throw new InternalServerErrorException(
    'P0 acceptance tests require DATABASE_URL',
  );
}

const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = parsedDatabaseUrl.pathname.replace(/^\//, '');
const isLocalHost = ['127.0.0.1', 'localhost'].includes(
  parsedDatabaseUrl.hostname,
);

if (!isLocalHost || !databaseName.endsWith('_acceptance')) {
  throw new InternalServerErrorException(
    'P0 acceptance tests refuse non-local or non-acceptance databases',
  );
}
