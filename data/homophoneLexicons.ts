export type HomophoneTheme = "ACGN" | "编程语言";

export interface HomophoneEntry {
  id: string;
  theme: HomophoneTheme;
  zh: string;
  en: string;
  pinyin: string[];
  aliases: string[];
  tags: string[];
}

export interface HomophoneLexiconFile {
  path: string;
  label: string;
  source: string;
}

export const HOMOPHONE_THEMES: { value: HomophoneTheme; label: string }[] = [
  { value: "ACGN", label: "ACGN" },
  { value: "编程语言", label: "编程语言" },
];

export const HOMOPHONE_LEXICON_FILES: Record<HomophoneTheme, HomophoneLexiconFile[]> = {
  ACGN: [
    { path: "/data/homophones/vocaloid/voices.json", label: "歌姬", source: "seed" },
    { path: "/data/homophones/vocaloid/songs.json", label: "歌曲", source: "seed" },
    { path: "/data/homophones/vocaloid/producers.json", label: "P主", source: "seed" },
    { path: "/data/homophones/anime/bangumi-subjects.json", label: "Bangumi 条目", source: "seed; ready for Bangumi top subjects" },
    { path: "/data/homophones/anime/bangumi-companies.json", label: "制作公司", source: "seed; ready for Bangumi companies" },
    { path: "/data/homophones/anime/concepts.json", label: "类型题材", source: "seed" },
    { path: "/data/homophones/movie/titles.json", label: "片名系列", source: "seed" },
    { path: "/data/homophones/movie/people.json", label: "影人", source: "seed" },
    { path: "/data/homophones/movie/industry.json", label: "公司技术类型", source: "seed" },
    { path: "/data/homophones/light-novel/titles.json", label: "作品", source: "seed" },
    { path: "/data/homophones/light-novel/creators.json", label: "作者", source: "seed" },
    { path: "/data/homophones/light-novel/publishers.json", label: "文库平台", source: "seed" },
    { path: "/data/homophones/light-novel/concepts.json", label: "类型", source: "seed" },
  ],
  编程语言: [
    { path: "/data/homophones/programming-language/languages.json", label: "语言", source: "seed" },
    { path: "/data/homophones/programming-language/frameworks.json", label: "框架运行时", source: "seed" },
    { path: "/data/homophones/programming-language/tools.json", label: "工具协议", source: "seed" },
  ],
};
