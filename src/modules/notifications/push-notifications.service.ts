import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  App,
  cert,
  Credential,
  getApps,
  initializeApp,
  ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging, SendResponse } from 'firebase-admin/messaging';
import { NotificationAudience, NotificationType, Prisma } from '@prisma/client';

interface PushMessageInput {
  notificationId: string;
  audience: NotificationAudience;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Prisma.JsonValue | null;
  tokens: string[];
}

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private firebaseApp?: App;

  constructor(private readonly configService: ConfigService) {}

  async sendToTokens(input: PushMessageInput): Promise<string[]> {
    const app = this.getFirebaseApp();

    if (!app || input.tokens.length === 0) {
      return [];
    }

    const uniqueTokens = Array.from(new Set(input.tokens));
    const response = await getMessaging(app).sendEachForMulticast({
      tokens: uniqueTokens,
      notification: {
        title: input.title,
        body: input.body,
      },
      data: this.buildDataPayload(input),
      android: {
        priority: 'high',
      },
    });

    if (response.failureCount > 0) {
      this.logger.warn(
        `FCM push had ${response.failureCount} failure(s) for notification ${input.notificationId}`,
      );
    }

    return response.responses
      .map((item, index) =>
        item.success || !this.isInvalidTokenError(item.error)
          ? null
          : uniqueTokens[index],
      )
      .filter((token): token is string => !!token);
  }

  private getFirebaseApp(): App | undefined {
    if (this.firebaseApp) {
      return this.firebaseApp;
    }

    const serviceAccountJson = this.configService.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_JSON',
    );
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    const credential = serviceAccountJson
      ? this.buildCredentialFromJson(serviceAccountJson)
      : this.buildCredentialFromParts(projectId, clientEmail, privateKey);

    if (!credential) {
      this.logger.warn(
        'Firebase push is disabled because Firebase credentials are missing',
      );
      return undefined;
    }

    const existingApp = getApps()[0];
    this.firebaseApp =
      existingApp ??
      initializeApp({
        credential,
      });

    return this.firebaseApp;
  }

  private buildCredentialFromJson(
    serviceAccountJson: string,
  ): Credential | undefined {
    try {
      return cert(JSON.parse(serviceAccountJson) as ServiceAccount);
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Invalid FIREBASE_SERVICE_ACCOUNT_JSON',
      );
      return undefined;
    }
  }

  private buildCredentialFromParts(
    projectId?: string,
    clientEmail?: string,
    privateKey?: string,
  ): Credential | undefined {
    if (!projectId || !clientEmail || !privateKey) {
      return undefined;
    }

    return cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    });
  }

  private buildDataPayload(input: PushMessageInput): Record<string, string> {
    const data: Record<string, string> = {
      notificationId: input.notificationId,
      audience: input.audience,
      type: input.type,
      title: input.title,
    };

    if (this.isObjectPayload(input.payload)) {
      for (const [key, value] of Object.entries(input.payload)) {
        data[key] =
          typeof value === 'string' ? value : JSON.stringify(value ?? '');
      }
    }

    return data;
  }

  private isObjectPayload(
    payload: Prisma.JsonValue | null | undefined,
  ): payload is Prisma.JsonObject {
    return !!payload && typeof payload === 'object' && !Array.isArray(payload);
  }

  private isInvalidTokenError(error: SendResponse['error']): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) {
      return false;
    }

    const code = String((error as { code?: unknown }).code);

    return (
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered'
    );
  }
}
