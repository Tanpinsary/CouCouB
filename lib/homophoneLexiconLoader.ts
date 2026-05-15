import { HOMOPHONE_LEXICON_FILES, type HomophoneEntry, type HomophoneTheme } from "@/data/homophoneLexicons";

type HomophoneEntryPayload = Omit<HomophoneEntry, "theme"> & { theme?: HomophoneTheme };

const lexiconCache = new Map<HomophoneTheme, Promise<HomophoneEntry[]>>();

export function loadHomophoneLexicon(theme: HomophoneTheme): Promise<HomophoneEntry[]> {
  const cached = lexiconCache.get(theme);
  if (cached) return cached;

  const request = Promise.all(
    HOMOPHONE_LEXICON_FILES[theme].map(file =>
      fetch(file.path)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to load ${file.path}: ${response.status}`);
          }
          return response.json() as Promise<HomophoneEntryPayload[]>;
        })
        .then(entries => entries.map(entry => ({ ...entry, theme })))
    )
  ).then(groups => groups.flat());

  lexiconCache.set(theme, request);
  return request;
}
