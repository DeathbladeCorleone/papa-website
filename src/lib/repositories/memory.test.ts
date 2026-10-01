import { MemoryRepository, demoSeed } from "./memory";
import { repositoryContract } from "./contract";

repositoryContract("MemoryRepository", async () => new MemoryRepository(demoSeed()));
