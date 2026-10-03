import assert from "node:assert/strict";

export function assertSupportedProjectVersion(version) {
  assert.match(
    version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    "The project version must be a stable semantic version",
  );
  const parts = version.split(".").map(Number);
  assert.ok(parts.every(Number.isSafeInteger), "Version numbers must be safe integers");
  const [major, minor] = parts;
  assert.ok(
    major > 1 || (major === 1 && minor >= 5),
    "The supported project baseline is 1.5.0 or a later stable version",
  );
}
