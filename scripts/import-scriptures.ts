import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DatabaseService } from '../src/database/database.service';
import { ScriptureImportService } from '../src/scriptures/scripture-import.service';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArgIndex = args.findIndex((a) => a === '--file' || a === '-f');
  const filePath =
    fileArgIndex !== -1 && args[fileArgIndex + 1]
      ? path.resolve(process.cwd(), args[fileArgIndex + 1])
      : path.resolve(__dirname, '../data/bhagavad_gita_canonical.json');

  console.log(`=================================================================`);
  console.log(`📖 Madhav.ai Scripture Importer (Step 07)`);
  console.log(`=================================================================`);
  console.log(`Mode:    ${dryRun ? '🔍 DRY RUN (Verification only)' : '💾 PERSIST (Upsert to database)'}`);
  console.log(`Dataset: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Dataset file not found: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  let dataset: any;
  try {
    dataset = JSON.parse(raw);
  } catch (err: any) {
    console.error(`❌ Failed to parse JSON: ${err.message}`);
    process.exit(1);
  }

  const db = new DatabaseService();
  db.onModuleInit();

  const importer = new ScriptureImportService(db);
  const result = await importer.importDataset(dataset, { dryRun });

  console.log(`-----------------------------------------------------------------`);
  console.log(`Import Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Records Processed:`);
  console.log(`  - Sources:      ${result.recordsProcessed.sources}`);
  console.log(`  - Chapters:     ${result.recordsProcessed.chapters}`);
  console.log(`  - Verses:       ${result.recordsProcessed.verses}`);
  console.log(`  - Translations: ${result.recordsProcessed.translations}`);

  if (result.warnings.length > 0) {
    console.log(`\n⚠️ Warnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      console.log(`  - [${w.entity} ${w.id}] ${w.message}`);
    }
  }

  if (result.errors.length > 0) {
    console.log(`\n❌ Errors (${result.errors.length}):`);
    for (const e of result.errors) {
      console.log(`  - [${e.entity} ${e.id}] ${e.message}`);
    }
    process.exit(1);
  }

  console.log(`=================================================================`);
}

run().catch((err) => {
  console.error('Fatal import error:', err);
  process.exit(1);
});
