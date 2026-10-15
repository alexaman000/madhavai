import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SynthesizeSpeechDto } from './dto/synthesize-speech.dto';
import { SpeechNormalizer, DeliveryConfig, PreparedSpeech } from './speech-normalizer';

export interface TtsResponse {
  success: boolean;
  audio: string; // Base64 encoded WAV audio
  format: string; // 'audio/wav'
  speaker: string;
  model: string;
  pace: number;
  temperature: number;
  deliveryStyle: string;
  totalChunks: number;
  currentChunkIndex: number;
  chunkText: string;
  chunks: string[];
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
    this.defaultSpeaker = this.configService.get<string>('SARVAM_DEFAULT_SPEAKER', 'shubh');
    this.defaultPace = parseFloat(this.configService.get<string>('SARVAM_TTS_PACE', '0.90'));
    this.defaultTemperature = parseFloat(this.configService.get<string>('SARVAM_TTS_TEMPERATURE', '0.70'));

    if (this.apiKey) {
      this.logger.log(`✨ Sarvam AI Bulbul TTS initialized (Model: ${this.defaultModel}, Default Speaker: ${this.defaultSpeaker}, Pace: ${this.defaultPace}, Temp: ${this.defaultTemperature})`);
    } else {
      this.logger.warn('⚠️ SARVAM_API_KEY is not configured in backend environment.');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Dedicated speech preparation: cleans, classifies delivery style, and segments into chunks
   */
  prepareSpeech(text: string, language?: string): PreparedSpeech {
    return SpeechNormalizer.prepare(text, language);
  }

  /**
   * Synthesize natural speech using Sarvam AI Bulbul v3 TTS API
   */
  async synthesize(dto: SynthesizeSpeechDto): Promise<TtsResponse> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Sarvam AI TTS provider is not configured. Please set SARVAM_API_KEY.');
    }

    // 1. Prepare speech: clean, classify, and segment
    const prepared = this.prepareSpeech(dto.text, dto.language);
    const { chunks, delivery, language } = prepared;

    if (!chunks || chunks.length === 0) {
      throw new BadRequestException('Cleaned speech text is empty.');
    }

    // Determine target chunk to synthesize
    const chunkIdx = typeof dto.chunkIndex === 'number' && dto.chunkIndex >= 0 && dto.chunkIndex < chunks.length
      ? dto.chunkIndex
      : 0;
    const textToSynthesize = chunks[chunkIdx];

    // Select parameters (allow DTO override, else context-aware delivery style, else default)
    const speaker = dto.speaker || this.defaultSpeaker;
    const model = dto.model || this.defaultModel;
    const pace = dto.pace ?? delivery.pace ?? this.defaultPace;
    const temperature = dto.temperature ?? delivery.temperature ?? this.defaultTemperature;

    // Documented Bulbul v3 request payload
    const payload = {
      text: textToSynthesize,
      target_language_code: language,
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
      this.logger.log(
        `Synthesizing chunk [${chunkIdx + 1}/${chunks.length}] via Sarvam AI [Model: ${model}, Speaker: ${speaker}, Style: ${delivery.style}, Pace: ${pace}, Temp: ${temperature}]`,
      );

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
        temperature,
        deliveryStyle: delivery.style,
        totalChunks: chunks.length,
        currentChunkIndex: chunkIdx,
        chunkText: textToSynthesize,
        chunks,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        this.logger.error('Sarvam AI TTS request timed out after 20 seconds');
        throw new ServiceUnavailableException('Sarvam AI TTS request timed out.');
      }
      if (
        err instanceof ServiceUnavailableException ||
        err instanceof BadRequestException ||
        err instanceof InternalServerErrorException
      ) {
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
      defaultTemperature: this.defaultTemperature,
      recommended: {
        conversationalWarmMale: 'shubh',  // Natural, articulate, warm, clear Hindi/Sanskrit
        contemplativeMale: 'ashutosh',    // Deep, mature, reflective
        gentleCompanionMale: 'ratan',      // Soft, night-companion, comforting
        reassuringMale: 'dev',             // Friendly, accessible
        meditativeSoulfulMale: 'kabir',    // Reverent, meditative
        gentleFemaleAlternative: 'priya',  // Soft, maternal, caring
      },
      catalog: [
        { id: 'shubh', gender: 'male', description: 'Articulate, warm, clear conversational delivery (Recommended for Madhav)' },
        { id: 'ashutosh', gender: 'male', description: 'Deep, mature, contemplative spiritual presence' },
        { id: 'ratan', gender: 'male', description: 'Soft, calming, emotionally reassuring companion' },
        { id: 'dev', gender: 'male', description: 'Friendly, reassuring conversational tone' },
        { id: 'kabir', gender: 'male', description: 'Warm, meditative, respectful delivery' },
        { id: 'advait', gender: 'male', description: 'Wise, peaceful, contemplative guide' },
        { id: 'priya', gender: 'female', description: 'Soft, compassionate, reassuring delivery' },
        { id: 'pooja', gender: 'female', description: 'Gentle, devotional delivery' },
      ],
    };
  }
}
