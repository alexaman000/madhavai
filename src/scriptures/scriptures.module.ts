import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { ScripturesController } from './scriptures.controller';
import { ScripturesService } from './scriptures.service';
import { ScriptureImportService } from './scripture-import.service';

@Module({
  imports: [DatabaseModule, EmbeddingsModule],
  controllers: [ScripturesController],
  providers: [ScripturesService, ScriptureImportService],
  exports: [ScripturesService, ScriptureImportService],
})
export class ScripturesModule {}
