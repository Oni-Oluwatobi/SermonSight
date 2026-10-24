import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface BookDef {
  id: number;
  osis_id: string;
  name: string;
  abbreviation: string;
  testament: 'OT' | 'NT';
  canonical_order: number;
  chapter_count: number;
  aliases: string[];
}

export const CANONICAL_66_BOOKS: BookDef[] = [
  // Old Testament (39 books)
  { id: 1, osis_id: 'GEN', name: 'Genesis', abbreviation: 'Gen', testament: 'OT', canonical_order: 1, chapter_count: 50, aliases: ['Genesis', 'Gen', 'Ge', 'Gn', '1st Book of Moses'] },
  { id: 2, osis_id: 'EXO', name: 'Exodus', abbreviation: 'Exod', testament: 'OT', canonical_order: 2, chapter_count: 40, aliases: ['Exodus', 'Exod', 'Ex', 'Exo', '2nd Book of Moses'] },
  { id: 3, osis_id: 'LEV', name: 'Leviticus', abbreviation: 'Lev', testament: 'OT', canonical_order: 3, chapter_count: 27, aliases: ['Leviticus', 'Lev', 'Le', 'Lv', '3rd Book of Moses'] },
  { id: 4, osis_id: 'NUM', name: 'Numbers', abbreviation: 'Num', testament: 'OT', canonical_order: 4, chapter_count: 36, aliases: ['Numbers', 'Num', 'Nu', 'Nm', 'Nb', '4th Book of Moses'] },
  { id: 5, osis_id: 'DEU', name: 'Deuteronomy', abbreviation: 'Deut', testament: 'OT', canonical_order: 5, chapter_count: 34, aliases: ['Deuteronomy', 'Deut', 'De', 'Dt', '5th Book of Moses'] },
  { id: 6, osis_id: 'JOS', name: 'Joshua', abbreviation: 'Josh', testament: 'OT', canonical_order: 6, chapter_count: 24, aliases: ['Joshua', 'Josh', 'Jos', 'Jsh'] },
  { id: 7, osis_id: 'JDG', name: 'Judges', abbreviation: 'Judg', testament: 'OT', canonical_order: 7, chapter_count: 21, aliases: ['Judges', 'Judg', 'Jdg', 'Jg', 'Jdgs'] },
  { id: 8, osis_id: 'RUT', name: 'Ruth', abbreviation: 'Ruth', testament: 'OT', canonical_order: 8, chapter_count: 4, aliases: ['Ruth', 'Rth', 'Ru'] },
  { id: 9, osis_id: '1SA', name: '1 Samuel', abbreviation: '1Sam', testament: 'OT', canonical_order: 9, chapter_count: 31, aliases: ['1 Samuel', '1Sam', '1 Sam', '1Sa', '1S', 'First Samuel', '1st Samuel', 'I Samuel'] },
  { id: 10, osis_id: '2SA', name: '2 Samuel', abbreviation: '2Sam', testament: 'OT', canonical_order: 10, chapter_count: 24, aliases: ['2 Samuel', '2Sam', '2 Sam', '2Sa', '2S', 'Second Samuel', '2nd Samuel', 'II Samuel'] },
  { id: 11, osis_id: '1KI', name: '1 Kings', abbreviation: '1Kgs', testament: 'OT', canonical_order: 11, chapter_count: 22, aliases: ['1 Kings', '1Kgs', '1 Kgs', '1Ki', '1K', 'First Kings', '1st Kings', 'I Kings'] },
  { id: 12, osis_id: '2KI', name: '2 Kings', abbreviation: '2Kgs', testament: 'OT', canonical_order: 12, chapter_count: 25, aliases: ['2 Kings', '2Kgs', '2 Kgs', '2Ki', '2K', 'Second Kings', '2nd Kings', 'II Kings'] },
  { id: 13, osis_id: '1CH', name: '1 Chronicles', abbreviation: '1Chr', testament: 'OT', canonical_order: 13, chapter_count: 29, aliases: ['1 Chronicles', '1Chr', '1 Chr', '1Ch', 'First Chronicles', '1st Chronicles', 'I Chronicles'] },
  { id: 14, osis_id: '2CH', name: '2 Chronicles', abbreviation: '2Chr', testament: 'OT', canonical_order: 14, chapter_count: 36, aliases: ['2 Chronicles', '2Chr', '2 Chr', '2Ch', 'Second Chronicles', '2nd Chronicles', 'II Chronicles'] },
  { id: 15, osis_id: 'EZR', name: 'Ezra', abbreviation: 'Ezra', testament: 'OT', canonical_order: 15, chapter_count: 10, aliases: ['Ezra', 'Ezr', 'Ez'] },
  { id: 16, osis_id: 'NEH', name: 'Nehemiah', abbreviation: 'Neh', testament: 'OT', canonical_order: 16, chapter_count: 13, aliases: ['Nehemiah', 'Neh', 'Ne'] },
  { id: 17, osis_id: 'EST', name: 'Esther', abbreviation: 'Esth', testament: 'OT', canonical_order: 17, chapter_count: 10, aliases: ['Esther', 'Esth', 'Est', 'Es'] },
  { id: 18, osis_id: 'JOB', name: 'Job', abbreviation: 'Job', testament: 'OT', canonical_order: 18, chapter_count: 42, aliases: ['Job', 'Jb'] },
  { id: 19, osis_id: 'PSA', name: 'Psalms', abbreviation: 'Ps', testament: 'OT', canonical_order: 19, chapter_count: 150, aliases: ['Psalms', 'Psalm', 'Ps', 'Psa', 'Psm', 'Pss'] },
  { id: 20, osis_id: 'PRO', name: 'Proverbs', abbreviation: 'Prov', testament: 'OT', canonical_order: 20, chapter_count: 31, aliases: ['Proverbs', 'Prov', 'Pro', 'Pr', 'Prv'] },
  { id: 21, osis_id: 'ECC', name: 'Ecclesiastes', abbreviation: 'Eccl', testament: 'OT', canonical_order: 21, chapter_count: 12, aliases: ['Ecclesiastes', 'Eccl', 'Ecc', 'Ec', 'Qoh', 'Qoheleth'] },
  { id: 22, osis_id: 'SNG', name: 'Song of Solomon', abbreviation: 'Song', testament: 'OT', canonical_order: 22, chapter_count: 8, aliases: ['Song of Solomon', 'Song', 'Song of Songs', 'SOS', 'Canticle of Canticles', 'Canticles'] },
  { id: 23, osis_id: 'ISA', name: 'Isaiah', abbreviation: 'Isa', testament: 'OT', canonical_order: 23, chapter_count: 66, aliases: ['Isaiah', 'Isa', 'Is'] },
  { id: 24, osis_id: 'JER', name: 'Jeremiah', abbreviation: 'Jer', testament: 'OT', canonical_order: 24, chapter_count: 52, aliases: ['Jeremiah', 'Jer', 'Je', 'Jr'] },
  { id: 25, osis_id: 'LAM', name: 'Lamentations', abbreviation: 'Lam', testament: 'OT', canonical_order: 25, chapter_count: 5, aliases: ['Lamentations', 'Lam', 'La'] },
  { id: 26, osis_id: 'EZK', name: 'Ezekiel', abbreviation: 'Ezek', testament: 'OT', canonical_order: 26, chapter_count: 48, aliases: ['Ezekiel', 'Ezek', 'Eze', 'Ezk'] },
  { id: 27, osis_id: 'DAN', name: 'Daniel', abbreviation: 'Dan', testament: 'OT', canonical_order: 27, chapter_count: 12, aliases: ['Daniel', 'Dan', 'Da', 'Dn'] },
  { id: 28, osis_id: 'HOS', name: 'Hosea', abbreviation: 'Hos', testament: 'OT', canonical_order: 28, chapter_count: 14, aliases: ['Hosea', 'Hos', 'Ho'] },
  { id: 29, osis_id: 'JOL', name: 'Joel', abbreviation: 'Joel', testament: 'OT', canonical_order: 29, chapter_count: 3, aliases: ['Joel', 'Joe', 'Jl'] },
  { id: 30, osis_id: 'AMO', name: 'Amos', abbreviation: 'Amos', testament: 'OT', canonical_order: 30, chapter_count: 9, aliases: ['Amos', 'Am'] },
  { id: 31, osis_id: 'OBD', name: 'Obadiah', abbreviation: 'Obad', testament: 'OT', canonical_order: 31, chapter_count: 1, aliases: ['Obadiah', 'Obad', 'Oba', 'Ob'] },
  { id: 32, osis_id: 'JON', name: 'Jonah', abbreviation: 'Jonah', testament: 'OT', canonical_order: 32, chapter_count: 4, aliases: ['Jonah', 'Jon', 'Jnh'] },
  { id: 33, osis_id: 'MIC', name: 'Micah', abbreviation: 'Mic', testament: 'OT', canonical_order: 33, chapter_count: 7, aliases: ['Micah', 'Mic', 'Mc'] },
  { id: 34, osis_id: 'NAM', name: 'Nahum', abbreviation: 'Nah', testament: 'OT', canonical_order: 34, chapter_count: 3, aliases: ['Nahum', 'Nah', 'Na'] },
  { id: 35, osis_id: 'HAB', name: 'Habakkuk', abbreviation: 'Hab', testament: 'OT', canonical_order: 35, chapter_count: 3, aliases: ['Habakkuk', 'Hab', 'Hb'] },
  { id: 36, osis_id: 'ZEP', name: 'Zephaniah', abbreviation: 'Zeph', testament: 'OT', canonical_order: 36, chapter_count: 3, aliases: ['Zephaniah', 'Zeph', 'Zep', 'Zp'] },
  { id: 37, osis_id: 'HAG', name: 'Haggai', abbreviation: 'Hag', testament: 'OT', canonical_order: 37, chapter_count: 2, aliases: ['Haggai', 'Hag', 'Hg'] },
  { id: 38, osis_id: 'ZEC', name: 'Zechariah', abbreviation: 'Zech', testament: 'OT', canonical_order: 38, chapter_count: 14, aliases: ['Zechariah', 'Zech', 'Zec', 'Zc'] },
  { id: 39, osis_id: 'MAL', name: 'Malachi', abbreviation: 'Mal', testament: 'OT', canonical_order: 39, chapter_count: 4, aliases: ['Malachi', 'Mal', 'Ml'] },

  // New Testament (27 books)
  { id: 40, osis_id: 'MAT', name: 'Matthew', abbreviation: 'Matt', testament: 'NT', canonical_order: 40, chapter_count: 28, aliases: ['Matthew', 'Matt', 'Mat', 'Mt', 'Gospel of Matthew'] },
  { id: 41, osis_id: 'MRK', name: 'Mark', abbreviation: 'Mark', testament: 'NT', canonical_order: 41, chapter_count: 16, aliases: ['Mark', 'Mrk', 'Mar', 'Mk', 'Gospel of Mark'] },
  { id: 42, osis_id: 'LUK', name: 'Luke', abbreviation: 'Luke', testament: 'NT', canonical_order: 42, chapter_count: 24, aliases: ['Luke', 'Luk', 'Lk', 'Gospel of Luke'] },
  { id: 43, osis_id: 'JHN', name: 'John', abbreviation: 'John', testament: 'NT', canonical_order: 43, chapter_count: 21, aliases: ['John', 'Jn', 'Jhn', 'Jno', "John's Gospel", 'Gospel of John', 'Gospel According to John'] },
  { id: 44, osis_id: 'ACT', name: 'Acts', abbreviation: 'Acts', testament: 'NT', canonical_order: 44, chapter_count: 28, aliases: ['Acts', 'Act', 'Ac', 'Acts of the Apostles'] },
  { id: 45, osis_id: 'ROM', name: 'Romans', abbreviation: 'Rom', testament: 'NT', canonical_order: 45, chapter_count: 16, aliases: ['Romans', 'Rom', 'Ro', 'Rm'] },
  { id: 46, osis_id: '1CO', name: '1 Corinthians', abbreviation: '1Cor', testament: 'NT', canonical_order: 46, chapter_count: 16, aliases: ['1 Corinthians', '1Cor', '1 Cor', '1Co', '1C', 'First Corinthians', '1st Corinthians', 'I Corinthians'] },
  { id: 47, osis_id: '2CO', name: '2 Corinthians', abbreviation: '2Cor', testament: 'NT', canonical_order: 47, chapter_count: 13, aliases: ['2 Corinthians', '2Cor', '2 Cor', '2Co', '2C', 'Second Corinthians', '2nd Corinthians', 'II Corinthians'] },
  { id: 48, osis_id: 'GAL', name: 'Galatians', abbreviation: 'Gal', testament: 'NT', canonical_order: 48, chapter_count: 6, aliases: ['Galatians', 'Gal', 'Ga'] },
  { id: 49, osis_id: 'EPH', name: 'Ephesians', abbreviation: 'Eph', testament: 'NT', canonical_order: 49, chapter_count: 6, aliases: ['Ephesians', 'Eph', 'Ep'] },
  { id: 50, osis_id: 'PHP', name: 'Philippians', abbreviation: 'Phil', testament: 'NT', canonical_order: 50, chapter_count: 4, aliases: ['Philippians', 'Phil', 'Php', 'Pp'] },
  { id: 51, osis_id: 'COL', name: 'Colossians', abbreviation: 'Col', testament: 'NT', canonical_order: 51, chapter_count: 4, aliases: ['Colossians', 'Col', 'Co'] },
  { id: 52, osis_id: '1TH', name: '1 Thessalonians', abbreviation: '1Thess', testament: 'NT', canonical_order: 52, chapter_count: 5, aliases: ['1 Thessalonians', '1Thess', '1 Thess', '1Th', '1Ts', 'First Thessalonians', '1st Thessalonians', 'I Thessalonians'] },
  { id: 53, osis_id: '2TH', name: '2 Thessalonians', abbreviation: '2Thess', testament: 'NT', canonical_order: 53, chapter_count: 3, aliases: ['2 Thessalonians', '2Thess', '2 Thess', '2Th', '2Ts', 'Second Thessalonians', '2nd Thessalonians', 'II Thessalonians'] },
  { id: 54, osis_id: '1TI', name: '1 Timothy', abbreviation: '1Tim', testament: 'NT', canonical_order: 54, chapter_count: 6, aliases: ['1 Timothy', '1Tim', '1 Tim', '1Ti', '1T', 'First Timothy', '1st Timothy', 'I Timothy'] },
  { id: 55, osis_id: '2TI', name: '2 Timothy', abbreviation: '2Tim', testament: 'NT', canonical_order: 55, chapter_count: 4, aliases: ['2 Timothy', '2Tim', '2 Tim', '2Ti', '2T', 'Second Timothy', '2nd Timothy', 'II Timothy'] },
  { id: 56, osis_id: 'TIT', name: 'Titus', abbreviation: 'Titus', testament: 'NT', canonical_order: 56, chapter_count: 3, aliases: ['Titus', 'Tit', 'Ti'] },
  { id: 57, osis_id: 'PHM', name: 'Philemon', abbreviation: 'Phlm', testament: 'NT', canonical_order: 57, chapter_count: 1, aliases: ['Philemon', 'Phlm', 'Phm', 'Pm'] },
  { id: 58, osis_id: 'HEB', name: 'Hebrews', abbreviation: 'Heb', testament: 'NT', canonical_order: 58, chapter_count: 13, aliases: ['Hebrews', 'Heb', 'He'] },
  { id: 59, osis_id: 'JAS', name: 'James', abbreviation: 'Jas', testament: 'NT', canonical_order: 59, chapter_count: 5, aliases: ['James', 'Jas', 'Jm'] },
  { id: 60, osis_id: '1PE', name: '1 Peter', abbreviation: '1Pet', testament: 'NT', canonical_order: 60, chapter_count: 5, aliases: ['1 Peter', '1Pet', '1 Pet', '1Pe', '1P', 'First Peter', '1st Peter', 'I Peter'] },
  { id: 61, osis_id: '2PE', name: '2 Peter', abbreviation: '2Pet', testament: 'NT', canonical_order: 61, chapter_count: 3, aliases: ['2 Peter', '2Pet', '2 Pet', '2Pe', '2P', 'Second Peter', '2nd Peter', 'II Peter'] },
  { id: 62, osis_id: '1JN', name: '1 John', abbreviation: '1John', testament: 'NT', canonical_order: 62, chapter_count: 5, aliases: ['1 John', '1John', '1 Jn', '1Jhn', '1J', 'First John', '1st John', 'I John', 'First Epistle of John'] },
  { id: 63, osis_id: '2JN', name: '2 John', abbreviation: '2John', testament: 'NT', canonical_order: 63, chapter_count: 1, aliases: ['2 John', '2John', '2 Jn', '2Jhn', '2J', 'Second John', '2nd John', 'II John', 'Second Epistle of John'] },
  { id: 64, osis_id: '3JN', name: '3 John', abbreviation: '3John', testament: 'NT', canonical_order: 64, chapter_count: 1, aliases: ['3 John', '3John', '3 Jn', '3Jhn', '3J', 'Third John', '3rd John', 'III John', 'Third Epistle of John'] },
  { id: 65, osis_id: 'JUD', name: 'Jude', abbreviation: 'Jude', testament: 'NT', canonical_order: 65, chapter_count: 1, aliases: ['Jude', 'Jud', 'Jd'] },
  { id: 66, osis_id: 'REV', name: 'Revelation', abbreviation: 'Rev', testament: 'NT', canonical_order: 66, chapter_count: 22, aliases: ['Revelation', 'Rev', 'Re', 'Rv', 'Apocalypse', 'The Revelation of St. John', 'Revelation to John'] },
];
