import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = ROOT / "sfa.db"
FEATURE = "beta_uat"
SCENARIO_VERSIONS = [
    "v0.2.0-rc.2-seed-healthy",
    "v0.2.0-rc.2-seed-ux",
    "v0.2.0-rc.2-seed-blocker",
]
TASK_KEYS = ["task_1", "task_2", "task_3", "task_4"]


def resolve_database_path() -> Path:
    raw_database_url = os.getenv("DATABASE_URL", "").strip()
    if raw_database_url in {"", "sqlite:///./api/sfa.db", "sqlite:///./sfa.db"}:
        return DEFAULT_DB_PATH
    if raw_database_url.startswith("sqlite:///"):
        return Path(raw_database_url.removeprefix("sqlite:///"))
    raise RuntimeError(f"Unsupported DATABASE_URL for seed script: {raw_database_url or '<empty>'}")


def compute_summary(responses: dict) -> dict:
    return {
        "overall_rating": responses.get("overall_rating"),
        "worked": sum(1 for key in TASK_KEYS if responses.get(key) == "worked"),
        "confusing": sum(1 for key in TASK_KEYS if responses.get(key) == "confusing"),
        "failed": sum(1 for key in TASK_KEYS if responses.get(key) == "failed"),
        "not_tested": sum(1 for key in TASK_KEYS if responses.get(key) == "not_tested"),
    }


SCENARIOS = {
    "v0.2.0-rc.2-seed-healthy": [
        {
            "time_to_complete": 58,
            "responses": {
                "task_1": "worked",
                "task_2": "worked",
                "task_3": "worked",
                "task_4": "worked",
                "comfortable": "yes",
                "overall_rating": "good",
                "task_notes": "Flow felt clear end to end.",
            },
        },
        {
            "time_to_complete": 72,
            "responses": {
                "task_1": "worked",
                "task_2": "worked",
                "task_3": "worked",
                "task_4": "worked",
                "comfortable": "yes",
                "overall_rating": "good",
                "anything_else": "Ready for another pass, but nothing blocked me.",
            },
        },
        {
            "time_to_complete": 66,
            "responses": {
                "task_1": "worked",
                "task_2": "worked",
                "task_3": "worked",
                "task_4": "worked",
                "comfortable": "yes",
                "overall_rating": "good",
                "missing": "No missing steps noticed.",
            },
        },
    ],
    "v0.2.0-rc.2-seed-ux": [
        {
            "time_to_complete": 84,
            "responses": {
                "task_1": "confusing",
                "task_2": "worked",
                "task_3": "confusing",
                "task_4": "worked",
                "comfortable": "yes",
                "overall_rating": "okay",
                "confusing": "I could finish, but I had to stop and think too much.",
            },
        },
        {
            "time_to_complete": 97,
            "responses": {
                "task_1": "worked",
                "task_2": "confusing",
                "task_3": "confusing",
                "task_4": "worked",
                "comfortable": "yes",
                "overall_rating": "okay",
                "task_notes": "Nothing broke, but labels felt ambiguous.",
            },
        },
        {
            "time_to_complete": 75,
            "responses": {
                "task_1": "worked",
                "task_2": "confusing",
                "task_3": "worked",
                "task_4": "not_tested",
                "comfortable": "yes",
                "overall_rating": "okay",
                "missing": "I did not realize the summary was part of the test path.",
            },
        },
    ],
    "v0.2.0-rc.2-seed-blocker": [
        {
            "time_to_complete": 43,
            "responses": {
                "task_1": "failed",
                "task_2": "worked",
                "task_3": "worked",
                "task_4": "worked",
                "comfortable": "yes",
                "overall_rating": "frustrating",
                "confusing": "I thought I finished, but the first step clearly went wrong.",
            },
        },
        {
            "time_to_complete": 121,
            "responses": {
                "task_1": "worked",
                "task_2": "failed",
                "task_3": "confusing",
                "task_4": "worked",
                "comfortable": "yes",
                "overall_rating": "frustrating",
                "task_notes": "I had to retry multiple times and still could not trust the output.",
            },
        },
        {
            "time_to_complete": 88,
            "responses": {
                "task_1": "worked",
                "task_2": "worked",
                "task_3": "failed",
                "task_4": "not_tested",
                "comfortable": "yes",
                "overall_rating": "okay",
                "anything_else": "Stopped once the review step broke.",
            },
        },
    ],
}


def seed_feedback() -> None:
    database_path = resolve_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    inserted = 0

    with sqlite3.connect(database_path) as connection:
        cursor = connection.cursor()
        cursor.execute(
            f"DELETE FROM feedback WHERE feature = ? AND version IN ({','.join('?' for _ in SCENARIO_VERSIONS)})",
            [FEATURE, *SCENARIO_VERSIONS],
        )

        for version, rows in SCENARIOS.items():
            for index, row in enumerate(rows):
                submitted_at = datetime.now(timezone.utc).isoformat()
                responses = row["responses"]
                summary = compute_summary(responses)
                cursor.execute(
                    """
                    INSERT INTO feedback (id, feature, version, responses, summary, time_to_complete, submitted_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        FEATURE,
                        version,
                        json.dumps(responses),
                        json.dumps(summary),
                        row["time_to_complete"],
                        submitted_at,
                    ),
                )
                inserted += 1
                print(f"seeded {version} sample {index + 1}")

        connection.commit()

    print(f"Seeded {inserted} feedback entries into {database_path}")
    print("Versions:")
    for version in SCENARIO_VERSIONS:
        print(f"- {version}")


if __name__ == "__main__":
    seed_feedback()