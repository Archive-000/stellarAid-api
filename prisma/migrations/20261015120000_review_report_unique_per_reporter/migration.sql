-- Deduplicate first: keep the most recent report per (reviewId, reporterId)
-- so existing rows cannot block the unique index (#869).
DELETE FROM "ReviewReport" a
USING "ReviewReport" b
WHERE a."reviewId" = b."reviewId"
  AND a."reporterId" = b."reporterId"
  AND a."createdAt" < b."createdAt";

-- One report per reporter per review.
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewReport_reviewId_reporterId_key"
  ON "ReviewReport"("reviewId", "reporterId");
