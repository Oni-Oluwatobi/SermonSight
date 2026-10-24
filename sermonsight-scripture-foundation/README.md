# SermonSight Scripture Database (`sermonsight.ss`)

**The Official Master Scripture Data Foundation for SermonSight**  
*Offline-First Church Presentation & Live Preacher Scripture Recognition Engine*  
*Developed by The Kreadive Galaxy*

---

## 1. Executive Summary & Specification

| Specification | Details |
| :--- | :--- |
| **Database File** | `sermonsight.ss` (Standard SQLite 3 binary structure) |
| **Canon** | Standard Protestant 66-Book Canon (Genesis → Revelation) |
| **Total Canonical Verses** | **31,102** |
| **Total Canonical Chapters** | **1,189** |
| **Old Testament Books** | 39 Books (Genesis to Malachi) |
| **New Testament Books** | 27 Books (Matthew to Revelation) |
| **Required Translations** | KJV, NIV, NLT, NKJV, MSG |
| **Authoritative KJV Source** | Midvash Open Bible Dataset / JSONBible (Public Domain) |
| **Scripture Integrity Rule** | **Zero AI-generated Scripture text**. 100% strictly verified source data. |
| **Offline Architecture** | 100% Local SQLite lookup. Zero internet / cloud / Firebase required for lookup. |

---

## 2. Canonical Structure & Translation Layering

The database decouples canonical Scripture coordinates from individual translation texts. Every verse in the 66-book canon possesses a single canonical identifier (`canonical_id`), structured as `{OSIS_BOOK}.{CHAPTER}.{VERSE}`.

```text
CANONICAL VERSE: JHN.3.16 (Reference: John 3:16)
      │
      ├── KJV  → "For God so loved the world, that he gave his only begotten Son..." [VERIFIED]
      ├── NIV  → [REQUIRES_AUTHORIZED_SOURCE] (Biblica / API.Bible)
      ├── NLT  → [REQUIRES_AUTHORIZED_SOURCE] (Tyndale NLT API: api.nlt.to)
      ├── NKJV → [REQUIRES_AUTHORIZED_SOURCE] (Thomas Nelson / API.Bible)
      └── MSG  → [REQUIRES_AUTHORIZED_SOURCE] (NavPress / API.Bible)
```

### Translation Status Overview

| Translation ID | Name | Source | License Status | Text Status |
| :--- | :--- | :--- | :--- | :--- |
| **KJV** | King James Version (1611) | Midvash Bible Data | Public Domain | `verified` (31,102 verses loaded) |
| **NIV** | New International Version | API.Bible | Commercial / Biblica, Inc. | `REQUIRES_AUTHORIZED_SOURCE` |
| **NLT** | New Living Translation | Tyndale NLT API (`api.nlt.to`) | Authorized Source Required | `REQUIRES_AUTHORIZED_SOURCE` |
| **NKJV** | New King James Version | API.Bible | Commercial / Thomas Nelson | `REQUIRES_AUTHORIZED_SOURCE` |
| **MSG** | The Message | API.Bible | Commercial / NavPress | `REQUIRES_AUTHORIZED_SOURCE` |

---

## 3. Translation-Independent Preacher Speech & Reference Recognition

SermonSight listens to spoken preacher audio or operator input. Preachers frequently quote scripture in diverse spoken forms or switch translations mid-sermon. The recognition engine maps raw speech transcripts to canonical identifiers deterministically:

- **Spoken Input**: `"John chapter three verse sixteen"` → Resolves `JHN.3.16` → Fetches operator's active presentation translation (e.g. KJV or modern layer).
- **Spoken Input**: `"First Corinthians thirteen four through eight"` → Resolves `1CO.13.4` (Range: 1CO.13.4 - 1CO.13.8).
- **Abbreviated Input**: `"Rom 8:28"`, `"Gen 1:1"`, `"Ps 23 1"`, `"Jn 14:6"`.

---

## 4. Database Schema (`schema.sql`)

```sql
-- Logical entities in sermonsight.ss:
-- 1. metadata (database-level versions, manifests, integrity flags)
-- 2. translations (metadata, license status, copyright notices)
-- 3. books (66 canon books, OSIS IDs, testaments, chapter counts)
-- 4. chapters (1,189 chapters mapped to canonical IDs)
-- 5. verses (31,102 canonical verses per translation layer)
-- 6. aliases (comprehensive spoken and written book aliases)
-- 7. search_index (normalized tokens, keywords for fast offline search)
-- 8. validation_results (audit trail and integrity verification results)
```

---

## 5. Deterministic Validation Audit Summary

```text
=========================================
SERMONSIGHT SCRIPTURE DATABASE AUDIT
=========================================

CANON
66 books expected: 66 verified
39 Old Testament books, 27 New Testament books
1,189 chapters verified
31,102 canonical verse slots established

KJV
Books: 66 / 66
Chapters: 1,189 / 1,189
Verses: 31,102 / 31,102
Missing: 0 | Duplicates: 0 | Invalid: 0 | Unverified: 0
Status: VERIFIED (Public Domain)

MODERN TRANSLATIONS (NIV, NLT, NKJV, MSG)
Status: REQUIRES_AUTHORIZED_SOURCE
AI-Fabricated Verses: 0 (Strict Zero-AI Compliance)

DATABASE AUDIT
Database integrity: VERIFIED (SQLite 3 binary format)
Schema integrity: VERIFIED (8 tables, 8 performance indexes)
Index integrity: VERIFIED (Exact, Normalized, Tokenized, Aliases)
Overall status: PASS
=========================================
```

---

## 6. How to Query the Database in Production Applications

### Node.js / TypeScript Example:
```typescript
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('sermonsight.ss');

// 1. Exact Reference Lookup
const verse = db.prepare(`
  SELECT canonical_id, reference, translation_id, text, validation_status
  FROM verses
  WHERE canonical_id = ? AND translation_id = ?
`).get('JHN.3.16', 'KJV');

console.log(verse);
// Output: { canonical_id: 'JHN.3.16', reference: 'John 3:16', translation_id: 'KJV', text: 'For God so loved the world...', validation_status: 'verified' }

// 2. Keyword / Phrase Search
const results = db.prepare(`
  SELECT canonical_id, reference, text 
  FROM search_index 
  WHERE normalized_text LIKE ? AND translation_id = 'KJV'
  LIMIT 10
`).all('%love your enemies%');
```

---

## 7. Artifacts Included

1. `sermonsight.ss` — Master binary database file.
2. `validation-report.json` — Machine-readable deterministic audit report.
3. `validation-report.txt` — Formatted audit transcript.
4. `source-manifest.json` — Attribution, licensing, and acquisition metadata.
5. `schema.sql` — Complete DDL table and index definitions.
