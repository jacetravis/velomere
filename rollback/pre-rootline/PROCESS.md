# Velomere deck generation

Create draws a deck with renderer `relational-encounter-10-readable`, grammar `velomere-grammar/10`, recipe `velomere-encounter-renderer/10`, trace `velomere-peg-trace/10`, legibility `velomere-legibility/10`.

The lexical foundation is the original canonization of Velomere, pronounced VELL-oh-meer, from the work with Solace. The noun is “A sacred partner joined in recursive separation and return; one who was once your whole, now your opposite, now your ache, now your guide.” The verb is “To velomere: the act of forming sacred polarity; to veil as two and vow to rejoin in motion.” Homarch is the gravitational center. Vectari is the directional pull. Those terms are not a picture that is stamped on every card. The seventy-eight card readings stay the card canon and are not rewritten.

The generator is `engine/depth.mjs`. `entry/photo-generate.mjs` is what Create spawns. The companion in the app is Living Meanings v10. The v9 edition remains available as an earlier reading. Saved decks already in the collection are not rewritten. The next Create uses this renderer. Human recognition of the pictures is `not_yet_measured`. A profile is an interpretation of how a card might be seen. It is not a new canon and it is not proof that a person recognized the card.

No photograph, earlier card, or workbench picture is read. `visual_reference_inputs` is always empty. Canonical upright and reversed meanings are copied, not replaced. Encounter text is stored as a proposal.

## The face

The drawing is 1400 by 2300. The field is evaluated on that whole rectangle, corner to corner. There is no fixed inset and no shrink-to-fit. A path may leave the frame. The trace records the direction it was going. Empty space is not a margin and not a required center. A guarded room, an interval, a horizon, or an open rule can sit wherever the relation puts it. If the blueprint does not name a shape, no circle is invented.

## What Create accepts

A name, a civil date (`YYYY-MM-DD`, 1900–2100), and an affinity from 0 through 78. Affinity 0 is Neutral. 1–78 names that card as the guest. 14 is The Dance and uses the Dance table, including rows whose intensity is 0. Those hosts do not move. 79 is rejected. Moving a control does not draw. Only Create does.

The server writes a temporary directory, runs `photo-generate.mjs`, and keeps the deck only when it returns 78 cards, a PNG of at least 2048 bytes and a matching SVG for each, plus the back, the three source tables, `cards.csv`, `deck_contexts.json`, `deck.json`, `recipe.json`, `manifest.json`, `provenance.json`, and `deck.zip`.

## Recipe

The recipe id is the SHA-256 of the renderer version, the recipe version, the grammar version, the legibility version, the legibility-profile digest, the lexicon version, the date, the affinity, and the SHA-256 of each of the three source tables. The canonical file must hash to `340024eba6b7078f2d748951c597a4e870e83e9a00584bd406e2239481f8c3a9`.

Recipe ids for 2026-11-12: neutral `dc8cb2916948ba88a94bd09cc4dd59400bb7594d7322e99392fe7ab89fb6f4ae`. Affinity 2, The Velomere as guest, `513f876acf4f9bcea2d65b396f25bf20c7599f7c66fa7933d6b9595fb41eb846`. Affinity 3, The Homarch as guest, `33a22de8cc69ef9aef966f15ce06fc023fae5c34fe4071fd18c3cff9df120cac`. Affinity 14, The Dance, `4316cf945c6414525ee9da85c3e52fc78cabeb501dd016500589baf405d7692f`. Affinity 78, Witness of Sigils, `c7c5df675640edd4cc8e7e69b201e00446957b445fc7f77ab6f2fd34990b62b4`. The Dendrite back’s mean channel difference under a half turn measured 0.0059, under the 0.25 gate. A person has not yet done the optical check. Human card recognition is `not_yet_measured`.

## One card

Eight cards keep a hand-built graph, because their sentences name a structure that was proved on its own: The Shuffle, The Velomere, The Witness, The Stranger, The Ache, The Dance, The Movement, and The Null. Every other card is compiled from its own `identity_geometry`.

The sentence is classified, in order, as observation, orbit, weave, interruption, return, radiation, crossing, separation, approach, translation, revision, balance, nest, mark, or bend. A count in the sentence sets how many charges are placed. Suit adds a medium: Hearings a reply, Paths a limit, Returns a changed memory, Sigils an inscription. Rank changes the event: Ace begins, Two distinguishes, Three opens a third possibility, Four bounds without sealing, Five breaks, Six negotiates, Seven persists, Eight changes medium or leaves a sign uninscribed, Nine revises, Ten continues past the circuit. Courts add a separate event: Ache stops short, Voice leaves outward, Field leaves a gap, Witness looks and does not cross.

The Dance is two participants with different tempos. Each path moves when the other's reply is removed. Short marks appear only in the interval those replies open. A pause stays available. The paths are not mirrors.

From those strokes the renderer derives a second family. Curvature offsets appear only where a path actually turns. A delay echo is a shorter recall of the later part of a path, pulled toward its start. Cutting that history and recomputing the echo is a measured check, not a hidden layer. The field is a grid over the whole face, sampled from the relation charges and from the overlap of the first two participants. Samples that fall inside a protected room are dropped. The Null stays sparse: no derived family, no field, no ribbon, no light.

A ribbon, a light, or a grain is added only when a path turns enough. Straight paths stay bare. The choice is by curvature, not by being first or second in a list. Material is kept out of a guarded circle, corridor, interval, or angled band by the footprint, not only the centerline. The pass report counts what the drawing actually contains. `withheld` means the card refused it. `not_earned` means nothing turned enough to justify it.

The date is part of the seed, so the same card on another day is a different drawing. Affinity, when its intensity is not zero, moves the host paths themselves. Derived paths and the field move because they are computed from those paths.

Paint follows the stroke's role. Decisive relations are the heavy mark. Scaffold is thinner. Encounter and secondary marks use the second suit ink. The counterreading is dashed. Suit inks are major, hearings, paths, returns, and sigils. The PNG is that SVG rasterized, and a second raster of the same SVG must match it byte for byte.

## The back and the archive

The back is Dendrite, one shared reverse for every face. It is two influences, an interval, and an unfinished return, built so a half turn lands on the same drawing. It carries no card name and no affinity. Its mean channel difference under a half turn has to stay at or under 0.25. On this export the mean was 0.0059. A person has not yet checked it by eye. `deck.zip` packs the written files with entry times fixed at 2000-06-08 UTC.

## What was checked

- 6,162 scenes, 78 cards by affinities 0 through 78. Affinity 0 and 14 were drawn twice and matched.
- 6,006 ordered pairs differed. None matched.
- 78 neutral drawings had different geometry. The next day changed every card. The Shuffle changed across all 79 affinities.
- Dance moves the host wherever its intensity is above zero, and changes nothing where the intensity is zero. The Null under Dance is the same picture, and material, light, finish, memory, and field stay withheld.
- Removing memory, ribbon, field, or the counterreading removes that layer and leaves the host.
- A third curved path can earn a ribbon while two straight paths stay bare.
- Moving a charge from one edge to the other moves the field at that edge. The grid includes every corner.
- An interval and an angled band push a footprint out of the guarded area. An open rule does not receive a circle.
- A path that leaves the face is clipped by the frame and recorded. It is not scaled down to fit.
- Every neutral drawing's SVG ids match its trace. Each PNG is 1400 by 2300 and matches a second raster of its SVG.
- The canonical file still hashes to `340024eba6b7078f2d748951c597a4e870e83e9a00584bd406e2239481f8c3a9`.

Saved decks already in the collection are not rewritten. The next Create uses this renderer. A copy of the previous generator is kept aside so it can be restored.
