import { describe, expect, it } from "vitest";
import { projectHref } from "../project-links";

describe("projectHref", () => {
  it("opens the workflow while there is still work to do", () => {
    expect(projectHref({ id: "prj_1", status: "draft" })).toBe("/project/prj_1");
    expect(projectHref({ id: "prj_1", status: "charter_confirmed" })).toBe("/project/prj_1");
    expect(projectHref({ id: "prj_1", status: "scored" })).toBe("/project/prj_1");
    expect(projectHref({ id: "prj_1", status: "approved" })).toBe("/project/prj_1");
  });

  it("opens the receipt once the payout has been sent", () => {
    expect(projectHref({ id: "prj_1", status: "paid" })).toBe("/receipt/prj_1");
  });
});
