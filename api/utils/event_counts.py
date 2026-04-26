def surfer_count(event):
    return len([
        p for p in event.participants
        if p.removed_at is None and (p.checked_in or (p.role == "surfer" and not p.is_waitlisted))
    ])


def waitlist_count(event):
    return len([
        p for p in event.participants
        if p.removed_at is None and p.role == "surfer" and p.is_waitlisted
    ])


def volunteer_count(event):
    return len([
        p for p in event.participants
        if p.removed_at is None and p.role == "volunteer"
    ])


def checked_in_count(event):
    return len([
        p for p in event.participants
        if p.removed_at is None and p.checked_in
    ])