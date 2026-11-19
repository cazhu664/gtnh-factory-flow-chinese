import { useMemo } from "react";
import { t } from "@/lib/i18n";
import type { FactoryNode, Recipe } from "@/lib/model/types";
import {
  applyMachineHandlerToRecipe,
  applyRecipeInputOverrides,
  formatCompact,
  isSteamMachineHandler,
  getSelectedMachineHandler,
} from "@/lib/model";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import { getNodePowerReport, getNodeSteamReport, hasPowerReport } from "@/lib/solver/power-report";
import { getMachineParallelMultiplier } from "@/lib/solver/machine-effects";
import { PIN_RULE_LABEL } from "@/lib/model/pin-rule";
import {
  formatSolvedMachines,
  type CleanCardView,
  type CleanChipView,
  type CleanFootView,
} from "../clean-model";
import type { TipSpec } from "../interaction/tip-spec";
import type { SettingControl } from "./settings-model";

/**
 * The card's richer tips (spec 10.3, the mod's `RecipeCard.tip`): the name's plate with what it needs, the tier chip's
 * recipe tier and time, the power row's per-machine draw, the count's whole machines and utilization, the strip chip's
 * coil need. The wording and the rows are the mod's.
 */
export interface CardTipFacts {
  steam: boolean;
  /** Seconds one operation takes. */
  seconds: number;
  /** EU/t one machine draws (all its parallels), or steam litres a second. */
  drawPerMachine: number;
  parallels: number;
  /** The tier the recipe asks of the machine. */
  recipeTier?: string;
  shared: boolean;
  recipes: number;
}

export function cardTipFacts(recipe: Recipe, node: FactoryNode): CardTipFacts {
  try {
    return computeFacts(recipe, node);
  } catch {
    // A recipe the maths cannot read (a stub): the tips just have fewer rows.
    return {
      steam: false,
      seconds: recipe.durationTicks / 20,
      drawPerMachine: Math.abs(recipe.eut),
      parallels: 1,
      shared: false,
      recipes: 1,
    };
  }
}

function computeFacts(recipe: Recipe, node: FactoryNode): CardTipFacts {
  const nodeRecipe = applyRecipeInputOverrides(recipe, node);
  const effective = applyMachineHandlerToRecipe(nodeRecipe, node);
  const steam =
    isSteamMachineHandler(getSelectedMachineHandler(recipe, node)) || !(effective.eut > 0);
  const stats = getOverclockedRecipeStats(nodeRecipe, node);
  const power =
    !steam && hasPowerReport(nodeRecipe) ? getNodePowerReport(nodeRecipe, node) : undefined;
  const steamReport = steam ? getNodeSteamReport(nodeRecipe, node) : undefined;
  return {
    steam: steamReport !== undefined,
    seconds: stats.durationTicks / 20,
    drawPerMachine: steamReport
      ? steamReport.drawSteamPerTick * 20
      : (power?.drawEuT ?? Math.abs(stats.eut)),
    parallels:
      power?.parallels ?? steamReport?.parallels ?? getMachineParallelMultiplier(effective, node),
    recipeTier: stats.minimumTier,
    shared: (node.extraRecipes?.length ?? 0) > 0,
    recipes: 1 + (node.extraRecipes?.length ?? 0),
  };
}

export function useCardTipFacts(recipe: Recipe, node: FactoryNode): CardTipFacts {
  return useMemo(() => cardTipFacts(recipe, node), [recipe, node]);
}

const seconds = (s: number) => `${formatCompact(s)} s`;
const times = (text: string) => text.replace(/^[x×]/, "×");

export function machineNameTip(view: CleanCardView, f: CardTipFacts): TipSpec {
  const tip: NonNullable<TipSpec["rows"]> = [
    {
      label: t(view.count.pinned ? "Running machines" : "Required machines"),
      value: times(view.count.text),
    },
  ];
  if (view.count.pinned)
    tip.push({ label: t(PIN_RULE_LABEL[view.count.rule]), value: `×${view.count.setText}` });
  if (f.shared) tip.push({ label: t("Recipes"), value: String(f.recipes) });
  if (view.tier && !f.steam) tip.push({ label: t("Configured tier"), value: view.tier.label });
  tip.push({ label: t("Time per operation"), value: seconds(f.seconds) });
  tip.push(
    f.steam
      ? { label: t("Steam per machine"), value: `${formatCompact(f.drawPerMachine)} L/s` }
      : { label: t("Draw per machine"), value: `${formatCompact(f.drawPerMachine)} EU/t` },
  );
  if (f.parallels > 1)
    tip.push({ label: t("Parallel operations"), value: String(Math.round(f.parallels)) });
  return {
    id: `${view.nodeId}|name`,
    title: view.name,
    sub: t(view.amps ? "Multiblock" : "Machine"),
    rows: tip,
    notes: f.shared ? [{ text: t("One machine runs these recipes in turns."), tone: "muted" }] : [],
    actions: view.hasPicker
      ? [
          {
            input: "left",
            label: t(f.shared ? "Machines that run them all" : "Machines that run it"),
          },
          { input: "wheel", label: t("Next machine") },
        ]
      : [],
  };
}

export function tierChipTip(view: CleanCardView, f: CardTipFacts): TipSpec {
  const tier = view.tier!;
  const rows: NonNullable<TipSpec["rows"]> = [{ label: t("Configured tier"), value: tier.label }];
  if (f.recipeTier && f.recipeTier !== "NONE")
    rows.push({ label: t("Recipe tier"), value: f.recipeTier });
  rows.push({ label: t("Time per operation"), value: seconds(f.seconds) });
  rows.push({ label: t("Draw per machine"), value: `${formatCompact(f.drawPerMachine)} EU/t` });
  return {
    id: `${view.nodeId}|tier`,
    title: t(tier.fixed ? "Fusion reactor power" : "Voltage tier"),
    rows,
    notes: view.power?.stalled
      ? [{ text: t("Below the recipe's tier: it cannot run."), tone: "red" }]
      : [],
    actions: tier.fixed
      ? []
      : [
          { input: "left", label: t("Up") },
          { input: "right", label: t("Down") },
          { input: "wheel", label: t("Step") },
        ],
  };
}

export function powerRowTip(view: CleanCardView, f: CardTipFacts): TipSpec {
  const power = view.power!;
  const demand = power.stalled ? power.number : `${power.number} ${power.unit}`.trim();
  return f.steam
    ? {
        id: `${view.nodeId}|power`,
        title: t("Steam"),
        rows: [
          { label: t("Steam per machine"), value: `${formatCompact(f.drawPerMachine)} L/s` },
          { label: t("Steam for this card"), value: demand },
        ],
        notes: [{ text: t("Not wired in plans."), tone: "muted" }],
      }
    : {
        id: `${view.nodeId}|power`,
        title: t("Power"),
        rows: [
          { label: t("Draw per machine"), value: `${formatCompact(f.drawPerMachine)} EU/t` },
          { label: t("Demand for this card"), value: demand },
        ],
        notes: [
          ...(power.stalled ? [{ text: power.title, tone: "red" as const }] : []),
          { text: t("Not wired in plans."), tone: "muted" as const },
        ],
      };
}

/** The count's tip: what runs against what you set, or what the plan needs and how busy its machines are. */
export function countRowsTip(
  view: Pick<CleanCardView, "nodeId" | "count">,
  shared: boolean,
): TipSpec {
  const { count } = view;
  const rows: NonNullable<TipSpec["rows"]> = [];
  const notes: NonNullable<TipSpec["notes"]> = [];
  if (count.pinned) {
    rows.push({ label: t("Running"), value: times(count.text) });
    rows.push({ label: t(PIN_RULE_LABEL[count.rule]), value: `×${count.setText}` });
    if (count.rule === "upTo" && count.set !== undefined && count.set > 0) {
      rows.push({
        label: t("Usage"),
        value: `${formatCompact(Math.min(100, (100 * count.value) / count.set))}%`,
      });
    }
    notes.push({ text: count.title, tone: "muted" });
  } else {
    rows.push({ label: t("Calculated"), value: times(count.text) });
    // What the number counts (a crop card's are crops).
    notes.push({ text: count.title, tone: "muted" });
    const whole = Math.ceil(count.value - 1e-9);
    if (count.value > 0 && whole !== count.value) {
      rows.push({ label: t("Whole machines"), value: `×${whole}` });
      rows.push({
        label: t("Average utilization"),
        value: `${formatCompact((100 * count.value) / whole)}%`,
      });
    }
    if (count.value <= 0)
      notes.push({
        text: t("No rate or set count in the plan needs this machine yet."),
        tone: "muted",
      });
  }
  if (shared)
    notes.push({ text: t("The total for all its recipes, which share the machines."), tone: "muted" });
  return {
    id: `${view.nodeId}|count`,
    title: count.pinned
      ? t("{rule} {set}", { rule: t(PIN_RULE_LABEL[count.rule]), set: count.setText })
      : t("Required machines"),
    rows,
    notes,
    actions: [
      { input: "left", label: t(count.pinned ? "Type a count" : "Set a count") },
      { input: "wheel", label: t(count.pinned ? "+1 / -1" : "Up to what runs") },
      ...(count.pinned ? [{ input: "middle" as const, label: t("Let the plan decide") }] : []),
    ],
  };
}

/** The rule word's tip: what the rule does, and that a click changes it. */
export function ruleTip(view: Pick<CleanCardView, "nodeId" | "count">): TipSpec {
  const { count } = view;
  return {
    id: `${view.nodeId}|rule`,
    title: t(PIN_RULE_LABEL[count.rule]),
    notes: [
      {
        text:
          count.rule === "exact"
            ? count.ruleFixed
              ? t("A custom rate always runs at its dial.")
              : t("Always this many. A gap comes in or goes out forced.")
            : count.rule === "any"
              ? t("The plan decides how many.")
              : count.pinned
                ? t("As many as the plan lets it run. Never more.")
                : t("Set how many you have. Until then the plan picks."),
        tone: "muted",
      },
    ],
    actions: count.ruleFixed ? [] : [{ input: "left", label: t("Any, Up to, Exactly") }],
  };
}

/** The foot bar's tip: how much runs, the reason in full, and where to act. */
export function footTip(nodeId: string, foot: CleanFootView): TipSpec {
  const f = foot.facts;
  const n = formatSolvedMachines;
  const rows: NonNullable<TipSpec["rows"]> = [];
  const notes: NonNullable<TipSpec["notes"]> = [];
  if (f.reason === "FORCED") {
    for (const line of f.forced) rows.push({ label: t("Forced in"), value: line, tone: "warn" });
    notes.push({ text: t("Set it to Up to and it runs what its inputs allow."), tone: "muted" });
    return { id: `${nodeId}|foot`, title: t("Exactly {n} running", { n: n(f.capacity) }), rows, notes };
  }
  const usage = f.capacity > 0 ? Math.min(100, (100 * f.running) / f.capacity) : 0;
  rows.push({ label: t("Usage"), value: `${formatCompact(usage)}%` });
  const all = f.running >= f.capacity - 0.000001;
  const title =
    f.running <= 0.0000005
      ? t("None running")
      : all
        ? f.capacity === 1
          ? t("Running flat out")
          : t("All {n} running", { n: n(f.capacity) })
        : t("{running} of {capacity} running", { running: n(f.running), capacity: n(f.capacity) });
  // A ring: what it is short of or backs up with, and that the ring stops itself.
  if (f.loop) {
    const dead = f.loop === "dead";
    if (f.resource)
      rows.push({ label: t(dead ? "Short of" : "Backs up"), value: f.resource, tone: "warn" });
    for (const name of f.tied)
      rows.push({ label: t(dead ? "Also short of" : "Also backs up"), value: name, tone: "warn" });
    notes.push({
      text: dead
        ? t("This loop starves itself to a stop. Bring this input in from outside.")
        : t("This loop clogs itself to a stop. A drawer for this output frees it."),
      tone: "muted",
    });
    return { id: `${nodeId}|foot`, title, rows, notes };
  }
  switch (f.reason) {
    case "FULL":
      notes.push({ text: t("Nothing around it would use more."), tone: "muted" });
      break;
    case "BOTTLENECK":
      if (f.wants !== undefined) {
        rows.push({ label: t("Wants"), value: `×${n(f.wants)}`, tone: "red" });
        notes.push({
          text: t("{n} more here would let the line run faster.", { n: n(f.wants - f.capacity) }),
          tone: "red",
        });
      }
      break;
    case "STARVED":
      if (f.resource) rows.push({ label: t("Short of"), value: f.resource, tone: "warn" });
      for (const name of f.tied) rows.push({ label: t("Also short of"), value: name, tone: "warn" });
      for (const name of f.upstream) rows.push({ label: t("Full upstream"), value: name });
      notes.push({
        text:
          f.upstream.length > 0
            ? t("Build more upstream first.")
            : t("More of this input would let it run faster."),
        tone: "muted",
      });
      break;
    case "CLOGGED":
      if (f.resource) rows.push({ label: t("Backs up"), value: f.resource, tone: "warn" });
      for (const name of f.tied) rows.push({ label: t("Also backs up"), value: name, tone: "warn" });
      notes.push({
        text: t("What takes it is full. Add machines after it or a drawer."),
        tone: "muted",
      });
      break;
    case "UNUSED":
      if (f.resource) rows.push({ label: t("Nothing takes"), value: f.resource, tone: "warn" });
      notes.push({ text: t("Wire its output or give it a rate."), tone: "muted" });
      break;
    case "LIMITED":
      notes.push({ text: t("Another count or rate in the plan holds it back."), tone: "muted" });
      break;
    default:
      notes.push({ text: t("Why it runs less was not worked out in time."), tone: "muted" });
  }
  return { id: `${nodeId}|foot`, title, rows, notes };
}

/** A strip chip's tip: what it is, what it is set to, what the recipe needs of it, how to change it. */
export function stripTip(
  nodeId: string,
  chip: CleanChipView,
  control: SettingControl | undefined,
  needK?: number,
): TipSpec {
  const rows: NonNullable<TipSpec["rows"]> = [
    { label: t(chip.reading ? "Reads" : "Set to"), value: chip.value },
  ];
  if (control?.id === "heatingCoil" && needK !== undefined)
    rows.push({ label: t("Recipe needs"), value: `${needK} K` });
  const notes: NonNullable<TipSpec["notes"]> = [];
  if (chip.warn) notes.push({ text: t("Too cold for this recipe: it cannot run."), tone: "red" });
  notes.push({ text: t("Pinned to the card: unpin it in the settings."), tone: "muted" });
  return {
    id: `${nodeId}|setting|${chip.id}`,
    title: chip.label,
    rows,
    notes,
    actions: chip.reading
      ? []
      : [
          { input: "left", label: t("Choose") },
          { input: "right", label: t("Step back") },
          { input: "wheel", label: t("Step") },
        ],
  };
}

/** The gear key's tip: what it opens, and what stops the recipe. */
export function gearTip(nodeId: string, coilTooCold: boolean): TipSpec {
  return {
    id: `${nodeId}|gear`,
    title: t("Machine settings"),
    notes: [
      { text: t("Pin a setting there to show it on the card."), tone: "muted" },
      ...(coilTooCold
        ? [{ text: t("The coil is too cold for this recipe: it cannot run."), tone: "red" as const }]
        : []),
    ],
    actions: [{ input: "left", label: t("Open") }],
  };
}
