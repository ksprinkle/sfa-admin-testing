from fastapi import Header


def is_admin(x_admin: str | None = Header(default=None)) -> bool:
    return x_admin == "true"
