import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraAcquireAttempts,
  cameraMetRequestedFps,
  captureHeight,
} from "../shared/platform.ts";

test("16:9 is the 720p-class video mode, 4:3 is the still preview", () => {
  assert.equal(captureHeight(1280, "16:9"), 720);
  assert.equal(captureHeight(1280, "4:3"), 960);
  assert.equal(captureHeight(1920, "16:9"), 1080);
});

test("a 60 fps request tries 16:9 exact first and drops width before ideal", () => {
  const attempts = cameraAcquireAttempts(1920, 60);
  assert.deepEqual(
    attempts.map((a) => `${a.width}x${a.height}:${a.fpsMode}`),
    [
      "1920x1080:exact",
      "1920x1440:exact",
      "1280x720:exact",
      "960x540:exact",
      "1920x1080:ideal",
      "1920x1440:ideal",
    ],
  );
});

test("1280@60 does not invent a wider mode, but still offers 960 as a 60 fps fallback", () => {
  const attempts = cameraAcquireAttempts(1280, 60);
  assert.deepEqual(
    attempts.map((a) => `${a.width}x${a.height}:${a.fpsMode}`),
    ["1280x720:exact", "1280x960:exact", "960x540:exact", "1280x720:ideal", "1280x960:ideal"],
  );
});

test("a 30 fps request stays at the chosen width — dropping res is a 60 fps trade", () => {
  const attempts = cameraAcquireAttempts(1920, 30);
  assert.equal(
    attempts.some((a) => a.width < 1920),
    false,
  );
  assert.equal(attempts[0]?.fpsMode, "exact");
  assert.equal(attempts.at(-1)?.fpsMode, "ideal");
});

test("59.94 counts as making a 60 fps request", () => {
  assert.equal(cameraMetRequestedFps(59.94, 60), true);
  assert.equal(cameraMetRequestedFps(30, 60), false);
  assert.equal(cameraMetRequestedFps(undefined, 60), false);
});
