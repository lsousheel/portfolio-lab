import { signalFor } from "../src/analysis.js";
import { indicators } from "../src/domain.js";

describe("Report 3 SMA/RSI suggestions", () => {
  it("returns insufficient data for a short historical series", () => {
    expect(signalFor(indicators([100, 101, 102], 1))).toBe("INSUFFICIENT_DATA");
  });
  it("does not automatically recommend buying an overbought uptrend", () => {
    const prices = Array.from({length: 300}, (_, i) => 10 + i * 0.2);
    expect(signalFor(indicators(prices, 1))).toBe("WAIT");
  });
  it("does not suggest buying in a downtrend", () => {
    const prices = Array.from({length: 300}, (_, i) => 300 - i * 0.2);
    expect(signalFor(indicators(prices, 1))).toBe("WAIT");
  });
});
