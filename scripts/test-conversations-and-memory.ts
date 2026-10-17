import * as fs from 'fs';
import * as path from 'path';

// Ensure environment variables are loaded
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.substring(0, idx).trim();
        const v = trimmed.substring(idx + 1).trim();
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  }
}

import { DatabaseService } from '../src/database/database.service';
import { ScriptureImportService } from '../src/scriptures/scripture-import.service';
import { ScripturesService } from '../src/scriptures/scriptures.service';
import { GeminiEmbeddingProvider } from '../src/embeddings/gemini-embedding.provider';
import { GeminiLlmProvider } from '../src/chat/llm/gemini-llm.provider';
import { RagService } from '../src/chat/rag.service';
import { MemoryService } from '../src/memory/memory.service';
import { ConversationsService } from '../src/conversations/conversations.service';
import { ChatService } from '../src/chat/chat.service';

async function runTestSuite() {
  console.log('=================================================================');
  console.log('🧪 Step 13 Test Suite: Deep Memory, Chat Persistence & Isolation');
  console.log('=================================================================');

  const db = new DatabaseService();
  db.onModuleInit();

  const importService = new ScriptureImportService(db);
  const embeddingProvider = new GeminiEmbeddingProvider();
  const scripturesService = new ScripturesService(db, importService, embeddingProvider);
  await scripturesService.onModuleInit();
  const llmProvider = new GeminiLlmProvider();
  const memService = new MemoryService(db);
  const convService = new ConversationsService(db);
  const ragService = new RagService(db, scripturesService, llmProvider, memService);
  const chatService = new ChatService(ragService, db, memService);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Setup Users
    const user1 = await db.createUser('arjun_test@madhav.ai', 'Arjun');
    const user2 = await db.createUser('karna_test@madhav.ai', 'Karna');
    assert(!!user1 && !!user2, 'T0: Users created with distinct IDs');

    // 2. Create Conversations
    const conv1 = await convService.createConversation(user1.id, {
      title: 'नया संवाद',
      mode: 'TALK',
      language: 'hi',
    });
    assert(conv1.user_id === user1.id && conv1.title === 'नया संवाद', 'T1: Conversation created for User 1');

    // 3. Send message via ChatService
    const chatResult = await chatService.handleChat(
      {
        message: 'padhai me mann nahi lag raha hai',
        conversationId: conv1.id,
        limit: 3,
      },
      user1.id,
    );

    assert(!!chatResult && !!chatResult.answer, 'T2: Chat message generated response');
    assert(chatResult.conversationId === conv1.id, 'T3: Response linked to correct conversation ID');
    assert(chatResult.conversationTitle !== 'नया संवाद', `T4: Conversation title auto-updated: "${chatResult.conversationTitle}"`);

    // 4. Verify Messages persisted in database
    const convDetails = await convService.getConversation(conv1.id, user1.id);
    assert(convDetails.messages.length >= 2, `T5: User and Assistant messages persisted in PostgreSQL (count: ${convDetails.messages.length})`);
    assert(convDetails.messages[0].role === 'user', 'T6: First message is user role');
    assert(convDetails.messages[1].role === 'assistant', 'T7: Second message is assistant role');

    // 5. Memory Management
    const mem1 = await memService.createMemory(user1.id, {
      content: 'Preparing for UPSC Civil Services examination',
      category: 'STUDIES',
      source: 'user_explicit',
    });
    assert(mem1.user_id === user1.id && mem1.category === 'STUDIES', 'T8: Memory saved explicitly');

    const mem2 = await memService.createMemory(user1.id, {
      content: 'Prefers explanations in friendly Hinglish',
      category: 'PREFERENCE',
      source: 'user_explicit',
    });
    assert(mem2.category === 'PREFERENCE', 'T9: Preference memory saved');

    // Memory query relevance
    const relevantMems = await memService.getRelevantMemoriesForQuery(user1.id, 'exam study schedule', 2);
    assert(relevantMems.length > 0 && relevantMems.some((m) => m.content.includes('UPSC')), 'T10: Relevant memory retrieved for exam query');

    // Memory update & delete
    const updatedMem = await memService.updateMemory(mem2.id, user1.id, {
      content: 'Prefers concise bullet points in Hinglish',
    });
    assert(updatedMem.content.includes('bullet points'), 'T11: Memory successfully updated');

    const delMemResult = await memService.deleteMemory(mem2.id, user1.id);
    assert(delMemResult.success, 'T12: Memory successfully deleted');

    // 6. Tenant Isolation Check
    let isolationPassed = false;
    try {
      await convService.getConversation(conv1.id, user2.id);
    } catch (err: any) {
      isolationPassed = true;
    }
    assert(isolationPassed, 'T13: User 2 cannot access User 1 conversation (Isolation enforced)');

    let memIsolationPassed = false;
    try {
      await memService.deleteMemory(mem1.id, user2.id);
    } catch {
      memIsolationPassed = true;
    }
    assert(memIsolationPassed, 'T14: User 2 cannot modify User 1 memory (Isolation enforced)');

    // 7. Conversation Deletion
    const delConvResult = await convService.deleteConversation(conv1.id, user1.id);
    assert(delConvResult.success, 'T15: Conversation successfully deleted');

    let postDeletePassed = false;
    try {
      await convService.getConversation(conv1.id, user1.id);
    } catch {
      postDeletePassed = true;
    }
    assert(postDeletePassed, 'T16: Deleted conversation cannot be reopened');
  } catch (err: any) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('=================================================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('=================================================================');
  if (failed > 0) process.exit(1);
}

runTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
