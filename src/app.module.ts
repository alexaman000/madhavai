import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { ChatModule } from './chat/chat.module';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ScripturesModule } from './scriptures/scriptures.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { TtsModule } from './tts/tts.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MemoryModule } from './memory/memory.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
    }),
    DatabaseModule,
    EmailModule,
    UsersModule,
    AuthModule,
    HealthModule,
    ChatModule,
    ScripturesModule,
    EmbeddingsModule,
    TtsModule,
    ConversationsModule,
    MemoryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
