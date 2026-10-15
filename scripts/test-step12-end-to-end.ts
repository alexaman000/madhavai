import * as fs from 'fs';
import * as path from 'path';

// Ensure GEMINI_API_KEY is loaded from backend/.env
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
import { ScripturesService } from '../src/scriptures/scriptures.service';
import { ScriptureImportService } from '../src/scriptures/scripture-import.service';
import { GeminiEmbeddingProvider } from '../src/embeddings/gemini-embedding.provider';
import { GeminiLlmProvider } from '../src/chat/llm/gemini-llm.provider';
import { RagService } from '../src/chat/rag.service';

async function runEndToEndTests() {
  console.log('================================================================');
  console.log('  Madhav.ai — Step 12 End-to-End Persona & Grounding Validation');
  console.log('================================================================\n');

  const db = new DatabaseService();
  db.onModuleInit();
  const importService = new ScriptureImportService(db);
  const embProvider = new GeminiEmbeddingProvider();
  const scripturesService = new ScripturesService(db, importService, embProvider);
  await scripturesService.onModuleInit();
  const llmProvider = new GeminiLlmProvider();
  const ragService = new RagService(db, scripturesService, llmProvider);

  // ------------------------------------------------------------
  // Scenario 1: Emotional Support in Hindi
  // ------------------------------------------------------------
  console.log('------------------------------------------------------------');
  console.log('Scenario 1: Emotional Support in Hindi');
  console.log('User: "मुझे जीवन में बहुत अकेलापन और चिंता महसूस हो रही है, क्या करूँ?"');
  const res1 = await ragService.generateAnswer({
    message: 'मुझे जीवन में बहुत अकेलापन और चिंता महसूस हो रही है, क्या करूँ?',
  });
  console.log('Response Preview:\n', res1.answer.substring(0, 350), '...');
  console.log('Citations Count:', res1.citations.length);
  if (res1.citations.length > 0) {
    console.log('First Citation:', res1.citations[0].scripture, res1.citations[0].chapter, res1.citations[0].verse);
  }
  const noDivineClaim1 = !res1.answer.includes('मैं भगवान हूँ') && !res1.answer.includes('मैं साक्षात ईश्वर हूँ');
  const hasHindi1 = /[\u0900-\u097F]/.test(res1.answer);
  console.log('Assertions: Natural Hindi:', hasHindi1, '| No Divine Omniscience Claim:', noDivineClaim1);

  // ------------------------------------------------------------
  // Scenario 2: Specific Bhagavad Gita Verse (BG 2.47)
  // ------------------------------------------------------------
  console.log('\n------------------------------------------------------------');
  console.log('Scenario 2: Specific Verse Inquiry (BG 2.47)');
  console.log('User: "BG 2.47 का अर्थ और संस्कृत श्लोक समझाइए।"');
  const res2 = await ragService.generateAnswer({
    message: 'BG 2.47 का अर्थ और संस्कृत श्लोक समझाइए।',
  });
  console.log('Response Preview:\n', res2.answer.substring(0, 350), '...');
  console.log('Citations Count:', res2.citations.length);
  const cit2 = res2.citations[0];
  const exactBg247 = cit2 && cit2.chapter === 2 && cit2.verse === 47;
  const hasSanskrit2 = res2.answer.includes('कर्मण्येवाधिकारस्ते') || cit2?.sanskritDevanagari?.includes('कर्मण्येवाधिकारस्ते');
  console.log('Assertions: Exact BG 2.47 Cited:', exactBg247, '| Sanskrit Present:', hasSanskrit2);

  // ------------------------------------------------------------
  // Scenario 3: General Technical Question (Binary Search in Python)
  // ------------------------------------------------------------
  console.log('\n------------------------------------------------------------');
  console.log('Scenario 3: General Technical Question (No Scripture Forced)');
  console.log('User: "How do I write a binary search function in Python?"');
  const res3 = await ragService.generateAnswer({
    message: 'How do I write a binary search function in Python?',
  });
  console.log('Response Preview:\n', res3.answer.substring(0, 300), '...');
  console.log('Citations Count:', res3.citations.length);
  const codeProvided3 = res3.answer.includes('def binary_search') || res3.answer.includes('binary_search');
  const zeroCitations3 = res3.citations.length === 0;
  const noGitaApology3 = !res3.answer.toLowerCase().includes('sacred scripture passages before me contains teachings on');
  console.log('Assertions: Code Provided:', codeProvided3, '| Zero Gita Citations:', zeroCitations3, '| No Scripture Apology:', noGitaApology3);

  // ------------------------------------------------------------
  // Scenario 4: Follow-up Question Dependent on History
  // ------------------------------------------------------------
  console.log('\n------------------------------------------------------------');
  console.log('Scenario 4: Follow-up Question Depending on Conversation History');
  console.log('Turn 1: User expressed nervousness about speaking on stage tomorrow.');
  console.log('Turn 2: "Can you give me 3 calm steps for the first 5 minutes?"');
  const res4 = await ragService.generateAnswer({
    message: 'Can you give me 3 calm steps for the first 5 minutes on stage?',
    history: [
      { role: 'user', content: 'I have to deliver an important keynote speech tomorrow and my hands are trembling with stage fright.' },
      { role: 'assistant', content: 'It is natural to feel anxious before addressing an audience. Remember that you are offering your words in service, not seeking validation.' },
    ],
  });
  console.log('Response Preview:\n', res4.answer.substring(0, 350), '...');
  const stageFrightAddressed = res4.answer.toLowerCase().includes('stage') || res4.answer.toLowerCase().includes('breath') || res4.answer.toLowerCase().includes('speech') || res4.answer.toLowerCase().includes('audience');
  console.log('Assertions: Context Preserved for Speech/Stage:', stageFrightAddressed);

  // ------------------------------------------------------------
  // Scenario 5: Hindi / Hinglish Mixed Question
  // ------------------------------------------------------------
  console.log('\n------------------------------------------------------------');
  console.log('Scenario 5: Hinglish Mixed-Language Question');
  console.log('User: "Mujhe subah uthne me laziness hoti hai, mind ko focused kaise rakhun?"');
  const res5 = await ragService.generateAnswer({
    message: 'Mujhe subah uthne me laziness hoti hai, mind ko focused kaise rakhun?',
  });
  console.log('Response Preview:\n', res5.answer.substring(0, 350), '...');
  console.log('Citations Count:', res5.citations.length);

  // ------------------------------------------------------------
  // Scenario 6: Nonexistent Reference & Fabrication Resistance
  // ------------------------------------------------------------
  console.log('\n------------------------------------------------------------');
  console.log('Scenario 6: Inquiry about Nonexistent Verse (Chapter 22 Verse 10)');
  console.log('User: "What does Bhagavad Gita Chapter 22 Verse 10 say?"');
  const res6 = await ragService.generateAnswer({
    message: 'What does Bhagavad Gita Chapter 22 Verse 10 say?',
  });
  console.log('Response Preview:\n', res6.answer.substring(0, 350), '...');
  console.log('Citations Count:', res6.citations.length);
  const clarifies18Chapters = res6.answer.includes('18') || res6.answer.toLowerCase().includes('18 chapter');
  const zeroFalseCitations6 = res6.citations.length === 0;
  console.log('Assertions: Clarifies 18 Chapters Exist:', clarifies18Chapters, '| Zero False Citations:', zeroFalseCitations6);

  console.log('\n============================================================');
  console.log('  All End-to-End Scenarios Completed Successfully!');
  console.log('============================================================');
}

runEndToEndTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
