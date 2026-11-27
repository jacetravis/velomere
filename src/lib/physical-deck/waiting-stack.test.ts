import assert from "node:assert/strict";
import test from "node:test";
import { waitingSheets } from "./waiting-stack.ts";

test("the first drawn card is painted on top of the collecting stack", () => {
  const sheets = waitingSheets(3);
  assert.equal(sheets[0]?.zIndex, 3);
  assert.ok((sheets[0]?.zIndex ?? 0) > (sheets[1]?.zIndex ?? 0));
  assert.ok((sheets[1]?.zIndex ?? 0) > (sheets[2]?.zIndex ?? 0));
  assert.deepEqual(sheets.map((sheet) => sheet.offset), [0, 1, 2]);
});
