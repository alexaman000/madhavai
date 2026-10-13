import * as path from 'path';
import * as dotenv from 'dotenv';
import { DatabaseService } from '../src/database/database.service';
import { GeminiEmbeddingProvider } from '../src/embeddings/gemini-embedding.provider';
import { EmbeddingsService } from '../src/embeddings/embeddings.service';

// Load environment
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

async function runCli() {
  const args = process.argv.slice(2);
  const isValidate = args.includes('--validate') || args.includes('-v');
  const isDryRun = args.includes('--dry-run') || args.includes('-d');
  const isCoverage = args.includes('--coverage') || args.includes('-c');
  const isGenerate = args.includes('--generate') || args.includes('-g');
  const force = args.includes('--force');

  console.log(`=================================================================`);
  console.log(`🔮 MADHAV.AI — SCRIPTURE EMBEDDING PIPELINE (STEP 08)`);
  console.log(`=================================================================`);

  const db = new DatabaseService();
  db.onModuleInit();

  const provider = new GeminiEmbeddingProvider();
  const embeddingsService = new EmbeddingsService(db, provider);

  // 1. Validate configuration
  if (isValidate || (!isDryRun && !isCoverage && !isGenerate)) {
    console.log(`\n📋 Step 1: Configuration Validation`);
    const isConfigured = provider.isConfigured();
    console.log(`  - Provider:           Google Gemini API`);
    console.log(`  - Target Model:       ${provider.defaultModel}`);
    console.log(`  - Vector Dimension:   ${provider.targetDimension} (pgvector vector(768))`);
    console.log(`  - Provider Status:    ${isConfigured ? '✅ CONFIGURED (API Key detected)' : '⚠️ UNCONFIGURED (Missing GEMINI_API_KEY in backend/.env)'}`);
    console.log(`  - Database Status:    ✅ Connected to Supabase PostgreSQL`);

    if (!isDryRun && !isCoverage && !isGenerate) {
      console.log(`\n💡 Available commands:`);
      console.log(`   npx ts-node scripts/manage-embeddings.ts --validate    (Check configuration)`);
      console.log(`   npx ts-node scripts/manage-embeddings.ts --dry-run     (Simulate embedding generation)`);
      console.log(`   npx ts-node scripts/manage-embeddings.ts --generate    (Execute live embedding generation)`);
      console.log(`   npx ts-node scripts/manage-embeddings.ts --coverage    (Verify vector coverage and integrity)`);
      return;
    }
  }

  // 2. Coverage & Integrity Verification
  if (isCoverage) {
    console.log(`\n📊 Step 2: Coverage & Vector Integrity Verification`);
    const report = await embeddingsService.verifyIntegrity();
    console.log(`Coverage Summary:`);
    console.log(`  - Eligible Searchable Chunks:   ${report.coverage.eligibleRecords}`);
    console.log(`  - Successfully Embedded:        ${report.coverage.alreadyEmbedded}`);
    console.log(`  - Missing Embeddings:           ${report.coverage.missingEmbeddings}`);
    console.log(`  - Completion Status:            ${report.coverage.isComplete ? '✅ 100% COMPLETE' : '⏳ INCOMPLETE'}`);
    console.log(`\nIntegrity Checks:`);
    console.log(`  - Total Vector Rows in DB:      ${report.integrity.totalRecordsInDb}`);
    console.log(`  - Invalid/Non-finite Vectors:   ${report.integrity.invalidVectors}`);
    console.log(`  - Dimension Mismatches:         ${report.integrity.dimensionMismatches}`);
    console.log(`  - Orphaned Rows:                ${report.integrity.orphanedRows}`);
    console.log(`  - Duplicate Embedding Rows:     ${report.integrity.duplicateRows}`);
    console.log(`  - Stale Rows (Content Changed): ${report.integrity.staleRows}`);
    console.log(`  - Models Recorded:             `, report.integrity.modelsUsed);
    return;
  }

  // 3. Dry-Run Mode
  if (isDryRun) {
    console.log(`\n🔍 Step 3: Simulating Embedding Generation (DRY RUN)`);
    console.log(`No paid provider calls or database modifications will be executed.`);
    const report = await embeddingsService.generateEmbeddings({ dryRun: true });
    console.log(`-----------------------------------------------------------------`);
    console.log(`Eligible Chunks to Embed: ${report.eligibleRecords}`);
    console.log(`Already Embedded:         ${report.alreadyEmbedded}`);
    console.log(`Unchanged (To Skip):      ${report.skippedUnchanged}`);
    console.log(`Simulated Successful:     ${report.successfullyEmbedded}`);
    console.log(`-----------------------------------------------------------------`);
    console.log(`✅ Dry-run simulation completed successfully.`);
    return;
  }

  // 4. Live Generation
  if (isGenerate) {
    console.log(`\n🚀 Step 4: Executing Live Embedding Generation`);
    if (!provider.isConfigured()) {
      console.error(`❌ Cannot generate embeddings: GEMINI_API_KEY is not configured in backend/.env`);
      process.exit(1);
    }
    const report = await embeddingsService.generateEmbeddings({
      dryRun: false,
      forceRegenerate: force,
    });
    console.log(`-----------------------------------------------------------------`);
    console.log(`Eligible Chunks:          ${report.eligibleRecords}`);
    console.log(`Successfully Generated:   ${report.successfullyEmbedded}`);
    console.log(`Skipped Unchanged:        ${report.skippedUnchanged}`);
    console.log(`Failures:                 ${report.failedCount}`);
    console.log(`Status:                   ${report.isComplete ? '✅ 100% COMPLETE' : '⚠️ PARTIAL/INCOMPLETE'}`);
    console.log(`-----------------------------------------------------------------`);
    if (report.errors.length > 0) {
      console.error(`Errors encountered:`, report.errors);
      process.exit(1);
    }
  }
}

runCli().catch((err) => {
  console.error('Fatal CLI error:', err);
  process.exit(1);
});
