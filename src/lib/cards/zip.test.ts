import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { parseCsv, readCardZip, readDeckArchive, writeDeckZip } from "./zip.ts";

test("an svg saved with the wrong extension is still read as a picture", async () => {
  const svg = strToU8(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>`);
  const zipped = zipSync({
    "cards.csv": strToU8("name,suit,image\nThe Form,major,01-the-form.jpg\n"),
    "images/01-the-form.jpg": svg,
  });
  const cards = await readCardZip(zipped);
  assert.equal(cards[0]?.image?.type, "image/svg+xml");
  assert.ok(cards[0]?.image && cards[0].image.bytes.byteLength > 20);
});

test("parseCsv keeps quoted commas and quotes", () => {
  const rows = parseCsv(
    'name,keywords\n"Ace, of Hearings","listen, ""attend"""\n',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.name, "Ace, of Hearings");
  assert.equal(rows[0]?.keywords, 'listen, "attend"');
});

test("zip with a spreadsheet matches pictures and updates duplicates", async () => {
  const csv = `name,suit,rank,keywords,upright,reversed,image
Ace of Hearings,hearings,Ace,"listen, attend","The ear opens.","Noise.",images/ace.jpg
Ace of Hearings,Hearings,Ace,later,,,ace.jpg
Two of Hearings,coins,Two,,,,missing.png
`;
  const zipped = zipSync({
    "deck/cards.csv": strToU8(csv),
    "deck/images/ace.jpg": new Uint8Array([1, 2, 3]),
    "__MACOSX/._cards.csv": strToU8("junk"),
  });
  const cards = await readCardZip(zipped);
  assert.equal(cards.length, 2);
  assert.equal(cards[0]?.name, "Ace of Hearings");
  assert.equal(cards[0]?.suit, "hearings");
  assert.equal(cards[0]?.keywords, "later");
  assert.equal(cards[0]?.image?.name, "ace.jpg");
  assert.equal(cards[1]?.suit, "pentacles");
  assert.equal(cards[1]?.image, null);
  assert.equal(cards[1]?.imageName, "missing.png");
});

test("zip of pictures becomes cards named from the files", async () => {
  const zipped = zipSync({
    "The Lantern.png": new Uint8Array([9]),
    "notes.txt": strToU8("ignore me"),
  });
  const cards = await readCardZip(zipped);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.name, "The Lantern");
  assert.equal(cards[0]?.suit, "custom");
  assert.ok(cards[0]?.image);
});

test("an exported deck zip round-trips cards and settings", async () => {
  const picture = new Uint8Array([1, 2, 3, 4]);
  const back = new Uint8Array([5, 6, 7]);
  const zipped = writeDeckZip(
    [
      {
        name: "The Fool",
        suit: "major",
        rank: "0",
        keywords: "begin",
        upright: "A step.",
        reversed: "A pause.",
        sortOrder: 3,
        imageScale: 120,
        imageX: -4,
        imageY: 6,
        imageRadius: 8,
        imageName: "01-the-fool.jpg",
        image: picture,
      },
    ],
    {
      edge: 82,
      edgeColor: 0,
      edgeSat: 71,
      edgeLight: 64,
      cardThickness: 75,
      cardRadius: 5,
      cardWidth: 55,
      cardLength: 55,
      cardLocked: true,
      cardTemplate: "tarot",
      backX: 1,
      backY: 2,
      backScale: 90,
      backRotate: 3,
      cardBackName: "card-back.jpg",
      cardBack: back,
      stockBackName: "stock-back.jpg",
      stockBack: new Uint8Array([4, 4, 4]),
      stockBackPath: null,
      customSuits: ["stars"],
      tableImageName: "table.jpg",
      tableImage: new Uint8Array([9, 9]),
      tableX: 4,
      tableY: -6,
      tableScale: 120,
      tableRotate: 8,
      tableColor: 20,
      tableSat: 80,
      tableLight: 90,
      tableContrast: 110,
      tableVignette: 30,
    },
  );
  const archive = await readDeckArchive(zipped);
  assert.equal(archive.cards.length, 1);
  assert.equal(archive.cards[0]?.name, "The Fool");
  assert.equal(archive.cards[0]?.sortOrder, 3);
  assert.equal(archive.cards[0]?.imageScale, 120);
  assert.equal(archive.cards[0]?.imageX, -4);
  assert.equal(archive.cards[0]?.imageY, 6);
  assert.equal(archive.cards[0]?.imageRadius, 8);
  assert.equal(archive.cards[0]?.image?.name, "01-the-fool.jpg");
  assert.equal(archive.settings?.cardThickness, 75);
  assert.equal(archive.settings?.edge, 82);
  assert.equal(archive.settings?.cardBack?.name, "card-back.jpg");
  assert.equal(archive.settings?.stockBack?.name, "stock-back.jpg");
  assert.equal(archive.settings?.stockBackPath, null);
  assert.equal(archive.settings?.backScale, 90);
  assert.deepEqual(archive.settings?.customSuits, ["stars"]);
  assert.equal(archive.settings?.tableScale, 120);
  assert.equal(archive.settings?.tableVignette, 30);
  assert.equal(archive.settings?.tableImage?.name, "table.jpg");
});

test("deck settings without luminous fall back to the darker default, and an explicit value is kept", async () => {
  const cards = "name,suit,rank,keywords,upright,reversed,image,sort_order\nThe Fool,major,0,,,,,\n";
  const missing = zipSync({
    "cards.csv": strToU8(cards),
    "deck.json": strToU8(JSON.stringify({ edge: 100, edgeColor: 0, edgeSat: 0 })),
  });
  const kept = zipSync({
    "cards.csv": strToU8(cards),
    "deck.json": strToU8(JSON.stringify({ edge: 100, edgeColor: 0, edgeSat: 0, edgeLight: 100 })),
  });
  assert.equal((await readDeckArchive(missing)).settings?.edgeLight, 26);
  assert.equal((await readDeckArchive(kept)).settings?.edgeLight, 100);
  assert.equal((await readDeckArchive(missing)).cards[0]?.imageScale, 100);
  assert.equal((await readDeckArchive(missing)).cards[0]?.imageRadius, 2);
  assert.equal((await readDeckArchive(missing)).settings?.tableScale, 100);
  assert.equal((await readDeckArchive(missing)).settings?.tableImage, null);
});

test("a non-zip is rejected", async () => {
  await assert.rejects(readCardZip(strToU8("hello")), /not a zip archive/);
});
