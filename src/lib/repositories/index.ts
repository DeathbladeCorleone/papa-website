import type { BlogRepository } from "./types";
import type { SqlDatabase } from "../bindings";
import { MemoryRepository, demoSeed } from "./memory";
import { D1Repository } from "./d1";

export type { BlogRepository } from "./types";

// One in-memory repo per process so local preview keeps state between requests.
let memoryRepo: MemoryRepository | null = null;

/**
 * Resolve the repository: Cloudflare D1 when the `DB` binding exists, otherwise
 * an in-memory repo seeded with demo content (tests / preview without Wrangler).
 */
export function getRepository(db: SqlDatabase | undefined): BlogRepository {
  if (db) return new D1Repository(db);
  if (!memoryRepo) memoryRepo = new MemoryRepository(demoSeed());
  return memoryRepo;
}
