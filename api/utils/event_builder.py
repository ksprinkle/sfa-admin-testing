from api.schemas.events import AdminEventListOut
from api.utils.event_counts import (
    surfer_count,
    waitlist_count,
    volunteer_count,
    checked_in_count,
)

def build_admin_event(event):

    return AdminEventListOut(
        id=event.id,
        title=event.title,
        slug=event.slug,
        event_type=event.event_type,
        status=event.status,
        start_date=event.start_date,
        end_date=event.end_date,
        start_time=event.start_time,
        end_time=event.end_time,
        timezone=event.timezone,

        location={
            "venue": event.venue,
            "city": event.city,
            "state": event.state,
            "latitude": event.latitude,
            "longitude": event.longitude,
            "beach_accessibility": event.beach_accessibility,
        },

        capacity={
            "participants": event.participant_capacity,
            "volunteers": event.volunteer_capacity,
        },

        registration={
            "participant_open": event.participant_open,
            "volunteer_open": event.volunteer_open,
            "exhibitor_open": event.exhibitor_open,
        },

        availability={
            "participant_available": (
                event.participant_open
                and (
                    event.participant_capacity is None
                    or event.surfer_count < event.participant_capacity
                )
            ),
            "volunteer_available": (
                event.volunteer_open
                and (
                    event.volunteer_capacity is None
                    or event.volunteer_count < event.volunteer_capacity
                )
            ),
        },

        website_schedule_published=event.website_schedule_published,
        beach_access_notes=event.beach_access_notes,
        directions=event.directions,
        parking_info=event.parking_info,
        lodging_info=event.lodging_info,
        map_url=event.map_url,
        weather_report_url=event.weather_report_url,
        surf_report_url=event.surf_report_url,
        internal_notes=event.internal_notes,

        featured_image=event.featured_image,

        sessions=sorted(
            [
                {
                    "id": str(s.id),
                    "name": s.name,
                    "start_time": s.start_time.isoformat() if s.start_time else None,
                    "capacity": s.capacity,
                    "participant_count": len([
                        p for p in event.participants
                        if p.removed_at is None
                        and p.session_id == s.id
                        and (p.role or "").strip().lower() != "volunteer"
                        and not p.is_waitlisted
                    ]),
                }
                for s in event.sessions
            ],
            key=lambda s: (s["start_time"] or "", s["name"]),
        ),

        # Event card capacity uses confirmed participant registrations only,
        # excluding volunteers and waitlisted surfers.
        participant_count=len([
            p for p in event.participants
            if p.removed_at is None
            and (p.role or "").strip().lower() != "volunteer"
            and not p.is_waitlisted
        ]),
        waitlist_count=event.waitlist_count,
        checked_in_count=event.checked_in_count,
    )