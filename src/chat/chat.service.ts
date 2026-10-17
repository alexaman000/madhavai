import { Injectable, Logger, Optional } from '@nestjs/common';
import { ChatRequestDto } from './dto/chat-request.dto';
import { RagService } from './rag.service';
import { RagResponseDto } from './chat.interfaces';
import { DatabaseService, ConversationRecord } from '../database/database.service';
import { MemoryService } from '../memory/memory.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly ragService: RagService,
    private readonly db: DatabaseService,
    @Optional() private readonly memoryService?: MemoryService,
  ) {}

  /**
   * Helper to ensure an authenticated conversation exists or is created,
   * and saves the user prompt prior to generation.
   */
  private async prepareConversationAndSaveUserMessage(
    dto: ChatRequestDto,
    userId?: string,
  ): Promise<{ conversation: ConversationRecord | null }> {
    if (!userId) {
      return { conversation: null };
    }

    let conversation: ConversationRecord | null = null;
    if (dto.conversationId) {
      conversation = await this.db.getConversationById(dto.conversationId, userId);
    }

    if (!conversation) {
      conversation = await this.db.createConversation({
        id: dto.conversationId,
        user_id: userId,
        title: 'नया संवाद',
        language: dto.language || 'hi',
      });
    }

    // Persist user prompt immediately to PostgreSQL
    await this.db.createMessage({
      conversation_id: conversation.id,
      user_id: userId,
      role: 'user',
      content: dto.message,
    });

    // Populate history from database if client did not supply turns
    if (!dto.history || dto.history.length === 0) {
      const dbMsgs = await this.db.getMessagesByConversation(conversation.id, userId, 6);
      if (dbMsgs.length > 1) {
        // Exclude the current turn we just inserted
        const previousTurns = dbMsgs.slice(0, -1);
        dto.history = previousTurns.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
      }
    }

    // Selectively extract and persist any explicit user goal or preference asynchronously
    if (this.memoryService) {
      this.memoryService.extractAndSavePotentialMemories(userId, dto.message).catch(() => {});
    }

    return { conversation };
  }

  /**
   * Helper to finalize conversation after generation: saves assistant response
   * and auto-generates title if it is still the default.
   */
  private async finalizeAssistantMessage(
    finalResult: RagResponseDto,
    conversation: ConversationRecord | null,
    userId?: string,
    rawUserQuery?: string,
  ): Promise<RagResponseDto> {
    if (!userId || !conversation) {
      return finalResult;
    }

    // Persist completed assistant response with verified citations
    const savedMsg = await this.db.createMessage({
      conversation_id: conversation.id,
      user_id: userId,
      role: 'assistant',
      content: finalResult.answer,
      citations: finalResult.citations,
      metadata: {
        retrieval: finalResult.retrieval,
      },
    });

    let currentTitle = conversation.title;

    // Auto-generate title if default and this is the start of the chat
    if (conversation.title === 'नया संवाद' && rawUserQuery) {
      const trimmedQuery = rawUserQuery.trim();
      const newTitle = trimmedQuery.length > 35 ? `${trimmedQuery.substring(0, 32)}...` : trimmedQuery;
      await this.db.updateConversation(conversation.id, userId, { title: newTitle });
      currentTitle = newTitle;
    }

    return {
      ...finalResult,
      conversationId: conversation.id,
      conversationTitle: currentTitle,
      messageId: savedMsg.id,
    };
  }

  /**
   * Main entry point for synchronous chat requests.
   */
  async handleChat(dto: ChatRequestDto, userId?: string): Promise<RagResponseDto> {
    this.logger.log(`Incoming chat message: "${dto.message}" (userId: ${userId || 'anonymous'})`);
    const { conversation } = await this.prepareConversationAndSaveUserMessage(dto, userId);

    const result = await this.ragService.generateAnswer(dto, userId);
    return this.finalizeAssistantMessage(result, conversation, userId, dto.message);
  }

  /**
   * Streaming entry point for chat requests.
   * Persists user prompt before streaming and assistant response on completion.
   */
  async handleChatStream(
    dto: ChatRequestDto,
    onStart: (info: { queryIntent: string; model: string }) => void | Promise<void>,
    onDelta: (chunk: string) => void | Promise<void>,
    abortSignal?: AbortSignal,
    userId?: string,
  ): Promise<RagResponseDto> {
    this.logger.log(`Incoming chat stream request: "${dto.message}" (userId: ${userId || 'anonymous'})`);
    const { conversation } = await this.prepareConversationAndSaveUserMessage(dto, userId);

    const result = await this.ragService.streamAnswer(dto, onStart, onDelta, abortSignal, userId);
    return this.finalizeAssistantMessage(result, conversation, userId, dto.message);
  }
}
