import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ScripturesService } from './scriptures.service';
import {
  VerseResponseDto,
  ChapterSummaryDto,
  ScriptureSearchResponseDto,
} from './scriptures.interfaces';
import { SearchScripturesDto } from './dto/search-scriptures.dto';

@Controller('scriptures')
export class ScripturesController {
  constructor(private readonly scripturesService: ScripturesService) {}

  /**
   * POST /api/scriptures/search
   * Performs semantic vector search across the Bhagavad Gita scripture knowledge base.
   * Accepts { query: string, limit?: number, language?: string }
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(@Body() dto: SearchScripturesDto): Promise<ScriptureSearchResponseDto> {
    return this.scripturesService.search(dto);
  }

  /**
   * GET /api/scriptures/bhagavad-gita/chapters
   * Returns list of canonical chapters with Sanskrit, transliterated, and English titles.
   */
  @Get('bhagavad-gita/chapters')
  @HttpCode(HttpStatus.OK)
  async getChapters(): Promise<ChapterSummaryDto[]> {
    return this.scripturesService.getChapters('bhagavad-gita');
  }

  /**
   * GET /api/scriptures/bhagavad-gita/chapters/:chapter
   * Returns metadata and summary for a specific chapter.
   */
  @Get('bhagavad-gita/chapters/:chapter')
  @HttpCode(HttpStatus.OK)
  async getChapter(@Param('chapter') chapter: string): Promise<ChapterSummaryDto> {
    return this.scripturesService.getChapter('bhagavad-gita', chapter);
  }

  /**
   * GET /api/scriptures/bhagavad-gita/chapters/:chapter/verses/:verse
   * Retrieves an exact canonical verse with Sanskrit, IAST transliteration,
   * verification status, and all attributed translations.
   * Example: GET /api/scriptures/bhagavad-gita/chapters/2/verses/47
   */
  @Get('bhagavad-gita/chapters/:chapter/verses/:verse')
  @HttpCode(HttpStatus.OK)
  async getVerse(
    @Param('chapter') chapter: string,
    @Param('verse') verse: string,
  ): Promise<VerseResponseDto> {
    return this.scripturesService.getVerse('bhagavad-gita', chapter, verse);
  }
}
