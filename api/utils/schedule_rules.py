import calendar
from datetime import date
from typing import Iterable


def generate_nth_weekday_dates(
    year: int,
    start_month: int,
    end_month: int,
    weekday: int,
    ordinals: Iterable[int],
) -> list[date]:
    """Return sorted dates for selected nth weekday occurrences across a month range."""
    dates: list[date] = []

    for month in range(start_month, end_month + 1):
        month_weeks = calendar.monthcalendar(year, month)
        weekday_dates = [week[weekday] for week in month_weeks if week[weekday] != 0]

        for ordinal in ordinals:
            index = ordinal - 1
            if 0 <= index < len(weekday_dates):
                dates.append(date(year, month, weekday_dates[index]))

    return sorted(dates)


def chapter_season_2nd_3rd_saturdays(year: int) -> list[date]:
    """Rule: 2nd and 3rd Saturday, May through September."""
    return generate_nth_weekday_dates(
        year=year,
        start_month=5,
        end_month=9,
        weekday=calendar.SATURDAY,
        ordinals=(2, 3),
    )
