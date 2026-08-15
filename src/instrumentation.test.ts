import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startRefreshJobMock = vi.fn();
vi.mock("./server/refresh", () => ({
  startRefreshJob: startRefreshJobMock,
}));

import { register } from "./instrumentation";

describe("instrumentation register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts the refresh job in production on the Node runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();
    expect(startRefreshJobMock).toHaveBeenCalledTimes(1);
  });

  it("does not start the job when NODE_ENV is not production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();
    expect(startRefreshJobMock).not.toHaveBeenCalled();
  });

  it("does not start the job on a non-Node runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(startRefreshJobMock).not.toHaveBeenCalled();
  });
});
