import { describe, expect, it } from "vitest";
import { readReadingPosition, writeReadingPosition } from "../src/readingPosition";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("reading position", () => {
  it("keeps an independent page, offset, and section bookmark for each course", () => {
    const storage = memoryStorage();
    const position = {
      page: "session2.html",
      top: 846,
      section: { id: "worked-example", index: 3, label: "Worked example" },
    };

    writeReadingPosition("bayes", position, storage);

    expect(readReadingPosition("bayes", storage)).toEqual(position);
    expect(readReadingPosition("confucius", storage)).toBeNull();
  });

  it("ignores corrupt or incomplete bookmarks", () => {
    const storage = memoryStorage();
    storage.setItem("course-studio:reading-position:bayes", '{"page":"session1.html","top":"far"}');

    expect(readReadingPosition("bayes", storage)).toBeNull();
  });
});
