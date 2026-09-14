import { describe, expect, it } from "vitest";
import { findSimilarCatalogNames, isDbSessionId, normalizeCatalogName } from "@/lib/session-catalog";

describe("normalizeCatalogName", () => {
  it("lowercases, strips accents and collapses spaces", () => {
    expect(normalizeCatalogName("  García   PÉREZ ")).toBe("garcia perez");
  });

  it("returns empty for blank input", () => {
    expect(normalizeCatalogName("   ")).toBe("");
  });
});

describe("findSimilarCatalogNames", () => {
  const existing = ["García Pérez", "Ibarra", "Aula 204"];

  it("suggests on accent/case-insensitive substring", () => {
    expect(findSimilarCatalogNames(existing, "garcia")).toEqual(["García Pérez"]);
    expect(findSimilarCatalogNames(existing, "AULA")).toEqual(["Aula 204"]);
  });

  it("suggests when the typed value contains the existing name", () => {
    expect(findSimilarCatalogNames(existing, "Profesor Ibarra")).toEqual(["Ibarra"]);
  });

  it("excludes the exact normalized match (caller reuses it silently)", () => {
    expect(findSimilarCatalogNames(existing, "garcia perez")).toEqual([]);
  });

  it("returns empty for blank input or no matches", () => {
    expect(findSimilarCatalogNames(existing, "   ")).toEqual([]);
    expect(findSimilarCatalogNames(existing, "xyz")).toEqual([]);
  });
});

describe("isDbSessionId", () => {
  it("accepts uuids and rejects legacy demo slugs", () => {
    expect(isDbSessionId("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isDbSessionId("asi-monday-theory")).toBe(false);
    expect(isDbSessionId("")).toBe(false);
  });
});
