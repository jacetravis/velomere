import assert from "node:assert/strict";
import test from "node:test";
import { cleanWebsite, cleanYoutube, readLinks } from "./links.ts";

test("official youtube links are kept and other video sites are refused", () => {
  const id = "dQw4w9WgXcQ";
  const canonical = `https://www.youtube.com/watch?v=${id}`;
  assert.equal(cleanYoutube(`https://youtu.be/${id}`), canonical);
  assert.equal(cleanYoutube(`https://www.youtube.com/watch?v=${id}&t=4`), canonical);
  assert.equal(cleanYoutube(`https://m.youtube.com/shorts/${id}`), canonical);
  assert.equal(cleanYoutube(`https://music.youtube.com/watch?v=${id}`), canonical);
  assert.equal(cleanYoutube(`https://www.youtube-nocookie.com/embed/${id}`), canonical);
  assert.equal(cleanYoutube(`https://youtube.com/live/${id}`), canonical);
  assert.equal(cleanYoutube("https://vimeo.com/123456789"), null);
  assert.equal(cleanYoutube(`https://youtube.com.evil.com/watch?v=${id}`), null);
  assert.equal(cleanWebsite("javascript:alert(1)"), null);
  assert.equal(cleanWebsite("https://example.com/notes"), "https://example.com/notes");
  const bad = readLinks("https://example.com", "https://vimeo.com/1");
  assert.equal(bad.ok, false);
  const good = readLinks("", `https://youtu.be/${id}?si=abc`);
  assert.equal(good.ok, true);
  if (good.ok) assert.equal(good.videoUrl, canonical);
});
