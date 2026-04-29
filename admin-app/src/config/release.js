export const FEEDBACK_RELEASE = {
  appName: "SFA Admin",
  feature: "event_creation",
  featureLabel: "Event Creation",
  releaseLabel: "Event Creation Test",
  version: "v0.1",
  retestVersion: "v0.1.1",
}

export const FEEDBACK_SCENARIO_VERSIONS = [
  "v0.1-seed-healthy",
  "v0.1-seed-ux",
  "v0.1-seed-blocker",
]

export function getReleaseTag(version = FEEDBACK_RELEASE.version) {
  return `${FEEDBACK_RELEASE.appName} - ${version} (${FEEDBACK_RELEASE.releaseLabel})`
}