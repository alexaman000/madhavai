import { CitationVerifier } from '../src/chat/citation-verifier';
import { QueryIntentClassifier } from '../src/chat/query-intent.classifier';

// Initialize verifier
CitationVerifier.init();

interface TestCaseResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestCaseResult[] = [];

function assert(condition: boolean, testName: string, passDetails: string, failDetails: string) {
  if (condition) {
    results.push({ name: testName, passed: true, details: passDetails });
    console.log(`✅ [PASS] ${testName}: ${passDetails}`);
  } else {
    results.push({ name: testName, passed: false, details: failDetails });
    console.error(`❌ [FAIL] ${testName}: ${failDetails}`);
  }
}

async function runStep12BValidationSuite() {
  console.log('================================================================');
  console.log('  Madhav.ai — Step 12B Citation Grounding & Verification Test');
  console.log('================================================================\n');

  // ----------------------------------------------------------------
  // CHECK 1: Canonical chapter/verse validation uses actual DB records
  // ----------------------------------------------------------------
  console.log('--- Check 1: Canonical Verse Boundaries Against DB Records ---');
  // Ch 1 max is 47, Ch 2 max is 72, Ch 12 max is 20, Ch 18 max is 78
  const ch12_20 = CitationVerifier.isValidCanonicalVerse(12, 20); // Valid (last verse of Ch 12)
  const ch12_21 = CitationVerifier.isValidCanonicalVerse(12, 21); // Invalid (Ch 12 has only 20 verses)
  const ch2_72 = CitationVerifier.isValidCanonicalVerse(2, 72);   // Valid
  const ch2_73 = CitationVerifier.isValidCanonicalVerse(2, 73);   // Invalid
  const ch18_78 = CitationVerifier.isValidCanonicalVerse(18, 78); // Valid
  const ch19_1 = CitationVerifier.isValidCanonicalVerse(19, 1);   // Invalid (only 18 chapters)
  const ch2_999 = CitationVerifier.isValidCanonicalVerse(2, 999); // Invalid

  assert(
    ch12_20 && !ch12_21 && ch2_72 && !ch2_73 && ch18_78 && !ch19_1 && !ch2_999,
    'Check 1: Canonical Chapter & Verse Boundary Validation',
    'Ch 12:20 valid, Ch 12:21 invalid, Ch 2:72 valid, Ch 2:73 invalid, Ch 19:1 invalid, Ch 2:999 invalid.',
    'Failed to enforce actual chapter-by-chapter verse bounds.',
  );

  // ----------------------------------------------------------------
  // CHECK 2 & 3: Provenance & Gemini fabrication rejection
  // ----------------------------------------------------------------
  console.log('\n--- Check 2 & 3: Provenance Verification & Fabrication Defense ---');
  // Suppose Gemini generated prose citing Chapter 18 Verse 66, but Turn 1 retrieved ONLY Chapter 2 Verse 47
  const currentRetrieved = [
    { chapter_number: 2, verse_number: 47, similarity_score: 0.95 },
  ];
  const fabricatedProse = 'In Bhagavad Gita, Chapter 18, Verse 66, Sri Krishna urges full surrender.';
  const intentSpiritual = QueryIntentClassifier.classify('How do I surrender?');

  const provResult = CitationVerifier.verify(fabricatedProse, currentRetrieved, intentSpiritual);

  assert(
    provResult.verifiedCitations.length === 0,
    'Check 2 & 3: Unretrieved Real Verse (BG 18.66) Rejected',
    'Even though BG 18.66 is a real verse, it was not retrieved in this turn and was rejected from citations.',
    `Expected 0 citations, got ${provResult.verifiedCitations.length}`,
  );

  // ----------------------------------------------------------------
  // CHECK 4: Canonical Hydration of Displayed Verse Text
  // ----------------------------------------------------------------
  console.log('\n--- Check 4: Metadata Hydration from Verified DB Records ---');
  const validProse = 'As taught in Bhagavad Gita Chapter 2, Verse 47, कर्मण्येवाधिकारस्ते मा फलेषु कदाचन: focus on duty, not fruits.';
  const intentVerse = QueryIntentClassifier.classify('Explain BG 2.47');

  const validResult = CitationVerifier.verify(validProse, currentRetrieved, intentVerse);
  const cit = validResult.verifiedCitations[0];

  assert(
    validResult.verifiedCitations.length === 1 &&
      cit.sanskritDevanagari?.includes('कर्मण्येवाधिकारस्ते') &&
      cit.chapter === 2 &&
      (cit.chapterTitle === 'The Yoga of Analytical Knowledge' || cit.chapterTitle?.includes('Yoga')),
    'Check 4: Canonical Hydration from Database Records',
    `Verse 2.47 hydrated with authentic Sanskrit (${cit?.sanskritDevanagari?.substring(0, 30)}...), English Title (${cit?.chapterTitle}).`,
    'Failed to hydrate authentic Sanskrit or metadata from canonical record.',
  );

  // ----------------------------------------------------------------
  // CHECK 5: Claim Support Rejects Real but Irrelevant Candidate
  // ----------------------------------------------------------------
  console.log('\n--- Check 5: Claim Support Rejection of Irrelevant Candidates ---');
  // Vector search returned candidate BG 6.11 (sitting on kusha grass) and BG 2.47
  const multiCandidates = [
    { chapter_number: 2, verse_number: 47, similarity_score: 0.88 },
    { chapter_number: 6, verse_number: 11, similarity_score: 0.75 }, // Irrelevant to answer
  ];
  const dutyAnswer = 'Perform your duty with dedication without worrying about the results, as explained in Chapter 2, Verse 47.';
  const claimResult = CitationVerifier.verify(dutyAnswer, multiCandidates, intentSpiritual);

  const has2_47 = claimResult.verifiedCitations.some((c) => c.chapter === 2 && c.verse === 47);
  const has6_11 = claimResult.verifiedCitations.some((c) => c.chapter === 6 && c.verse === 11);

  assert(
    claimResult.verifiedCitations.length === 1 && has2_47 && !has6_11,
    'Check 5: Claim Support Prunes Real But Irrelevant Candidate (BG 6.11)',
    'BG 2.47 accepted (cited in answer); BG 6.11 pruned because answer did not claim or discuss it.',
    'Failed to prune irrelevant candidate verse.',
  );

  // ----------------------------------------------------------------
  // CHECK 6: Invalid Citations Pruned without Discarding Useful Answer
  // ----------------------------------------------------------------
  console.log('\n--- Check 6: Safe Removal of Malformed Tags without Answer Loss ---');
  const answerWithBadTag = 'Stay calm during tests [BG 99.99]. Taking deep breaths helps center the mind.';
  const badTagResult = CitationVerifier.verify(answerWithBadTag, [], intentSpiritual);

  assert(
    !badTagResult.cleanedAnswer.includes('[BG 99.99]') &&
      badTagResult.cleanedAnswer.includes('Taking deep breaths helps center the mind') &&
      badTagResult.verifiedCitations.length === 0,
    'Check 6: Nonexistent Bracket Tag Cleaned Gracefully',
    'Malformed tag [BG 99.99] cleaned while preserving user advice; zero invalid citations emitted.',
    'Failed to cleanly sanitize malformed bracket tag while keeping answer text.',
  );

  // ----------------------------------------------------------------
  // CHECK 7: Technical Questions Bypass Scripture Citations
  // ----------------------------------------------------------------
  console.log('\n--- Check 7: Technical Query Intent and Citation Suppression ---');
  const pythonIntent = QueryIntentClassifier.classify('How do I write a binary search in Python?');
  const pythonAnswer = 'Here is the binary search function in Python:\n```python\ndef binary_search(arr, x):\n  ...\n```';

  // Even if accidental candidates were passed:
  const techResult = CitationVerifier.verify(pythonAnswer, multiCandidates, pythonIntent);

  assert(
    pythonIntent.type === 'GENERAL_FACTUAL_OR_TECHNICAL' && techResult.verifiedCitations.length === 0,
    'Check 7: Technical Questions Suppress Scripture Citations',
    'Python binary search classified as GENERAL_FACTUAL_OR_TECHNICAL; citations strictly empty [].',
    `Expected empty citations, got ${techResult.verifiedCitations.length}`,
  );

  // ----------------------------------------------------------------
  // CHECK 8: Conversation History Cannot Authorize New Citations
  // ----------------------------------------------------------------
  console.log('\n--- Check 8: History Scoping (Zero Accidental Citation Carryover) ---');
  // Turn 1 discussed BG 2.47. In Turn 2, currentRequestVerses is EMPTY.
  const turn2Answer = 'Continuing from our earlier discussion, here are 3 morning steps for your office routine.';
  const turn2Result = CitationVerifier.verify(turn2Answer, [], intentSpiritual);

  assert(
    turn2Result.verifiedCitations.length === 0,
    'Check 8: History Cannot Authorize Citations for Turn 2',
    'Turn 2 has 0 current turn retrieved verses -> 0 citations emitted, preventing history leakage.',
    `Expected 0 citations, got ${turn2Result.verifiedCitations.length}`,
  );

  // ----------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------
  console.log('\n================================================================');
  console.log('  Step 12B Automated Verification Summary');
  console.log('================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  console.log(`Passed: ${passed}/${total} checks (${Math.round((passed / total) * 100)}%)`);

  for (const r of results) {
    console.log(`- ${r.passed ? 'PASS' : 'FAIL'}: ${r.name}`);
  }

  if (passed !== total) {
    process.exit(1);
  }
}

runStep12BValidationSuite().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
