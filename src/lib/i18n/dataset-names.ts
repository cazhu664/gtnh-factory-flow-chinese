import { getLocale } from "./core";
import zhDatasetNames from "./data/dataset-names.zh.json";

/**
 * The names the dataset export carries - items, fluids, machines and the
 * recipe titles the pipeline builds from them - are English: they come from the
 * mods' own en_US lang files. This is the Chinese half of that table, generated
 * by joining the GTNH translation project's en_US and zh_CN files (see the
 * dataset notes in `docs/`), keyed by the exact English name the export ships.
 *
 * It is a plain lookup, not the UI dictionary (`./zh`): these keys are DATA,
 * thousands of them, and they arrive from the dataset rather than from markup.
 */
const ZH_DATASET_NAMES = zhDatasetNames as unknown as Record<string, string>;

/**
 * A dataset name in the current language: the Chinese name when one is known
 * under 中文, the English name otherwise (and always in English). Names the
 * table does not hold - a mod with no translation, a hand-built label - fall
 * through unchanged, so a caller never has to test for a miss.
 */
export function datasetNameLabel(name: string): string;
export function datasetNameLabel(name: string | undefined): string | undefined;
export function datasetNameLabel(name: string | undefined): string | undefined {
  if (!name || getLocale() !== "zh") {
    return name;
  }
  return ZH_DATASET_NAMES[name] ?? name;
}

/**
 * A recipe title, which the pipeline writes as "<machine>: <product>" ("Crop
 * Farm: Wheat"). Both halves are dataset names, so each is looked up on its
 * own; the title itself is tried first for the names that carry no separator.
 */
export function datasetRecipeLabel(name: string): string;
export function datasetRecipeLabel(name: string | undefined): string | undefined;
export function datasetRecipeLabel(name: string | undefined): string | undefined {
  if (!name || getLocale() !== "zh") {
    return name;
  }
  const direct = ZH_DATASET_NAMES[name];
  if (direct) {
    return direct;
  }
  const at = name.indexOf(": ");
  if (at > 0) {
    const head = name.slice(0, at);
    const tail = name.slice(at + 2);
    const zhHead = ZH_DATASET_NAMES[head];
    const zhTail = ZH_DATASET_NAMES[tail];
    if (zhHead || zhTail) {
      return `${zhHead ?? head}: ${zhTail ?? tail}`;
    }
  }
  return name;
}
