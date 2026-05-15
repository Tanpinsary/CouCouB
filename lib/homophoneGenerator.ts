import { type HomophoneEntry, type HomophoneTheme } from "@/data/homophoneLexicons";

export interface GenerateHomophoneOptions {
  input: string;
  theme: HomophoneTheme;
  entries: HomophoneEntry[];
  fuzzy: boolean;
  slotCount: number;
  maxChoicesPerToken?: number;
  maxResults?: number;
}

export interface HomophoneCandidate {
  id: string;
  slotIndex: number;
  label: string;
  options: HomophoneSlotOption[];
}

export interface HomophoneSlotOption {
  id: string;
  text: string;
  score: number;
  matches: HomophoneMatch[];
  tags: string[];
  readonly?: boolean;
}

export interface HomophoneMatch {
  token: string;
  replacement: string;
  entryId: string;
  reason: string;
}

interface InputToken {
  raw: string;
  kind: "chinese" | "latin" | "other";
  keys: string[];
}

interface TokenChoice {
  text: string;
  score: number;
  match: HomophoneMatch;
  tags: string[];
}

const DEFAULT_MAX_CHOICES_PER_TOKEN = 4;
const DEFAULT_MAX_RESULTS = 6;
const HEAD_SLOT_SUFFIX = "牛逼";

const CHINESE_PINYIN: Record<string, string> = {
  爱: "ai",
  奥: "ao",
  白: "bai",
  本: "ben",
  编: "bian",
  不: "bu",
  藏: "zang",
  草: "cao",
  从: "cong",
  大: "da",
  刀: "dao",
  的: "de",
  地: "di",
  电: "dian",
  动: "dong",
  飞: "fei",
  福: "fu",
  鬼: "gui",
  好: "hao",
  海: "hai",
  和: "he",
  很: "hen",
  红: "hong",
  画: "hua",
  机: "ji",
  加: "jia",
  家: "jia",
  间: "jian",
  剑: "jian",
  将: "jiang",
  酱: "jiang",
  津: "jin",
  禁: "jin",
  镜: "jing",
  开: "kai",
  柯: "ke",
  空: "kong",
  来: "lai",
  浪: "lang",
  乐: "yue",
  莉: "li",
  凉: "liang",
  零: "ling",
  铃: "ling",
  绫: "ling",
  流: "liu",
  洛: "luo",
  绿: "lv",
  码: "ma",
  美: "mei",
  梦: "meng",
  灭: "mie",
  魔: "mo",
  默: "mo",
  南: "nan",
  尼: "ni",
  你: "ni",
  年: "nian",
  音: "yin",
  派: "pai",
  轻: "qing",
  青: "qing",
  球: "qiu",
  让: "rang",
  人: "ren",
  日: "ri",
  赛: "sai",
  森: "sen",
  上: "shang",
  少: "shao",
  神: "shen",
  生: "sheng",
  声: "sheng",
  世: "shi",
  史: "shi",
  士: "shi",
  书: "shu",
  斯: "si",
  丝: "si",
  松: "song",
  泰: "tai",
  坦: "tan",
  天: "tian",
  头: "tou",
  团: "tuan",
  哇: "wa",
  为: "wei",
  未: "wei",
  薇: "wei",
  我: "wo",
  物: "wu",
  西: "xi",
  献: "xian",
  香: "xiang",
  小: "xiao",
  新: "xin",
  星: "xing",
  言: "yan",
  影: "ying",
  有: "you",
  又: "you",
  右: "you",
  语: "yu",
  域: "yu",
  月: "yue",
  越: "yue",
  在: "zai",
  早: "zao",
  战: "zhan",
  正: "zheng",
  之: "zhi",
  转: "zhuan",
  猪: "zhu",
  祝: "zhu",
  子: "zi",
};

const NASAL_FUZZY_PAIRS: [string, string][] = [
  ["an", "ang"],
  ["en", "eng"],
  ["in", "ing"],
  ["ian", "iang"],
  ["uan", "uang"],
];

const CJK_VARIANT_ALIASES: Record<string, string> = {
  講: "讲",
  讲: "講",
  談: "谈",
  谈: "談",
  社: "社",
  電: "电",
  电: "電",
  動: "动",
  动: "動",
  機: "机",
  机: "機",
  殻: "壳",
  壳: "殻",
  鋼: "钢",
  钢: "鋼",
  錬: "炼",
  炼: "錬",
  術: "术",
  术: "術",
  師: "师",
  师: "師",
  涼: "凉",
  凉: "涼",
  宮: "宫",
  宫: "宮",
  尋: "寻",
  寻: "尋",
  蟲: "虫",
  虫: "蟲",
};

export function generateHomophoneCandidates(options: GenerateHomophoneOptions): HomophoneCandidate[] {
  const input = options.input.trim();
  const slotCount = Math.max(0, options.slotCount);
  const headSlotCount = Math.max(0, slotCount - 1);
  if (!input || slotCount === 0) return [];

  const tokens = tokenizeInput(input);
  if (tokens.length === 0) return [];

  const entries = options.entries.filter(entry => entry.theme === options.theme);
  const maxChoicesPerToken = options.maxChoicesPerToken ?? DEFAULT_MAX_CHOICES_PER_TOKEN;
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const tokenChoices = tokens.map(token => getChoicesForToken(token, entries, options.fuzzy, maxChoicesPerToken));
  if (tokenChoices.every(choices => choices.length === 0) && headSlotCount === 0) return [];

  const headCandidates = Array.from({ length: headSlotCount }, (_, slotIndex) => {
    const optionsForSlot = buildSlotOptions(tokenChoices, slotIndex, headSlotCount, maxResults);
    return {
      id: `${options.theme}-slot-${slotIndex}`,
      slotIndex,
      label: `文案 ${slotIndex + 1}`,
      options: optionsForSlot,
    };
  }).filter(candidate => candidate.options.length > 0);

  return [
    ...headCandidates,
    {
      id: `${options.theme}-slot-final`,
      slotIndex: slotCount - 1,
      label: "！？？！",
      options: [
        {
          id: `${options.theme}-slot-final-original`,
          text: `!?${input}?!`,
          score: 0,
          matches: [],
          tags: ["原文"],
          readonly: true,
        },
      ],
    },
  ];
}

function tokenizeInput(input: string): InputToken[] {
  const segments = input.match(/[\u4e00-\u9fff]|[A-Za-z0-9+#.]+/g) ?? [];
  return segments.map(segment => {
    if (/^[\u4e00-\u9fff]$/.test(segment)) {
      const pinyin = CHINESE_PINYIN[segment];
      return {
        raw: segment,
        kind: "chinese",
        keys: expandAliases(pinyin ? [pinyin, segment] : [segment]),
      };
    }

    if (/^[A-Za-z0-9+#.]+$/.test(segment)) {
      return {
        raw: segment,
        kind: "latin",
        keys: expandAliases([normalizeTerm(segment)]),
      };
    }

    return { raw: segment, kind: "other", keys: [normalizeTerm(segment)] };
  });
}

function getChoicesForToken(
  token: InputToken,
  entries: HomophoneEntry[],
  fuzzy: boolean,
  maxChoices: number
): TokenChoice[] {
  const choices = entries
    .map(entry => scoreEntry(token, entry, fuzzy))
    .filter((choice): choice is TokenChoice => choice !== null)
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, "zh-Hans-CN"));

  const seen = new Set<string>();
  const uniqueChoices: TokenChoice[] = [];
  for (const choice of choices) {
    const key = choice.text;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueChoices.push(choice);
    if (uniqueChoices.length >= maxChoices) break;
  }
  return uniqueChoices;
}

function scoreEntry(token: InputToken, entry: HomophoneEntry, fuzzy: boolean): TokenChoice | null {
  const entryPinyin = expandCjkVariants(entry.pinyin.map(normalizeTerm));
  const titleKeys = expandAliases([
    entry.zh,
    entry.en,
    ...entry.en.split(/\s+/),
  ]);
  let bestScore = 0;
  let reason = "";

  for (const key of token.keys) {
    if (!key) continue;

    if (token.kind === "chinese") {
      if (entryPinyin.includes(key)) {
        bestScore = Math.max(bestScore, 110);
        reason = `${token.raw} → ${key}`;
      } else if (fuzzy && entryPinyin.some(pinyin => isFuzzyPinyin(key, pinyin))) {
        bestScore = Math.max(bestScore, 82);
        reason = `${token.raw} ≈ ${key}`;
      }
      continue;
    }

    if (titleKeys.includes(key)) {
      bestScore = Math.max(bestScore, 108);
      reason = `${token.raw} 命中标题`;
    } else if (entryPinyin.includes(key)) {
      bestScore = Math.max(bestScore, 78);
      reason = `${token.raw} → ${key}`;
    } else if (fuzzy && entryPinyin.some(pinyin => isFuzzyPinyin(key, pinyin))) {
      bestScore = Math.max(bestScore, 58);
      reason = `${token.raw} ≈ ${key}`;
    }
  }

  if (bestScore === 0) return null;
  return {
    text: entry.zh,
    score: bestScore + Math.min(entry.tags.length, 3),
    tags: entry.tags,
    match: {
      token: token.raw,
      replacement: entry.zh,
      entryId: entry.id,
      reason,
    },
  };
}

function buildSlotOptions(
  tokenChoices: TokenChoice[][],
  slotIndex: number,
  headSlotCount: number,
  maxResults: number
): HomophoneSlotOption[] {
  if (headSlotCount === 0) return [];

  const bestByText = new Map<string, HomophoneSlotOption>();
  tokenChoices.forEach((choices, tokenIndex) => {
    if (Math.min(tokenIndex, headSlotCount - 1) !== slotIndex) return;

    choices.forEach(choice => {
      const text = `${choice.text}${HEAD_SLOT_SUFFIX}`;
      const existing = bestByText.get(text);
      const option: HomophoneSlotOption = {
        id: `${slotIndex}-${choice.match.entryId}-${choice.text}`,
        text,
        score: choice.score - (slotIndex < tokenIndex ? 8 : 0),
        matches: [choice.match],
        tags: choice.tags,
      };

      if (!existing || option.score > existing.score) {
        bestByText.set(text, option);
      }
    });
  });

  return [...bestByText.values()]
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, "zh-Hans-CN"))
    .slice(0, maxResults);
}

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function expandAliases(values: string[]): string[] {
  const aliases = new Set<string>();
  for (const value of values) {
    const normalized = normalizeTerm(value);
    if (!normalized) continue;
    aliases.add(normalized);
    expandCjkVariants([normalized]).forEach(alias => aliases.add(alias));
    normalized.split(/\s+/).forEach(part => aliases.add(part));
  }

  if (aliases.has("u")) aliases.add("you");
  if (aliases.has("you")) aliases.add("u");

  return [...aliases];
}

function expandCjkVariants(values: string[]): string[] {
  const variants = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    variants.add(value);
    const chars = [...value];
    chars.forEach((char, index) => {
      const variant = CJK_VARIANT_ALIASES[char];
      if (!variant) return;
      variants.add(variant);
      const replaced = [...chars];
      replaced[index] = variant;
      variants.add(replaced.join(""));
    });
  }
  return [...variants];
}

function isFuzzyPinyin(input: string, target: string): boolean {
  if (input === target) return true;
  return NASAL_FUZZY_PAIRS.some(([shortFinal, longFinal]) => {
    const inputShort = swapFinal(input, longFinal, shortFinal);
    const inputLong = swapFinal(input, shortFinal, longFinal);
    return inputShort === target || inputLong === target;
  });
}

function swapFinal(value: string, fromFinal: string, toFinal: string): string {
  return value.endsWith(fromFinal) ? `${value.slice(0, -fromFinal.length)}${toFinal}` : value;
}
