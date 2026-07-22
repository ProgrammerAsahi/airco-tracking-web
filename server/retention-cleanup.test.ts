import assert from "node:assert/strict";
import test from "node:test";
import { cleanupExpiredPartition, type CleanupTable } from "./retention-cleanup.js";

class FakeCleanupTable implements CleanupTable {
  readonly entities: Array<Record<string, any>>;
  readonly deleted: string[] = [];

  constructor(entities: Array<Record<string, any>>) {
    this.entities = entities;
  }

  listEntities<T extends object>(): AsyncIterableIterator<any> {
    const entities = this.entities.map((entity) => ({ ...entity }));
    return (async function* () {
      for (const entity of entities) yield entity as T;
    })();
  }

  async deleteEntity(partitionKey: string, rowKey: string): Promise<void> {
    this.deleted.push(`${partitionKey}/${rowKey}`);
  }
}

test("cleanup deletes expired and malformed ephemeral rows but preserves future rows", async () => {
  const table = new FakeCleanupTable([
    { partitionKey: "auth-code", rowKey: "expired", expiresAt: "2026-07-22T09:59:59.000Z", etag: "1" },
    { partitionKey: "auth-code", rowKey: "boundary", expiresAt: "2026-07-22T10:00:00.000Z", etag: "2" },
    { partitionKey: "auth-code", rowKey: "future", expiresAt: "2026-07-22T10:00:01.000Z", etag: "3" },
    { partitionKey: "auth-code", rowKey: "malformed", expiresAt: "invalid", etag: "4" },
  ]);
  const result = await cleanupExpiredPartition({
    table,
    partitionKey: "auth-code",
    expiryField: "expiresAt",
    now: Date.parse("2026-07-22T10:00:00.000Z"),
    maxDeletes: 100,
    deleteInvalidExpiry: true,
  });
  assert.deepEqual(table.deleted, ["auth-code/expired", "auth-code/boundary", "auth-code/malformed"]);
  assert.deepEqual(result, { scanned: 4, deleted: 3, invalid: 1, limitReached: false });
});

test("cleanup fails closed for malformed legal deadlines and resumes after a per-run limit", async () => {
  const table = new FakeCleanupTable([
    { partitionKey: "legal-retention", rowKey: "first", retentionUntil: "2020-01-01T00:00:00.000Z" },
    { partitionKey: "legal-retention", rowKey: "second", retentionUntil: "2021-01-01T00:00:00.000Z" },
    { partitionKey: "legal-retention", rowKey: "invalid", retentionUntil: "invalid" },
  ]);
  const result = await cleanupExpiredPartition({
    table,
    partitionKey: "legal-retention",
    expiryField: "retentionUntil",
    now: Date.parse("2026-07-22T10:00:00.000Z"),
    maxDeletes: 1,
    deleteInvalidExpiry: false,
  });
  assert.deepEqual(table.deleted, ["legal-retention/first"]);
  assert.equal(result.limitReached, true);

  const followup = await cleanupExpiredPartition({
    table: new FakeCleanupTable(table.entities.slice(1)),
    partitionKey: "legal-retention",
    expiryField: "retentionUntil",
    now: Date.parse("2026-07-22T10:00:00.000Z"),
    maxDeletes: 100,
    deleteInvalidExpiry: false,
  });
  assert.equal(followup.deleted, 1);
  assert.equal(followup.invalid, 1);
});
