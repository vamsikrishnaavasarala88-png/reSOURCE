import type { MaterialCategory, MaterialCondition, PageResponse } from './material';

/**
 * Types for the AI intelligence layer.
 *
 * <p>Everything here is a suggestion produced by the backend. AI never decides
 * price, availability, ownership or quantity - those stay the backend's and the
 * owner's business.</p>
 */

/** The two marketplaces the AI search can be run against. */
export type AiResourceType = 'SPACE' | 'MATERIAL';

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * A natural-language search, turned into filters.
 *
 * <p>Every field is nullable and {@code null} means "the visitor did not say".
 * The backend returns what it could apply, so this is what the UI may claim.</p>
 */
export interface SearchIntent {
  resourceType: AiResourceType | null;
  activity: string | null;
  category: string | null;
  condition: string | null;
  maxPrice: number | null;
  minQuantity: number | null;
  maxQuantity: number | null;
  quantityUnit: string | null;
  capacity: number | null;
  radiusKm: number | null;
  date: string | null;
  latitude: number | null;
  longitude: number | null;
  freeOnly: boolean | null;
  locationText: string | null;
  query: string | null;
}

/** What a successful AI search answers with: the criteria and real listings. */
export interface AiSearchSuccess<T> {
  resourceType: AiResourceType;
  /** What the AI thought the words were about, when that is not the page's marketplace. */
  detectedResourceType: AiResourceType | null;
  intent: SearchIntent;
  chips: string[];
  summary: string;
  /** What had to be relaxed to find these listings, or `null` when nothing was. */
  note: string | null;
  results: PageResponse<T>;
}

/** The shape every AI endpoint uses when it cannot run. */
export interface AiFailure {
  success: false;
  message: string;
  fallbackAvailable: boolean;
}

/** A photo turned into a suggestion. Deliberately has no quantity field. */
export interface MaterialRecognition {
  materialName: string | null;
  category: MaterialCategory | null;
  categoryLabel: string | null;
  condition: MaterialCondition | null;
  conditionLabel: string | null;
  /** A short description of what the photo shows, or `null` when none came back. */
  description: string | null;
  confidence: number;
  confidenceBand: ConfidenceBand;
  confidenceLabel: string;
  confident: boolean;
  message: string | null;
}

/** A listing described in words, turned into fields for the owner to review. */
export interface ListingExtraction {
  title: string | null;
  category: MaterialCategory | null;
  categoryLabel: string | null;
  description: string | null;
  condition: MaterialCondition | null;
  conditionLabel: string | null;
  quantity: number | null;
  quantityUnit: string | null;
  price: number | null;
  isFree: boolean | null;
  locationText: string | null;
}

/** A suggested description, built from confirmed facts only. */
export interface GeneratedDescription {
  description: string;
}

/**
 * The outcome of an AI call, as plain data.
 *
 * <p>AI is an enhancement, so its failures are values rather than exceptions:
 * every caller has a manual path to offer, and no rejected promise should ever
 * reach the console because a provider was busy.</p>
 */
export type AiOutcome<T> = { ok: true; data: T } | { ok: false; message: string };
