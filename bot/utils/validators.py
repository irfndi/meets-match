from .constants import MIN_AGE, MAX_AGE

def validate_age(age: str, min_age: int = MIN_AGE, max_age: int = MAX_AGE) -> bool:
    try:
        age_int = int(age)
        return min_age <= age_int <= max_age
    except ValueError:
        return False

def validate_gender(gender: str) -> bool:
    return gender.lower() in ['male', 'female', 'other']