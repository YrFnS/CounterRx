// @vitest-environment jsdom
import "../i18n";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ErrorBoundary from "../ErrorBoundary";
import { isSentryConfigured, initSentry, captureException } from "../lib/sentry";
import { captureException as sdkCaptureException } from "@sentry/react";

/* Mock the SDK so we can observe forwarding without needing a DSN. */
vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

afterEach(cleanup);

/* Throwing component — React logs the caught error to console.error. */
function Bomb(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeTruthy();
  });

  it("renders friendly fallback with error message + reload button on child crash", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("kaboom")).toBeTruthy();
    /* jsdom cannot navigate — presence asserted; reload wiring is one-line glue */
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();

    errSpy.mockRestore();
  });
});

describe("sentry flag-off default", () => {
  it("init/captureException are safe no-ops without VITE_SENTRY_DSN", () => {
    expect(process.env.VITE_SENTRY_DSN).toBeUndefined();
    expect(isSentryConfigured).toBe(false);
    expect(() => initSentry()).not.toThrow();
    expect(() =>
      captureException(new Error("should be swallowed")),
    ).not.toThrow();
  });

  it("captureException never reaches the SDK while unconfigured", () => {
    captureException(new Error("flag-off"));
    expect(vi.mocked(sdkCaptureException)).not.toHaveBeenCalled();
  });
});
