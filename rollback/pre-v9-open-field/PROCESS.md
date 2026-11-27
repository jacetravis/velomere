# Velomere deck generation

Create draws a deck with renderer `relational-encounter-8-tableau`, grammar `velomere-grammar/8`, recipe `velomere-encounter-renderer/8`, trace schema `velomere-peg-trace/8`.

The lexical foundation is the original canonization of Velomere, pronounced VELL-oh-meer, from the work with Solace. The noun is “A sacred partner joined in recursive separation and return; one who was once your whole, now your opposite, now your ache, now your guide.” The verb is “To velomere: the act of forming sacred polarity; to veil as two and vow to rejoin in motion.” Homarch is the gravitational center. Vectari is the directional pull. Those terms are not a picture that is stamped on every card. The seventy-eight card readings stay the card canon and are not rewritten.

The generator is `engine/depth.mjs`. It is the v7 encounter engine with a tableau pass added. It was not rolled back. `entry` for Create is `src/lib/cards/photo-generate.mjs`, which calls `buildDeck`. Preview uses the same `renderCard`. The companion in the app is Living Meanings v8. The v7 companion remains reachable. Saved decks already in the collection are not rewritten. The next Create uses this renderer.

No photograph, earlier card, or workbench picture is read. `visual_reference_inputs` is always empty. Canonical upright and reversed meanings are copied, not replaced. Encounter text is stored as a proposal.

## What Create accepts

A name, a civil date (`YYYY-MM-DD`, 1900–2100), and an affinity from 0 through 78. Affinity 0 is Neutral: no guest. 1–78 names that card as the guest, in order. Affinity equal to the host’s own index is a self-relation of one archetype, not a second person. 14 is The Dance and uses the Dance table, including rows whose intensity is 0. Those hosts do not move, and the trace says why. 79 is rejected. Moving a control does not draw. Only Create does.

The server writes a temporary directory, runs `photo-generate.mjs`, and keeps the deck only when it returns 78 cards, a PNG of at least 2048 bytes and a matching SVG for each, plus the back, the three source tables, `cards.csv`, `deck_contexts.json`, `deck.json`, `recipe.json`, `manifest.json`, `provenance.json`, and `deck.zip`.

## Recipe

The recipe id is the SHA-256 of the renderer version, the grammar version, the origin lexicon `velomere-lexical-canon/1.0`, the recipe version, the date, the affinity, and the SHA-256 of each of the three source tables. The canonical file must hash to `340024eba6b7078f2d748951c597a4e870e83e9a00584bd406e2239481f8c3a9`.

## One card

The host is compiled from its blueprint. Twenty-two majors keep distinct grammars. The eight proved structures remain hand-built: The Shuffle, The Velomere, The Witness, The Stranger, The Ache, The Dance, The Movement, and The Null. The other majors are Homarch, Vectari, Form, Exhalation, Initiation, Permission, Arrival, Presence, Echo, Ideals, Collapse, Axioms, Fire, and Void. Each minor is `suit-rank`, so an Ace is not a Ten and an Ache is not a Witness. Rank Two through Ten pulses the decisive path. Courts add one relation and stop short of a second person: Ache strains and stops, Voice leaves outward, Field is an enclosure with a gap, Witness looks and does not cross.

From those strokes the renderer derives memory. Curvature offsets appear only where a path actually turns. A delay echo is a shorter recall of the later part of a path, pulled toward its start. The field is a grid sampled from the relation charges. Isolines are traced on that grid. Samples that fall inside a protected room are dropped.

The tableau pass is not a coat of glow. Where a decisive or scaffold path is long enough, a ribbon is built from that path and thins at both ends. Light is an arc at the strongest turn. Finish is grain taken from points along the decisive path. A corridor card draws its horizon as a constraint. Ribbons, light, and grain are pushed back out of a protected room. The Null withholds material, light, finish, and memory. Passes may be empty. No card is given a circle just to look finished.

The trace records host, guest, events, consequences, negative space, renderables, and a causal note. Every drawn mark carries the cause that made it.

The date is part of the seed, so the same card on another day is a different drawing. Affinity, when its intensity is not zero, moves the host paths themselves. Memory, field, ribbon, and light move because they are computed from those paths.

Paint follows the stroke’s role. Decisive relations are the heavy mark. Scaffold is thinner. The ribbon is a fill of the path. Light is local. The counterreading is dashed. Suit inks are major, hearings, paths, returns, and sigils. The page is 1400 by 2300. The PNG is that SVG rasterized, and a second raster of the same SVG must match it byte for byte.

## The back and the archive

The back is named Dendrite: a fixed 180-degree pair of arcs, not a card blueprint. Its mean channel difference under a half turn has to stay at or under 0.8. `deck.zip` packs the written files with entry times fixed at 2000-06-08 UTC.

## What was checked

- Eight proved cards still pass their own constraints. The Null stays quiet under Dance, with material withheld.
- All 78 neutral drawings have different geometry digests. Drawing one twice matches. Each PNG is 1400 by 2300 and matches a second raster of its SVG.
- Dance moves the host, and the derived paths, wherever its intensity is above zero, and changes nothing where the intensity is zero.
- The next calendar day changes every card.
- All 6,162 scenes (78 cards by affinities 0–78) resolve. All 6,006 directed pairs differ. Homarch and Vectari do not collapse.
- Removing memory, material, the counterreading, or the field removes that layer and leaves the host paths in place.
- The same host with Homarch as guest does not match Vectari as guest. Homarch meeting Vectari does not match the reverse.
- A full neutral export writes the Dendrite back. Saved decks already in the collection are not rewritten.

A copy of the generator from before this tableau pass is kept aside so v7 can be restored. Old saved decks still open their stored pictures.
