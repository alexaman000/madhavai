import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SynthesizeSpeechDto } from './dto/synthesize-speech.dto';

export interface TtsResponse {
  success: boolean;
  audio: string; // Base64 encoded WAV audio
  format: string; // 'audio/wav'
  speaker: string;
  model: string;
  pace: number;
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly defaultSpeaker: string;
  private readonly defaultPace: number;
  private readonly defaultTemperature: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SARVAM_API_KEY', '');
    this.defaultModel = this.configService.get<string>('SARVAM_TTS_MODEL', 'bulbul:v3');
    this.defaultSpeaker = this.configService.get<string>('SARVAM_DEFAULT_SPEAKER', 'ratan');
    this.defaultPace = parseFloat(this.configService.get<string>('SARVAM_TTS_PACE', '0.90'));
    this.defaultTemperature = parseFloat(this.configService.get<string>('SARVAM_TTS_TEMPERATURE', '0.6'));

    if (this.apiKey) {
      this.logger.log(`✨ Sarvam AI Bulbul TTS initialized (Model: ${this.defaultModel}, Default Speaker: ${this.defaultSpeaker})`);
    } else {
      this.logger.warn('⚠️ SARVAM_API_KEY is not configured in backend environment.');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Pre-processes raw text for serene, natural spiritual delivery:
   * - Expands scripture citations (e.g. BG 2.47 -> श्रीमद्भगवद्गीता अध्याय २, श्लोक ४७)
   * - Strips markdown formatting, brackets, URLs
   * - Converts abrupt dashes and semicolons to natural breath pauses
   * - Adds respectful pauses after spiritual invocations
   */
  cleanAndFormatSpeechText(rawText: string, isHindi: boolean): string {
    if (!rawText || !rawText.trim()) return '';
    let text = rawText;

    // 1. Expand Scripture Verse citations into respectful spoken words
    if (isHindi) {
      text = text.replace(/\[?\bBG[- ]?([0-9]{1,2})[\.:]([0-9]{1,2})\]?/gi, 'श्रीमद्भगवद्गीता अध्याय $1, श्लोक $2, ');
      text = text.replace(/\[?\bBG[- ]?([0-9]{1,2})\]?/gi, 'श्रीमद्भगवद्गीता अध्याय $1, ');
    } else {
      text = text.replace(/\[?\bBG[- ]?([0-9]{1,2})[\.:]([0-9]{1,2})\]?/gi, 'Bhagavad Gita Chapter $1, Verse $2, ');
      text = text.replace(/\[?\bBG[- ]?([0-9]{1,2})\]?/gi, 'Bhagavad Gita Chapter $1, ');
    }

    // 2. Strip bracketed citation tags like [श्रीमद्भगवद्गीता]
    text = text.replace(/\[[^\]]+\]/g, '');

    // 3. Strip URLs
    text = text.replace(/http[s]?:\/\/\S+/g, '');

    // 4. Strip markdown formatting and bracket characters: * _ ` # ~ > ( ) [ ]
    text = text.replace(/[*#_`~>()[\]]/g, ' ');

    // 5. Replace dashes and semicolons with commas for natural breath pauses
    text = text.replace(/[—–-]{2,}/g, ', ');
    text = text.replace(/\s+[—–-]\s+/g, ', ');
    text = text.replace(/;/g, ', ');

    // 6. Convert bullet points and numbering into gentle thought transitions
    text = text.replace(/^\s*[-*•]\s*/gm, '');
    text = text.replace(/^\s*\d+\.\s*/gm, '');

    // 7. Conversational warm pauses after spiritual addresses
    if (isHindi) {
      text = text.replace(/(हे पार्थ|प्रिय मित्र|वत्स|हे अर्जुन)[!|।,]?\s*/gi, '$1, ');
    } else {
      text = text.replace(/(Dear friend|O Partha|O Arjuna)[!,]?\s*/gi, '$1, ');
    }

    // 8. Clean repetitive punctuation and normalize whitespace
    text = text.replace(/,\s*,+/g, ', ');
    text = text.replace(/[,\s]*,[,\s]*/g, ', ');
    text = text.replace(/\s+/g, ' ').trim();

    // 9. Enforce Sarvam max character limit (2500 chars)
    if (text.length > 2500) {
      text = text.substring(0, 2490) + '...';
    }

    return text;
  }

  hasDevanagari(text: string): boolean {
    return /[\u0900-\u097F]/.test(text);
  }

  /**
   * Synthesize natural speech using Sarvam AI Bulbul TTS API
   */
  async synthesize(dto: SynthesizeSpeechDto): Promise<TtsResponse> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Sarvam AI TTS provider is not configured. Please set SARVAM_API_KEY.');
    }

    const isHindi = dto.language?.startsWith('hi') || this.hasDevanagari(dto.text);
    const targetLanguageCode = isHindi ? 'hi-IN' : 'en-IN';
    const cleanText = this.cleanAndFormatSpeechText(dto.text, isHindi);

    if (!cleanText || cleanText.trim().length === 0) {
      throw new BadRequestException('Cleaned speech text is empty.');
    }

    const speaker = dto.speaker || this.defaultSpeaker;
    const model = dto.model || this.defaultModel;
    const pace = dto.pace ?? this.defaultPace;
    const temperature = dto.temperature ?? this.defaultTemperature;

    const payload = {
      text: cleanText,
      target_language_code: targetLanguageCode,
      speaker,
      model,
      pace,
      temperature,
      speech_sample_rate: 22050,
      output_audio_codec: 'wav',
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

    try {
      this.logger.log(`Synthesizing speech via Sarvam AI [Model: ${model}, Speaker: ${speaker}, Lang: ${targetLanguageCode}]`);
      const response = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'api-subscription-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMsg = errorBody.error?.message || errorBody.message || response.statusText;
        this.logger.error(`Sarvam API error (${response.status}): ${errorMsg}`);

        if (response.status === 401 || response.status === 403) {
          throw new ServiceUnavailableException('Sarvam AI authentication failed. Please check SARVAM_API_KEY.');
        } else if (response.status === 429) {
          throw new ServiceUnavailableException('Sarvam AI rate limit exceeded. Please try again shortly.');
        } else {
          throw new InternalServerErrorException(`Sarvam AI synthesis failed: ${errorMsg}`);
        }
      }

      const data = await response.json();
      if (!data.audios || data.audios.length === 0) {
        throw new InternalServerErrorException('Sarvam AI returned an empty audio response.');
      }

      const audioBase64 = data.audios[0];
      return {
        success: true,
        audio: audioBase64,
        format: 'audio/wav',
        speaker,
        model,
        pace,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        this.logger.error('Sarvam AI TTS request timed out after 20 seconds');
        throw new ServiceUnavailableException('Sarvam AI TTS request timed out.');
      }
      if (err instanceof ServiceUnavailableException || err instanceof BadRequestException || err instanceof InternalServerErrorException) {
        throw err;
      }
      this.logger.error(`Unexpected error during Sarvam TTS synthesis: ${err.message}`, err.stack);
      throw new InternalServerErrorException(`Speech synthesis error: ${err.message}`);
    }
  }

  /**
   * Return supported voices and spiritual guide presets
   */
  getAvailableSpeakers() {
    return {
      model: this.defaultModel,
      defaultSpeaker: this.defaultSpeaker,
      defaultPace: this.defaultPace,
      recommended: {
        spiritualGuideMale: 'ratan', // Soft, warm, calming, spiritually reassuring companion
        conversationalMale: 'dev',    // Friendly, gentle, reassuring
        reflectiveMale: 'kabir',      // Reverent, grounded, soulful
        gentleFemaleAlternative: 'priya', // Soft, caring, gentle Indian female
      },
      catalog: [
        { id: 'ratan', gender: 'male', description: 'Soft, warm, calming, emotionally reassuring companion (Default for Madhav)' },
        { id: 'dev', gender: 'male', description: 'Gentle, reassuring conversational tone' },
        { id: 'kabir', gender: 'male', description: 'Warm, meditative, respectful delivery' },
        { id: 'advait', gender: 'male', description: 'Wise, peaceful, contemplative spiritual guide' },
        { id: 'aditya', gender: 'male', description: 'Natural, clear conversational delivery' },
        { id: 'shubh', gender: 'male', description: 'Articulate, clear, balanced tone' },
        { id: 'ashutosh', gender: 'male', description: 'Mature, composed presence' },
        { id: 'priya', gender: 'female', description: 'Soft, compassionate, reassuring delivery' },
        { id: 'pooja', gender: 'female', description: 'Gentle, devotional delivery' },
      ],
    };
  }
}
