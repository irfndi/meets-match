from src.utils.errors import (
    AuthenticationError,
    ConfigurationError,
    DatabaseError,
    ExternalServiceError,
    MatchingError,
    MeetMatchError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)


def test_meetmatch_error_base():
    err = MeetMatchError("test error", 503, {"foo": "bar"})
    assert str(err) == "test error"
    assert err.message == "test error"
    assert err.status_code == 503
    assert err.details == {"foo": "bar"}


def test_meetmatch_error_defaults():
    err = MeetMatchError("test error")
    assert err.status_code == 500
    assert err.details == {}


def test_configuration_error():
    err = ConfigurationError("config error")
    assert isinstance(err, MeetMatchError)
    assert err.status_code == 500
    assert err.message == "config error"


def test_database_error():
    err = DatabaseError("db error")
    assert isinstance(err, MeetMatchError)
    assert err.status_code == 500
    assert err.message == "db error"


def test_validation_error():
    err = ValidationError("validation error")
    assert isinstance(err, MeetMatchError)
    assert err.status_code == 400
    assert err.message == "validation error"


def test_authentication_error():
    err = AuthenticationError("auth error")
    assert isinstance(err, MeetMatchError)
    assert err.status_code == 401
    assert err.message == "auth error"


def test_not_found_error():
    err = NotFoundError("not found")
    assert isinstance(err, MeetMatchError)
    assert err.status_code == 404
    assert err.message == "not found"


def test_rate_limit_error():
    err = RateLimitError("too many requests")
    assert isinstance(err, MeetMatchError)
    assert err.status_code == 429
    assert err.message == "too many requests"


def test_external_service_error():
    err = ExternalServiceError("service failed", "Telegram")
    assert isinstance(err, MeetMatchError)
    assert err.status_code == 502
    assert err.message == "service failed"
    assert err.details["service"] == "Telegram"


def test_matching_error():
    err = MatchingError("algorithm failed")
    assert isinstance(err, MeetMatchError)
    assert err.status_code == 500
    assert err.message == "algorithm failed"
