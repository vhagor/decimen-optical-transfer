// Platform detection and camera capability probing.
//
// Policy: probe (probeCameraCapabilities) wherever the behavior is probeable;
// the UA sniffs exist only for quirks that are not — frame-rate negotiation
// semantics, refusing a live applyConstraints, install-flow UI.

const nav = typeof navigator === "undefined" ? undefined : navigator;

/** Every iOS browser is WebKit (Chrome-on-iOS included), so this really means
 *  "mobile WebKit" — which is the axis the camera quirks vary on. iPadOS
 *  reports itself as MacIntel; the touch-point count is what gives it away. */
export const isIOS: boolean =
  !!nav &&
  (/iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1));

export const isAndroid: boolean = !!nav && /Android/.test(nav.userAgent);

// Chrome-on-Android extensions to the mediacapture spec that lib.dom doesn't
// type. iOS Safari exposes none of them, which is why every use sits behind
// a probe rather than a platform check.
type ExtendedCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  focusMode?: string[];
};
type ExtendedConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
  focusMode?: string;
};

export interface CameraCapabilities {
  /** Reported but deliberately unused: the sender is an emissive screen, so a
   *  flashlight adds glare, never light the camera was missing. */
  torch: boolean;
  continuousFocus: boolean;
  /** Highest frame rate the current camera mode reports, when it reports one. */
  maxFrameRate?: number;
  /** Widest capture the camera reports, when it reports one. */
  maxWidth?: number;
}

export function probeCameraCapabilities(track: MediaStreamTrack): CameraCapabilities {
  // getCapabilities itself is optional — Firefox shipped it years after the rest.
  const caps: ExtendedCapabilities = track.getCapabilities?.() ?? {};
  return {
    torch: caps.torch === true,
    continuousFocus: Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous"),
    maxFrameRate: caps.frameRate?.max,
    maxWidth: caps.width?.max,
  };
}

/** Best-effort advanced constraint; true when the camera took it. The spec
 *  says advanced sets never reject, but Chrome throws for torch anyway. */
export async function applyAdvancedConstraint(
  track: MediaStreamTrack,
  set: ExtendedConstraintSet,
): Promise<boolean> {
  try {
    await track.applyConstraints({ advanced: [set] });
    return true;
  } catch {
    return false;
  }
}

export type CameraAspect = "16:9" | "4:3";
export type CameraFpsMode = "exact" | "ideal";

export interface CameraAcquireAttempt {
  width: number;
  height: number;
  fpsMode: CameraFpsMode;
}

/** Phone 60 fps modes are video-shaped. 4:3 still-preview often locks 30. */
export function captureHeight(width: number, aspect: CameraAspect): number {
  return aspect === "16:9"
    ? Math.round((width * 9) / 16)
    : Math.round((width * 3) / 4);
}

/**
 * getUserMedia attempts in preference order: lock the requested fps on a
 * 16:9 video mode first, then the historical 4:3 path, then drop width
 * before accepting a slower stream.
 */
export function cameraAcquireAttempts(
  wantWidth: number,
  wantFps: number,
): CameraAcquireAttempt[] {
  const seen = new Set<string>();
  const attempts: CameraAcquireAttempt[] = [];
  const add = (width: number, aspect: CameraAspect, fpsMode: CameraFpsMode) => {
    const height = captureHeight(width, aspect);
    const key = `${width}x${height}:${fpsMode}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push({ width, height, fpsMode });
  };
  add(wantWidth, "16:9", "exact");
  add(wantWidth, "4:3", "exact");
  if (wantFps >= 60) {
    if (wantWidth > 1280) add(1280, "16:9", "exact");
    if (wantWidth > 960) add(960, "16:9", "exact");
  }
  add(wantWidth, "16:9", "ideal");
  add(wantWidth, "4:3", "ideal");
  return attempts;
}

/** NTSC 59.94 still counts as a 60 request. */
export function cameraMetRequestedFps(got: number | undefined, want: number): boolean {
  return (got ?? 0) + 0.5 >= want;
}
