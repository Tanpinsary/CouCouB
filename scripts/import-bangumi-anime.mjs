import { createWriteStream, promises as fs } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public/data/homophones/anime");
const latestArchiveUrl = "https://raw.githubusercontent.com/bangumi/Archive/master/aux/latest.json";
const apiBaseUrl = "https://api.bgm.tv/v0";
const userAgent = "CouCouB/0.1.0 (https://github.com/tanpinsary/CouCouB)";
const topSubjectLimit = 1000;
const studioPositions = new Set(["动画制作", "製作", "制作", "出品"]);
const chineseCompanyPattern = /(?:中国|北京|上海|广州|深圳|杭州|武汉|成都|重庆|天津|南京|苏州|无锡|厦门|长沙|浙江|江苏|霍尔果斯|克拉玛依|有限公司|股份有限公司|有限责任公司|数字科技|数码科技|文化传媒|文化传播|影业|影视|动漫|腾讯|企鹅影视|哔哩哔哩|bilibili|爱奇艺|优酷|阿里|网易|米哈游|猫眼|宽娱|若森|玄机|绘梦|福煦|视美|原力动画|万维猫|艺画|好传动画|寒木春华|大火鸟|七灵石|狼烟动画|娃娃鱼动画|海岸线动画|可可豆动画|追光动画|绿怪研|铅元素|启缘映画|艾尔平方|幻维数码|索以文化|洛水花原|铸梦动画|声影动漫|融梦动漫|若鸿文化)/iu;

const fallbackSubjects = [
  entry("bangumi-326", "攻壳机动队 S.A.C. 2nd GIG", "攻殻機動隊 S.A.C. 2nd GIG", ["gong", "ke", "ji", "dong", "dui"], ["Koukaku Kidoutai S.A.C. 2nd GIG", "Ghost in the Shell: Stand Alone Complex 2nd GIG"], ["Bangumi", "动画", "rank:1"]),
  entry("bangumi-253", "星际牛仔", "COWBOY BEBOP", ["xing", "ji", "niu", "zai"], ["Cowboy Bebop"], ["Bangumi", "动画"]),
  entry("bangumi-876", "钢之炼金术师 FULLMETAL ALCHEMIST", "鋼の錬金術師 FULLMETAL ALCHEMIST", ["gang", "zhi", "lian", "jin", "shu", "shi"], ["Fullmetal Alchemist: Brotherhood", "FMA"], ["Bangumi", "动画"]),
  entry("bangumi-265", "攻壳机动队 STAND ALONE COMPLEX", "攻殻機動隊 STAND ALONE COMPLEX", ["gong", "ke", "ji", "dong", "dui"], ["Ghost in the Shell: Stand Alone Complex", "SAC"], ["Bangumi", "动画"]),
  entry("bangumi-8763", "命运石之门", "STEINS;GATE", ["ming", "yun", "shi", "zhi", "men"], ["Steins Gate"], ["Bangumi", "动画"]),
  entry("bangumi-51", "千与千寻", "千と千尋の神隠し", ["qian", "yu", "qian", "xun"], ["Spirited Away"], ["Bangumi", "动画电影"]),
  entry("bangumi-11577", "魔法少女小圆", "魔法少女まどか☆マギカ", ["mo", "fa", "shao", "nv", "xiao", "yuan"], ["Puella Magi Madoka Magica"], ["Bangumi", "动画"]),
  entry("bangumi-1606", "CLANNAD AFTER STORY", "CLANNAD ～AFTER STORY～", ["ke", "la", "na", "de"], ["CLANNAD ～AFTER STORY～"], ["Bangumi", "动画"]),
  entry("bangumi-9717", "凉宫春日的消失", "涼宮ハルヒの消失", ["liang", "gong", "chun", "ri"], ["The Disappearance of Haruhi Suzumiya"], ["Bangumi", "动画电影"]),
  entry("bangumi-792", "虫师", "蟲師", ["chong", "shi"], ["Mushishi"], ["Bangumi", "动画"]),
];

const fallbackCompanies = [
  entry("bangumi-company-production-ig", "Production I.G", "Production I.G", ["pu", "luo"], ["Production IG"], ["Bangumi", "公司", "动画制作"]),
  entry("bangumi-company-kyoto-animation", "京都动画", "京都アニメーション", ["jing", "du", "dong", "hua"], ["京阿尼", "KyoAni"], ["Bangumi", "公司", "动画制作"]),
  entry("bangumi-company-madhouse", "MADHOUSE", "MADHOUSE", ["ma", "de", "hao", "si"], ["Madhouse"], ["Bangumi", "公司", "动画制作"]),
  entry("bangumi-company-sunrise", "SUNRISE", "SUNRISE", ["ri", "sheng"], ["日升"], ["Bangumi", "公司", "动画制作"]),
  entry("bangumi-company-studio-ghibli", "吉卜力", "スタジオジブリ", ["ji", "bu", "li"], ["Studio Ghibli"], ["Bangumi", "公司", "动画制作"]),
];

async function main() {
  await mkdir(outputDir, { recursive: true });

  try {
    const archive = await loadArchive();
    const subjects = normalizeSubjects(archive.subjects).slice(0, topSubjectLimit);
    const companies = normalizeCompanies(archive, new Set(subjects.map(subject => subject.bangumiId)));
    if (subjects.length < topSubjectLimit) throw new Error(`Archive produced only ${subjects.length} subjects`);
    await writeJson("bangumi-subjects.json", subjects.map(stripInternalFields));
    await writeJson("bangumi-companies.json", companies.filter(entry => !isChineseAnimationCompany(entry)).map(stripInternalFields));
    console.log(`Imported ${subjects.length} Bangumi anime subjects and ${companies.length} companies.`);
  } catch (error) {
    console.warn(`Bangumi Archive import failed, trying live API: ${error instanceof Error ? error.message : String(error)}`);
    try {
      const { subjects, companies } = await loadLiveApi();
      if (subjects.length < topSubjectLimit) throw new Error(`Live API produced only ${subjects.length} subjects`);
      await writeJson("bangumi-subjects.json", subjects.map(stripInternalFields));
      await writeJson("bangumi-companies.json", companies.filter(entry => !isChineseAnimationCompany(entry)).map(stripInternalFields));
      console.log(`Imported ${subjects.length} Bangumi anime subjects and ${companies.length} companies from live API.`);
    } catch (apiError) {
      console.warn(`Bangumi live API import failed, writing fallback seed: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
      await writeJson("bangumi-subjects.json", fallbackSubjects);
      await writeJson("bangumi-companies.json", fallbackCompanies.filter(entry => !isChineseAnimationCompany(entry)));
    }
  }
}

async function loadLiveApi() {
  const subjects = [];
  for (let offset = 0; offset < topSubjectLimit; offset += 50) {
    const page = await fetchJson(`${apiBaseUrl}/subjects?type=2&sort=rank&limit=50&offset=${offset}`);
    subjects.push(...(page.data ?? []));
  }

  const normalizedSubjects = normalizeLiveSubjects(subjects).slice(0, topSubjectLimit);
  const companies = normalizeCompaniesFromSubjects(subjects);

  return {
    subjects: normalizedSubjects,
    companies,
  };
}

async function loadArchive() {
  const latest = await fetchJson(latestArchiveUrl);
  const downloadUrl = latest.browser_download_url;
  if (typeof downloadUrl !== "string") throw new Error("Archive latest.json did not include browser_download_url");

  const tempDir = await mkdtemp(path.join(tmpdir(), "coucoub-bangumi-"));
  try {
    const zipPath = path.join(tempDir, "archive.zip");
    await downloadFile(downloadUrl, zipPath);
    await unzip(zipPath, tempDir);

    return {
      subjects: await readArchiveJson(tempDir, /subject/i),
      persons: await readArchiveJson(tempDir, /person/i, /subject/i),
      subjectPersons: await readArchiveJson(tempDir, /subject.*person|person.*subject/i),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return response.json();
  } catch {
    return JSON.parse(await runCurl(url));
  }
}

async function downloadFile(url, targetPath) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (!response.ok || !response.body) throw new Error(`Failed to download ${url}: ${response.status}`);
    await pipeline(response.body, createWriteStream(targetPath));
  } catch {
    await runCurl(url, targetPath);
  }
}

async function runCurl(url, outputPath) {
  const args = ["--fail", "--location", "--silent", "--show-error", "--user-agent", userAgent, url];
  if (outputPath) args.splice(args.length - 1, 0, "--output", outputPath);

  return new Promise((resolve, reject) => {
    const chunks = [];
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.on("data", chunk => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", code => {
      const output = Buffer.concat(chunks).toString("utf8");
      code === 0 ? resolve(output) : reject(new Error(output || `curl exited with ${code}`));
    });
  });
}

async function unzip(zipPath, targetDir) {
  await new Promise((resolve, reject) => {
    const child = spawn("unzip", ["-q", zipPath, "-d", targetDir], { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", code => (code === 0 ? resolve() : reject(new Error(`unzip exited with ${code}`))));
  });
}

async function readArchiveJson(dir, includePattern, excludePattern) {
  const files = await collectFiles(dir);
  const file = files.find(candidate => {
    const name = path.basename(candidate).toLowerCase();
    return name.endsWith(".json") && includePattern.test(name) && !(excludePattern && excludePattern.test(name));
  });
  if (!file) throw new Error(`Could not find archive JSON matching ${includePattern}`);
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async dirent => {
    const fullPath = path.join(dir, dirent.name);
    return dirent.isDirectory() ? collectFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
}

function normalizeSubjects(subjectPayload) {
  const subjects = Array.isArray(subjectPayload) ? subjectPayload : subjectPayload.items ?? subjectPayload.data ?? [];
  const sortedSubjects = subjects
    .filter(subject => subject?.type === 2 && Number.isFinite(subject.rank) && subject.rank > 0)
    .sort((a, b) => a.rank - b.rank);
  const knownTitles = buildKnownSubjectTitles(sortedSubjects);

  return sortedSubjects.map(subject => {
      const rawZh = cleanText(subject.name_cn || subject.name);
      const rawEn = cleanText(subject.name || subject.name_cn || rawZh);
      const zh = canonicalizeSubjectTitle(rawZh, knownTitles);
      const en = canonicalizeSubjectTitle(rawEn, knownTitles);
      const tags = ["Bangumi", "动画", `rank:${subject.rank}`, subject.platform].filter(Boolean).map(String);
      const aliases = uniqueStrings([
        rawZh,
        rawEn,
        subject.name,
        subject.name_cn,
        ...extractInfoboxValues(subject.infobox, ["别名", "中文名"]),
      ]).filter(alias => alias !== zh && alias !== en).slice(0, 12);

      return {
        bangumiId: subject.id,
        id: `bangumi-${subject.id}`,
        zh,
        en,
        pinyin: buildPinyinKeys([zh, en]),
        aliases,
        tags,
      };
    });
}

function normalizeLiveSubjects(subjects) {
  const sortedSubjects = subjects
    .filter(subject => subject?.type === 2 && Number.isFinite(subject.rating?.rank) && subject.rating.rank > 0)
    .sort((a, b) => a.rating.rank - b.rating.rank);
  const knownTitles = buildKnownSubjectTitles(sortedSubjects);

  return sortedSubjects.map(subject => {
      const rawZh = cleanText(subject.name_cn || subject.name);
      const rawEn = cleanText(subject.name || subject.name_cn || rawZh);
      const zh = canonicalizeSubjectTitle(rawZh, knownTitles);
      const en = canonicalizeSubjectTitle(rawEn, knownTitles);
      const tags = ["Bangumi", "动画", `rank:${subject.rating.rank}`, subject.platform].filter(Boolean).map(String);
      const aliases = uniqueStrings([
        rawZh,
        rawEn,
        subject.name,
        subject.name_cn,
        ...extractInfoboxValues(subject.infobox, ["别名", "中文名"]),
      ]).filter(alias => alias !== zh && alias !== en).slice(0, 12);

      return {
        bangumiId: subject.id,
        id: `bangumi-${subject.id}`,
        zh,
        en,
        pinyin: buildPinyinKeys([zh, en]),
        aliases,
        tags,
      };
    });
}

function normalizeCompaniesFromSubjects(subjects) {
  const companyByName = new Map();
  for (const subject of subjects) {
    const names = extractInfoboxValues(subject.infobox, [...studioPositions]).flatMap(splitCompanyNames);
    for (const name of names) {
      const zh = cleanText(name);
      if (!zh) continue;
      const key = normalizeTerm(zh);
      const existing = companyByName.get(key);
      companyByName.set(key, {
        id: `bangumi-company-${slugify(zh)}`,
        zh,
        en: zh,
        pinyin: buildPinyinKeys([zh]),
        aliases: existing?.aliases ?? [],
        tags: uniqueStrings([...(existing?.tags ?? []), "Bangumi", "公司", "动画制作"]),
        subjectCount: (existing?.subjectCount ?? 0) + 1,
      });
    }
  }

  return [...companyByName.values()].sort((a, b) => b.subjectCount - a.subjectCount || a.zh.localeCompare(b.zh, "zh-Hans-CN"));
}

function normalizeCompanies(archive, subjectIds) {
  const persons = Array.isArray(archive.persons) ? archive.persons : archive.persons.items ?? archive.persons.data ?? [];
  const relations = Array.isArray(archive.subjectPersons) ? archive.subjectPersons : archive.subjectPersons.items ?? archive.subjectPersons.data ?? [];
  const personById = new Map(persons.map(person => [person.id, person]));
  const companyById = new Map();

  for (const relation of relations) {
    if (!subjectIds.has(relation.subject_id) || !studioPositions.has(relation.position)) continue;
    const person = personById.get(relation.person_id);
    if (!person || person.type !== 2) continue;
    const zh = cleanText(person.name_cn || person.name);
    const en = cleanText(person.name || person.name_cn || zh);
    const existing = companyById.get(person.id);
    const aliases = uniqueStrings([
      ...(existing?.aliases ?? []),
      person.name,
      person.name_cn,
      ...extractInfoboxValues(person.infobox, ["别名", "简体中文名"]),
    ]).filter(alias => alias !== zh && alias !== en).slice(0, 12);

    companyById.set(person.id, {
      id: `bangumi-company-${person.id}`,
      zh,
      en,
      pinyin: buildPinyinKeys([zh, en]),
      aliases,
      tags: ["Bangumi", "公司", relation.position],
    });
  }

  return [...companyById.values()].sort((a, b) => a.zh.localeCompare(b.zh, "zh-Hans-CN"));
}

function extractInfoboxValues(infobox, keys) {
  if (!Array.isArray(infobox)) return [];
  return infobox
    .filter(item => keys.includes(item?.key))
    .flatMap(item => Array.isArray(item.value) ? item.value.map(value => value?.v ?? value) : [item.value])
    .map(cleanText)
    .filter(Boolean);
}

function buildPinyinKeys(primaryValues) {
  const values = primaryValues.flat().map(cleanText).filter(Boolean);
  const latin = uniqueStrings(values.flatMap(value => value.split(/[^A-Za-z0-9+#.]+/))).filter(Boolean);
  const chineseChars = uniqueStrings(values.flatMap(value => [...value].filter(char => /[\u4e00-\u9fff]/.test(char))));
  return uniqueStrings([...latin.map(value => value.toLowerCase()), ...chineseChars]).slice(0, 16);
}

function buildKnownSubjectTitles(subjects) {
  const titles = new Set();
  for (const subject of subjects) {
    [subject.name_cn, subject.name, ...extractInfoboxValues(subject.infobox, ["中文名"])].forEach(value => {
      const title = stripSubjectPrefix(value);
      if (title.length >= 2) titles.add(title);
    });
  }
  return [...titles]
    .filter(title => canonicalizeByPattern(title) === title)
    .sort((a, b) => a.length - b.length);
}

function canonicalizeSubjectTitle(value, knownTitles = []) {
  const original = cleanText(value);
  if (!original) return original;

  const withoutPrefix = stripSubjectPrefix(original);
  const knownPrefix = findKnownSubjectPrefix(withoutPrefix, knownTitles);
  if (knownPrefix) return knownPrefix.replace(/[!！:：~〜－—–-]+$/u, "").trim() || knownPrefix;

  return canonicalizeByPattern(withoutPrefix) || original;
}

function canonicalizeByPattern(value) {
  const withoutPrefix = stripSubjectPrefix(value);

  const delimiterMatch = withoutPrefix.match(/[：:~〜～]|\s(?:Season|Saison|Part|Cour|剧场版|劇場版|电影|電影)\b/i);
  const delimiterIndex = delimiterMatch?.index ?? -1;
  let beforeDelimiter = delimiterIndex > 1 ? withoutPrefix.slice(0, delimiterIndex).trim() : withoutPrefix;
  const bangMatch = beforeDelimiter.match(/[!！]\s*(?:[0-9]+|第?[一二三四五六七八九十0-9]+(?:季|期|部|章|篇)|红传说|紅伝説|The\s+Movie|Movie)/iu);
  if (bangMatch?.index && bangMatch.index > 1) beforeDelimiter = beforeDelimiter.slice(0, bangMatch.index).trim();

  const withoutBracketSubtitle = beforeDelimiter
    .replace(/\s*[（(【\[][^）)】\]]*(?:前篇|後篇|后篇|新篇|総集編|总集篇|總集篇)[^）)】\]]*[）)】\]].*$/u, "")
    .replace(/\s*[（(【\[].*?[）)】\]]\s*$/u, "")
    .trim();

  let withoutSeasonSuffix = withoutBracketSubtitle;
  let previous = "";
  while (previous !== withoutSeasonSuffix) {
    previous = withoutSeasonSuffix;
    withoutSeasonSuffix = withoutSeasonSuffix
      .replace(/\s*(?:Part\.?\s*\d+|第?\d+部分|第?[一二三四五六七八九十0-9]+(?:季|期|部|章|篇|幕|夜)|[一二三四五六七八九十]+期|[一二三四五六七八九十]+|[ⅡⅢⅣⅤⅥⅦⅧⅨⅩIIIIIIVVIXX]+|(?:Season|Part)\s*\d+|\d+(?:nd|rd|th)?\s*Season|The\s+(?:Final|Movie))\s*$/iu, "")
      .replace(/\s*(?:FINAL|Final|final|完结篇|完結篇|最终季|最終季|新篇|续篇|續篇|后篇|後篇|前篇|总集篇|總集篇|剧场版|劇場版|电影|電影)\s*$/u, "")
      .trim();
  }

  return withoutSeasonSuffix.replace(/[!！:：~〜～－—–-]+$/u, "").trim();
}

function stripSubjectPrefix(value) {
  return cleanText(value)
    .replace(/^(?:剧场版|劇場版|电影|電影|映画|OVA|OAD|TV动画|TV動畫|动画电影|動畫電影)(?:\s*[:：\-—–~〜～ ]\s*)?/i, "")
    .trim();
}

function findKnownSubjectPrefix(title, knownTitles) {
  for (const knownTitle of knownTitles) {
    if (knownTitle === title || knownTitle.length < 2 || !title.startsWith(knownTitle)) continue;
    const rest = title.slice(knownTitle.length).trimStart();
    if (isContinuationSuffix(rest)) return knownTitle;
  }
  return "";
}

function isContinuationSuffix(value) {
  return /^(?:[!！:：~〜～－—–-]|\s|[（(【\[]|剧场版|劇場版|电影|電影|第?[一二三四五六七八九十0-9]+(?:季|期|部|章|篇)|最终季|最終季|完结篇|完結篇|Part\.?\s*\d+|Season\s*\d+|\d+(?:nd|rd|th)?\s*Season|II|III|IV|Ⅴ|Ⅱ|Ⅲ|Ⅳ)/iu.test(value);
}

function entry(id, zh, en, pinyin, aliases, tags) {
  return { id, zh, en, pinyin, aliases, tags };
}

function stripInternalFields(entry) {
  const { bangumiId, subjectCount, ...publicEntry } = entry;
  return publicEntry;
}

function isChineseAnimationCompany(entry) {
  return [entry.zh, entry.en, ...(entry.aliases ?? [])].some(value => chineseCompanyPattern.test(String(value ?? "")));
}

function splitCompanyNames(value) {
  return cleanText(value)
    .split(/\s*(?:、|,|，|\/|／|;|；|\+|＆|&| x | × )\s*/i)
    .map(cleanText)
    .filter(Boolean);
}

function normalizeTerm(term) {
  return cleanText(term).toLowerCase().replace(/[\s_-]+/g, " ");
}

function slugify(value) {
  const normalized = normalizeTerm(value).replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || Buffer.from(value).toString("hex");
}

function uniqueStrings(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function cleanText(value) {
  return String(value ?? "").trim();
}

async function writeJson(filename, data) {
  await fs.writeFile(path.join(outputDir, filename), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

await main();
