import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MINUTE, NOW } from "./support/fixtures";
import { BoxSummary } from "@/components/portal/BoxSummary";
import { HoldBanner } from "@/components/portal/HoldBanner";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

/** How long after the server render the browser hydrates. */
const HYDRATION_DELAY = 3000;

const banner = (expiresAt: number) =>
  createElement(HoldBanner, { expiresAt, itemCount: 1, renderedAt: NOW });

const box = (expiresAt: number) =>
  createElement(BoxSummary, {
    holds: [{ id: "h1", productTitle: "Romper", size: "2T", expiresAt }],
    itemLimit: 10,
    hasAddress: true,
    renderedAt: NOW,
  });

function renderAt(at: number, element: ReactElement): string {
  vi.setSystemTime(at);
  return renderToString(element);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each([
  ["HoldBanner", banner],
  ["BoxSummary", box],
])("%s hydration", (_name, element) => {
  it.each([
    ["mid-hold", NOW + 20 * MINUTE],
    ["as it turns urgent", NOW + 2 * MINUTE + 1000],
    ["as it expires", NOW + 1000],
  ])("renders the same on the server and in the browser %s", (_when, expiresAt) => {
    const server = renderAt(NOW, element(expiresAt));
    const browser = renderAt(NOW + HYDRATION_DELAY, element(expiresAt));

    expect(browser).toBe(server);
  });

  it("counts down from the time the server rendered", () => {
    expect(renderAt(NOW + HYDRATION_DELAY, element(NOW + 20 * MINUTE))).toContain(
      "20:00",
    );
  });
});
