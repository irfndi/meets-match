"""Database connection utilities for the MeetMatch bot using PostgreSQL."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import sentry_sdk
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, and_, create_engine, or_
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from src.config import settings
from src.utils.errors import DatabaseError
from src.utils.logging import get_logger

logger = get_logger(__name__)


def utcnow() -> datetime:
    """Get current UTC time (naive) to replace datetime.utcnow()."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""

    pass


class UserDB(Base):
    """User database model."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    interests: Mapped[List[str]] = mapped_column(JSON, default=list)
    photos: Mapped[List[str]] = mapped_column(JSON, default=list)
    location_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    location_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    preferences: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_sleeping: Mapped[bool] = mapped_column(Boolean, default=False)
    is_profile_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    last_active: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_reminded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class MatchDB(Base):
    """Match database model."""

    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    user1_id: Mapped[str] = mapped_column(String(50), ForeignKey("users.id"))
    user2_id: Mapped[str] = mapped_column(String(50), ForeignKey("users.id"))
    user1_action: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    user2_action: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    score_total: Mapped[float] = mapped_column(Float, default=0.0)
    score_location: Mapped[float] = mapped_column(Float, default=0.0)
    score_interests: Mapped[float] = mapped_column(Float, default=0.0)
    score_preferences: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    matched_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expired_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class DeletedMediaDB(Base):
    """Deleted media tracking model for soft delete and 365-day retention."""

    __tablename__ = "deleted_media"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(50), ForeignKey("users.id"), index=True)
    file_path: Mapped[str] = mapped_column(String(500))
    deleted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    reason: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_purged: Mapped[bool] = mapped_column(Boolean, default=False)


class Database:
    """Singleton database connection manager."""

    _engine = None
    _session_factory = None

    @classmethod
    def get_engine(cls) -> Any:
        """Get or create the database engine."""
        if cls._engine is None:
            from src.config import get_settings

            settings = get_settings()
            database_url = settings.DATABASE_URL

            if not database_url:
                raise DatabaseError("DATABASE_URL is not configured")

            # Fix for SQLAlchemy 1.4+ which requires postgresql:// instead of postgres://
            if database_url and database_url.startswith("postgres://"):
                database_url = database_url.replace("postgres://", "postgresql://", 1)

            try:
                cls._engine = create_engine(database_url, pool_recycle=300, pool_pre_ping=True, echo=settings.DEBUG)
                logger.info("Database engine created")
            except Exception as e:
                # Log redacted URL for debugging
                safe_url = database_url
                if "@" in safe_url:
                    try:
                        part1, part2 = safe_url.rsplit("@", 1)
                        if ":" in part1:
                            scheme_user, _ = part1.rsplit(":", 1)
                            safe_url = f"{scheme_user}:***@{part2}"
                    except Exception:
                        safe_url = "REDACTED_MALFORMED_URL"

                logger.error("Failed to create database engine", error=str(e), url=safe_url)
                raise DatabaseError("Failed to connect to database", details={"error": str(e), "url": safe_url}) from e
        return cls._engine

    @classmethod
    def get_session_factory(cls) -> Any:
        """Get or create the session factory."""
        if cls._session_factory is None:
            cls._session_factory = sessionmaker(bind=cls.get_engine())
        return cls._session_factory

    @classmethod
    def get_session(cls) -> Session:
        """Get a new database session."""
        return cls.get_session_factory()()  # type: ignore

    @classmethod
    def create_tables(cls) -> None:
        """Create all database tables."""
        engine = cls.get_engine()
        Base.metadata.create_all(engine)
        logger.info("Database tables created")


def get_session() -> Session:
    """Get a database session."""
    return Database.get_session()


def init_database() -> None:
    """Initialize the database and create tables."""
    Database.create_tables()


def execute_query(
    table: str,
    query_type: str,
    filters: Optional[Dict[str, Any]] = None,
    data: Optional[Dict[str, Any]] = None,
    select: str = "*",
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    order_by: Optional[str] = None,
) -> Any:
    """Execute a query on the database (compatibility wrapper).

    Args:
        table: Table name
        query_type: Query type (select, insert, update, delete)
        filters: Query filters
        data: Data for insert/update operations
        select: Fields to select
        limit: Max number of records to return
        offset: Number of records to skip
        order_by: Field to sort by (e.g. "created_at desc")

    Returns:
        Query result
    """
    session = get_session()
    filters = filters or {}
    data = data or {}

    model_map = {
        "users": UserDB,
        "matches": MatchDB,
        "deleted_media": DeletedMediaDB,
    }

    model = model_map.get(table)
    if not model:
        raise ValueError(f"Unknown table: {table}")

    try:
        # Trace database operation
        span = None
        if settings.SENTRY_DSN:
            span = sentry_sdk.start_span(op="db.query", name=f"{query_type.upper()} {table}")
            span.set_data("table", table)
            span.set_data("query_type", query_type)
            if filters:
                span.set_data("filters", str(filters))
        # Transform user data if needed
        if table == "users" and data:
            data = _transform_user_data(data)

        if query_type == "select":
            query = session.query(model)
            for key, value in filters.items():
                if key == "$or":
                    # Handle OR condition
                    # Expects value to be a list of dicts: [{"field": value}, {"field": value}]
                    # Each dict can have multiple fields that are ANDed together
                    or_conditions = []
                    for condition in value:
                        and_conditions = []
                        for k, v in condition.items():
                            and_conditions.append(getattr(model, k) == v)
                        if and_conditions:
                            # AND together all conditions within each OR clause
                            or_conditions.append(
                                and_(*and_conditions) if len(and_conditions) > 1 else and_conditions[0]
                            )
                    if or_conditions:
                        query = query.filter(or_(*or_conditions))
                elif "__" in key:
                    # Handle special operators (gte, lte, in)
                    field_name, op = key.rsplit("__", 1)
                    if hasattr(model, field_name):
                        column = getattr(model, field_name)
                        if op == "gte":
                            query = query.filter(column >= value)
                        elif op == "lte":
                            query = query.filter(column <= value)
                        elif op == "gt":
                            query = query.filter(column > value)
                        elif op == "lt":
                            query = query.filter(column < value)
                        elif op == "in":
                            query = query.filter(column.in_(value))
                        elif op == "like":
                            query = query.filter(column.like(value))
                        elif op == "ilike":
                            query = query.filter(column.ilike(value))
                        else:
                            # Fallback to exact match if operator not recognized
                            query = query.filter(column == value)
                else:
                    query = query.filter(getattr(model, key) == value)

            # Handle sorting
            if order_by:
                parts = order_by.split()
                field_name = parts[0]
                direction = parts[1].lower() if len(parts) > 1 else "asc"
                if hasattr(model, field_name):
                    col = getattr(model, field_name)
                    if direction == "desc":
                        query = query.order_by(col.desc())
                    else:
                        query = query.order_by(col.asc())

            # Handle pagination
            if limit:
                query = query.limit(limit)
            if offset:
                query = query.offset(offset)

            results = query.all()
            session.close()

            if span:
                span.set_data("row_count", len(results))

            return type("Result", (), {"data": [_model_to_dict(r) for r in results]})()

        elif query_type == "insert":
            instance = model(**data)
            session.add(instance)
            session.commit()
            result = _model_to_dict(instance)
            session.close()

            return type("Result", (), {"data": [result]})()

        elif query_type == "update":
            if table == "users" and "preferences" in data:
                logger.debug("Updating users table with preferences", data_preferences=data["preferences"])

            query = session.query(model)
            for key, value in filters.items():
                query = query.filter(getattr(model, key) == value)

            # Check if record exists before update
            exists = query.first()
            if not exists:
                logger.error("Record not found for update", table=table, filters=filters)
                session.close()

                if span:
                    span.set_status("not_found")

                return type("Result", (), {"data": []})()

            updated_count = query.update(data)  # type: ignore
            logger.debug("Update count", count=updated_count, table=table)

            session.commit()
            # Fetch updated records
            updated_query = session.query(model)
            for key, value in filters.items():
                updated_query = updated_query.filter(getattr(model, key) == value)
            results = updated_query.all()

            if table == "users" and results:
                logger.debug("Updated user record", user_preferences=getattr(results[0], "preferences", None))

            session.close()

            if span:
                span.set_data("updated_count", updated_count)

            return type("Result", (), {"data": [_model_to_dict(r) for r in results]})()

        elif query_type == "delete":
            query = session.query(model)
            for key, value in filters.items():
                query = query.filter(getattr(model, key) == value)
            query.delete()
            session.commit()
            session.close()

            return type("Result", (), {"data": []})()

        else:
            raise ValueError(f"Invalid query type: {query_type}")

    except Exception as e:
        if span:
            span.set_status("internal_error")

        session.rollback()
        session.close()
        logger.error(
            f"Failed to execute {query_type} query on {table}",
            error=str(e),
            filters=filters,
            data=data,
        )
        raise DatabaseError(
            f"Database operation failed: {query_type} on {table}",
            details={"error": str(e), "filters": filters, "data": data},
        ) from e


def _transform_user_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Transform User model data to UserDB schema.

    Flattens nested location and preferences fields.
    """
    transformed = data.copy()

    # Flatten location if present
    if "location" in transformed:
        location = transformed.pop("location")
        if location is not None and isinstance(location, dict):
            transformed["location_latitude"] = location.get("latitude")
            transformed["location_longitude"] = location.get("longitude")
            transformed["location_city"] = location.get("city")
            transformed["location_country"] = location.get("country")
        # If location is None, just remove it (don't add location fields)

    # Preferences stays as JSON, but ensure it's a dict
    if "preferences" in transformed and transformed["preferences"] is not None:
        if not isinstance(transformed["preferences"], dict):
            transformed["preferences"] = {}

    return transformed


def _model_to_dict(model: Any) -> Dict[str, Any]:
    """Convert a SQLAlchemy model to a dictionary."""
    result = {c.name: getattr(model, c.name) for c in model.__table__.columns}

    # Reconstruct location object from flat fields for UserDB
    if hasattr(model, "location_latitude"):
        if result.get("location_latitude") is not None:
            result["location"] = {
                "latitude": result.pop("location_latitude"),
                "longitude": result.pop("location_longitude"),
                "city": result.pop("location_city"),
                "country": result.pop("location_country"),
            }
        else:
            # Keep flat city/country fields for display when coordinates are missing
            # but do not reconstruct nested location
            result.pop("location_latitude", None)
            result.pop("location_longitude", None)
            result["location"] = None

    return result
