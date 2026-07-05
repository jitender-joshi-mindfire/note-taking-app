-- NOTE: Prisma's migration diff wanted to DROP "Note_searchVector_idx" here because that
-- index (added by hand in the AB-1007 migration, on an Unsupported("tsvector") column Prisma
-- can't represent in schema.prisma) isn't declared anywhere Prisma's schema model can see.
-- Deliberately NOT dropping it — this index is load-bearing for full-text search performance.
-- Every future migration touching this schema will show the same phantom drift; the fix is
-- always to remove the DROP INDEX line, never to actually apply it.

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_noteId_key" ON "ShareLink"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
