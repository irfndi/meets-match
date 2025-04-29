"""Database connection utilities for the MeetMatch bot."""

from typing import Any, Dict, Optional

from supabase import Client, create_client

from src.config import settings
from src.utils.errors import DatabaseError
from src.utils.logging import get_logger

logger = get_logger(__name__)


class SupabaseClient:
    """Singleton class for Supabase client."""

    _instance: Optional[Client] = None

    @classmethod
    def get_client(cls) -> Client:
        """Get or create a Supabase client instance.

        Returns:
            Supabase client instance

        Raises:
            DatabaseError: If connection fails
        """
        if cls._instance is None:
            try:
                cls._instance = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
                logger.info("Supabase client initialized")
            except Exception as e:
                logger.error(
                    "Failed to initialize Supabase client",
                    error=str(e),
                    url=settings.SUPABASE_URL,
                )
                raise DatabaseError(
                    "Failed to connect to Supabase",
                    details={"error": str(e)},
                ) from e
        return cls._instance


def execute_query(
    table: str,
    query_type: str,
    filters: Optional[Dict[str, Any]] = None,
    data: Optional[Dict[str, Any]] = None,
    select: str = "*",
) -> Any:
    """Execute a query on Supabase.

    Args:
        table: Table name
        query_type: Query type (select, insert, update, delete)
        filters: Query filters
        data: Data for insert/update operations
        select: Fields to select

    Returns:
        Query result

    Raises:
        DatabaseError: If query execution fails
    """
    client = SupabaseClient.get_client()
    filters = filters or {}
    data = data or {}

    try:
        if query_type == "select":
            query = client.table(table).select(select)
            for key, value in filters.items():
                query = query.eq(key, value)
            return query.execute()
        elif query_type == "insert":
            return client.table(table).insert(data).execute()
        elif query_type == "update":
            query = client.table(table).update(data)
            for key, value in filters.items():
                query = query.eq(key, value)
            return query.execute()
        elif query_type == "delete":
            query = client.table(table).delete()
            for key, value in filters.items():
                query = query.eq(key, value)
            return query.execute()
        else:
            raise ValueError(f"Invalid query type: {query_type}")
    except Exception as e:
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
