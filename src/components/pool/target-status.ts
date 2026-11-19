import { t } from "@/lib/i18n";
import type { FactoryStorage, StorageThroughputResult } from "@/lib/model/types";
import type { StorageRole } from "@/lib/model/storage-role";
import { hasStorageTarget, isInputRate, storageTargetMode } from "@/lib/model/storage-target";

type RateStatus = { label: string; compact?: string; tone: "muted" | "met" | "failed"; explain?: boolean };

/** Describe the solver's verdict; never guess which constraint caused a failure. */
export function targetStatus(storage: FactoryStorage, role: StorageRole | undefined,
  result: StorageThroughputResult | undefined, stale = false): RateStatus {
  const mode = storageTargetMode(storage, role);
  if (mode === "ignore") return { label: t("Rate not enforced"), compact: t("Not enforced"), tone: "muted" };
  if (!hasStorageTarget(storage, role)) return { label: t("No rate set"), compact: t("No rate set"), tone: "muted" };
  if (stale || !result) return { label: t("Calculating…"), tone: "muted" };
  const target = Math.abs(storage.targetPerSecond!);
  const actual = isInputRate(storage, role) ? result.consumedPerSecond : result.producedPerSecond;
  // Treat rounding at the solver's relative precision as equality, including large EU targets.
  const tolerance = Math.max(1e-7, target * 1e-5);
  if (result.targetUnreachable) return {
    label: actual < target - tolerance ? t("Below requested rate") : actual > target + tolerance ? t("Rate limit exceeded") : t("Target not met"),
    compact: actual < target - tolerance ? t("Below target") : actual > target + tolerance ? t("Over limit") : t("Not met"),
    tone: "failed", explain: true,
  };
  if (mode === "at-most") return { label: t("Within rate limit"), compact: t("Within limit"), tone: "met" };
  if (mode === "at-least" && actual > target + tolerance) return { label: t("Above requested rate"), compact: t("Above target"), tone: "met" };
  return { label: t("Requested rate met"), compact: t("Rate met"), tone: "met" };
}
