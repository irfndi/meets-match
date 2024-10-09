from yoyo import step

__depends__ = {'20240308_01_initial'}

steps = [
    step(
        "ALTER TABLE users ADD COLUMN media JSONB",
        "ALTER TABLE users DROP COLUMN media"
    )
]