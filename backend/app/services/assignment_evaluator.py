def _get_value(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def _to_bool(value):
    return bool(value)


def _session_id(session):
    return _get_value(session, "session_id", _get_value(session, "id"))


def _assignment_penalty(participant, session):
    capacity = _to_int(_get_value(session, "capacity", 0))
    current_count = _to_int(_get_value(session, "current_count", 0))
    assistance_count = _to_int(_get_value(session, "assistance_count", 0))
    target_assistance = _to_int(_get_value(session, "target_assistance", 0))
    minor_count = _to_int(_get_value(session, "minor_count", 0))
    target_minors = _to_int(_get_value(session, "target_minors", 0))

    requires_assistance = _to_bool(_get_value(participant, "requires_assistance", False))
    is_minor = _to_bool(_get_value(participant, "is_minor", False))

    if capacity <= 0 or current_count >= capacity:
        return float("inf")

    next_count = current_count + 1
    next_assistance = assistance_count + (1 if requires_assistance else 0)
    next_minor = minor_count + (1 if is_minor else 0)

    # Lower penalty means a better target session.
    penalty = (next_count / capacity) * 100

    if next_assistance > target_assistance:
        penalty += 20 + (next_assistance - target_assistance) * 5

    if abs(next_minor - target_minors) > abs(minor_count - target_minors):
        penalty += 15

    return penalty


def evaluate_assignment(participant, session, session_stats):
    messages = []
    status = "good"

    capacity = _to_int(_get_value(session, "capacity", 0))
    current_count = _to_int(_get_value(session, "current_count", 0))
    assistance_count = _to_int(_get_value(session, "assistance_count", 0))
    target_assistance = _to_int(_get_value(session, "target_assistance", 0))
    minor_count = _to_int(_get_value(session, "minor_count", 0))
    target_minors = _to_int(_get_value(session, "target_minors", 0))

    requires_assistance = _to_bool(_get_value(participant, "requires_assistance", False))
    is_minor = _to_bool(_get_value(participant, "is_minor", False))

    if capacity <= 0 or current_count >= capacity:
        result = {
            "status": "avoid",
            "messages": ["Session is full"],
        }
        return result

    fill_ratio = current_count / capacity if capacity > 0 else 1.0
    if fill_ratio > 0.9:
        status = "warn"
        messages.append("Capacity: session is nearly full")

    next_assistance = assistance_count + (1 if requires_assistance else 0)
    if next_assistance > target_assistance:
        status = "warn"
        messages.append("Assistance: may overbalance support")

    next_minor = minor_count + (1 if is_minor else 0)
    if abs(next_minor - target_minors) > abs(minor_count - target_minors):
        status = "warn"
        messages.append("Age: may reduce group balance")

    current_penalty = _assignment_penalty(participant, session)
    best_session = None
    best_penalty = float("inf")

    for candidate in session_stats or []:
        candidate_id = _session_id(candidate)
        if candidate_id is None:
            continue
        if str(candidate_id) == str(_session_id(session)):
            continue

        candidate_penalty = _assignment_penalty(participant, candidate)
        if candidate_penalty < best_penalty:
            best_penalty = candidate_penalty
            best_session = candidate

    suggested_alternative_session_id = None
    if best_session is not None and current_penalty - best_penalty >= 12:
        suggested_alternative_session_id = _session_id(best_session)
        if suggested_alternative_session_id is not None:
            status = "warn" if status != "avoid" else status
            messages.append("Capacity: better option available")

    if not messages and status == "good":
        messages.append("Capacity: good session choice")

    result = {
        "status": status,
        "messages": messages,
    }

    if suggested_alternative_session_id is not None:
        result["suggested_alternative_session_id"] = suggested_alternative_session_id

    return result
