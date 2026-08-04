import { describe, expect, it } from "vitest";
import { VowHumansClient } from "./index.js";

describe("server SDK", () => {
  it("constructs outside a browser", () => expect(new VowHumansClient({ baseUrl: "https://example.test", apiKey: "test" })).toBeTruthy());
});

