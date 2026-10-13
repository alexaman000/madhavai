import * as assert from 'assert';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { ScripturesService } from '../src/scriptures/scriptures.service';
import { ScriptureImportService } from '../src/scriptures/scripture-import.service';
import { DatabaseService } from '../src/database/database.service';

// Load test environment
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    process.stdout.write(`  ⏳ ${name}... `);
    await fn();
    console.log(`✅ PASS`);
    passed++;
  } catch (err: any) {
    console.log(`❌ FAIL\n     Error: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log(`=================================================================`);
  console.log(`🧪 MADHAV.AI STEP 07: SCRIPTURE KNOWLEDGE BASE & RETRIEVAL TESTS`);
  console.log(`=================================================================`);

  const db = new DatabaseService();
  db.onModuleInit();

  const importService = new ScriptureImportService(db);
  const scripturesService = new ScripturesService(db, importService);
  await scripturesService.onModuleInit();

  console.log(`\n--- Test Suite 1: Exact Verse Retrieval (BG 2.47) ---`);

  await runTest('TC01: Exact lookup for BG 2.47 returns verified Sanskrit text', async () => {
    const res = await scripturesService.getVerse('bhagavad-gita', 2, 47);
    assert.strictEqual(res.verse_id, 'BG-2.47');
    assert.strictEqual(res.chapter_number, 2);
    assert.strictEqual(res.verse_number, 47);
    assert.ok(res.sanskrit_devanagari.includes('कर्मण्येवाधिकारस्ते'));
    assert.ok(res.transliteration_iast.includes('karmaṇy evādhikāras te'));
    assert.strictEqual(res.verification_status, 'verified');
    assert.ok(res.translations.length >= 2);
  });

  await runTest('TC02: Verse response includes provenance and licensing metadata', async () => {
    const res = await scripturesService.getVerse('bhagavad-gita', 2, 47);
    const sivananda = res.translations.find((t) => t.source.id === 'src_sivananda_1942');
    assert.ok(sivananda, 'Sivananda translation must be present');
    assert.strictEqual(sivananda.source.author_or_translator, 'Swami Sivananda');
    assert.strictEqual(sivananda.source.license, 'Public Domain');
    assert.ok(sivananda.translation_text.length > 10);
  });

  await runTest('TC03: Verse response preserves Unicode Devanagari accurately', async () => {
    const res = await scripturesService.getVerse('bhagavad-gita', 2, 47);
    assert.ok(res.sanskrit_devanagari.includes('सङ्गोऽस्त्वकर्मणि'));
    assert.ok(res.transliteration_iast.includes('saṅgo \'stv akarmaṇi'));
  });

  await runTest('TC04: Verse response includes chapter metadata titles', async () => {
    const res = await scripturesService.getVerse('bhagavad-gita', 2, 47);
    assert.strictEqual(res.chapter_title.sanskrit, 'साङ्ख्ययोग');
    assert.strictEqual(res.chapter_title.english, 'The Yoga of Analytical Knowledge');
  });

  console.log(`\n--- Test Suite 2: Chapters & Structure Endpoints ---`);

  await runTest('TC05: Canonical chapters listing returns all 18 chapters', async () => {
    const chapters = await scripturesService.getChapters('bhagavad-gita');
    assert.strictEqual(chapters.length, 18, 'Must return exactly 18 chapters');
    const ch2 = chapters.find((c) => c.chapter_number === 2);
    assert.ok(ch2);
    assert.strictEqual(ch2.verse_count, 72);
  });

  await runTest('TC06: Single chapter endpoint returns correct metadata', async () => {
    const ch2 = await scripturesService.getChapter('bhagavad-gita', 2);
    assert.strictEqual(ch2.chapter_number, 2);
    assert.strictEqual(ch2.name_sanskrit, 'साङ्ख्ययोग');
    assert.ok(ch2.summary?.includes('Nishkama Karma'));
  });

  console.log(`\n--- Test Suite 3: Validation, Boundaries & Error Handling ---`);

  await runTest('TC07: Missing verse returns 404 NotFoundException', async () => {
    let thrown = false;
    try {
      await scripturesService.getVerse('bhagavad-gita', 2, 999);
    } catch (err: any) {
      thrown = true;
      assert.strictEqual(err.status, 404);
    }
    assert.strictEqual(thrown, true, 'Should throw 404 for non-existent verse');
  });

  await runTest('TC08: Invalid chapter number (>18) returns 400 BadRequestException', async () => {
    let thrown = false;
    try {
      await scripturesService.getVerse('bhagavad-gita', 19, 1);
    } catch (err: any) {
      thrown = true;
      assert.strictEqual(err.status, 400);
    }
    assert.strictEqual(thrown, true, 'Should throw 400 for chapter > 18');
  });

  await runTest('TC09: Non-numeric parameters return 400 BadRequestException', async () => {
    let thrown = false;
    try {
      await scripturesService.getVerse('bhagavad-gita', 'abc', 47);
    } catch (err: any) {
      thrown = true;
      assert.strictEqual(err.status, 400);
    }
    assert.strictEqual(thrown, true, 'Should throw 400 for non-numeric chapter');
  });

  console.log(`\n--- Test Suite 4: Importer, Dry-Run & Idempotency ---`);

  await runTest('TC10: Dry-run does not alter records and returns accurate validation report', async () => {
    const validDataset: any = {
      scripture: { id: 'bhagavad-gita' },
      sources: [
        {
          id: 'test_src',
          name: 'Test Source',
          author_or_translator: 'Tester',
          license: 'Public Domain',
        },
      ],
      chapters: [
        {
          id: 'BG-1',
          chapter_number: 1,
          name_sanskrit: 'Test',
          name_english: 'Test',
        },
      ],
      verses: [
        {
          id: 'BG-1.1',
          chapter_number: 1,
          verse_number: 1,
          sanskrit_devanagari: 'धर्मक्षेत्रे कुरुक्षेत्रे',
          transliteration_iast: 'dharmakṣetre kurukṣetre',
          translations: [
            {
              id: 'BG-1.1-tr',
              source_id: 'test_src',
              language: 'en',
              translation_text: 'In the field of righteousness...',
            },
          ],
        },
      ],
    };

    const res = await importService.importDataset(validDataset, { dryRun: true });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.dryRun, true);
    assert.strictEqual(res.recordsProcessed.verses, 1);
    assert.strictEqual(res.recordsProcessed.translations, 1);
  });

  await runTest('TC11: Importer detects schema violations (e.g. unknown source_id, duplicate verse)', async () => {
    const invalidDataset: any = {
      scripture: { id: 'bhagavad-gita' },
      sources: [],
      chapters: [],
      verses: [
        {
          id: 'BG-2.47',
          chapter_number: 2,
          verse_number: 47,
          sanskrit_devanagari: 'कर्मण्येवाधिकारस्ते',
          transliteration_iast: 'karmaṇy evādhikāras te',
          translations: [
            {
              id: 'invalid-tr',
              source_id: 'non_existent_source',
              language: 'en',
              translation_text: 'Invalid translation',
            },
          ],
        },
      ],
    };

    const res = await importService.importDataset(invalidDataset, { dryRun: true });
    assert.strictEqual(res.success, false);
    assert.ok(res.errors.length > 0);
    const sourceErr = res.errors.find((e) => e.message.includes('unknown source_id'));
    assert.ok(sourceErr, 'Should detect missing referenced source_id');
  });

  await runTest('TC12: Upsert idempotency: Repeated import leaves state intact without duplicate errors', async () => {
    const canonical = require('../data/bhagavad_gita_canonical.json');
    const run1 = await importService.importDataset(canonical, { dryRun: false });
    assert.strictEqual(run1.success, true);

    const run2 = await importService.importDataset(canonical, { dryRun: false });
    assert.strictEqual(run2.success, true);

    const verse = await scripturesService.getVerse('bhagavad-gita', 2, 47);
    assert.strictEqual(verse.verse_id, 'BG-2.47');
    assert.strictEqual(verse.translations.length, 2);
  });

  console.log(`\n--- Test Suite 5: Existing System Health & Non-Regression ---`);

  await runTest('TC13: Non-regression check: DatabaseService preserves existing user & OTP methods', async () => {
    assert.strictEqual(typeof db.findUserByEmail, 'function');
    assert.strictEqual(typeof db.findLatestOtpForEmail, 'function');
    assert.strictEqual(typeof db.createOtpRecord, 'function');
    assert.strictEqual(typeof db.incrementOtpAttempts, 'function');
    assert.strictEqual(typeof db.markOtpConsumed, 'function');
  });

  console.log(`\n=================================================================`);
  console.log(`TEST SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`=================================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
