export interface Book {
  id: number;
  osis_id: string;
  name: string;
  abbreviation: string;
  testament: 'OT' | 'NT';
  canonical_order: number;
  chapter_count: number;
  aliases?: string[];
}

export interface Translation {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  year: string;
  publisher: string;
  source: string;
  source_url: string;
  license_status: string;
  access_method: string;
  copyright_notice: string;
  is_default: number;
  text_status: string;
}

export interface VerseRecord {
  id?: number;
  canonical_id: string;
  book_id: number;
  chapter_number: number;
  verse_number: number;
  reference: string;
  translation_id: string;
  text: string;
  source_id: string;
  validation_status: string;
  created_at?: string;
}

export interface RecognitionResult {
  matched: boolean;
  raw_input: string;
  canonical_id?: string;
  reference?: string;
  book_name?: string;
  chapter?: number;
  verse?: number;
  end_verse?: number | null;
  confidence?: number;
  selected_translation?: string;
  text?: string | null;
  validation_status?: string;
  message?: string;
  translation_layers?: {
    translation: string;
    name: string;
    license_status: string;
    text_status: string;
    text: string | null;
    source: string;
  }[];
}

export interface SearchResultItem {
  canonical_id: string;
  reference: string;
  translation: string;
  text: string;
  validation_status: string;
  match_type: string;
}

export interface ValidationCheckItem {
  id: number;
  check_category: string;
  item_name: string;
  status: string;
  details: string;
  checked_at: string;
}

export interface DatabaseStatusResponse {
  status: string;
  database_file: string;
  metadata: Record<string, string>;
  translations: Translation[];
  counts: {
    books: number;
    chapters: number;
    verses: number;
    kjv_verses: number;
  };
}
