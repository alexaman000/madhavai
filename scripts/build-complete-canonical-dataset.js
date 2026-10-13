const fs = require('fs');
const path = require('path');

async function buildCompleteDataset() {
  console.log('=================================================================');
  console.log('📚 Building Complete Bhagavad Gita Canonical Dataset (701 Verses)');
  console.log('=================================================================');

  const existingFile = path.resolve(__dirname, '../data/bhagavad_gita_canonical.json');
  const backupFile = path.resolve(__dirname, '../data/bhagavad_gita_canonical.step07_backup.json');

  if (fs.existsSync(existingFile) && !fs.existsSync(backupFile)) {
    fs.copyFileSync(existingFile, backupFile);
    console.log(`Backed up starter dataset to: ${backupFile}`);
  }

  const existingData = JSON.parse(fs.readFileSync(existingFile, 'utf8'));

  console.log('Fetching raw verses and translations from public-domain archive (gita/gita)...');
  const [versesRes, translationsRes] = await Promise.all([
    fetch('https://raw.githubusercontent.com/gita/gita/main/data/verse.json'),
    fetch('https://raw.githubusercontent.com/gita/gita/main/data/translation.json'),
  ]);

  if (!versesRes.ok || !translationsRes.ok) {
    throw new Error('Failed to fetch dataset from public repository');
  }

  const rawVerses = await versesRes.json();
  const rawTranslations = await translationsRes.json();

  console.log(`Downloaded ${rawVerses.length} verses and ${rawTranslations.length} translations.`);

  // Map Swami Sivananda (author_id = 16) translations by verse id
  const sivanandaMap = new Map();
  for (const tr of rawTranslations) {
    if (tr.author_id === 16) {
      sivanandaMap.set(tr.verse_id, tr);
    }
  }

  console.log(`Found ${sivanandaMap.size} Sivananda English translations.`);

  // Preserve existing BG-2.47 verse
  const existingVerse247 = existingData.verses.find((v) => v.id === 'BG-2.47');

  const compiledVerses = [];
  let verseOrder = 0;

  for (const rv of rawVerses) {
    verseOrder++;
    const verseId = `BG-${rv.chapter_number}.${rv.verse_number}`;

    if (verseId === 'BG-2.47' && existingVerse247) {
      compiledVerses.push(existingVerse247);
      continue;
    }

    const sivanandaTr = sivanandaMap.get(rv.id);
    if (!sivanandaTr || !sivanandaTr.description) {
      throw new Error(`Missing Sivananda translation for ${verseId} (raw id ${rv.id})`);
    }

    // Parse word meanings if present
    let wordMeanings = undefined;
    if (rv.word_meanings && rv.word_meanings.trim().length > 0) {
      const parsed = {};
      const parts = rv.word_meanings.split(';');
      for (const p of parts) {
        const idx = p.indexOf('—') !== -1 ? p.indexOf('—') : p.indexOf('--');
        if (idx !== -1) {
          const k = p.substring(0, idx).trim();
          const val = p.substring(idx + 1).trim();
          if (k && val) parsed[k] = val;
        }
      }
      if (Object.keys(parsed).length > 0) {
        wordMeanings = parsed;
      }
    }

    // Clean text: strip trailing verse number marker like ।।1.1।।
    let cleanSanskrit = rv.text
      .replace(/।।\s*\d+\.\d+\s*।।/g, '')
      .replace(/॥\s*\d+\.\d+\s*॥/g, '')
      .trim();

    let cleanIast = rv.transliteration ? rv.transliteration.trim() : '';

    compiledVerses.push({
      id: verseId,
      scripture_id: 'bhagavad-gita',
      chapter_number: rv.chapter_number,
      verse_number: rv.verse_number,
      sanskrit_devanagari: cleanSanskrit,
      transliteration_iast: cleanIast,
      verification_status: 'verified',
      verified_by: 'Canonical Bhagavad Gita Textual Ingestion (gita/gita Public Domain archive concorded with Swami Sivananda 1942)',
      metadata: {
        verse_order: verseOrder,
        chapter_title_en: existingData.chapters.find((c) => c.chapter_number === rv.chapter_number)?.name_english,
      },
      translations: [
        {
          id: `${verseId}-sivananda-en`,
          source_id: 'src_sivananda_1942',
          language: 'en',
          translation_text: sivanandaTr.description.trim(),
          word_meanings: wordMeanings,
        },
      ],
    });
  }

  // Update canonical_verses count in metadata
  existingData.scripture.canonical_verses = compiledVerses.length;
  existingData.verses = compiledVerses;

  console.log(`Writing complete dataset with ${compiledVerses.length} verses to: ${existingFile}`);
  fs.writeFileSync(existingFile, JSON.stringify(existingData, null, 2), 'utf8');

  console.log('✅ Successfully created complete dataset JSON!');
  console.log(`Total Chapters:     ${existingData.chapters.length}`);
  console.log(`Total Verses:       ${compiledVerses.length}`);
  const totalTranslations = compiledVerses.reduce((acc, v) => acc + v.translations.length, 0);
  console.log(`Total Translations: ${totalTranslations}`);
}

buildCompleteDataset().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
