import { rmSync } from "node:fs";

// A fresh database for every run: the specs count what they put in.
export default function setup(): void {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`test-results/e2e.sqlite${suffix}`, { force: true });
}
