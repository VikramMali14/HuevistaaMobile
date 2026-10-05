// Ported from HueVistaFrontEnd/src/lib/colour-search.ts — keep the two in step.
/**
 * Searching by what a colour LOOKS like, not by what it is called.
 *
 * A shop owner types "yellow" and expects every yellow in the range: the light
 * ones, the lemon ones, the mustards. What the search box did was look for the
 * letters y-e-l-l-o-w in a code or a name — and for everyone but an
 * administrator a shade has no name on screen, only "HV0348", so the most
 * natural thing anyone types into a paint catalogue found nothing at all. For an
 * administrator it found the shades whose NAME happened to say yellow, and
 * missed the hundred that are yellow and are called something else.
 *
 * So a query made of colour words is read as a colour and answered from each
 * shade's own hex, measured in CIELAB (lightness L, chroma C, hue angle h — see
 * color-science.ts). The vocabulary is the one people use at a paint counter:
 *
 *   - base colours      "red", "yellow", "blue" … and their plurals;
 *   - named colours     "lemon", "mustard", "sky blue", "navy", "sage",
 *                        "terracotta", "off white" …;
 *   - qualities         "light", "dark", "pastel", "bright", "muted", "warm" …;
 *   - blends            "blue green", "greenish blue", "bluish grey";
 *   - Hindi counter words "peela", "laal", "aasmani", "gulabi", "mehendi" …;
 *   - a typo or a word still being typed: "yelow", "light yel".
 *
 * A query with any word outside that vocabulary is NOT a colour query, and this
 * returns null. That is deliberate. "Ivory Mist" is another company's shade
 * name and has to reach the cross-reference as a name; reading it as "ivory"
 * would answer a different question. Codes carry digits and are never colours.
 *
 * Each colour is a region of LCh space rather than a single point: "yellow" is
 * every shade whose hue sits in the yellow arc, clear enough to read as yellow
 * rather than cream, and light enough not to be olive. The regions were set
 * against ~130 reference paint colours (see the tests), and they overlap at the
 * edges on purpose — a golden yellow is a fair answer to both "yellow" and
 * "orange". Within a region, shades are ranked by distance from a typical
 * example of the colour, so the truest yellows come first.
 *
 * Pure: no React, no DOM. The catalogue and the studio both call it, so the
 * two screens always agree about what "light yellow" means.
 */
import { hexToLab, labToHex, type Lab } from "./color";
import { chroma, labHue } from "./color-science";

/** A region of LCh space. Absent bounds are unbounded; a hue arc may wrap past 360. */
interface Box {
  h?: readonly [number, number];
  L?: readonly [number, number];
  C?: readonly [number, number];
}

type Base = "red" | "pink" | "orange" | "yellow" | "brown" | "green" | "blue" | "purple" | "white" | "grey" | "black";

interface Term {
  label: string;
  boxes: ReadonlyArray<Box>;
  /** A typical example — what ranks first. */
  proto: string;
  /** The base colours this belongs under: "lemon" is a yellow, "teal" both blue and green. */
  bases: ReadonlyArray<Base>;
  /** Where "light X" starts and "dark X" ends, in L. Derived from the region when absent. */
  light?: number;
  dark?: number;
  /**
   * The hue a person means by the word, when that is not the middle of its region.
   * Green's region runs from olive to teal, but "green" means a green about 138°,
   * and a "blue green" is measured from there.
   */
  centre?: number;
  /** What to offer next, as queries this module reads. */
  related?: ReadonlyArray<string>;
}

const ACHROMATIC: ReadonlySet<Base> = new Set(["white", "grey", "black"]);

/* ── The vocabulary ──────────────────────────────────────────────────────── */

const BASES: Record<Base, Term> = {
  red: {
    label: "red", bases: ["red"], centre: 32, proto: "#c1272d", light: 50, dark: 35,
    // Stops short of rust: past ~46° a red is an orange that has been told it is red.
    boxes: [{ h: [5, 46], L: [18, 62], C: [28, 200] }],
    related: ["dark red", "maroon", "terracotta", "coral", "pink"],
  },
  pink: {
    label: "pink", bases: ["pink"], centre: 8, proto: "#eba3b3", light: 82, dark: 65,
    // Light reds, and the vivid magentas that stay pink however deep they go.
    boxes: [{ h: [330, 50], L: [58, 100], C: [9, 200] }, { h: [335, 15], L: [35, 58], C: [45, 200] }],
    related: ["baby pink", "rose", "dusty pink", "magenta", "peach"],
  },
  orange: {
    label: "orange", bases: ["orange"], centre: 62, proto: "#f28c28", light: 75, dark: 58,
    boxes: [{ h: [45, 75], L: [45, 100], C: [40, 200] }],
    related: ["peach", "saffron", "terracotta", "rust", "coral"],
  },
  yellow: {
    label: "yellow", bases: ["yellow"], centre: 94, proto: "#f5d33f", light: 88, dark: 76,
    // Clear enough to read as yellow rather than cream, light enough not to be
    // olive, and short of the lime greens that start just past a lemon.
    boxes: [{ h: [75, 106], L: [60, 100], C: [28, 200] }],
    related: ["light yellow", "lemon yellow", "mustard", "golden yellow", "cream"],
  },
  brown: {
    label: "brown", bases: ["brown"], centre: 62, proto: "#8b5a2b", light: 55, dark: 32,
    boxes: [{ h: [30, 90], L: [12, 58], C: [8, 60] }, { h: [55, 85], L: [58, 78], C: [18, 42] }],
    related: ["beige", "tan", "coffee", "terracotta", "taupe"],
  },
  green: {
    label: "green", bases: ["green"], centre: 138, proto: "#5a9e44", light: 72, dark: 42,
    // Olive greens lean further toward yellow than pale greens can before they
    // stop reading as green, so the arc starts earlier in the dark.
    boxes: [{ h: [98, 200], L: [0, 75], C: [8, 200] }, { h: [110, 200], L: [75, 100], C: [8, 200] }],
    related: ["light green", "sage", "mint", "olive", "bottle green"],
  },
  blue: {
    label: "blue", bases: ["blue"], centre: 255, proto: "#3a6ea5", light: 70, dark: 38,
    boxes: [{ h: [190, 306], L: [0, 100], C: [8, 200] }],
    related: ["sky blue", "navy", "teal", "royal blue", "grey blue"],
  },
  purple: {
    label: "purple", bases: ["purple"], centre: 318, proto: "#7e5a9b", light: 68, dark: 38,
    boxes: [{ h: [300, 345], L: [0, 70], C: [9, 200] }, { h: [288, 345], L: [70, 100], C: [7, 200] }],
    related: ["lavender", "lilac", "plum", "mauve", "magenta"],
  },
  white: {
    label: "white", bases: ["white"], proto: "#f7f5f0",
    boxes: [{ L: [92, 100], C: [0, 10] }],
    related: ["off white", "ivory", "cream", "warm white", "cool white"],
  },
  grey: {
    label: "grey", bases: ["grey"], proto: "#9a9a98", light: 72, dark: 42,
    boxes: [{ L: [18, 92], C: [0, 9] }],
    related: ["light grey", "warm grey", "charcoal", "silver", "blue grey"],
  },
  black: {
    label: "black", bases: ["black"], proto: "#1c1c1c",
    boxes: [{ L: [0, 22], C: [0, 15] }],
    related: ["charcoal", "navy", "dark grey"],
  },
};

const NAMED: Record<string, Term> = {
  "off white": {
    label: "off white", bases: ["white"], proto: "#f3efe6",
    boxes: [{ L: [86, 100], C: [0, 14] }],
    related: ["ivory", "cream", "warm white", "beige"],
  },
  ivory: {
    label: "ivory", bases: ["white"], proto: "#f6f1e1",
    boxes: [{ h: [70, 115], L: [90, 100], C: [3, 16] }],
    related: ["off white", "cream", "beige"],
  },
  cream: {
    label: "cream", bases: ["white", "yellow"], proto: "#f3e5c0",
    boxes: [{ h: [72, 112], L: [84, 100], C: [8, 32] }],
    related: ["ivory", "off white", "light yellow", "beige"],
  },
  beige: {
    label: "beige", bases: ["brown"], proto: "#e3d5bb",
    boxes: [{ h: [55, 105], L: [68, 92], C: [7, 28] }],
    related: ["cream", "sand", "taupe", "greige", "off white"],
  },
  sand: {
    label: "sand", bases: ["brown"], proto: "#d8c3a0",
    boxes: [{ h: [60, 95], L: [70, 86], C: [12, 30] }],
    related: ["beige", "tan", "cream"],
  },
  taupe: {
    label: "taupe", bases: ["brown", "grey"], proto: "#8b7d6b",
    boxes: [{ h: [30, 100], L: [38, 70], C: [5, 18] }],
    related: ["greige", "beige", "warm grey"],
  },
  greige: {
    label: "greige", bases: ["grey", "brown"], proto: "#b5ab9c",
    boxes: [{ h: [50, 110], L: [55, 85], C: [4, 12] }],
    related: ["taupe", "beige", "warm grey"],
  },
  tan: {
    label: "tan", bases: ["brown"], proto: "#c19a6b",
    boxes: [{ h: [60, 85], L: [58, 80], C: [18, 40] }],
    related: ["beige", "sand", "brown"],
  },
  coffee: {
    label: "coffee", bases: ["brown"], proto: "#5a3a22",
    boxes: [{ h: [35, 80], L: [12, 40], C: [8, 40] }],
    related: ["brown", "tan", "charcoal"],
  },
  lemon: {
    label: "lemon yellow", bases: ["yellow"], proto: "#faed6a",
    boxes: [{ h: [92, 108], L: [82, 100], C: [45, 200] }],
    related: ["light yellow", "lime", "butter yellow", "yellow"],
  },
  butter: {
    label: "butter yellow", bases: ["yellow"], proto: "#fff1a8",
    boxes: [{ h: [88, 110], L: [88, 100], C: [18, 50] }],
    related: ["cream", "lemon yellow", "light yellow"],
  },
  mustard: {
    label: "mustard", bases: ["yellow"], proto: "#d4a017",
    boxes: [{ h: [74, 94], L: [55, 80], C: [45, 200] }],
    related: ["golden yellow", "turmeric", "ochre", "yellow"],
  },
  gold: {
    label: "golden yellow", bases: ["yellow"], proto: "#d4af37",
    boxes: [{ h: [76, 96], L: [62, 84], C: [40, 200] }],
    related: ["mustard", "turmeric", "yellow"],
  },
  turmeric: {
    label: "turmeric", bases: ["yellow", "orange"], proto: "#e3a52a",
    boxes: [{ h: [72, 90], L: [62, 84], C: [50, 200] }],
    related: ["mustard", "saffron", "golden yellow"],
  },
  ochre: {
    label: "ochre", bases: ["yellow", "brown"], proto: "#cc7722",
    boxes: [{ h: [60, 86], L: [45, 72], C: [35, 200] }],
    related: ["mustard", "terracotta", "tan"],
  },
  saffron: {
    label: "saffron", bases: ["orange"], proto: "#ff9933",
    boxes: [{ h: [55, 80], L: [60, 90], C: [50, 200] }],
    related: ["orange", "turmeric", "peach"],
  },
  peach: {
    label: "peach", bases: ["orange", "pink"], proto: "#f6c9a8",
    boxes: [{ h: [40, 78], L: [74, 95], C: [12, 45] }],
    related: ["coral", "baby pink", "light orange", "saffron"],
  },
  coral: {
    label: "coral", bases: ["orange", "pink"], proto: "#f08070",
    boxes: [{ h: [25, 55], L: [58, 80], C: [35, 200] }],
    related: ["peach", "terracotta", "pink"],
  },
  terracotta: {
    label: "terracotta", bases: ["red", "orange", "brown"], proto: "#c8674a",
    // Earthier than a red: a signal red is too clean to be baked clay.
    boxes: [{ h: [32, 56], L: [35, 62], C: [28, 64] }],
    related: ["rust", "coral", "ochre", "maroon"],
  },
  rust: {
    label: "rust", bases: ["orange", "red", "brown"], proto: "#b7410e",
    boxes: [{ h: [40, 62], L: [30, 52], C: [40, 200] }],
    related: ["terracotta", "brown", "maroon"],
  },
  maroon: {
    label: "maroon", bases: ["red"], proto: "#6d1a2e",
    boxes: [{ h: [350, 45], L: [10, 36], C: [18, 200] }],
    related: ["red", "plum", "coffee"],
  },
  "baby pink": {
    label: "baby pink", bases: ["pink"], proto: "#f4c2c2",
    boxes: [{ h: [340, 50], L: [78, 100], C: [9, 35] }],
    related: ["blush", "peach", "rose"],
  },
  rose: {
    label: "rose", bases: ["pink"], proto: "#e8a0a8",
    boxes: [{ h: [345, 30], L: [55, 85], C: [18, 50] }],
    related: ["baby pink", "dusty pink", "mauve"],
  },
  blush: {
    label: "blush", bases: ["pink"], proto: "#f3d1d1",
    boxes: [{ h: [0, 50], L: [80, 100], C: [6, 22] }],
    related: ["baby pink", "peach", "off white"],
  },
  "dusty pink": {
    label: "dusty pink", bases: ["pink"], proto: "#d4a5a5",
    boxes: [{ h: [345, 45], L: [55, 82], C: [10, 30] }],
    related: ["rose", "mauve", "blush"],
  },
  magenta: {
    label: "magenta", bases: ["pink", "purple"], proto: "#d33f8c",
    boxes: [{ h: [330, 15], L: [35, 72], C: [45, 200] }],
    related: ["pink", "plum", "purple"],
  },
  lime: {
    label: "lime green", bases: ["green", "yellow"], proto: "#c9e265",
    boxes: [{ h: [106, 130], L: [70, 100], C: [45, 200] }],
    related: ["lemon yellow", "pista green", "light green"],
  },
  olive: {
    label: "olive green", bases: ["green"], proto: "#708238",
    boxes: [{ h: [95, 125], L: [25, 62], C: [15, 200] }],
    related: ["sage", "mehendi green", "khaki"],
  },
  mehendi: {
    label: "mehendi green", bases: ["green"], proto: "#7d8c3a",
    boxes: [{ h: [100, 125], L: [40, 65], C: [30, 200] }],
    related: ["olive green", "pista green", "sage"],
  },
  khaki: {
    label: "khaki", bases: ["brown", "green"], proto: "#b5a77a",
    boxes: [{ h: [80, 110], L: [55, 80], C: [15, 40] }],
    related: ["olive green", "beige", "sage"],
  },
  sage: {
    label: "sage green", bases: ["green"], proto: "#9caf88",
    boxes: [{ h: [100, 175], L: [45, 82], C: [6, 28] }],
    related: ["mint", "olive green", "grey green"],
  },
  pista: {
    label: "pista green", bases: ["green"], proto: "#a8c686",
    boxes: [{ h: [108, 138], L: [65, 90], C: [22, 55] }],
    related: ["mint", "lime green", "light green"],
  },
  mint: {
    label: "mint green", bases: ["green"], proto: "#b6e5c7",
    boxes: [{ h: [135, 205], L: [78, 100], C: [8, 40] }],
    related: ["pista green", "sage green", "aqua"],
  },
  emerald: {
    label: "emerald green", bases: ["green"], proto: "#50c878",
    boxes: [{ h: [140, 170], L: [40, 78], C: [35, 200] }],
    related: ["sea green", "bottle green", "green"],
  },
  forest: {
    label: "bottle green", bases: ["green"], proto: "#2f5a3a",
    boxes: [{ h: [120, 175], L: [15, 45], C: [10, 200] }],
    related: ["emerald green", "olive green", "teal"],
  },
  "sea green": {
    label: "sea green", bases: ["green", "blue"], proto: "#2e8b57",
    boxes: [{ h: [145, 180], L: [40, 72], C: [20, 200] }],
    related: ["emerald green", "teal", "mint green"],
  },
  teal: {
    label: "teal", bases: ["blue", "green"], proto: "#2f6f73",
    boxes: [{ h: [180, 230], L: [22, 60], C: [12, 200] }],
    related: ["turquoise", "sea green", "navy"],
  },
  turquoise: {
    label: "turquoise", bases: ["blue", "green"], proto: "#40c8c0",
    boxes: [{ h: [175, 225], L: [55, 92], C: [18, 200] }],
    related: ["aqua", "teal", "sky blue"],
  },
  sky: {
    label: "sky blue", bases: ["blue"], proto: "#a4c8e1",
    boxes: [{ h: [200, 275], L: [70, 95], C: [8, 40] }],
    related: ["light blue", "turquoise", "denim blue", "lavender"],
  },
  navy: {
    label: "navy blue", bases: ["blue"], proto: "#1f2a44",
    boxes: [{ h: [240, 310], L: [5, 32], C: [10, 200] }],
    related: ["royal blue", "indigo", "charcoal"],
  },
  "royal blue": {
    label: "royal blue", bases: ["blue"], proto: "#4169e1",
    boxes: [{ h: [268, 306], L: [25, 55], C: [45, 200] }],
    related: ["navy blue", "blue", "indigo"],
  },
  denim: {
    label: "denim blue", bases: ["blue"], proto: "#4682b4",
    boxes: [{ h: [245, 290], L: [30, 62], C: [15, 45] }],
    related: ["grey blue", "navy blue", "sky blue"],
  },
  indigo: {
    label: "indigo", bases: ["blue", "purple"], proto: "#3f3d7a",
    boxes: [{ h: [282, 320], L: [10, 38], C: [25, 200] }],
    related: ["navy blue", "purple", "royal blue"],
  },
  lavender: {
    label: "lavender", bases: ["purple"], proto: "#c9b8e0",
    boxes: [{ h: [280, 340], L: [68, 96], C: [6, 35] }],
    related: ["lilac", "mauve", "baby pink"],
  },
  lilac: {
    label: "lilac", bases: ["purple"], proto: "#c8a2c8",
    boxes: [{ h: [300, 350], L: [62, 90], C: [12, 40] }],
    related: ["lavender", "mauve", "purple"],
  },
  mauve: {
    label: "mauve", bases: ["purple", "pink"], proto: "#b784a7",
    boxes: [{ h: [315, 355], L: [45, 78], C: [12, 35] }],
    related: ["lilac", "dusty pink", "plum"],
  },
  plum: {
    label: "plum", bases: ["purple"], proto: "#7d4e6d",
    boxes: [{ h: [320, 358], L: [20, 45], C: [15, 50] }],
    related: ["maroon", "mauve", "purple"],
  },
  charcoal: {
    label: "charcoal", bases: ["grey", "black"], proto: "#36454f",
    boxes: [{ L: [15, 38], C: [0, 12] }],
    related: ["dark grey", "black", "slate grey"],
  },
  silver: {
    label: "silver", bases: ["grey"], proto: "#c0c0c0",
    boxes: [{ L: [70, 88], C: [0, 6] }],
    related: ["light grey", "cool grey", "off white"],
  },
  slate: {
    label: "slate grey", bases: ["grey", "blue"], proto: "#4f5b66",
    boxes: [{ h: [200, 290], L: [28, 60], C: [3, 15] }],
    related: ["charcoal", "grey blue", "denim blue"],
  },
  neutral: {
    label: "neutral", bases: [], proto: "#d9d0c1",
    boxes: [{ L: [15, 100], C: [0, 14] }],
    related: ["off white", "beige", "greige", "grey"],
  },
  earthy: {
    label: "earthy", bases: ["brown"], proto: "#a47148",
    boxes: [{ h: [30, 100], L: [20, 70], C: [10, 50] }],
    related: ["terracotta", "ochre", "olive green", "brown"],
  },
};

type Mod = "light" | "dark" | "medium" | "pale" | "pastel" | "bright" | "muted" | "warm" | "cool";

/** Canonical order for a label: "Light muted warm grey", however it was typed. */
const MOD_ORDER: ReadonlyArray<Mod> = ["light", "pale", "pastel", "medium", "dark", "bright", "muted", "warm", "cool"];

type Word =
  | { kind: "term"; term: Term }
  | { kind: "tint"; term: Term; word: string }
  | { kind: "mod"; mod: Mod };

const WORDS = new Map<string, Word>();
const term = (t: Term, ...keys: string[]) => keys.forEach((k) => WORDS.set(k, { kind: "term", term: t }));
const mod = (m: Mod, ...keys: string[]) => keys.forEach((k) => WORDS.set(k, { kind: "mod", mod: m }));
const tint = (t: Term, ...keys: string[]) => keys.forEach((k) => WORDS.set(k, { kind: "tint", term: t, word: keys[0]! }));

term(BASES.red, "red", "crimson", "scarlet", "vermilion", "cherry", "sindoori", "laal", "lal");
term(BASES.pink, "pink", "gulabi");
term(BASES.orange, "orange", "narangi", "santri");
term(BASES.yellow, "yellow", "peela", "pila", "peeli", "pili");
term(BASES.brown, "brown", "bhura", "kathai");
term(BASES.green, "green", "hara", "hari");
term(BASES.blue, "blue", "neela", "nila", "neeli", "nili");
term(BASES.purple, "purple", "violet", "jamuni", "baingani", "aubergine", "brinjal");
term(BASES.white, "white", "safed", "safaid", "snow");
term(BASES.grey, "grey", "gray", "sleti", "slaty");
term(BASES.black, "black", "kala", "kaala", "kali", "ebony");
term(NAMED["off white"]!, "off white", "offwhite", "eggshell");
term(NAMED.ivory!, "ivory");
term(NAMED.cream!, "cream", "malai");
term(NAMED.beige!, "beige", "chandan", "sandalwood", "almond", "badami", "biscuit", "nude");
term(NAMED.sand!, "sand", "sandy", "stone");
term(NAMED.taupe!, "taupe", "mushroom");
term(NAMED.greige!, "greige");
term(NAMED.tan!, "tan", "camel", "caramel");
term(NAMED.coffee!, "coffee", "chocolate", "walnut", "mocha");
term(NAMED.lemon!, "lemon", "lemon yellow");
term(NAMED.butter!, "butter", "butter yellow", "butterscotch");
term(NAMED.mustard!, "mustard", "mustard yellow");
term(NAMED.gold!, "gold", "golden", "golden yellow", "sunehra", "sunehri");
term(NAMED.turmeric!, "turmeric", "haldi");
term(NAMED.ochre!, "ochre", "ocher", "gerua");
term(NAMED.saffron!, "saffron", "kesari", "kesariya", "bhagwa");
term(NAMED.peach!, "peach", "apricot");
term(NAMED.coral!, "coral", "salmon");
term(NAMED.terracotta!, "terracotta", "brick", "brick red", "clay");
term(NAMED.rust!, "rust", "burnt orange", "copper");
term(NAMED.maroon!, "maroon", "burgundy", "wine", "oxblood");
term(NAMED["baby pink"]!, "baby pink");
term(NAMED.rose!, "rose", "rose pink");
term(NAMED.blush!, "blush", "blush pink");
term(NAMED["dusty pink"]!, "dusty pink", "dusty rose", "old rose", "onion pink", "onion");
term(NAMED.magenta!, "magenta", "fuchsia", "hot pink", "rani", "rani pink");
term(NAMED.lime!, "lime", "lime green", "chartreuse", "parrot green", "parrot");
term(NAMED.olive!, "olive", "olive green", "army green");
term(NAMED.mehendi!, "mehendi", "mehndi", "henna", "mehendi green", "mehndi green");
term(NAMED.khaki!, "khaki");
term(NAMED.sage!, "sage", "sage green");
term(NAMED.pista!, "pista", "pistachio", "pista green", "dhani");
term(NAMED.mint!, "mint", "mint green");
term(NAMED.emerald!, "emerald", "emerald green");
term(NAMED.forest!, "forest", "forest green", "bottle green", "hunter green");
term(NAMED["sea green"]!, "sea green");
term(NAMED.teal!, "teal", "peacock", "peacock blue", "peacock green");
term(NAMED.turquoise!, "turquoise", "aqua", "cyan", "firozi", "feroza");
term(NAMED.sky!, "sky", "sky blue", "aasmani", "asmani", "baby blue", "powder blue", "ice blue");
term(NAMED.navy!, "navy", "navy blue", "midnight blue");
term(NAMED["royal blue"]!, "royal blue", "cobalt", "cobalt blue", "ultramarine");
term(NAMED.denim!, "denim", "denim blue", "steel blue");
term(NAMED.indigo!, "indigo");
term(NAMED.lavender!, "lavender", "periwinkle");
term(NAMED.lilac!, "lilac");
term(NAMED.mauve!, "mauve");
term(NAMED.plum!, "plum", "wine purple");
term(NAMED.charcoal!, "charcoal", "graphite");
term(NAMED.silver!, "silver");
term(NAMED.slate!, "slate", "slate grey", "slate gray");
term(NAMED.neutral!, "neutral", "neutrals");
term(NAMED.earthy!, "earthy", "earth", "earth tone", "earth tones", "earthy tones");

mod("light", "light", "lite", "lighter", "whitish");
mod("pale", "pale", "faint");
mod("pastel", "pastel", "pastels");
mod("dark", "dark", "darker", "deep", "rich", "blackish");
mod("medium", "medium", "mid");
mod("bright", "bright", "vivid", "bold", "strong", "neon", "vibrant", "loud");
mod("muted", "muted", "dull", "dusty", "soft", "subtle", "subdued", "greyish", "grayish", "smoky");
mod("warm", "warm", "warmer");
mod("cool", "cool", "cold", "cooler");

tint(BASES.red, "reddish");
tint(BASES.pink, "pinkish");
tint(BASES.orange, "orangish", "orangey", "orangy");
tint(BASES.yellow, "yellowish");
tint(BASES.brown, "brownish");
tint(BASES.green, "greenish");
tint(BASES.blue, "bluish", "blueish");
tint(BASES.purple, "purplish");

/** Words that say "I mean a colour" and nothing about which. */
const FILLER = new Set(["colour", "color", "colours", "colors", "shade", "shades", "paint", "tone", "tones", "the", "a", "of", "in", "rang"]);

/** Every single-word key, for typo and prefix matching. */
const SINGLE_WORDS: ReadonlyArray<string> = [...WORDS.keys()].filter((k) => !k.includes(" "));

/* ── Reading a query ─────────────────────────────────────────────────────── */

export interface ColourSearch {
  /** What was understood, in words: "Light yellow", "Sky blue", "Warm". */
  label: string;
  /** A typical example of it, for a swatch beside the label. */
  hex: string;
  /** True for a query of qualities alone ("light", "warm"), which names no colour. */
  qualitiesOnly: boolean;
  /**
   * Whether a list should be re-ordered by {@link ColourSearch.score}. Only a named
   * colour has a "truest" example; "light" alone has nothing to rank toward.
   */
  ranked: boolean;
  /** Next things to try, each one a query this module reads. */
  related: ReadonlyArray<string>;
  /**
   * How far a colour is from what was asked — lower is closer — or null when it
   * does not answer the query at all.
   */
  score(hex: string): number | null;
}

/** Levenshtein distance, capped: only "is it at most one edit" is ever asked. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return true;
  // Substitution, insertion, deletion — or a swap of two neighbours ("marron").
  return (
    a.slice(i + 1) === b.slice(i + 1) ||
    a.slice(i) === b.slice(i + 1) ||
    a.slice(i + 1) === b.slice(i) ||
    (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
  );
}

/** The dictionary word a typed word stands for: exact, singular, or one typo away. */
function lookUp(token: string): string | null {
  if (WORDS.has(token) || FILLER.has(token)) return token;
  for (const stem of [token.replace(/es$/, ""), token.replace(/s$/, "")]) {
    if (stem !== token && WORDS.has(stem)) return stem;
  }
  // A typo only in a word long enough that one wrong letter still identifies it.
  if (token.length < 5) return null;
  const near = SINGLE_WORDS.filter((w) => w.length >= 5 && withinOneEdit(token, w));
  return near.length === 1 ? near[0]! : null;
}

type ColourWord = Extract<Word, { kind: "tint" | "term" }>;

interface Parsed {
  head: Term | null;
  tint: ColourWord | null;
  mods: Set<Mod>;
  /** The tint as it should read in the label: "greenish", "grey", "blue". */
  tintLabel: string | null;
  /** Qualities that came from a word already in the label ("GREY blue" is muted). */
  silent: Set<Mod>;
}

/** What a word stands for, so two spellings of one colour count as one. */
function meaningOf(w: Word): Term | Mod {
  return w.kind === "mod" ? w.mod : w.term;
}

function tokenize(query: string): string[] | null {
  const q = query.toLowerCase().trim();
  // A digit or a hash is a code or a hex, and never a colour word.
  if (!q || /[0-9#]/.test(q)) return null;
  return q.replace(/[^a-z\s-]/g, " ").replace(/-/g, " ").split(/\s+/).filter(Boolean);
}

function parse(query: string): Parsed | null {
  const tokens = tokenize(query);
  if (!tokens || tokens.length === 0 || tokens.length > 6) return null;

  const words: Word[] = [];
  const labels: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    // Longest phrase first, so "sky blue" is one colour and not a blend of two.
    let taken = 0;
    for (let n = Math.min(3, tokens.length - i); n >= 2 && !taken; n--) {
      const phrase = tokens.slice(i, i + n).join(" ");
      const w = WORDS.get(phrase);
      if (w) {
        words.push(w);
        labels.push(phrase);
        taken = n;
      }
    }
    if (taken) {
      i += taken;
      continue;
    }
    const token = tokens[i]!;
    const key = lookUp(token);
    if (key) {
      if (!FILLER.has(key)) {
        words.push(WORDS.get(key)!);
        labels.push(key);
      }
      i++;
      continue;
    }
    // Still being typed: the LAST word, as a prefix of a colour word, is let go
    // rather than turning the whole query back into text ("light yel" → "light";
    // "light yell" → "light yellow" once it names only one word).
    if (i === tokens.length - 1 && SINGLE_WORDS.some((w) => w.startsWith(token))) {
      const candidates = token.length >= 3 ? SINGLE_WORDS.filter((w) => w.startsWith(token)) : [];
      // "yel" could be "yellow" or "yellowish", which are one colour; "gre" could be
      // green or grey, which are not, and is left until the next letter decides.
      const meanings = new Set(candidates.map((w) => meaningOf(WORDS.get(w)!)));
      if (candidates.length > 0 && meanings.size === 1) {
        const plain = candidates.find((w) => WORDS.get(w)!.kind !== "tint") ?? candidates[0]!;
        words.push(WORDS.get(plain)!);
        labels.push(plain);
      }
      i++;
      continue;
    }
    return null;
  }

  const mods = new Set<Mod>();
  const colours: Array<{ w: ColourWord; label: string }> = [];
  words.forEach((w, k) => {
    if (w.kind === "mod") mods.add(w.mod);
    else colours.push({ w, label: labels[k]! });
  });
  if (colours.length === 0 && mods.size === 0) return null;
  // Three colours is a list, not a colour. Say nothing rather than guess.
  if (colours.length > 2) return null;

  // The head is the last plain colour word ("greenish BLUE", "blue GREEN"); anything
  // before it, or any "-ish" word, is a tint leaning it one way.
  let headIdx = -1;
  for (let k = colours.length - 1; k >= 0; k--) {
    if (colours[k]!.w.kind === "term") {
      headIdx = k;
      break;
    }
  }
  if (headIdx === -1 && colours.length > 0) headIdx = colours.length - 1; // "greenish" alone
  const head = headIdx >= 0 ? colours[headIdx]!.w.term : null;
  const other = colours.find((_, k) => k !== headIdx) ?? null;

  let tintWord: ColourWord | null = other?.w ?? null;
  const tintLabel = other?.label ?? null;
  const silent = new Set<Mod>();
  // "Lemon yellow", "navy blue", "mustard yellow": a named colour and its own base
  // are one colour, the named one.
  if (head && tintWord && tintWord.kind === "term") {
    const named = tintWord.term;
    const plainBase = head === BASES[head.bases[0]!] && named.bases.includes(head.bases[0]!);
    const reverse = named === BASES[named.bases[0]!] && head.bases.includes(named.bases[0]!);
    if (plainBase) return { head: named, tint: null, mods, tintLabel: null, silent };
    if (reverse) return { head, tint: null, mods, tintLabel: null, silent };
  }
  // An achromatic tint is a quality: "greyish" is muted, "whitish" light.
  if (tintWord && ACHROMATIC.has(tintWord.term.bases[0]!) && tintWord.term === BASES[tintWord.term.bases[0]!]) {
    const b = tintWord.term.bases[0];
    if (head && !ACHROMATIC.has(head.bases[0]!)) {
      const m: Mod = b === "white" ? "light" : b === "black" ? "dark" : "muted";
      if (!mods.has(m)) silent.add(m);
      mods.add(m);
      tintWord = null;
    }
  }
  // "Greenish" on its own is simply green.
  if (head && !tintWord && colours.length === 1 && colours[0]!.w.kind === "tint") {
    return { head, tint: null, mods, tintLabel: null, silent };
  }
  return { head, tint: tintWord, mods, tintLabel, silent };
}

/* ── Measuring a colour against it ───────────────────────────────────────── */

interface LCh { L: number; C: number; h: number; lab: Lab }

const lchCache = new Map<string, LCh>();
function lchOf(hex: string): LCh {
  let v = lchCache.get(hex);
  if (!v) {
    const lab = hexToLab(hex);
    v = { L: lab.L, C: chroma(lab), h: labHue(lab), lab };
    if (lchCache.size > 20000) lchCache.clear();
    lchCache.set(hex, v);
  }
  return v;
}

function inArc(h: number, [from, to]: readonly [number, number]): boolean {
  const a = ((from % 360) + 360) % 360;
  const b = ((to % 360) + 360) % 360;
  return a <= b ? h >= a && h <= b : h >= a || h <= b;
}

function inBox(c: LCh, box: Box): boolean {
  if (box.L && (c.L < box.L[0] || c.L > box.L[1])) return false;
  if (box.C && (c.C < box.C[0] || c.C > box.C[1])) return false;
  if (box.h && !inArc(c.h, box.h)) return false;
  return true;
}

/** The middle of a term's hue arc — where "leaning toward it" points. */
function hueCentre(t: Term): number | null {
  if (t.centre !== undefined) return t.centre;
  const arc = t.boxes.find((b) => b.h)?.h;
  if (!arc) return null;
  const [from, to] = arc;
  const span = (((to - from) % 360) + 360) % 360;
  return (from + span / 2) % 360;
}

/** Signed shortest turn from a to b, in (-180, 180]. */
function turn(a: number, b: number): number {
  const d = (((b - a) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

function range(box: Box, key: "L" | "C", lo: number, hi: number): [number, number] {
  const r = box[key];
  return r ? [r[0], r[1]] : [lo, hi];
}

/**
 * The term's region with the qualities applied — "light" raises its floor, and so on.
 *
 * `strict` returns null for a region the qualities leave empty. A colour made of
 * two regions (green: the olive side and the pale side) keeps whichever survives
 * "dark"; only when every region empties is the lenient reading used.
 */
function applyMods(box: Box, mods: ReadonlySet<Mod>, t: Term | null, strict: boolean): Box | null {
  let [lo, hi] = range(box, "L", 0, 100);
  let [cLo, cHi] = range(box, "C", 0, 200);
  const lightAt = t?.light ?? lo + (hi - lo) * 0.6;
  const darkAt = t?.dark ?? lo + (hi - lo) * 0.4;
  const standalone = !t;
  const relax = () => { cLo = cLo >= 6 ? Math.max(6, cLo * 0.6) : cLo; };

  if (mods.has("light") || mods.has("pale") || mods.has("pastel")) {
    const floor = standalone ? 72 : Math.max(lo, lightAt);
    // "Light navy" has no light end in the navy region; the upper half of it is
    // the honest reading, rather than an empty grid.
    if (floor > hi && strict) return null;
    lo = floor <= hi ? floor : lo + (hi - lo) * 0.5;
    relax();
  }
  if (mods.has("dark")) {
    const ceiling = standalone ? 42 : Math.min(hi, darkAt);
    if (ceiling < lo && strict) return null;
    hi = ceiling >= lo ? ceiling : lo + (hi - lo) * 0.5;
  }
  if (mods.has("medium")) {
    const a = standalone ? 42 : Math.max(lo, darkAt);
    const b = standalone ? 72 : Math.min(hi, lightAt);
    if (a < b) [lo, hi] = [a, b];
  }
  if (mods.has("pale")) cHi = Math.max(cLo + 6, Math.min(cHi, 40));
  if (mods.has("pastel")) {
    cHi = Math.max(cLo + 6, Math.min(cHi, 45));
    if (standalone) cLo = Math.max(cLo, 6);
  }
  if (mods.has("bright")) cLo = Math.min(Math.max(cLo, 45), cHi - 6);
  if (mods.has("muted")) {
    relax();
    cHi = Math.max(cLo + 6, Math.min(cHi, 28));
  }
  return { ...box, L: [lo, hi], C: [cLo, cHi] };
}

/** The example the ranking pulls toward, moved the way the qualities move the region. */
function protoWith(hex: string, mods: ReadonlySet<Mod>, box: Box): Lab {
  const { L, C, h } = lchOf(hex);
  let l = L;
  let c = C;
  const [lo, hi] = range(box, "L", 0, 100);
  if (mods.has("light") || mods.has("pale") || mods.has("pastel")) {
    l = Math.max(l, (lo + Math.min(hi, 97)) / 2);
    c *= 0.6;
  }
  if (mods.has("dark")) {
    l = Math.min(l, (lo + hi) / 2);
    c *= 0.85;
  }
  if (mods.has("bright")) c *= 1.2;
  if (mods.has("muted") || mods.has("pale")) c *= 0.55;
  const rad = (h * Math.PI) / 180;
  return { L: l, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

function capitalise(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

const parsedCache = new Map<string, ColourSearch | null>();

/**
 * Read a query as a colour, or return null when it is not one.
 *
 * Memoised on the exact string: the studio asks once per shade per keystroke.
 */
export function parseColourSearch(query: string): ColourSearch | null {
  const key = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (parsedCache.has(key)) return parsedCache.get(key)!;
  const built = build(key);
  if (parsedCache.size > 200) parsedCache.clear();
  parsedCache.set(key, built);
  return built;
}

function build(query: string): ColourSearch | null {
  const p = parse(query);
  if (!p) return null;
  const { head, mods } = p;

  let boxes: Box[] = head ? head.boxes.map((b) => ({ ...b })) : [{}];
  // A blend's neighbours are the named colours inside it, not the head's own list:
  // "blue green" wants teal and turquoise next, not sage and olive.
  let blendRelated: string[] | null = null;
  let proto = head?.proto ?? "#bcb6aa";
  const tint = p.tint?.term ?? null;

  if (head && tint) {
    const hc = hueCentre(head);
    const tc = hueCentre(tint);
    if (tc !== null && hc === null) {
      // "Bluish grey", "pinkish white": the head's region, leaning toward the tint.
      boxes = boxes.map((b) => ({
        ...b,
        h: [tc - 45, tc + 45] as const,
        C: [1.5, Math.max((b.C?.[1] ?? 10) + 4, 12)] as const,
      }));
      const base = lchOf(head.proto);
      const rad = (tc * Math.PI) / 180;
      proto = labToHex({ L: base.L, a: 6 * Math.cos(rad), b: 6 * Math.sin(rad) });
    } else if (tc !== null && hc !== null) {
      // Two hues: a stretch of the way from the head toward the tint — a "blue
      // green" is a green that has moved some way toward blue, so neither a plain
      // green nor a blue.
      const d = turn(hc, tc);
      const near = hc + d * 0.2;
      const far = hc + d * 0.65;
      const [from, to] = d >= 0 ? [near, far] : [far, near];
      const L: [number, number] = [
        Math.min(...boxes.map((b) => b.L?.[0] ?? 0)),
        Math.max(...boxes.map((b) => b.L?.[1] ?? 100)),
      ];
      const cMin = Math.min(head.boxes[0]?.C?.[0] ?? 8, tint.boxes[0]?.C?.[0] ?? 8, 12);
      boxes = [{ h: [from, to], L, C: [cMin, 200] }];
      const inside = Object.values(NAMED)
        .filter((t) => {
          const c = lchOf(t.proto);
          return c.C > 8 && inArc(c.h, [from, to]);
        })
        .map((t) => t.label);
      blendRelated = [...new Set([...inside.slice(0, 3), tint.label, head.label])];
      const base = lchOf(head.proto);
      const h = (hc + d * 0.42 + 360) % 360;
      const rad = (h * Math.PI) / 180;
      proto = labToHex({ L: base.L, a: base.C * Math.cos(rad), b: base.C * Math.sin(rad) });
    }
    // An achromatic tint on a chromatic head became a quality in parse().
  }

  const strict = boxes.map((b) => applyMods(b, mods, head, true)).filter((b): b is Box => b !== null);
  const regions = strict.length > 0 ? strict : boxes.map((b) => applyMods(b, mods, head, false)!);
  const target = protoWith(proto, mods, regions[0]!);
  const warm = mods.has("warm");
  const cool = mods.has("cool");

  const qualities = MOD_ORDER.filter((m) => mods.has(m) && !p.silent.has(m));
  const colourWords = [p.tintLabel, head?.label ?? null].filter(Boolean);
  const label = capitalise([...qualities, ...colourWords].join(" ").replace(/\s+/g, " "));
  const qualitiesOnly = !head;

  const related = (blendRelated ?? head?.related ?? ["light", "dark", "pastel", "warm", "cool"])
    .filter((r) => r !== (head?.label ?? "") && r !== query);

  return {
    label,
    hex: labToHex(target),
    qualitiesOnly,
    ranked: !qualitiesOnly,
    related: related.slice(0, 5),
    score(hex: string): number | null {
      if (!/^#?[0-9a-f]{6}$/i.test(hex)) return null;
      const c = lchOf(hex);
      if (!regions.some((r) => inBox(c, r))) return null;
      // Warm and cool are about the tint a colour carries; a true grey carries none.
      if (warm && !(c.C >= 2.5 && inArc(c.h, [15, 110]))) return null;
      if (cool && !(c.C >= 2 && inArc(c.h, [150, 330]))) return null;
      // Lightness counts for a little less than hue: a slightly lighter yellow is
      // more "yellow" than a slightly greener one.
      const dL = (c.lab.L - target.L) * 0.75;
      const da = c.lab.a - target.a;
      const db = c.lab.b - target.b;
      return Math.sqrt(dL * dL + da * da + db * db);
    },
  };
}

/**
 * Does this hex answer the query as a colour? False for any query that is not
 * a colour query — callers OR this with their own text match.
 */
export function matchesColour(query: string, hex: string): boolean {
  const c = parseColourSearch(query);
  return c !== null && c.score(hex) !== null;
}
