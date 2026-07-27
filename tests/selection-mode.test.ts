import { describe, expect, it } from "vitest";
import { collapseToLatestSelection, mergeSelection } from "../src/selection";
import type { Selection } from "../src/types";

const first: Selection = { id: "first", kind: "text", tag: "p", text: "First", outerHTML: "First", location: "p" };
const second: Selection = { id: "second", kind: "block", tag: "section", text: "Second", outerHTML: "<section>Second</section>", location: "section" };

describe("selection mode", () => {
  it("replaces the previous context by default", () => {
    expect(mergeSelection([first], second, false)).toEqual([second]);
  });

  it("accumulates context only in explicit multiple mode", () => {
    expect(mergeSelection([first], second, true)).toEqual([first, second]);
  });

  it("keeps the latest context when multiple mode is turned off", () => {
    expect(collapseToLatestSelection([first, second])).toEqual([second]);
  });
});
