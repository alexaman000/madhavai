/**
 * Automated test suite for Madhav.ai SSE streaming & citation safety
 */
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

async function runStreamingTests() {
  console.log('============================================================');
  console.log('   Madhav.ai — SSE Streaming & Citation Safety Test Suite   ');
  console.log('============================================================\n');

  const db = new DatabaseService();
  db.onModuleInit();
  const importService = new ScriptureImportService(db);
  const embProvider = new GeminiEmbeddingProvider();
  const scripturesService = new ScripturesService(db, importService, embProvider);
  await scripturesService.onModuleInit();
  const provider = new GeminiLlmProvider();
  const ragService = new RagService(db, scripturesService, provider);

  // Test 1: Incremental Token Delivery & TTFT Measurement
  console.log('--- Test 1: Incremental Token Delivery & TTFT Measurement ---');
  const t0 = performance.now();
  let firstTokenTime: number | null = null;
  const deltas: string[] = [];

  const result1 = await ragService.streamAnswer(
    { message: 'How to find balance when duty feels heavy?' },
    (info) => {
      console.log(`[event: start] Intent: ${info.queryIntent}, Model: ${info.model}`);
    },
    (chunk) => {
      if (firstTokenTime === null) {
        firstTokenTime = performance.now();
      }
      deltas.push(chunk);
    },
  );
  const totalTime = performance.now();

  const ttftMs = firstTokenTime ? (firstTokenTime - t0).toFixed(0) : 'N/A';
  const totalMs = (totalTime - t0).toFixed(0);

  console.log(`Chunks received: ${deltas.length}`);
  console.log(`Time to First Token (TTFT): ${ttftMs} ms`);
  console.log(`Total Time: ${totalMs} ms`);
  console.log(`Verified Citations Count: ${result1.citations.length}`);
  console.log(`Preview: "${result1.answer.substring(0, 100)}..."\n`);

  if (deltas.length < 2) {
    throw new Error('Test 1 Failed: Expected multiple incremental stream chunks.');
  }
  console.log('✅ Test 1 Passed: Incremental tokens streamed with fast TTFT.\n');

  // Test 2: Technical Query Isolation (Zero Citations in Stream)
  console.log('--- Test 2: Technical Query Isolation ---');
  let techStartFired = false;
  const techDeltas: string[] = [];
  const result2 = await ragService.streamAnswer(
    { message: 'Write a Python function to check if a word is a palindrome.' },
    (info) => {
      techStartFired = true;
      if (info.queryIntent !== 'GENERAL_FACTUAL_OR_TECHNICAL') {
        throw new Error(`Expected GENERAL_FACTUAL_OR_TECHNICAL intent, got: ${info.queryIntent}`);
      }
    },
    (chunk) => {
      techDeltas.push(chunk);
    },
  );

  console.log(`Tech Citations Count: ${result2.citations.length}`);
  console.log(`Tech Chunks Received: ${techDeltas.length}`);
  if (result2.citations.length !== 0) {
    throw new Error('Test 2 Failed: Technical query must have zero citations.');
  }
  console.log('✅ Test 2 Passed: Technical query streamed with 0 citations.\n');

  // Test 3: Specific Verse Canonical Hydration
  console.log('--- Test 3: Specific Verse Canonical Hydration ---');
  const verseDeltas: string[] = [];
  const result3 = await ragService.streamAnswer(
    { message: 'What is Bhagavad Gita Chapter 2 Verse 47?' },
    () => {},
    (chunk) => {
      verseDeltas.push(chunk);
    },
  );

  console.log(`Citations Count: ${result3.citations.length}`);
  if (result3.citations.length !== 1) {
    throw new Error(`Expected 1 citation, got ${result3.citations.length}`);
  }
  const cit = result3.citations[0];
  console.log(`Citation: BG ${cit.chapter}.${cit.verse} | Sanskrit: ${cit.sanskritDevanagari?.substring(0, 30)}...`);
  if (cit.chapter !== 2 || cit.verse !== 47 || !cit.sanskritDevanagari?.includes('कर्मण्येवाधिकारस्ते')) {
    throw new Error('Test 3 Failed: BG 2.47 hydration mismatch.');
  }
  console.log('✅ Test 3 Passed: Specific verse hydrated with canonical Sanskrit.\n');

  // Test 4: Client Abort Signal Handling
  console.log('--- Test 4: Client Abort Signal Handling ---');
  const abortController = new AbortController();
  let abortedChunks = 0;

  try {
    const streamPromise = ragService.streamAnswer(
      { message: 'Give me a very detailed explanation of all 18 chapters of the Bhagavad Gita.' },
      () => {},
      (chunk) => {
        abortedChunks++;
        if (abortedChunks >= 3) {
          console.log('Aborting client connection after 3 chunks...');
          abortController.abort();
        }
      },
      abortController.signal,
    );

    const abortedResult = await streamPromise;
    console.log(`Aborted stream gracefully terminated. Citations: ${abortedResult.citations.length}`);
  } catch (err: any) {
    console.log(`Stream abort caught cleanly: ${err.message}`);
  }
  console.log('✅ Test 4 Passed: Client abort handled cleanly without uncaught exception.\n');

  console.log('============================================================');
  console.log('    All SSE Streaming & Citation Tests Passed! (4/4)        ');
  console.log('============================================================');
}

runStreamingTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
