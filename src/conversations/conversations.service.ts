import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { DatabaseService, ConversationRecord, MessageRecord } from '../database/database.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private readonly db: DatabaseService) {}

  async listUserConversations(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<ConversationRecord[]> {
    return this.db.getConversationsByUser(userId, limit, offset);
  }

  async createConversation(
    userId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationRecord> {
    return this.db.createConversation({
      user_id: userId,
      title: dto.title || 'नया संवाद',
      mode: dto.mode || 'TALK',
      language: dto.language || 'hi',
    });
  }

  async getConversation(
    id: string,
    userId: string,
  ): Promise<{ conversation: ConversationRecord; messages: MessageRecord[] }> {
    const conversation = await this.db.getConversationById(id, userId);
    if (!conversation) {
      throw new NotFoundException(`Conversation '${id}' not found or does not belong to you.`);
    }

    const messages = await this.db.getMessagesByConversation(id, userId);
    return {
      conversation,
      messages,
    };
  }

  async updateConversation(
    id: string,
    userId: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationRecord> {
    const existing = await this.db.getConversationById(id, userId);
    if (!existing) {
      throw new NotFoundException(`Conversation '${id}' not found or does not belong to you.`);
    }

    const updated = await this.db.updateConversation(id, userId, {
      title: dto.title ?? existing.title,
      is_pinned: dto.is_pinned ?? existing.is_pinned,
    });

    if (!updated) {
      throw new NotFoundException(`Failed to update conversation '${id}'.`);
    }
    return updated;
  }

  async deleteConversation(id: string, userId: string): Promise<{ success: boolean }> {
    const existing = await this.db.getConversationById(id, userId);
    if (!existing) {
      throw new NotFoundException(`Conversation '${id}' not found or does not belong to you.`);
    }

    const deleted = await this.db.deleteConversation(id, userId);
    return { success: deleted };
  }
}
