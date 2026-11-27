import assert from "node:assert/strict";
import test from "node:test";
import { publicGenerateError, velomereScriptPath } from "./script-path.mjs";

test("generator script resolves beside the app source", () => {
  const script = velomereScriptPath("photo-generate.mjs");
  assert.match(script, /photo-generate\.mjs$/);
});

test("a missing python runtime does not leak the spawn error", () => {
  const message = publicGenerateError(new Error("spawn python3 ENOENT"));
  assert.match(message, /picture maker did not start/);
  assert.doesNotMatch(message, /ENOENT/);
  assert.doesNotMatch(message, /python3/);
});

test("missing-module failures stay readable", () => {
  const message = publicGenerateError(
    new Error("Error: Cannot find module '/var/task/src/lib/cards/photo-generate.mjs'\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1568:15)"),
  );
  assert.match(message, /missing the generator/);
  assert.doesNotMatch(message, /node:internal/);
  assert.doesNotMatch(message, /\/var\/task/);
});

