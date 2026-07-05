# 0002. searchVector trigger fires BEFORE, not AFTER, insert/update

Date: 2026-07-05
Status: accepted

## Context

`docs/SDS.md` Section 3 originally described the `searchVector` generated-tsvector column as
maintained by an `AFTER INSERT OR UPDATE` trigger. Taken literally, this doesn't work: a trigger
that needs to set `NEW."searchVector"` must run `BEFORE` the row is written, so the computed
value is included in the same write. An `AFTER` trigger can only run a second `UPDATE` on the
already-inserted row, which would itself re-fire the trigger (requiring a recursion guard) and
double the write cost on every note create/update, for no behavioral benefit.

## Decision

The trigger (`note_search_vector_trigger`, migration `20260705173336_add_note_search_vector`)
fires `BEFORE INSERT OR UPDATE OF title, content` and sets `NEW."searchVector"` directly:
```sql
CREATE FUNCTION note_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
```
This is the standard, idiomatic Postgres pattern for generated-tsvector columns. `docs/SDS.md`
Section 3 is corrected to say `BEFORE` as part of this same ticket (AB-1007).

Alternative considered: an `AFTER` trigger with a self-referential `UPDATE ... WHERE id =
NEW.id` guarded against infinite recursion — rejected as needlessly complex and slower (two
writes per note change) for no benefit over the standard `BEFORE` pattern.

## Consequences

- Every future migration touching `Note.title` or `Note.content` must be aware this trigger
  exists and fires on those columns specifically (`OF title, content`), not on every column
  update.
- Pre-existing rows created before this migration needed a one-time backfill `UPDATE` (included
  in the same migration) since the trigger only fires on future inserts/updates.
