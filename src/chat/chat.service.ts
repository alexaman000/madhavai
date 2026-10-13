import { Injectable, Logger } from '@nestjs/common';
import { ChatRequestDto } from './dto/chat-request.dto';
import { RagService } from './rag.service';
import { RagResponseDto } from './chat.interfaces';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly ragService: RagService) {}

  /**
   * Main entry point for chat requests.
   * Delegates to RagService to perform grounded retrieval-augmented generation.
   */
  async handleChat(dto: ChatRequestDto): Promise<RagResponseDto> {
    this.logger.log(`Incoming chat message: "${dto.message}" (limit: ${dto.limit || 5})`);
    return this.ragService.generateAnswer(dto);
  }
}
