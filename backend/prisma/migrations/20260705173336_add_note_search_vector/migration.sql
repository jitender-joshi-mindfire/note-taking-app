-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "searchVector" tsvector;

-- CreateFunction
-- Maintains "searchVector" on every insert/update of title or content. Must be
-- BEFORE (not AFTER, as originally drafted in docs/SDS.md Section 3): a BEFORE
-- trigger can set NEW."searchVector" so it's included in the same write, whereas
-- an AFTER trigger would require a second UPDATE on the same row (re-firing the
-- trigger, needing a recursion guard, and doubling write cost for no benefit).
-- See docs/decisions/0002-tsvector-trigger-before-not-after.md.
CREATE FUNCTION note_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- CreateTrigger
CREATE TRIGGER note_search_vector_trigger
BEFORE INSERT OR UPDATE OF title, content ON "Note"
FOR EACH ROW EXECUTE FUNCTION note_search_vector_update();

-- CreateIndex
CREATE INDEX "Note_searchVector_idx" ON "Note" USING GIN ("searchVector");

-- Backfill
-- Populate searchVector for rows that existed before this trigger did (the
-- trigger only fires on future inserts/updates).
UPDATE "Note" SET "searchVector" =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B');
