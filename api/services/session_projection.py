"""
session_projection.py

Simulates future session fill by applying the next N unassigned participants
using deterministic session scoring (mirrors recommend_sessions logic but
strips the random jitter so projections are reproducible).

Pure function — no database access, no side effects.
"""


def _get_attr(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _session_id(session):
    return _get_attr(session, "session_id", _get_attr(session, "id"))


def _session_name(session):
    name = _get_attr(session, "name")
    return name if name else str(_session_id(session))


def _to_dict(session):
    """Normalise a session (ORM object or dict) into a mutable plain dict."""
    if isinstance(session, dict):
        return dict(session)
    return {
        "id": getattr(session, "id", None),
        "session_id": getattr(session, "session_id", None),
        "name": getattr(session, "name", None),
        "capacity": getattr(session, "capacity", 0),
        "current_count": getattr(session, "current_count", 0),
        "assistance_count": getattr(session, "assistance_count", 0),
        "target_assistance": getattr(session, "target_assistance", 0),
        "minor_count": getattr(session, "minor_count", 0),
        "target_minors": getattr(session, "target_minors", 0),
    }


def _score_session(participant, session):
    """
    Deterministic scoring that mirrors recommend_sessions() but omits
    the random jitter so projections always produce the same result.

    Returns None when the session is full or invalid.
    """
    current_count = _to_int(_get_attr(session, "current_count", 0))
    capacity = _to_int(_get_attr(session, "capacity", 0))

    if capacity <= 0 or current_count >= capacity:
        return None

    score = 0.0

    # Capacity balance (primary driver) — same weight as recommender
    fill_ratio = current_count / capacity
    score += (1.0 - fill_ratio) * 50.0

    requires_assistance = bool(_get_attr(participant, "requires_assistance", False))
    is_minor = bool(_get_attr(participant, "is_minor", False))

    assistance_count = _to_int(_get_attr(session, "assistance_count", 0))
    target_assistance = _to_int(_get_attr(session, "target_assistance", 0))
    minor_count = _to_int(_get_attr(session, "minor_count", 0))
    target_minors = _to_int(_get_attr(session, "target_minors", 0))

    if requires_assistance:
        if assistance_count < target_assistance:
            score += 25.0
    else:
        if assistance_count > target_assistance:
            score += 10.0

    if is_minor:
        if minor_count < target_minors:
            score += 20.0
    else:
        if minor_count > target_minors:
            score += 10.0

    # No random component — intentionally omitted for determinism
    return score


def _pick_best_session(participant, sessions):
    """Return the highest-scoring session dict, or None if all are full."""
    best = None
    best_score = -1.0
    for s in sessions:
        score = _score_session(participant, s)
        if score is not None and score > best_score:
            best_score = score
            best = s
    return best


def project_session_flow(participants, session_stats, limit=10):
    """
    Simulate assigning the next *limit* unassigned participants.

    Args:
        participants:  Ordered list of unassigned participants (dicts or ORM objects).
        session_stats: Current session state (dicts or ORM objects).
        limit:         Maximum number of participants to simulate (default 10).

    Returns:
        {
            "projections": [
                {
                    "step": int,
                    "participant_id": ...,
                    "assigned_session_id": ...
                },
                ...
            ],
            "final_state": list[dict],   # mutated copies of session_stats
            "warnings": list[str]
        }
    """
    # Deep-copy all sessions into plain dicts — originals are never touched.
    state = [_to_dict(s) for s in (session_stats or [])]

    projections = []
    warnings = []

    # Guard sets so we emit each session-level warning only once.
    warned_full = set()
    warned_assistance = set()
    warned_one_spot = set()

    for step, participant in enumerate(list(participants)[:limit], start=1):
        p_id = _get_attr(participant, "id", _get_attr(participant, "participant_id"))
        best = _pick_best_session(participant, state)

        if best is None:
            warnings.append({
                "session_id": None,
                "message": f"Step {step}: no available session for participant {p_id} — all sessions full",
            })
            continue

        sid = _session_id(best)
        name = _session_name(best)

        # Snapshot counts before mutation for cleaner warning messages.
        capacity = _to_int(best.get("capacity", 0))
        count_before = _to_int(best.get("current_count", 0))
        spots_remaining_before = max(capacity - count_before, 0)

        # Warn *before* assigning when only one spot will remain after this step.
        if spots_remaining_before == 2 and sid not in warned_one_spot:
            warned_one_spot.add(sid)
            warnings.append({
                "session_id": sid,
                "message": f"Session '{name}' will have only 1 spot left after step {step}",
            })

        projections.append({
            "step": step,
            "participant_id": p_id,
            "assigned_session_id": sid,
        })

        # Mutate the cloned state.
        requires_assistance = bool(_get_attr(participant, "requires_assistance", False))
        is_minor = bool(_get_attr(participant, "is_minor", False))

        best["current_count"] = count_before + 1
        if requires_assistance:
            best["assistance_count"] = _to_int(best.get("assistance_count", 0)) + 1
        if is_minor:
            best["minor_count"] = _to_int(best.get("minor_count", 0)) + 1

        count_after = best["current_count"]

        # Full warning.
        if capacity > 0 and count_after >= capacity and sid not in warned_full:
            warned_full.add(sid)
            warnings.append({
                "session_id": sid,
                "message": f"Session '{name}' is now full (projected at step {step})",
            })

        # Assistance overrun warning.
        target_assistance = _to_int(best.get("target_assistance", 0))
        assistance_after = _to_int(best.get("assistance_count", 0))
        if (
            target_assistance > 0
            and assistance_after > target_assistance
            and sid not in warned_assistance
        ):
            warned_assistance.add(sid)
            warnings.append({
                "session_id": sid,
                "message": f"Session '{name}' will exceed assistance target after step {step}",
            })

    # Summary pass — report sessions that are close to full in the final state
    # but were never flagged during the simulation (e.g. they were already near-full).
    for s in state:
        sid = _session_id(s)
        if sid in warned_full or sid in warned_one_spot:
            continue
        capacity = _to_int(s.get("capacity", 0))
        current = _to_int(s.get("current_count", 0))
        if capacity > 0:
            remaining = capacity - current
            if remaining == 1:
                name = _session_name(s)
                warnings.append({
                    "session_id": sid,
                    "message": f"Session '{name}' has 1 spot remaining after {limit} projected assignments",
                })

    return {
        "projections": projections,
        "final_state": state,
        "warnings": warnings,
    }
