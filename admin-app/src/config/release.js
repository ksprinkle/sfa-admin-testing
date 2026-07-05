export const FEEDBACK_RELEASE = {
  appName: "SFA Admin",
  feature: "event_creation",
  featureLabel: "Event Creation",
  releaseLabel: "Beta Release Candidate",
  version: "v0.2.0-rc.1",
  retestVersion: "v0.2.0-rc.2",
}

export const FEEDBACK_SCENARIO_VERSIONS = [
  "v0.2.0-rc.1-seed-healthy",
  "v0.2.0-rc.1-seed-ux",
  "v0.2.0-rc.1-seed-blocker",
]

export function getReleaseTag(version = FEEDBACK_RELEASE.version) {
  return `${FEEDBACK_RELEASE.appName} - ${version} (${FEEDBACK_RELEASE.releaseLabel})`
}