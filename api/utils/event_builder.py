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
            "vendor_open": event.vendor_open,
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

        featured_image=event.featured_image,

        participant_count=event.surfer_count,
        waitlist_count=event.waitlist_count,
        checked_in_count=event.checked_in_count,
    )