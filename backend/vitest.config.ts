import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env.test" });

export default defineConfig({
  test: {
    passWithNoTests: true,
    // All test files share one real Postgres test database (never mock Prisma,
    // per AGENTS.md's testing convention) and several use global deleteMany()
    // calls in beforeEach. Running files in parallel lets one file's cleanup
    // race another file's in-flight test data (confirmed: notes.test.ts passed
    // 13/13 alone, but failed when run alongside auth.test.ts). Sequential
    // execution trades some speed for correctness — the safer default given
    // more test files (tags, search, sharing, ...) will share this DB too.
    fileParallelism: false,
  },
});
