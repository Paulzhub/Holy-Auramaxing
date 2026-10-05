import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";

import { globalErrorMessages } from "./global-error-messages";

describe("global error messages", () => {
  it("match messages/en.json exactly", () => {
    const subset = globalErrorMessages.en;
    expect(subset.app.tabName).toBe(en.app.tabName);
    expect(subset.meta).toEqual({ titleTemplate: en.meta.titleTemplate, error: en.meta.error });
    expect(subset.errors).toEqual({
      errorTitle: en.errors.errorTitle,
      errorBody: en.errors.errorBody,
      tryAgain: en.errors.tryAgain,
    });
  });
});
