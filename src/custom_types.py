"""Type definitions for the MeetMatch bot."""

from typing import Any, Protocol


class D1Database(Protocol):
    """Protocol for Cloudflare D1 Database binding."""

    def prepare(self, query: str) -> Any: ...


class KVNamespace(Protocol):
    """Protocol for Cloudflare KV Namespace binding."""

    async def get(self, key: str, type: str = "text") -> Any: ...

    async def put(self, key: str, value: Any, expiration_ttl: int = 0) -> None: ...

    async def delete(self, key: str) -> None: ...


class Env(Protocol):
    """Protocol for Cloudflare environment bindings."""

    DB: D1Database
    KV: KVNamespace
    # Add other bindings like R2, Queues, etc., as needed
