from fastapi import Header


def is_admin(x_admin: bool = Header(False)):
    return x_admin
