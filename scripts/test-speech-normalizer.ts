import { SpeechNormalizer } from '../src/tts/speech-normalizer';

function runNormalizationTests() {
  console.log('--- Running SpeechNormalizer Test Suite ---\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // TC01: Scripture Citation Expansion (Hindi)
  const rawHindi = 'हे पार्थ! [BG 2.47] के अनुसार कर्म करो। फल की चिंता मत करो।';
  const cleanHindi = SpeechNormalizer.cleanRawText(rawHindi, true);
  assert(
    cleanHindi.includes('श्रीमद्भगवद्गीता अध्याय 2, श्लोक 47'),
    'Expands [BG 2.47] to spoken Hindi scripture title',
  );
  assert(!cleanHindi.includes('['), 'Strips bracket tags');

  // TC02: Scripture Citation Expansion (English)
  const rawEnglish = 'Remember [BG 18.66]: surrender all duties unto Me.';
  const cleanEnglish = SpeechNormalizer.cleanRawText(rawEnglish, false);
  assert(
    cleanEnglish.includes('Bhagavad Gita Chapter 18, Verse 66'),
    'Expands [BG 18.66] to spoken English title',
  );

  // TC03: Strip Decorative Markdown Headings & Formatting
  const rawMarkdown = `### **Spiritual Reflection (Aatmik Chintan):**\n- मन को शांत रखो।\n- **कर्मण्येवाधिकारस्ते** पर ध्यान दो।\nhttp://example.com/verse`;
  const cleanMd = SpeechNormalizer.cleanRawText(rawMarkdown, true);
  assert(!cleanMd.includes('###'), 'Removes markdown hashes');
  assert(!cleanMd.includes('**'), 'Removes bold asterisks');
  assert(!cleanMd.includes('http'), 'Strips raw URLs');
  assert(cleanMd.includes('कर्मण्येवाधिकारस्ते'), 'Preserves Sanskrit terms in Devanagari');

  // TC04: Context-Aware Delivery Style Classification
  const distressText = 'मुझे बहुत चिंता और घबराहट हो रही है। मन बहुत अशांत है।';
  const style1 = SpeechNormalizer.classifyDeliveryStyle(distressText);
  assert(style1.style === 'COMPASSIONATE', 'Classifies anxiety/distress as COMPASSIONATE');
  assert(style1.temperature === 0.72 && style1.pace === 0.88, 'Applies gentle pace and warm temp for COMPASSIONATE');

  const meditationText = 'आत्मज्ञान और ध्यान की साधना से मोक्ष का मार्ग प्रशस्त होता है।';
  const style2 = SpeechNormalizer.classifyDeliveryStyle(meditationText);
  assert(style2.style === 'CALM_REFLECTIVE', 'Classifies meditation/soul inquiry as CALM_REFLECTIVE');

  const actionText = 'उठो हे अर्जुन, और अपने धर्म के लिए कर्म करो! साहस रखो।';
  const style3 = SpeechNormalizer.classifyDeliveryStyle(actionText);
  assert(style3.style === 'GENTLE_ENCOURAGING', 'Classifies duty/courage as GENTLE_ENCOURAGING');

  const verseCommentary = 'इस श्लोक का अर्थ यह है कि अध्याय 4 में भगवान ने कर्मयोग की व्याख्या की है।';
  const style4 = SpeechNormalizer.classifyDeliveryStyle(verseCommentary);
  assert(style4.style === 'EXPLANATORY', 'Classifies verse analysis as EXPLANATORY');

  // TC05: Long Response Segmentation without breaking sentences
  const longText = `नमस्ते प्रिय मित्र। जब जीवन में अनिश्चितता आए, तो अपने मन को स्थिर करो।\n\nश्रीमद्भगवद्गीता अध्याय २, श्लोक ४७ में भगवान श्रीकृष्ण कहते हैं कि तुम्हारा अधिकार केवल कर्म करने में है, उसके फलों में कभी नहीं। इसलिए निष्काम भाव से अपने कर्तव्य का पालन करो।\n\nआत्मिक चिंतन: जब तुम परिणाम की आशा छोड़ केवल कर्म में तल्लीन होते हो, तब मन स्वतः शांत और आनंदमय हो जाता है। यही सच्चा योग है।`;
  const prep = SpeechNormalizer.prepare(longText);
  assert(prep.chunks.length >= 2, `Segments multi-paragraph response into ${prep.chunks.length} natural chunks`);
  assert(
    prep.chunks.every((c) => c.length <= 450),
    'All chunks remain within conversational length (<= 450 chars)',
  );
  assert(
    prep.chunks.every((c) => !c.startsWith('- ') && !c.includes('###')),
    'No chunk contains stray markdown or bullets',
  );

  console.log(`\n====================================================`);
  console.log(`NORMALIZATION TEST SUMMARY: Passed: ${passed} | Failed: ${failed}`);
  console.log(`====================================================\n`);

  if (failed > 0) process.exit(1);
}

runNormalizationTests();
