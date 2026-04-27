import calendar
from datetime import date


def get_nth_weekday(year: int, month: int, weekday: int, n: int) -> date | None:
    if month < 1 or month > 12:
        raise ValueError("Month must be between 1 and 12")
    if weekday < 0 or weekday > 6:
        raise ValueError("Weekday must be between 0 and 6")
    if n < 1:
        raise ValueError("Week number must be >= 1")

    month_weeks = calendar.monthcalendar(year, month)
    weekday_dates = [week[weekday] for week in month_weeks if week[weekday] != 0]
    index = n - 1
    if index >= len(weekday_dates):
        return None

    return date(year, month, weekday_dates[index])


def generate_dates_from_template(template, year: int) -> list[date]:
    """Generate deterministic schedule dates from template nth-weekday fields."""
    if template.schedule_rule_type != "nth_weekday":
        raise ValueError(f"Unsupported schedule_rule_type: {template.schedule_rule_type}")

    months = sorted({int(month) for month in (template.schedule_months or [])})
    week_numbers = sorted({int(n) for n in (template.schedule_week_numbers or [])})
    weekday = int(template.schedule_weekday)

    dates: list[date] = []

    for month in months:
        for week_number in week_numbers:
            generated = get_nth_weekday(year, month, weekday, week_number)
            if generated is not None:
                dates.append(generated)

    return sorted(dates)
