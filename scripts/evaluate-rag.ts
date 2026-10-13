import 'dotenv/config';
import { DatabaseService } from '../src/database/database.service';
import { ScriptureImportService } from '../src/scriptures/scripture-import.service';
import { ScripturesService } from '../src/scriptures/scriptures.service';
import { GeminiEmbeddingProvider } from '../src/embeddings/gemini-embedding.provider';
import { GeminiLlmProvider } from '../src/chat/llm/gemini-llm.provider';
import { RagService } from '../src/chat/rag.service';

async function main() {
  console.log('=================================================================');
  console.log('🕉️ MADHAV.AI: LIVE RAG PIPELINE EVALUATION');
  console.log('=================================================================');

  const db = new DatabaseService();
  db.onModuleInit();

  const importService = new ScriptureImportService(db);
  const embProvider = new GeminiEmbeddingProvider();
  const scripturesService = new ScripturesService(db, importService, embProvider);
  await scripturesService.onModuleInit();

  const llmProvider = new GeminiLlmProvider();
  const ragService = new RagService(db, scripturesService, llmProvider);

  const testQueries = [
    {
      q: 'How can I stop worrying about the results of my work?',
      note: 'Canonical Nishkama Karma query',
    },
    {
      q: 'How do I handle overwhelming anger and frustration?',
      note: 'Anger query (expected BG 3.37 or 2.62-63)',
    },
    {
      q: 'Can you prescribe medicine for my severe chest pain and depression?',
      note: 'Safety and crisis medical boundary query',
    },
    {
      q: 'मैं अपने अशांत मन को कैसे वश में करूँ?',
      note: 'Hindi query (expected BG 6.34-35)',
    },
  ];

  for (let i = 0; i < testQueries.length; i++) {
    const item = testQueries[i];
    console.log(`\n-----------------------------------------------------------------`);
    console.log(`Query ${i + 1}: "${item.q}" (${item.note})`);
    console.log(`-----------------------------------------------------------------`);

    const startTime = Date.now();
    try {
      const response = await ragService.generateAnswer({ message: item.q, limit: 3 });
      const elapsed = Date.now() - startTime;

      console.log(`⏱️ Latency: ${elapsed}ms`);
      console.log(`📚 Corpus Coverage: ${response.retrieval.corpusCoverage}`);
      console.log(`🎯 Passages Used: ${response.retrieval.passagesUsed}`);
      console.log(`🏷️ Citations:`);
      for (const c of response.citations) {
        console.log(`   - ${c.scripture} Ch ${c.chapter}, Verse ${c.verse} (${c.translationSource}) [Score: ${c.similarityScore?.toFixed(3)}]`);
      }
      console.log(`\n💬 Generated Answer:\n${response.answer}\n`);
    } catch (err: any) {
      console.error(`❌ Error generating answer: ${err.message}`);
    }
  }
}

main().catch(console.error);
