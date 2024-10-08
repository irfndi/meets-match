def validate_age(age: str, min_age: int, max_age: int) -> bool:
    try:
        age_int = int(age)
        return min_age <= age_int <= max_age
    except ValueError:
        return False

def validate_gender(gender: str) -> bool:
    valid_genders = ['male', 'female', 'other']
    return gender.lower() in valid_genders