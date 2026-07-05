export const FEEDBACK_RELEASE = {
  appName: "SFA Admin",
  feature: "beta_uat",
  featureLabel: "Beta Evaluation",
  releaseLabel: "v0.2.0-rc.2 Beta Evaluation",
  version: "v0.2.0-rc.2",
  retestVersion: "v0.2.0-rc.2-retest",
}

export const FEEDBACK_SCENARIO_VERSIONS = [
  "v0.2.0-rc.2-seed-healthy",
  "v0.2.0-rc.2-seed-ux",
  "v0.2.0-rc.2-seed-blocker",
]

export function getReleaseTag(version = FEEDBACK_RELEASE.version) {
  return `${FEEDBACK_RELEASE.appName} - ${version} (${FEEDBACK_RELEASE.releaseLabel})`
}