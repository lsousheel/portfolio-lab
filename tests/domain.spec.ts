import { horizon, indicators, money, rsi, sma } from "../src/domain.js";

describe("Historical technical-analysis calculations", () => {
  it("calculates moving averages and handles insufficient history", () => {
    expect(sma([1, 2, 3, 4], 3)).toBe(3);
    expect(sma([1], 2)).toBeNull();
  });
  it("calculates RSI from gains and losses", () => {
    expect(rsi([10, 11, 10, 11], 3)).toBeCloseTo(66.6666667, 6);
    expect(rsi(Array(15).fill(10))).toBe(50);
  });
  it("supports the three investment horizons", () => {
    expect([1,2,5].map(h => horizon(h).slow)).toEqual([100,100,200]);
    expect(() => horizon(3)).toThrow();
  });
  it("detects SMA uptrend and downtrend", () => {
    expect(indicators([...Array(100).fill(10), 100], 1).signal).toBe("uptrend");
    expect(indicators([...Array(100).fill(10), 1], 1).signal).toBe("downtrend");
  });
  it("handles money precisely", () => {
    expect(money("0.1").plus("0.2").toFixed(2)).toBe("0.30");
  });
});
