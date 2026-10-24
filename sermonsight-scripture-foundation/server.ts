import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CANONICAL_66_BOOKS } from './src/data/canonicalBooks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());

// Open sermonsight.ss database
const DB_PATH = path.resolve(__dirname, 'sermonsight.ss');
let db: DatabaseSync | null = null;

try {
  if (fs.existsSync(DB_PATH)) {
    db = new DatabaseSync(DB_PATH, { readOnly: true });
    console.log(`[SermonSight] Connected to ${DB_PATH} successfully.`);
  } else {
    console.warn(`[SermonSight] sermonsight.ss not found at ${DB_PATH}. Please run npm run build:db.`);
  }
} catch (e) {
  console.error('[SermonSight] Failed to open database:', e);
}

// Spoken number word to digit map
const WORD_TO_NUMBER: Record<string, number> = {
  first: 1, '1st': 1, one: 1,
  second: 2, '2nd': 2, two: 2,
  third: 3, '3rd': 3, three: 3,
  fourth: 4, '4th': 4, four: 4,
  fifth: 5, '5th': 5, five: 5,
  sixth: 6, '6th': 6, six: 6,
  seventh: 7, '7th': 7, seven: 7,
  eighth: 8, '8th': 8, eight: 8,
  ninth: 9, '9th': 9, nine: 9,
  tenth: 10, '10th': 10, ten: 10,
  eleventh: 11, eleven: 11,
  twelfth: 12, twelve: 12,
  thirteenth: 13, thirteen: 13,
  fourteenth: 14, fourteen: 14,
  fifteenth: 15, fifteen: 15,
  sixteenth: 16, sixteen: 16,
  seventeenth: 17, seventeen: 17,
  eighteenth: 18, eighteen: 18,
  nineteenth: 19, nineteen: 19,
  twentieth: 20, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100
};

function parseNumberWords(str: string): number | null {
  const clean = str.trim().toLowerCase();
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);

  const tokens = clean.split(/[\s-]+/);
  let total = 0;
  let current = 0;

  for (const token of tokens) {
    if (WORD_TO_NUMBER[token] !== undefined) {
      const val = WORD_TO_NUMBER[token];
      if (val === 100) {
        current = (current === 0 ? 1 : current) * 100;
      } else if (val >= 20 && val <= 90) {
        current += val;
      } else {
        current += val;
      }
    } else if (/^\d+$/.test(token)) {
      current += parseInt(token, 10);
    } else {
      return null;
    }
  }
  total += current;
  return total > 0 ? total : null;
}

// Canonical recognition resolver
function recognizeScriptureSpokenOrText(input: string) {
  if (!input || !input.trim()) return null;

  const rawInput = input.trim();
  let normalized = rawInput.toLowerCase()
    .replace(/[,\.;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize spoken prefixes like "1st", "first", "second", "third"
  normalized = normalized
    .replace(/\bfirst\s+/g, '1 ')
    .replace(/\b1st\s+/g, '1 ')
    .replace(/\bi\s+(samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john)/g, '1 $1')
    .replace(/\bsecond\s+/g, '2 ')
    .replace(/\b2nd\s+/g, '2 ')
    .replace(/\bii\s+(samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john)/g, '2 $1')
    .replace(/\bthird\s+/g, '3 ')
    .replace(/\b3rd\s+/g, '3 ')
    .replace(/\biii\s+(john)/g, '3 $1');

  // Try matching with alias dictionary
  for (const book of CANONICAL_66_BOOKS) {
    for (const alias of book.aliases) {
      const aliasLower = alias.toLowerCase();
      // Test if input begins with this alias
      const regex = new RegExp(`^${aliasLower.replace(/\s+/g, '\\s+')}(\\b|\\s|\\d|:)(.*)$`, 'i');
      const match = normalized.match(regex);
      if (match) {
        const rest = match[2]?.trim() || '';
        // Look for chapter and verse patterns in rest
        // Patterns:
        // "chapter 3 verse 16"
        // "3:16", "3:16-18"
        // "3 16"
        // "three sixteen", "chapter three verse sixteen"
        // "chapter 3", "3"
        const chapVerseMatch1 = rest.match(/^(?:chapter\s+)?(\w+)(?:\s*(?::|verse|v\.?)\s*|\s+)(\w+)(?:\s*(?:to|through|-)\s*(\w+))?$/i);
        const chapOnlyMatch = rest.match(/^(?:chapter\s+)?(\w+)$/i);

        if (chapVerseMatch1) {
          const chapNum = parseNumberWords(chapVerseMatch1[1]);
          const verseNum = parseNumberWords(chapVerseMatch1[2]);
          const endVerseNum = chapVerseMatch1[3] ? parseNumberWords(chapVerseMatch1[3]) : null;

          if (chapNum && chapNum <= book.chapter_count && (!verseNum || verseNum <= 176)) {
            const verse = verseNum || 1;
            return {
              matched: true,
              canonical_id: `${book.osis_id}.${chapNum}.${verse}`,
              osis_id: book.osis_id,
              book_id: book.id,
              book_name: book.name,
              chapter: chapNum,
              verse: verse,
              end_verse: endVerseNum,
              reference: endVerseNum ? `${book.name} ${chapNum}:${verse}-${endVerseNum}` : `${book.name} ${chapNum}:${verse}`,
              confidence: 0.98,
              detected_alias: alias,
            };
          }
        } else if (chapOnlyMatch) {
          const chapNum = parseNumberWords(chapOnlyMatch[1]);
          if (chapNum && chapNum <= book.chapter_count) {
            return {
              matched: true,
              canonical_id: `${book.osis_id}.${chapNum}.1`,
              osis_id: book.osis_id,
              book_id: book.id,
              book_name: book.name,
              chapter: chapNum,
              verse: 1,
              end_verse: null,
              reference: `${book.name} ${chapNum}:1`,
              is_chapter_reference: true,
              confidence: 0.92,
              detected_alias: alias,
            };
          }
        }
      }
    }
  }

  // Fallback regex pattern matching
  const generalMatch = normalized.match(/^([\d\s\w]+?)\s+(?:chapter\s+)?(\d+)(?:\s*[:\s]\s*(\d+))?(?:-(\d+))?$/i);
  if (generalMatch) {
    const bookQuery = generalMatch[1].trim();
    const chap = parseInt(generalMatch[2], 10);
    const verse = generalMatch[3] ? parseInt(generalMatch[3], 10) : 1;
    const endVerse = generalMatch[4] ? parseInt(generalMatch[4], 10) : null;

    const matchedBook = CANONICAL_66_BOOKS.find(b =>
      b.name.toLowerCase() === bookQuery ||
      b.abbreviation.toLowerCase() === bookQuery ||
      b.aliases.some(a => a.toLowerCase() === bookQuery)
    );

    if (matchedBook && chap <= matchedBook.chapter_count) {
      return {
        matched: true,
        canonical_id: `${matchedBook.osis_id}.${chap}.${verse}`,
        osis_id: matchedBook.osis_id,
        book_id: matchedBook.id,
        book_name: matchedBook.name,
        chapter: chap,
        verse: verse,
        end_verse: endVerse,
        reference: endVerse ? `${matchedBook.name} ${chap}:${verse}-${endVerse}` : `${matchedBook.name} ${chap}:${verse}`,
        confidence: 0.95,
      };
    }
  }

  return null;
}

// API Routes
app.get('/api/db-status', (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Database not initialized.' });
  }

  try {
    const metadataRows = db.prepare('SELECT * FROM metadata').all() as any[];
    const metaMap: Record<string, string> = {};
    for (const row of metadataRows) {
      metaMap[row.key] = row.value;
    }

    const translations = db.prepare('SELECT * FROM translations').all();
    const booksCount = (db.prepare('SELECT COUNT(*) as count FROM books').get() as any).count;
    const chaptersCount = (db.prepare('SELECT COUNT(*) as count FROM chapters').get() as any).count;
    const versesCount = (db.prepare('SELECT COUNT(*) as count FROM verses').get() as any).count;
    const kjvCount = (db.prepare("SELECT COUNT(*) as count FROM verses WHERE translation_id = 'KJV'").get() as any).count;

    res.json({
      status: 'ready',
      database_file: 'sermonsight.ss',
      metadata: metaMap,
      translations,
      counts: {
        books: booksCount,
        chapters: chaptersCount,
        verses: versesCount,
        kjv_verses: kjvCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Books endpoint
app.get('/api/books', (req, res) => {
  if (!db) return res.status(500).json({ error: 'DB offline' });
  try {
    const books = db.prepare('SELECT * FROM books ORDER BY canonical_order ASC').all();
    res.json(books);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Chapter verses endpoint
app.get('/api/chapter/:bookId/:chapter', (req, res) => {
  if (!db) return res.status(500).json({ error: 'DB offline' });
  try {
    const bookId = parseInt(req.params.bookId, 10);
    const chapterNum = parseInt(req.params.chapter, 10);
    const translation = (req.query.translation as string) || 'KJV';

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;
    if (!book) return res.status(404).json({ error: 'Book not found' });

    const verses = db.prepare(`
      SELECT * FROM verses 
      WHERE book_id = ? AND chapter_number = ? AND translation_id = ?
      ORDER BY verse_number ASC
    `).all(bookId, chapterNum, translation);

    res.json({
      book,
      chapter: chapterNum,
      translation,
      verses,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Single verse by canonical ID with all translation layers
app.get('/api/verse/:canonical_id', (req, res) => {
  if (!db) return res.status(500).json({ error: 'DB offline' });
  try {
    const canonicalId = req.params.canonical_id;
    const translations = db.prepare('SELECT * FROM translations').all() as any[];

    const verses = db.prepare(`
      SELECT * FROM verses WHERE canonical_id = ?
    `).all(canonicalId) as any[];

    const versesMap: Record<string, any> = {};
    for (const v of verses) {
      versesMap[v.translation_id] = v;
    }

    // Build layered response for the 5 required translations
    const layers = translations.map(t => {
      const loadedVerse = versesMap[t.id];
      return {
        translation_id: t.id,
        name: t.name,
        publisher: t.publisher,
        license_status: t.license_status,
        text_status: loadedVerse ? loadedVerse.validation_status : t.text_status,
        text: loadedVerse ? loadedVerse.text : null,
        notice: loadedVerse ? null : `Requires authorized source API access. Zero AI-generated text inserted per Scripture-integrity rule.`,
      };
    });

    res.json({
      canonical_id: canonicalId,
      layers,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Preacher speech recognition and phrase resolution endpoint
app.post('/api/recognize', (req, res) => {
  if (!db) return res.status(500).json({ error: 'DB offline' });
  try {
    const { speech_text, preferred_translation = 'KJV' } = req.body;
    if (!speech_text) {
      return res.status(400).json({ error: 'Missing speech_text in request body' });
    }

    const recognized = recognizeScriptureSpokenOrText(speech_text);
    if (!recognized) {
      return res.json({
        matched: false,
        raw_input: speech_text,
        message: 'No canonical Scripture reference recognized from input phrase.',
      });
    }

    // Fetch canonical verse for preferred translation
    const verseRecord = db.prepare(`
      SELECT * FROM verses 
      WHERE canonical_id = ? AND translation_id = ?
    `).get(recognized.canonical_id, preferred_translation) as any;

    // Fetch all available translation layers
    const allTranslations = db.prepare('SELECT * FROM translations').all() as any[];
    const allVerses = db.prepare('SELECT * FROM verses WHERE canonical_id = ?').all(recognized.canonical_id) as any[];
    const verseMap: Record<string, any> = {};
    for (const v of allVerses) verseMap[v.translation_id] = v;

    const translationLayers = allTranslations.map(t => ({
      translation: t.id,
      name: t.name,
      license_status: t.license_status,
      text_status: verseMap[t.id] ? verseMap[t.id].validation_status : t.text_status,
      text: verseMap[t.id] ? verseMap[t.id].text : null,
      source: t.source,
    }));

    res.json({
      matched: true,
      raw_input: speech_text,
      canonical_id: recognized.canonical_id,
      reference: recognized.reference,
      book_name: recognized.book_name,
      chapter: recognized.chapter,
      verse: recognized.verse,
      end_verse: recognized.end_verse,
      confidence: recognized.confidence,
      selected_translation: preferred_translation,
      text: verseRecord ? verseRecord.text : null,
      validation_status: verseRecord ? verseRecord.validation_status : 'REQUIRES_AUTHORIZED_SOURCE',
      translation_layers: translationLayers,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Search endpoint (Exact reference, Keyword, and Phrase search)
app.get('/api/search', (req, res) => {
  if (!db) return res.status(500).json({ error: 'DB offline' });
  try {
    const q = (req.query.q as string || '').trim();
    const translation = (req.query.translation as string) || 'KJV';
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);

    if (!q) {
      return res.json({ query: '', count: 0, results: [] });
    }

    // Check if query is a canonical reference or speech phrase
    const recognized = recognizeScriptureSpokenOrText(q);
    let referenceResult: any = null;

    if (recognized) {
      const refVerse = db.prepare(`
        SELECT * FROM verses 
        WHERE canonical_id = ? AND translation_id = ?
      `).get(recognized.canonical_id, translation) as any;

      if (refVerse) {
        referenceResult = {
          canonical_id: recognized.canonical_id,
          reference: recognized.reference,
          translation: translation,
          text: refVerse.text,
          validation_status: refVerse.validation_status,
          match_type: 'exact_reference',
        };
      }
    }

    // Normalized search query
    const norm = q.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const searchPattern = `%${norm}%`;

    const matches = db.prepare(`
      SELECT canonical_id, reference, translation_id, text, 'text_match' as match_type
      FROM search_index
      WHERE normalized_text LIKE ? AND translation_id = ?
      LIMIT ?
    `).all(searchPattern, translation, limit) as any[];

    // If reference result exists, prepend it if not already present
    const results: any[] = [];
    if (referenceResult) {
      results.push(referenceResult);
    }

    for (const m of matches) {
      if (!results.some(r => r.canonical_id === m.canonical_id)) {
        results.push({
          canonical_id: m.canonical_id,
          reference: m.reference,
          translation: m.translation_id,
          text: m.text,
          validation_status: 'verified',
          match_type: 'phrase_match',
        });
      }
    }

    res.json({
      query: q,
      translation,
      count: results.length,
      results,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Audit endpoint
app.get('/api/audit', (req, res) => {
  if (!db) return res.status(500).json({ error: 'DB offline' });
  try {
    const checks = db.prepare('SELECT * FROM validation_results ORDER BY id ASC').all();
    const reportPath = path.resolve(__dirname, 'validation-report.json');
    let reportData = null;
    if (fs.existsSync(reportPath)) {
      reportData = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    }

    res.json({
      report: reportData,
      checks,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Download files endpoint
app.get('/api/download/:file', (req, res) => {
  const allowed = ['sermonsight.ss', 'validation-report.json', 'validation-report.txt', 'source-manifest.json', 'schema.sql', 'README.md'];
  const fileName = req.params.file;
  if (!allowed.includes(fileName)) {
    return res.status(404).send('File not found');
  }

  const filePath = path.resolve(__dirname, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found on disk');
  }

  res.download(filePath, fileName);
});

// Mount Vite middleware in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SermonSight Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
