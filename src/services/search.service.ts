/**
 * Full-text artwork search, backed by the GIN indexes added in this
 * change (see `prisma/migrations/20260924140000_artwork_search_indexes`):
 *
 *   - an expression index on `to_tsvector('english', title || description
 *     || tags)`, matched by this file's `ts_rank`/`plainto_tsquery` query
 *     — the WHERE/ORDER BY expressions here must stay textually identical
 *     to the index expression for Postgres to use it instead of scanning;
 *   - a `pg_trgm` trigram index on `title`, used as a fuzzy-match fallback
 *     when the full-text query returns nothing (handles typos/partial
 *     words that `to_tsvector` won't match).
 *
 * Results are cached (cache-aside, short TTL — search result caching is
 * one of the issue's explicit tasks) since identical queries are common
 * (autocomplete-style re-querying, pagination).
 */

import { Prisma, type Artwork, type ArtworkCategory } from '@prisma/client';

import { prisma } from '@/services';

import { cached } from './cache.service';

export interface SearchFilters {
  readonly category?: ArtworkCategory;
}

export interface SearchPage {
  readonly items: readonly Artwork[];
  readonly page: number;
  readonly limit: number;
  /** Total number of matches across all pages. */
  readonly total: number;
  /** Whether a further page of results exists after this one. */
  readonly hasNext: boolean;
}

const SEARCH_CACHE_TTL_SECONDS = 60;
const TRIGRAM_SIMILARITY_THRESHOLD = 0.2;

function buildFilterSql(filters: SearchFilters): Prisma.Sql {
  if (filters.category === undefined) {
    return Prisma.sql``;
  }
  return Prisma.sql`AND "category" = ${filters.category}::"ArtworkCategory"`;
}

async function fullTextCount(q: string, filters: SearchFilters): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "Artwork"
    WHERE "published" = true
      AND "sold" = false
      ${buildFilterSql(filters)}
      AND to_tsvector('english', "title" || ' ' || coalesce("description", '') || ' ' || coalesce("tags"::text, ''))
          @@ plainto_tsquery('english', ${q})
  `);
  return rows[0]?.count ?? 0;
}

async function trigramCount(q: string, filters: SearchFilters): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "Artwork"
    WHERE "published" = true
      AND "sold" = false
      ${buildFilterSql(filters)}
      AND similarity("title", ${q}) > ${TRIGRAM_SIMILARITY_THRESHOLD}
  `);
  return rows[0]?.count ?? 0;
}

async function fullTextSearch(
  q: string,
  filters: SearchFilters,
  page: number,
  limit: number,
): Promise<Artwork[]> {
  return prisma.$queryRaw<Artwork[]>(Prisma.sql`
    SELECT *
    FROM "Artwork"
    WHERE "published" = true
      AND "sold" = false
      ${buildFilterSql(filters)}
      AND to_tsvector('english', "title" || ' ' || coalesce("description", '') || ' ' || coalesce("tags"::text, ''))
          @@ plainto_tsquery('english', ${q})
    ORDER BY ts_rank(
      to_tsvector('english', "title" || ' ' || coalesce("description", '') || ' ' || coalesce("tags"::text, '')),
      plainto_tsquery('english', ${q})
    ) DESC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `);
}

/** Typo-tolerant fallback: trigram similarity on title, used only when the
 * full-text query above returns nothing. */
async function trigramSearch(
  q: string,
  filters: SearchFilters,
  page: number,
  limit: number,
): Promise<Artwork[]> {
  return prisma.$queryRaw<Artwork[]>(Prisma.sql`
    SELECT *
    FROM "Artwork"
    WHERE "published" = true
      AND "sold" = false
      ${buildFilterSql(filters)}
      AND similarity("title", ${q}) > ${TRIGRAM_SIMILARITY_THRESHOLD}
    ORDER BY similarity("title", ${q}) DESC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `);
}

export async function searchArtworks(
  q: string,
  filters: SearchFilters,
  page: number,
  limit: number,
): Promise<SearchPage> {
  const trimmed = q.trim();
  if (trimmed === '') {
    return { items: [], page, limit, total: 0, hasNext: false };
  }

  const cacheKey = `search:${JSON.stringify({ q: trimmed, filters, page, limit })}`;

  const result = await cached(cacheKey, SEARCH_CACHE_TTL_SECONDS, async () => {
    const fullTextTotal = await fullTextCount(trimmed, filters);
    if (fullTextTotal > 0) {
      return {
        items: await fullTextSearch(trimmed, filters, page, limit),
        total: fullTextTotal,
      };
    }
    const trigramTotal = await trigramCount(trimmed, filters);
    if (trigramTotal === 0) {
      return { items: [], total: 0 };
    }
    return {
      items: await trigramSearch(trimmed, filters, page, limit),
      total: trigramTotal,
    };
  });

  return {
    items: result.items,
    page,
    limit,
    total: result.total,
    hasNext: page * limit < result.total,
  };
}
