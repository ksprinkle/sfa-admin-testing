from slugify import slugify


def generate_unique_slug(db, model, title: str):
    """
    Generate a unique slug for a model based on title.
    """

    base_slug = slugify(title)
    slug = base_slug
    counter = 1

    while db.query(model).filter(model.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    return slug