import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "./core";
import { datasetNameInChinese, datasetNameLabel, datasetRecipeChineseNames, datasetRecipeLabel } from "./dataset-names";

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

describe("Chinese names for the search index", () => {
  it("gives the Chinese name whatever language the reader is in", () => {
    // The index is built once on the server and serves every reader, so the
    // Chinese name must never depend on the UI locale.
    setLocale("en");
    expect(datasetNameInChinese("Iron Ingot")).toBe("铁锭");
  });

  it("gives both halves of a machine: product title", () => {
    expect(datasetRecipeChineseNames("Macerator: Iron Ingot")).toEqual(["研磨机", "铁锭"]);
  });

  it("gives nothing for a name the map does not know", () => {
    expect(datasetNameInChinese("Some Untranslated Thing")).toBeUndefined();
    expect(datasetRecipeChineseNames("Foo: Bar")).toEqual([]);
  });
});
