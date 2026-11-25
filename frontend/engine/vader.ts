import { lexicon as baseLexicon } from "vader-sentiment/src/vader_lexicon.js";

const B_INCR = 0.293;
const B_DECR = -0.293;
const C_INCR = 0.733;
const N_SCALAR = -0.74;
const REGEX_REMOVE_PUNCTUATION = /[!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]/g;

const PUNC_LIST = [
  ".", "!", "?", ",", ";", ":", "-", "'", '"',
  "!!", "!!!", "??", "???", "?!?", "!?!", "?!?!", "!?!?",
];

const NEGATE = new Set([
  "aint", "arent", "cannot", "cant", "couldnt", "darent", "didnt", "doesnt",
  "ain't", "aren't", "can't", "couldn't", "daren't", "didn't", "doesn't",
  "dont", "hadnt", "hasnt", "havent", "isnt", "mightnt", "mustnt", "neither",
  "don't", "hadn't", "hasn't", "haven't", "isn't", "mightn't", "mustn't",
  "neednt", "needn't", "never", "none", "nope", "nor", "not", "nothing",
  "nowhere", "oughtnt", "shant", "shouldnt", "uhuh", "wasnt", "werent",
  "oughtn't", "shan't", "shouldn't", "uh-uh", "wasn't", "weren't", "without",
  "wont", "wouldnt", "won't", "wouldn't", "rarely", "seldom", "despite",
]);

const BOOSTER_DICT: Record<string, number> = {
  absolutely: B_INCR, amazingly: B_INCR, awfully: B_INCR, completely: B_INCR,
  considerably: B_INCR, decidedly: B_INCR, deeply: B_INCR, effing: B_INCR,
  enormously: B_INCR, entirely: B_INCR, especially: B_INCR, exceptionally: B_INCR,
  extremely: B_INCR, fabulously: B_INCR, flipping: B_INCR, flippin: B_INCR,
  fricking: B_INCR, frickin: B_INCR, frigging: B_INCR, friggin: B_INCR,
  fully: B_INCR, fucking: B_INCR, greatly: B_INCR, hella: B_INCR,
  highly: B_INCR, hugely: B_INCR, incredibly: B_INCR, intensely: B_INCR,
  majorly: B_INCR, more: B_INCR, most: B_INCR, particularly: B_INCR,
  purely: B_INCR, quite: B_INCR, really: B_INCR, remarkably: B_INCR,
  so: B_INCR, substantially: B_INCR, thoroughly: B_INCR, totally: B_INCR,
  tremendously: B_INCR, uber: B_INCR, unbelievably: B_INCR, unusually: B_INCR,
  utterly: B_INCR, very: B_INCR,
  almost: B_DECR, barely: B_DECR, hardly: B_DECR, "just enough": B_DECR,
  "kind of": B_DECR, kinda: B_DECR, kindof: B_DECR, "kind-of": B_DECR,
  less: B_DECR, little: B_DECR, marginally: B_DECR, occasionally: B_DECR,
  partly: B_DECR, scarcely: B_DECR, slightly: B_DECR, somewhat: B_DECR,
  "sort of": B_DECR, sorta: B_DECR, sortof: B_DECR, "sort-of": B_DECR,
};

const SPECIAL_CASE_IDIOMS: Record<string, number> = {
  "the shit": 3,
  "the bomb": 3,
  "bad ass": 1.5,
  "yeah right": -2,
  "cut the mustard": 2,
  "kiss of death": -1.5,
  "hand to mouth": -2,
};

export const LEXICON: Record<string, number> = { ...baseLexicon };

function isUpperPython(word: string): boolean {
  return word.length > 0 && /^[^a-z]*[A-Z]+[^a-z]*$/.test(word);
}

function allcapDifferential(words: string[]): boolean {
  let allcap = 0;
  for (const w of words) {
    if (isUpperPython(w)) allcap++;
  }
  const diff = words.length - allcap;
  return diff > 0 && diff < words.length;
}

function negated(inputWords: string[], includeNt = true): boolean {
  for (const w of inputWords) {
    if (NEGATE.has(w)) return true;
    if (includeNt && w.includes("n't")) return true;
  }
  const leastIdx = inputWords.indexOf("least");
  return leastIdx > 0 && inputWords[leastIdx - 1] !== "at";
}

function normalizeScore(score: number, alpha = 15): number {
  const norm = score / Math.sqrt(score * score + alpha);
  return Math.max(-1, Math.min(1, norm));
}

function scalarIncDec(word: string, valence: number, isCapDiff: boolean): number {
  const lower = word.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(BOOSTER_DICT, lower)) return 0;
  let scalar = BOOSTER_DICT[lower];
  if (valence < 0) scalar *= -1;
  if (isCapDiff && isUpperPython(word)) {
    scalar += valence > 0 ? C_INCR : -C_INCR;
  }
  return scalar;
}

function getWordsAndEmoticons(text: string): string[] {
  const noPunc = text.replace(REGEX_REMOVE_PUNCTUATION, "");
  const wordsOnly = noPunc.split(/\s/).filter((w) => w.length > 1);
  const puncMap = new Map<string, string>();
  for (const p of PUNC_LIST) {
    for (const w of wordsOnly) {
      puncMap.set(`${p}${w}`, w);
      puncMap.set(`${w}${p}`, w);
    }
  }
  const tokens = text.split(/\s/).filter((t) => t.length > 1);
  return tokens.map((t) => puncMap.get(t) ?? t);
}

function neverCheck(
  valence: number,
  words: string[],
  startI: number,
  index: number
): number {
  if (startI === 0 && negated([words[index - 1]])) {
    return valence * N_SCALAR;
  }
  if (startI === 1) {
    if (words[index - 2] === "never" && (words[index - 1] === "so" || words[index - 1] === "this")) {
      return valence * 1.5;
    }
    if (negated([words[index - 2]])) {
      return valence * N_SCALAR;
    }
  }
  if (startI === 2) {
    if (
      (words[index - 3] === "never" && (words[index - 2] === "so" || words[index - 2] === "this")) ||
      words[index - 1] === "so" ||
      words[index - 1] === "this"
    ) {
      return valence * 1.25;
    }
    if (negated([words[index - 3]])) {
      return valence * N_SCALAR;
    }
  }
  return valence;
}

function idiomsCheck(valence: number, words: string[], index: number): number {
  const onezero = `${words[index - 1]} ${words[index]}`;
  const twoonezero = `${words[index - 2]} ${words[index - 1]} ${words[index]}`;
  const twoone = `${words[index - 2]} ${words[index - 1]}`;
  const threetwoone = `${words[index - 3]} ${words[index - 2]} ${words[index - 1]}`;
  const threetwo = `${words[index - 3]} ${words[index - 2]}`;

  for (const seq of [onezero, twoonezero, twoone, threetwoone, threetwo]) {
    if (Object.prototype.hasOwnProperty.call(SPECIAL_CASE_IDIOMS, seq)) {
      valence = SPECIAL_CASE_IDIOMS[seq];
      break;
    }
  }

  if (words.length - 1 > index) {
    const zeroone = `${words[index]} ${words[index + 1]}`;
    if (Object.prototype.hasOwnProperty.call(SPECIAL_CASE_IDIOMS, zeroone)) {
      valence = SPECIAL_CASE_IDIOMS[zeroone];
    }
  }
  if (words.length - 1 > index + 1) {
    const zeroonetwo = `${words[index]} ${words[index + 1]} ${words[index + 2]}`;
    if (Object.prototype.hasOwnProperty.call(SPECIAL_CASE_IDIOMS, zeroonetwo)) {
      valence = SPECIAL_CASE_IDIOMS[zeroonetwo];
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(BOOSTER_DICT, threetwo) ||
    Object.prototype.hasOwnProperty.call(BOOSTER_DICT, twoone)
  ) {
    valence += B_DECR;
  }
  return valence;
}

function leastCheck(valence: number, words: string[], index: number): number {
  if (
    index > 1 &&
    words[index - 1].toLowerCase() === "least" &&
    !Object.prototype.hasOwnProperty.call(LEXICON, words[index - 1].toLowerCase())
  ) {
    const prev2 = words[index - 2].toLowerCase();
    if (prev2 !== "at" && prev2 !== "very") {
      return valence * N_SCALAR;
    }
  } else if (
    index > 0 &&
    words[index - 1].toLowerCase() === "least" &&
    !Object.prototype.hasOwnProperty.call(LEXICON, words[index - 1].toLowerCase())
  ) {
    return valence * N_SCALAR;
  }
  return valence;
}

export function scoreVader(text: string): {
  neg: number;
  neu: number;
  pos: number;
  compound: number;
} {
  const words = getWordsAndEmoticons(text);
  const isCapDiff = allcapDifferential(words);
  const sentiments: number[] = [];

  for (let i = 0; i < words.length; i++) {
    const item = words[i];
    const lower = item.toLowerCase();
    if (
      (i < words.length - 1 && lower === "kind" && words[i + 1].toLowerCase() === "of") ||
      Object.prototype.hasOwnProperty.call(BOOSTER_DICT, lower)
    ) {
      sentiments.push(0);
      continue;
    }

    let valence = 0;
    if (Object.prototype.hasOwnProperty.call(LEXICON, lower)) {
      valence = LEXICON[lower];
      if (isUpperPython(item) && isCapDiff) {
        valence += valence > 0 ? C_INCR : -C_INCR;
      }

      for (let startI = 0; startI < 3; startI++) {
        if (
          i > startI &&
          !Object.prototype.hasOwnProperty.call(LEXICON, words[i - (startI + 1)].toLowerCase())
        ) {
          let s = scalarIncDec(words[i - (startI + 1)], valence, isCapDiff);
          if (startI === 1 && s !== 0) s *= 0.95;
          else if (startI === 2 && s !== 0) s *= 0.9;
          valence += s;
          valence = neverCheck(valence, words, startI, i);
          if (startI === 2) {
            valence = idiomsCheck(valence, words, i);
          }
        }
      }
      valence = leastCheck(valence, words, i);
    }

    sentiments.push(valence);
  }

  // Contrastive conjunction 'but'
  let butIdx = words.indexOf("but");
  if (butIdx === -1) butIdx = words.indexOf("BUT");
  if (butIdx !== -1) {
    for (let i = 0; i < sentiments.length; i++) {
      if (i < butIdx) sentiments[i] *= 0.5;
      else if (i > butIdx) sentiments[i] *= 1.5;
    }
  }

  if (sentiments.length === 0) {
    return { neg: 0, neu: 0, pos: 0, compound: 0 };
  }

  let sumS = sentiments.reduce((a, b) => a + b, 0);
  const epCount = Math.min(4, (text.match(/!/g) ?? []).length);
  const qmRaw = (text.match(/\?/g) ?? []).length;
  const qmAmp = qmRaw > 1 ? (qmRaw <= 3 ? qmRaw * 0.18 : 0.96) : 0;
  const punctAmp = epCount * 0.292 + qmAmp;

  if (sumS > 0) sumS += punctAmp;
  else if (sumS < 0) sumS -= punctAmp;

  const compound = normalizeScore(sumS);

  let posSum = 0;
  let negSum = 0;
  let neuCount = 0;
  for (const s of sentiments) {
    if (s > 0) posSum += s + 1;
    else if (s < 0) negSum += s - 1;
    else neuCount++;
  }
  if (posSum > Math.abs(negSum)) posSum += punctAmp;
  else if (posSum < Math.abs(negSum)) negSum -= punctAmp;

  const total = posSum + Math.abs(negSum) + neuCount;
  if (total === 0) return { neg: 0, neu: 0, pos: 0, compound: 0 };

  return {
    neg: Number(Math.abs(negSum / total).toFixed(3)),
    neu: Number(Math.abs(neuCount / total).toFixed(3)),
    pos: Number(Math.abs(posSum / total).toFixed(3)),
    compound: Number(compound.toFixed(4)),
  };
}
