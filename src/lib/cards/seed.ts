import type { Suit } from "./types";

export type SeedCard = {
  name: string;
  suit: Suit;
  rank: string;
  keywords: string;
  upright: string;
  reversed: string;
  sortOrder: number;
};

function card(
  suit: Suit,
  sortOrder: number,
  name: string,
  rank: string,
  keywords: string,
  upright: string,
  reversed: string,
): SeedCard {
  return { name, suit, rank, keywords, upright, reversed, sortOrder };
}

const major: SeedCard[] = [
  card("major", 0, "The Fool", "0", "beginning, leap, trust",
    "A threshold with no map. The Fool asks you to step before you are ready, carrying only what you actually need. Innocence here is not ignorance — it is willingness.",
    "The leap is reckless, or the step is being refused. Check whether you are courting chaos or hiding from a true beginning."),
  card("major", 1, "The Magician", "I", "will, craft, making",
    "Tools are on the table and the current is live. The Magician is focused doing — skill meeting intention. What you name, you can shape.",
    "Talent unused, or used to manipulate. The current is there; the aim is not. Return to honest work."),
  card("major", 2, "The High Priestess", "II", "intuition, veil, knowing",
    "Not everything wants to be spoken. Sit with what you already sense. The Priestess keeps the library behind the veil and trusts you to wait.",
    "You are overriding a quiet knowing, or keeping a secret that now needs air. Listen once without arguing."),
  card("major", 3, "The Empress", "III", "nourish, body, plenty",
    "Growth that cannot be forced. The Empress is soil, appetite, art, and care. Tend the living thing — a project, a person, yourself — and let it be sensual, not efficient.",
    "Overgiving, creative drought, or the body being ignored. Restore a simple pleasure and a boundary."),
  card("major", 4, "The Emperor", "IV", "structure, authority, hold",
    "A spine for the vision. The Emperor builds the frame so the work can last: rules, time, protection. Leadership here is stewardship, not theatre.",
    "Rigidity, control, or a refusal to take the chair. Soften the rule, or finally claim the responsibility."),
  card("major", 5, "The Hierophant", "V", "teaching, rite, belonging",
    "A tradition that still feeds you, or a teacher worth the bow. Meaning is transmitted in rooms, not only invented alone. Find the form that holds you.",
    "Dogma, empty ritual, or outgrowing a teacher you keep performing for. Keep the wisdom; leave the costume."),
  card("major", 6, "The Lovers", "VI", "choice, union, values",
    "A fork that is really a values test. Love, alliance, or a yes that costs you a smaller life. Choose the path you can stand beside in daylight.",
    "Misalignment, a postponed choice, or wanting two lives at once. Name the real desire."),
  card("major", 7, "The Chariot", "VII", "drive, victory, direction",
    "Two horses, one road. The Chariot wins by holding opposing forces on a chosen line. Momentum is the medicine — provided you are steering.",
    "Scattered will, a lost rein, or winning a race you no longer care about. Stop. Pick one direction."),
  card("major", 8, "Strength", "VIII", "courage, patience, soft power",
    "The lion is not slain; it is met. Strength is composure under heat — a hand on the mane, not a fist. Your gentleness is not a lack of power.",
    "Force, self-doubt, or a temper driving the day. Return to the breath before the roar."),
  card("major", 9, "The Hermit", "IX", "solitude, lantern, counsel",
    "A season of inward light. Withdraw enough to hear yourself. The Hermit is not hiding; they are refining a truth they can later carry back.",
    "Isolation dressed as wisdom, or refusing the cave you actually need. Distinguish rest from exile."),
  card("major", 10, "Wheel of Fortune", "X", "cycle, turn, fate",
    "The wheel moves whether you bless it or not. A door opens because it is time. Ride the turn with some humor; this too is a season.",
    "Clinging to a spoke that has already passed. Stop bargaining with the cycle and take the new position."),
  card("major", 11, "Justice", "XI", "truth, consequence, balance",
    "Cause meets effect without drama. Justice asks for a clean account — of a choice, a debt, a story you have been telling. Fairness starts with accuracy.",
    "Bias, self-justifying, or a scale you will not look at. Tell the plainer version."),
  card("major", 12, "The Hanged Man", "XII", "surrender, pause, new sight",
    "Willing suspension. Progress by stopping. The Hanged Man offers a view you cannot get from the old posture. Yield, and the picture inverts.",
    "Stalling, martyrdom, or hanging because it is familiar. If the pause has no wisdom left, come down."),
  card("major", 13, "Death", "XIII", "ending, compost, passage",
    "Something is finished, and pretending otherwise is the only true death. Let it complete so the next life can start. Grief is part of the compost.",
    "Clinging, a half-ending, or change you keep postponing. Name what is already gone."),
  card("major", 14, "Temperance", "XIV", "blend, patience, alchemy",
    "Two elements, one vessel. Temperance is the art of mixing without drowning either. Slow the pour. The middle path is not timid; it is skilled.",
    "Excess, impatience, or a refusal to combine. You do not have to choose a pole. Practice the blend."),
  card("major", 15, "The Devil", "XV", "bond, appetite, shadow",
    "A chain you can slip and have not. The Devil names the attachment, the habit, the golden cage. Looking at it steadily is already a form of freedom.",
    "The chain is loosening, or you are calling healthy desire a prison. Distinguish hunger from captivity."),
  card("major", 16, "The Tower", "XVI", "rupture, truth, lightning",
    "A structure built on a false floor comes down. It will feel like disaster and later like mercy. Do not rebuild the same lie faster.",
    "A reckoning delayed, or wreckage you are living in out of habit. Step out of the dust and tell the true story."),
  card("major", 17, "The Star", "XVII", "hope, healing, quiet faith",
    "After the storm, water on skin and a far light. The Star is restoration without spectacle — a reason to continue that does not need an audience.",
    "Hope feels naive, or you are starving a healing already underway. Do one small faithful thing."),
  card("major", 18, "The Moon", "XVIII", "dream, fear, unseen",
    "The path is lit enough to walk, not enough to be sure. Dreams, anxiety, and intuition share this weather. Do not make a permanent map of a night landscape.",
    "A fog lifting, or a fear you have been feeding. Wait for a cleaner light before you declare."),
  card("major", 19, "The Sun", "XIX", "joy, clarity, vitality",
    "Warmth without riddle. The Sun is simple radiance: success that can be shared, a body that wants to play, a truth that likes the day.",
    "A cloud over a still-burning star. Joy is delayed, not denied. Find the smallest honest pleasure."),
  card("major", 20, "Judgement", "XX", "calling, reckoning, rise",
    "A summons. The old life is being called to account so a larger one can start. Answer with the whole of you, not the leftover self.",
    "Harsh self-verdict, or a calling you keep hitting snooze on. Forgive enough to stand up."),
  card("major", 21, "The World", "XXI", "completion, wholeness, arrival",
    "A cycle closes with the dancer still in motion. Integration, travel, a work completed well. You can bow — and then begin the next circle.",
    "Almost finished, and the last inch is being avoided. Complete it. Wholeness is a practice, not a prize."),
];

const ranks: { rank: string; title: string }[] = [
  { rank: "Ace", title: "Ace" },
  { rank: "Two", title: "Two" },
  { rank: "Three", title: "Three" },
  { rank: "Four", title: "Four" },
  { rank: "Five", title: "Five" },
  { rank: "Six", title: "Six" },
  { rank: "Seven", title: "Seven" },
  { rank: "Eight", title: "Eight" },
  { rank: "Nine", title: "Nine" },
  { rank: "Ten", title: "Ten" },
  { rank: "Page", title: "Page" },
  { rank: "Knight", title: "Knight" },
  { rank: "Queen", title: "Queen" },
  { rank: "King", title: "King" },
];

type MinorCopy = {
  keywords: string;
  upright: string;
  reversed: string;
};

const wands: MinorCopy[] = [
  { keywords: "spark, vocation, yes", upright: "A clean ignition. Wands Ace is the permission to want the thing and begin it while the spark is hot.", reversed: "A false start, or a spark you keep smothering. Relight only what is actually yours." },
  { keywords: "plan, fork, world", upright: "A choice of roads, both alive. Hold the world in your hands and pick a direction you can travel with energy.", reversed: "Planning as delay. You already know the road. Take it." },
  { keywords: "craft, looking ahead, work", upright: "The work is standing. Pause on the hill, see how far it has come, then return to the making.", reversed: "Busywork, or a project collapsing from no foundation. Strip back to what is well-built." },
  { keywords: "home, celebration, rest", upright: "A hearth after labor. Harmony worth protecting. Enjoy the room you have made without immediately leaving it.", reversed: "Restlessness in a good house, or a celebration you are not inside of. Come home." },
  { keywords: "strife, contest, ego", upright: "Competition that clarifies. Five wands is friction, not ruin — test the idea in the melee and keep your humor.", reversed: "Needless conflict, or avoiding a fight that would clear the air. Pick the real contest." },
  { keywords: "victory, recognition, parade", upright: "A win that can be shared. Ride through, accept the wreath, and remember who walked with you.", reversed: "A hollow win, or success you will not claim. Let yourself be seen." },
  { keywords: "stance, courage, hold", upright: "High ground. Defend what you have built without becoming a fortress. Courage here is staying, not striking.", reversed: "Paranoia, or a position you should yield. Not every hill is the one." },
  { keywords: "swiftness, news, motion", upright: "Things move. Messages, travel, a sudden opening. Keep your feet; the flight is useful.", reversed: "Scattered motion, delays, or running from what needs landing." },
  { keywords: "stamina, last watch, burden", upright: "Almost there, and the arms are tired. Nine of Wands is the veteran still standing. Rest without surrendering the post.", reversed: "Exhaustion mistaken for duty. Put the wands down before you break." },
  { keywords: "load, duty, overwork", upright: "Carrying more than is wise because you can. Ten of Wands asks which bundles are actually yours.", reversed: "Setting a burden down — or refusing to, past the point of sense. Delegate." },
  { keywords: "messenger, study, spark", upright: "A student of fire. News, an apprentice energy, a message that wants answering with curiosity, not mastery.", reversed: "Immature heat, gossip, or a lesson you are dodging." },
  { keywords: "charge, pursuit, passion", upright: "Forward on a living horse. The Knight of Wands is charisma and appetite for the next horizon. Ride, and aim.", reversed: "Impulse without a road. Passion turning to restlessness. Slow the horse." },
  { keywords: "confidence, warmth, command", upright: "A sovereign of fire who leads by presence. Creative authority, warmth that does not apologize, a life arranged around the work you love.", reversed: "Ego, jealousy, or a dimmed flame. Reclaim warmth without burning the room." },
  { keywords: "vision, enterprise, spark at scale", upright: "The King of Wands sees the whole field and still loves the game. Lead the venture. Your enthusiasm is strategy.", reversed: "Tyranny of vision, or a leader who will not decide. Come back to the actual fire." },
];

const cups: MinorCopy[] = [
  { keywords: "feeling, gift, open heart", upright: "An offering of feeling, unmarked. Ace of Cups is the well filling — love, art, or compassion arriving unforced.", reversed: "A closed cup, or emotion spilling without a vessel. Make a place for the feeling." },
  { keywords: "partnership, toast, accord", upright: "Two cups meeting. Mutuality, a truce, a friendship that wants a ritual. Equal exchange.", reversed: "Imbalance, a broken toast, or attraction without respect. Restore the even pour." },
  { keywords: "friendship, gathering, joy", upright: "The harvest of people. Celebration that is about belonging, not display. Let yourself be among them.", reversed: "A group that drains, or isolation from the very people who would lift you." },
  { keywords: "apathy, withdraw, sit it out", upright: "A refusal that is also self-knowledge. The figure turns from the cups. Not every invitation is yours.", reversed: "A sulk past its wisdom, or finally standing to engage. Check which it is." },
  { keywords: "grief, loss, what remains", upright: "Three spilled, two standing. Mourning what is gone without denying what is left. Drink from the remaining cups when you can.", reversed: "Grief unmoving, or a recovery you will not credit. Let something be intact." },
  { keywords: "nostalgia, kindness, childhood", upright: "A gift from the past — memory, a child, a simpler sweetness. Receive it. Not all looking back is trap.", reversed: "Stuck in yesterday, or a tenderness you will not accept. Come into this room." },
  { keywords: "choice, fantasy, too many", upright: "Cups in the air, a figure choosing among dreams. Seven is temptation and imagination. Pick one cup that is real.", reversed: "Illusions breaking, or still grazing on maybe. Come down to a single yes." },
  { keywords: "walk away, higher ground", upright: "Leaving a table that cannot feed you. The Eight of Cups is a quiet departure toward meaning. It is not drama; it is honesty.", reversed: "Staying past the lesson, or leaving in a way that avoids a conversation." },
  { keywords: "wish, satisfaction, plenty", upright: "The wish card. Emotional fullness, a table set, a heart that can receive. Let the good thing be true.", reversed: "A wish half-held, or satisfaction you keep poking holes in. Sit at the table." },
  { keywords: "family, overflow, home", upright: "Love that has become a house. Family in whatever form you mean it — chosen, blood, creative. The rainbow is not a metaphor today.", reversed: "A happy picture covering a crack, or family as obligation. Tell a truer story of home." },
  { keywords: "message, muse, offer", upright: "A cup extended. News of the heart, an invitation, a young feeling. Answer with sincerity.", reversed: "A moody message, or a feeling you will not deliver. Speak plainly." },
  { keywords: "romance, quest, ideal", upright: "The questing heart. Charm, pursuit, a beautiful offer. Follow if the vision can survive daylight.", reversed: "Moodiness, a crush on an idea, or love as escape. Ground the feeling." },
  { keywords: "compassion, depth, calm sea", upright: "Emotional sovereignty. The Queen of Cups feels everything and is not drowned. Counsel, art, and care from a still center.", reversed: "Overflow, martyrdom, or feelings used as weather against others. Find the shore." },
  { keywords: "steward, diplomat, mature heart", upright: "A king who governs feeling with fairness. Counsel, loyalty, a cup held steady in public life. Lead with emotional literacy.", reversed: "Coldness, mood as law, or a heart closed in the name of control. Soften the crown." },
];

const swords: MinorCopy[] = [
  { keywords: "clarity, truth, cut", upright: "A thought with an edge. Ace of Swords is the idea that cuts through fog — a decision, a sentence, a beginning of honesty.", reversed: "A confused blade, or truth used as a weapon. Sharpen, then aim with care." },
  { keywords: "stalemate, truce, cross", upright: "Two truths crossed. A blindfolded pause. Neither side wins by pushing. Hold the tension until a third way appears.", reversed: "A deadlock breaking — or being prolonged out of pride. Lower one sword." },
  { keywords: "heartbreak, necessary cut", upright: "Rain and a pierced heart. Pain that is also a clearing. Three of Swords tells the truth that hurts and, by telling it, begins to heal.", reversed: "A grief recycled, or a wound you will not name. Speak the sentence." },
  { keywords: "rest, recovery, mind still", upright: "The sword is under the bench. Rest is not failure. Let the mind lie down so it can be useful later.", reversed: "Restlessness, burnout, or using stillness as avoidance. True rest has an end." },
  { keywords: "defeat, humiliation, empty win", upright: "A stolen victory, or the feeling of being taken. Five of Swords asks whether winning this way is a life you want.", reversed: "Walking away from a mean contest. Or lingering in one. Choose dignity." },
  { keywords: "passage, rite, leaving", upright: "A boat to farther shores. Six of Swords is the quiet crossing after conflict — not joy yet, but motion toward calmer water.", reversed: "Unable to leave, or a crossing you keep undoing. Pack the boat." },
  { keywords: "strategy, theft of ideas, alone", upright: "A figure carrying swords in secret. Cunning, a plan, or feeling you must do it without help. Wit is useful; isolation is optional.", reversed: "A plot collapsing, or finally asking for help. Come out of the tent." },
  { keywords: "bound, story, restriction", upright: "Blindfold and bindings you could slip. Eight of Swords is a story of powerlessness that has become a room. Look again at the knots.", reversed: "Seeing the door. Or tightening the story. Test one knot with your actual hands." },
  { keywords: "anxiety, night mind, spiral", upright: "Swords on the wall, a figure awake. Nine is rumination. The fears are loud; not all of them are prophets. Wait for morning.", reversed: "The spiral loosening, or deepening. Get the thoughts out of the bed." },
  { keywords: "ending, ruin, rock bottom", upright: "The worst has a shape. Ten of Swords is an ending so complete it cannot be bargained with. The sun is already under the horizon, coming back.", reversed: "A disaster you are rehearsing, or one that is over and still being worn. Get up." },
  { keywords: "curious mind, message, student", upright: "A young blade: questions, writing, a message of fact. Learn in public. The Page of Swords watches, then speaks.", reversed: "Gossip, spying, or a mind without kindness. Check the motive of the question." },
  { keywords: "charge, principle, haste", upright: "A knight into the wind. Ideals, debate, a rush toward justice. Brave — and sometimes too sure. Aim the horse.", reversed: "Cruelty in the name of being right, or a fight picked for sport. Sheathe it." },
  { keywords: "discernment, independence, clear air", upright: "The Queen of Swords has buried and still sees. Honesty without heat, a boundary with language. Ask her for the precise word.", reversed: "Bitterness, isolation, or a tongue used to exile. Warm the blade." },
  { keywords: "intellect, law, command of mind", upright: "A king of air: ethics, strategy, fair judgment. Think it through, then rule. Your mind is a public trust today.", reversed: "Tyranny of reason, or a decision you will not make. Come down from the head." },
];

const pentacles: MinorCopy[] = [
  { keywords: "seed, body, resource", upright: "A coin in the garden. Ace of Pentacles is a real beginning in matter — work, money, health, a craft you can hold.", reversed: "A missed offer, or treating the seed as already a forest. Plant something small." },
  { keywords: "juggle, balance, keeping", upright: "Two coins in motion. Adaptability, a life in two rhythms. Stay light on the feet and the ships will pass.", reversed: "Dropping a coin, overcommitment, or refusing to juggle at all. Simplify the pattern." },
  { keywords: "craft, collaboration, skill", upright: "The guild hall. Work done well with others, a standard of making. Apprenticeship and mastery in the same room.", reversed: "Mediocre work, or talent refusing the team. Raise the craft." },
  { keywords: "hold, scarcity story, conservation", upright: "A coin hugged close. Security, or the fear of not enough. Four of Pentacles asks whether you are saving or starving the life.", reversed: "A fist opening — generosity, or a leak. Look at the actual numbers." },
  { keywords: "hardship, two figures, a church", upright: "Lack in a landscape that still has a lit window. Five of Pentacles is real need, and also the help you have not yet asked for.", reversed: "Recovery beginning, or pride keeping you in the snow. Walk toward the light." },
  { keywords: "giving, receiving, scales", upright: "Charity as circulation, not performance. Six of Pentacles is a fair exchange — money, time, dignity. Be on the honest side of the scale.", reversed: "Strings attached, or a gift you will not receive. Clean the exchange." },
  { keywords: "patience, harvest later, tend", upright: "The farmer waits on the vine. Seven of Pentacles is assessment: is this crop worth another season? Tend, and do not yank the fruit.", reversed: "Impatience, a bad investment, or abandoning a garden one week from ripe." },
  { keywords: "skill, diligence, the work itself", upright: "The chisel in hand. Eight of Pentacles is devotion to craft — repetition that makes beauty. Show up to the bench.", reversed: "Perfectionism, busywork, or a craft you have outgrown. Return to meaning." },
  { keywords: "ripeness, self-sufficiency, garden", upright: "A woman in a vineyard of her own making. Nine of Pentacles is earned ease, a body at home, success that does not need an audience.", reversed: "Isolation in plenty, or ease you will not allow. Enjoy one fruit." },
  { keywords: "lineage, wealth, the gate", upright: "An elder, a child, dogs, an arch of coin. Ten of Pentacles is lasting structure — family, inheritance, a life that outlives you. Build for them.", reversed: "A family system that costs too much, or wealth without belonging. Redefine the gate." },
  { keywords: "study, offer, new work", upright: "A pentacle like a page of homework. News of work, a student of the material world. Begin the apprenticeship.", reversed: "A missed chance, or studying forever to avoid the job. Take the post." },
  { keywords: "labor, reliability, the field", upright: "The Knight of Pentacles is slow on purpose. Duty, the daily acre, a promise kept. Progress you can trust.", reversed: "Stuckness, stubbornness, or duty without love. Move the horse one field." },
  { keywords: "practical magic, home, abundance", upright: "The Queen of Pentacles makes a world you can live in — food, money, comfort, and competence. Care is her throne.", reversed: "Smothering care, or a home neglected. Put one beautiful practical thing in order." },
  { keywords: "steward, enterprise, the good king", upright: "A king who can read a ledger and a field. Material mastery in service of people. Build something that lasts and is fair.", reversed: "Greed, stagnation, or a king who will not get his hands in the dirt. Return to the work." },
];

function pack(
  suit: "wands" | "cups" | "swords" | "pentacles",
  base: number,
  copy: MinorCopy[],
): SeedCard[] {
  return copy.map((entry, i) => {
    const r = ranks[i];
    const name = `${r.title} of ${SUIT_LABEL_SHORT[suit]}`;
    return card(suit, base + i, name, r.rank, entry.keywords, entry.upright, entry.reversed);
  });
}

const SUIT_LABEL_SHORT: Record<
  Exclude<Suit, "major" | "custom" | "hearings">,
  string
> = {
  wands: "Wands",
  cups: "Cups",
  swords: "Swords",
  pentacles: "Pentacles",
};

export const SEED_CARDS: SeedCard[] = [
  ...major,
  ...pack("wands", 100, wands),
  ...pack("cups", 200, cups),
  ...pack("swords", 300, swords),
  ...pack("pentacles", 400, pentacles),
];
