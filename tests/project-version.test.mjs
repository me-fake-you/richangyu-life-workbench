import assert from "node:assert/strict";
import test from "node:test";
import { assertSupportedProjectVersion } from "./helpers/project-version.mjs";

test("project checks accept the current and later stable baselines", () => {
  for (const version of ["1.5.0", "1.5.1", "1.6.0", "2.0.0"]) {
    assert.doesNotThrow(() => assertSupportedProjectVersion(version));
  }
});

test("project checks reject versions older than the supported baseline", () => {
  for (const version of ["0.9.0", "1.0.0", "1.4.99"]) {
    assert.throws(() => assertSupportedProjectVersion(version));
  }
});

test("project checks reject unstable, malformed or unsafe versions", () => {
  for (const version of [
    "", "1.6", "v1.6.0", "1.6.0-preview", "1.6.0+build",
    "01.6.0", "-1.6.0", "9007199254740992.0.0",
    undefined, null, 1.6,
  ]) {
    assert.throws(() => assertSupportedProjectVersion(version));
  }
});
