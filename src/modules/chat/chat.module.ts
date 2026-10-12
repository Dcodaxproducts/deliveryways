import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ChatController } from './chat.controller';
import { ChatRealtimeService } from './chat.realtime.service';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';

@Module({
  imports: [StorageModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, ChatRealtimeService],
  exports: [ChatService, ChatRealtimeService],
})
export class ChatModule {}
