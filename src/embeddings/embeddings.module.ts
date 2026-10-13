import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EmbeddingsService } from './embeddings.service';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider';

@Module({
  imports: [DatabaseModule],
  providers: [EmbeddingsService, GeminiEmbeddingProvider],
  exports: [EmbeddingsService, GeminiEmbeddingProvider],
})
export class EmbeddingsModule {}
