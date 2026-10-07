import { Injectable, Logger } from '@nestjs/common';
import { ChatRequestDto } from './dto/chat-request.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  handleChat(dto: ChatRequestDto) {
    this.logger.log(`Incoming chat message: "${dto.message}"`);

    return {
      success: true,
      response: 'Namaste 🙏 I am Madhav. Your backend is working.',
    };
  }
}
