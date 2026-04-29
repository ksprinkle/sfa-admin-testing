import random


def recommend_sessions(participant, sessions):
    recommendations = []

    for session in sessions:
        current_count = int(getattr(session, "current_count", 0) or 0)
        capacity = int(getattr(session, "capacity", 0) or 0)

        # Skip invalid or full sessions.
        if capacity <= 0 or current_count >= capacity:
            continue

        score = 0.0
        reasons = []

        # --- Capacity balancing (primary driver) ---
        fill_ratio = current_count / capacity
        capacity_score = (1 - fill_ratio) * 50
        score += capacity_score
        reasons.append("Capacity: helps balance session load")

        # --- Assistance balancing ---
        assistance_count = int(getattr(session, "assistance_count", 0) or 0)
        target_assistance = int(getattr(session, "target_assistance", 0) or 0)
        if bool(getattr(participant, "requires_assistance", False)):
            if assistance_count < target_assistance:
                score += 25
                reasons.append("Assistance: supports participant needs")
        else:
            if assistance_count > target_assistance:
                score += 10
                reasons.append("Assistance: supports participant needs")

        # --- Minor / Adult balancing ---
        minor_count = int(getattr(session, "minor_count", 0) or 0)
        target_minors = int(getattr(session, "target_minors", 0) or 0)
        if bool(getattr(participant, "is_minor", False)):
            if minor_count < target_minors:
                score += 20
                reasons.append("Age: improves group balance")
        else:
            if minor_count > target_minors:
                score += 10
                reasons.append("Age: improves group balance")

        # --- Soft spread to prevent stacking ---
        score += random.uniform(0, 5)

        recommendations.append({
            "session_id": session.id,
            "score": round(score, 2),
            "reasons": reasons,
        })

    # Sort highest -> lowest
    recommendations.sort(key=lambda x: x["score"], reverse=True)

    if not recommendations:
        # Fall back to the least-full sessions when balancing data is not usable.
        fallback = sorted(
            sessions,
            key=lambda session: (
                int(getattr(session, "current_count", 0) or 0)
                / max(int(getattr(session, "capacity", 1) or 1), 1)
            ),
        )

        return [
            {
                "session_id": session.id,
                "score": 0,
                "reasons": ["Fallback: lowest capacity"],
            }
            for session in fallback
            if int(getattr(session, "current_count", 0) or 0) < int(getattr(session, "capacity", 0) or 0)
        ][:3]

    return recommendations
