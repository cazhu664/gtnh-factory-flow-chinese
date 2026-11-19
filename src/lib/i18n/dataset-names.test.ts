import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "./core";
import { datasetNameLabel, datasetRecipeLabel } from "./dataset-names";

afterEach(() => setLocale("en"));

describe("datasetNameLabel", () => {
  it("returns the dataset name unchanged in English", () => {
    expect(datasetNameLabel("Iron Ingot")).toBe("Iron Ingot");
  });

  it("translates a known resource name in Chinese", () => {
    setLocale("zh");
    expect(datasetNameLabel("Iron Ingot")).toBe("铁锭");
  });

  it("falls back to the dataset name when the map has no entry", () => {
    setLocale("zh");
    expect(datasetNameLabel("Some Untranslated Thing")).toBe("Some Untranslated Thing");
  });
});

describe("datasetRecipeLabel", () => {
  it("translates each half of a machine: product name", () => {
    setLocale("zh");
    expect(datasetRecipeLabel("Macerator: Iron Ingot")).toBe("研磨机: 铁锭");
  });

  it("keeps the dataset name when neither half is known", () => {
    setLocale("zh");
    expect(datasetRecipeLabel("Foo: Bar")).toBe("Foo: Bar");
  });
});
