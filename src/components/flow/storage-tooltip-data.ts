import { effectiveBufferMode } from "@/lib/model/storage-role";
import { isInputRate, storageTargetMode, targetModeHelp, TARGET_MODE_LABELS, type TargetMode } from "@/lib/model/storage-target";
import type {
  FactoryProject,
  FactoryStorage,
  StorageBufferMode,
  StorageThroughputResult,
  ThroughputResult,
} from "@/lib/model/types";
import type { StorageRole } from "@/lib/model/storage-role";
import { getCategoryPresentation } from "@/lib/model/category-presentation";
import { resourceLabel } from "@/lib/model/resources";
import { deriveNodeVerdict } from "./node-verdict";
import { formatSlotRate } from "./flow-explainers";
import { tooltipMode, type RecipeTooltipView, type TooltipAction } from "./recipe-tooltip-data";
import { t } from "@/lib/i18n";

/**
 * The drawer's hover, in the same panel and vocabulary as the cards: the
 * resource, the role word, and rows of figures. No sentence explains what a
 * role does - the word and the numbers are the explanation. A sentence only
 * appears for a requirement (an unwired drawer) or a named cause (what
 * limits a product that misses its amount).
 */

const ROLE_WORD: Record<StorageRole, string> = {
  source: "Source",
  product: "Product",
  byproduct: "Byproduct",
  trash: "Trash",
  buffer: "Buffer",
  idle: "Drawer",
};

const EPS = 1e-6;
const differs = (a: number, b: number) => Math.abs(a - b) > Math.max(EPS, 0.005 * Math.max(Math.abs(a), Math.abs(b)));

/** What limits the machines feeding this drawer, when one of them says so. */
function feederCause(project: FactoryProject, result: ThroughputResult | undefined, storageId: string): string | undefined {
  if (!result) return undefined;
  const feeders = new Set<string>();
  for (const edge of project.edges) {
    if (edge.target === storageId) feeders.add(edge.source);
  }
  for (const nodeId of feeders) {
    if (!project.nodes.some((node) => node.id === nodeId)) continue;
    const verdict = deriveNodeVerdict(project, result, nodeId);
    if ((verdict.kind === "starved" || verdict.kind === "blocked") && verdict.binding) {
      return t("{name} supply limits production.", { name: verdict.binding.displayName });
    }
  }
  return undefined;
}

export function buildStorageTooltip(
  project: FactoryProject,
  result: ThroughputResult | undefined,
  storage: FactoryStorage,
  role: StorageRole,
): RecipeTooltipView {
  const mode = tooltipMode(project);
  const strict = role === "buffer" && effectiveBufferMode(storage, project.solveMode === true) === "strict";
  const figures: StorageThroughputResult | undefined = result?.storages[storage.id];
  const rate = (value: number) => formatSlotRate(value, storage.kind);
  const view: RecipeTooltipView = {
    title: resourceLabel(getCategoryPresentation(project.recipes, storage.kind, storage.resourceId)
      ?? { id: storage.resourceId, displayName: storage.displayName }),
    subtitle: role === "buffer" && storage.bufferMode === "ratio" ? t("Buffer · Ratio") : strict ? t("Buffer · Strict") : t(ROLE_WORD[role]),
    rows: [],
    // A drawer is a port with no rows to browse: dragging is its one gesture,
    // and in pool mode a drag lands nothing.
    // Its port chip answers like a machine's port row (power has no book).
    actions: mode === "pool"
      ? []
      : [
          ...(storage.kind === "power" ? [] : ([{ gesture: "left", label: t("Recipes") }, { gesture: "right", label: t("Uses") }] as const)),
          { gesture: "drag", label: t("Drag to connect") },
        ],
  };

  if (role === "idle") {
    return mode === "pool"
      ? { ...view, subtitle: t("Drawer · Not pooled") }
      : { ...view, requirement: t("You must connect it.") };
  }
  if (mode === "pool" && role !== "product" && role !== "source") {
    // Only source/product drawers are live in Pool; other drawers stand inert.
    return { ...view, subtitle: `${view.subtitle}${t(" · Not pooled")}` };
  }
  if (!figures) {
    return { ...view, reason: t("Calculation unavailable.") };
  }

  const inRate = figures.producedPerSecond;
  const outRate = figures.consumedPerSecond;
  switch (role) {
    case "source": {
      const target = storage.targetPerSecond;
      const rule = storageTargetMode(storage, "source");
      if (mode !== "build" && target !== undefined) {
        view.rows.push({ label: rule === "ignore" ? t("Saved target") : t(TARGET_MODE_LABELS[rule]), value: rate(Math.abs(target)) });
        if (figures.targetUnreachable) view.reason = t("No machine count meets this input rate with the current wires and targets.");
      }
      view.rows.push({ label: t("Supplied"), value: rate(outRate) });
      break;
    }
    case "product": {
      const target = storage.targetPerSecond;
      if (mode !== "build" && storageTargetMode(storage, role) === "ignore") {
        view.subtitle = t("Ignored target");
        view.reason = t("The saved amount does not drive production.");
        view.rows = target !== undefined ? [{ label: t("Saved target"), value: rate(target) }] : [];
        if ((target ?? 0) >= 0) view.rows.push({ label: t("Produced"), value: rate(inRate) });
        break;
      }
      if (mode !== "build" && target !== undefined && target < 0) {
        view.subtitle = t("Input goal");
        view.rows = [{ label: t("Consume"), value: rate(-target) }, { label: t("Consumed"), value: rate(outRate) }];
        if (figures.targetUnreachable) view.reason = t("No machine count consumes the requested input amount.");
        break;
      }
      const hasTarget = mode !== "build" && target !== undefined && (target > 0 || storageTargetMode(storage, role) === "exact");
      if (hasTarget) view.rows.push({ label: storageTargetMode(storage, role) === "exact" ? t("Exactly") : t("Required"), value: rate(target) });
      view.rows.push({ label: t("Produced"), value: rate(inRate) });
      if (hasTarget && target > inRate + EPS && differs(target, inRate)) {
        view.rows.push({ label: t("Shortfall"), value: rate(target - inRate) });
        view.reason = figures.targetUnreachable
          ? t("No machine count reaches the required amount.")
          : feederCause(project, result, storage.id);
      }
      break;
    }
    case "byproduct":
      view.rows = [{ label: t("Produced"), value: rate(inRate) }];
      break;
    case "trash":
      view.rows = [{ label: t("Discarded"), value: rate(inRate) }];
      break;
    case "buffer": {
      view.rows = [
        { label: t("In"), value: rate(inRate) },
        { label: t("Out"), value: rate(outRate) },
      ];
      const net = inRate - outRate;
      if (differs(inRate, outRate)) {
        view.rows.push(net > 0 ? { label: t("Stored"), value: `+${rate(net)}` } : { label: t("Drawn"), value: `-${rate(-net)}` });
      }
      break;
    }
  }
  return view;
}

/** The required-amount field: the number, and what is reachable when it is not. */
export function buildTargetTooltip(storage: FactoryStorage, figures: StorageThroughputResult | undefined, poolMode = false, input = isInputRate(storage)): RecipeTooltipView {
  const target = storage.targetPerSecond;
  const rate = (value: number) => formatSlotRate(value, storage.kind);
  const rule = storageTargetMode(storage, input ? "source" : "product");
  const ignored = rule === "ignore";
  const exact = rule === "exact";
  const rows = target !== undefined ? [{ label: ignored ? t("Saved target") : input ? (rule === "exact" ? t("Consume") : t(TARGET_MODE_LABELS[rule])) : exact ? t("Exactly") : t("Required"), value: rate(ignored ? target : Math.abs(target)) }] : [];
  if (figures?.targetUnreachable && figures.producedPerSecond >= 0) {
    rows.push({ label: t("Reachable"), value: rate(input ? figures.consumedPerSecond : figures.producedPerSecond) });
  }
  return { title: ignored ? t("Ignored target") : input ? t("Input goal") : exact ? t("Exact output goal") : t("Required amount"), reason: targetModeHelp(rule, input), rows, bullets: [t("Middle-click to clear the rate.")], actions: [{ gesture: "left", label: t("Edit amount") }] };
}

/**
 * A drawer's rule row in Solve: your rule (or Any), your rate, the real
 * rate, and how far the real rate has got toward yours. `rule` is undefined
 * on Any, including an Any that keeps a number waiting.
 */
export function buildRatePlateTooltip(
  storage: FactoryStorage,
  figures: StorageThroughputResult | undefined,
  input: boolean,
  net: number,
  rule: TargetMode | undefined,
): RecipeTooltipView {
  const rate = (value: number) => formatSlotRate(Math.abs(value), storage.kind);
  const target = storage.targetPerSecond;
  const rows: Array<{ label: string; value: string }> = [
    { label: t("Your rule"), value: rule && target !== undefined ? `${t(TARGET_MODE_LABELS[rule])} ${rate(target)}` : t("Any amount") },
    { label: t("Real rate"), value: rate(net) },
  ];
  if (rule && target !== undefined && Math.abs(target) > 0) {
    rows.push({ label: t("Reached"), value: `${Math.round(Math.min(1, Math.abs(net) / Math.abs(target)) * 100)}%` });
  } else if (!rule && target !== undefined) {
    rows.push({ label: t("Kept"), value: `${rate(target)}, ${t("not applied")}` });
  }
  return {
    title: rule ? (input ? t("Input rule") : t("Output rule")) : t("Any amount"),
    status: figures?.targetUnreachable ? { label: t("Can't be met"), tone: "warning" } : undefined,
    reason: rule ? targetModeHelp(rule, input) : input ? t("Supplies whatever the chain needs.") : t("Takes whatever the chain makes."),
    rows,
    bullets: [t("The ▾ button beside it picks Any, At least, Exactly or At most.")],
    actions: [
      { gesture: "left", label: t("Type a rate") },
      { gesture: "wheel", label: t("Step by 1 (Ctrl 10, Shift 100)") },
      { gesture: "middle", label: t("Clear the rate") },
    ],
  };
}

const NEXT_ACTION = (next: string): TooltipAction[] => [{ gesture: "left", label: t("Switch to {next}", { next }) }];

export function buildDrainKeyTooltip(role: StorageRole, next: string): RecipeTooltipView {
  return { title: t(ROLE_WORD[role]), rows: [], actions: NEXT_ACTION(next) };
}

export function buildBufferKeyTooltip(mode: StorageBufferMode): RecipeTooltipView {
  if (mode === "ratio") return { title: t("Ratio"), subtitle: t("Incoming, outgoing and setup output"), rows: [], actions: NEXT_ACTION("overflow") };
  return mode === "strict"
    ? { title: t("Strict"), subtitle: t("Surplus clogs the feeder"), rows: [], actions: NEXT_ACTION("ratio") }
    : { title: t("Non-strict"), subtitle: t("Surplus stored"), rows: [], actions: NEXT_ACTION("strict") };
}
