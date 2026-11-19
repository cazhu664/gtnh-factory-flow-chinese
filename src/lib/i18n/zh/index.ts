/**
 * The Chinese dictionary, split into one shard per area of the app and merged
 * here. Keys are the English source strings; a missing key falls back to the
 * English text (see ../index.ts).
 *
 * Keep shards one-per-area so two areas can be translated without touching the
 * same file.
 */
import { zh as common } from "./common";
import { zh as chrome } from "./chrome";
import { zh as settings } from "./settings";
import { zh as share } from "./share";
import { zh as board } from "./board";
import { zh as cards } from "./cards";
import { zh as panels } from "./panels";
import { zh as recipe } from "./recipe";
import { zh as power } from "./power";
import { zh as solver } from "./solver";
import { zh as community } from "./community";
import { zh as tasks } from "./tasks";
import { zh as welcome } from "./welcome";
import { zh as live } from "./live";

export const ZH_DICTIONARY: Record<string, string> = {
  ...common,
  ...chrome,
  ...settings,
  ...share,
  ...board,
  ...cards,
  ...panels,
  ...recipe,
  ...power,
  ...solver,
  ...community,
  ...tasks,
  ...welcome,
  ...live,
};
