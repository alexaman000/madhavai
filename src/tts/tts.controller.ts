import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { TtsService, TtsResponse } from './tts.service';
import { SynthesizeSpeechDto } from './dto/synthesize-speech.dto';

@Controller('tts')
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @Post('synthesize')
  @HttpCode(HttpStatus.OK)
  async synthesize(@Body() dto: SynthesizeSpeechDto): Promise<TtsResponse> {
    return this.ttsService.synthesize(dto);
  }

  @Post('speak')
  @HttpCode(HttpStatus.OK)
  async speak(@Body() dto: SynthesizeSpeechDto): Promise<TtsResponse> {
    return this.ttsService.synthesize(dto);
  }

  @Get('speakers')
  getSpeakers() {
    return this.ttsService.getAvailableSpeakers();
  }
}
