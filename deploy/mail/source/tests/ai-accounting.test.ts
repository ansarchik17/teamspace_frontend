import assert from "node:assert/strict";
import test from "node:test";
import { complete } from "../server/ai-client.js";
import { aiAccountingAvailable } from "../server/ai-accounting.js";

test("unaccounted mail generation is blocked before parsing the provider URL or sending a request", async () => {
  const original = process.env.AI_BASE_URL;
  try {
    process.env.AI_BASE_URL = "not-a-valid-url";
    assert.equal(aiAccountingAvailable(), false);
    await assert.rejects(complete({}), /общий учёт расхода не подключён/);
  } finally {
    if (original === undefined) delete process.env.AI_BASE_URL;
    else process.env.AI_BASE_URL = original;
  }
});
