import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService, UserMemoryRecord } from '../database/database.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(private readonly db: DatabaseService) {}

  async listUserMemories(userId: string): Promise<UserMemoryRecord[]> {
    return this.db.getUserMemories(userId, true);
  }

  async createMemory(userId: string, dto: CreateMemoryDto): Promise<UserMemoryRecord> {
    const cleanedContent = dto.content.trim();

    // Privacy & Safety: Never save credentials or sensitive information
    if (
      /password|secret|token|api[_\s]?key|credit[_\s]?card|cvv|pin/i.test(cleanedContent)
    ) {
      this.logger.warn(`Rejected memory creation containing potential credentials.`);
      throw new Error('Sensitive credentials or tokens cannot be saved in memory.');
    }

    // Check for existing similar memory in the same category to deduplicate
    const existing = await this.db.getUserMemories(userId, true);
    const normalizedNew = cleanedContent.toLowerCase();

    for (const mem of existing) {
      if (mem.category === dto.category) {
        const normalizedOld = mem.content.toLowerCase();
        // If content is nearly identical or one contains the other
        if (
          normalizedOld === normalizedNew ||
          (normalizedNew.length > 10 && normalizedOld.includes(normalizedNew)) ||
          (normalizedOld.length > 10 && normalizedNew.includes(normalizedOld))
        ) {
          // Update existing memory instead of creating a duplicate
          const updated = await this.db.updateUserMemory(mem.id, userId, {
            content: cleanedContent,
            source: dto.source || mem.source,
          });
          if (updated) return updated;
        }
      }
    }

    return this.db.createUserMemory({
      user_id: userId,
      content: cleanedContent,
      category: dto.category,
      source: dto.source || 'user_explicit',
      confidence: 1.0,
    });
  }

  async updateMemory(
    id: string,
    userId: string,
    dto: UpdateMemoryDto,
  ): Promise<UserMemoryRecord> {
    const updated = await this.db.updateUserMemory(id, userId, {
      content: dto.content?.trim(),
      category: dto.category,
    });

    if (!updated) {
      throw new NotFoundException(`Memory '${id}' not found or does not belong to you.`);
    }
    return updated;
  }

  async deleteMemory(id: string, userId: string): Promise<{ success: boolean }> {
    const deleted = await this.db.deleteUserMemory(id, userId);
    if (!deleted) {
      throw new NotFoundException(`Memory '${id}' not found or does not belong to you.`);
    }
    return { success: true };
  }

  async clearAllMemories(userId: string): Promise<{ success: boolean }> {
    const cleared = await this.db.clearAllUserMemories(userId);
    return { success: cleared };
  }

  /**
   * Retrieves relevant memories for the current prompt context without exceeding token budget.
   * Prioritizes study goals, communication preferences, and active projects.
   */
  async getRelevantMemoriesForQuery(
    userId: string,
    query: string,
    maxCount: number = 3,
  ): Promise<UserMemoryRecord[]> {
    const memories = await this.db.getUserMemories(userId, true);
    if (!memories || memories.length === 0) return [];

    const lowerQuery = query.toLowerCase();

    // Score memories based on keyword relevance and category priority
    const scored = memories.map((m) => {
      let score = 0;
      const lowerContent = m.content.toLowerCase();

      // Keyword overlap
      const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length > 3);
      for (const w of queryWords) {
        if (lowerContent.includes(w)) {
          score += 2;
        }
      }

      // Base weight for preferences and active goals
      if (m.category === 'PREFERENCE') score += 1;
      if (m.category === 'STUDIES' && (lowerQuery.includes('padhai') || lowerQuery.includes('study') || lowerQuery.includes('exam'))) {
        score += 3;
      }
      if (m.category === 'CAREER' && (lowerQuery.includes('career') || lowerQuery.includes('naukri') || lowerQuery.includes('job'))) {
        score += 3;
      }

      return { memory: m, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.filter((s) => s.score > 0).slice(0, maxCount).map((s) => s.memory);
  }

  /**
   * Evaluates user input for explicit preferences or long-term goals and selectively saves them.
   */
  async extractAndSavePotentialMemories(userId: string, message: string): Promise<void> {
    const trimmed = message.trim();
    if (trimmed.length < 10) return;

    // 1. Preparation / Exam Goal
    const examMatch = trimmed.match(/(?:main|mein|i am|i'm)\s+(?:preparing for|ki taiyari kar raha|ki padhai kar raha)\s+([a-zA-Z0-9\s]+?)(?:\.|$|,|\s+mein)/i);
    if (examMatch && examMatch[1]) {
      const subject = examMatch[1].trim();
      if (subject.length > 2 && subject.length < 50) {
        await this.createMemory(userId, {
          content: `Preparing for ${subject}`,
          category: 'STUDIES',
          source: 'conversation_extracted',
        }).catch(() => {});
      }
    }

    // 2. Language Preference
    if (/mujhe\s+(?:hindi|hinglish|english)\s+mein\s+(?:samjhao|batao|baat karo)/i.test(trimmed)) {
      const lang = trimmed.includes('hindi') ? 'Hindi' : trimmed.includes('hinglish') ? 'Hinglish' : 'English';
      await this.createMemory(userId, {
        content: `Prefers guidance in ${lang}`,
        category: 'PREFERENCE',
        source: 'conversation_extracted',
      }).catch(() => {});
    }

    // 3. Explicit "remember that" request
    const rememberMatch = trimmed.match(/(?:remember that|yaad rakhna ki|yaad rakho ki)\s+(.+?)(?:\.|$)/i);
    if (rememberMatch && rememberMatch[1]) {
      const fact = rememberMatch[1].trim();
      if (fact.length > 5 && fact.length < 200) {
        await this.createMemory(userId, {
          content: fact,
          category: 'PREFERENCE',
          source: 'user_explicit',
        }).catch(() => {});
      }
    }
  }
}
