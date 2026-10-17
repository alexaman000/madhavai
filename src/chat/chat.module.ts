import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ScripturesModule } from '../scriptures/scriptures.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { MemoryModule } from '../memory/memory.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RagService } from './rag.service';
import { GeminiLlmProvider } from './llm/gemini-llm.provider';

@Module({
  imports: [DatabaseModule, ScripturesModule, EmbeddingsModule, MemoryModule],
  controllers: [ChatController],
  providers: [ChatService, RagService, GeminiLlmProvider],
  exports: [ChatService, RagService, GeminiLlmProvider],
})
export class ChatModule {}
