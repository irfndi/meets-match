"""Base model for testing."""

import uuid
from datetime import datetime
from typing import Any, Dict


class Model:
    """Base model class for mocks."""

    def __init__(self, **kwargs):
        """Initialize model with attributes.

        Args:
            **kwargs: Key-value pairs of attributes to set
        """
        if "id" not in kwargs:
            kwargs["id"] = str(uuid.uuid4())
        if "created_at" not in kwargs:
            kwargs["created_at"] = datetime.now().isoformat()
        if "updated_at" not in kwargs:
            kwargs["updated_at"] = kwargs["created_at"]

        self.__dict__.update(kwargs)

    def __getattr__(self, attr):
        """Handle access to non-existent attributes.

        Args:
            attr: The attribute name being accessed

        Returns:
            None: Default to None for missing attributes
        """
        return None

    def dict(self) -> Dict[str, Any]:
        """Convert model to dictionary.

        Returns:
            Dict[str, Any]: Dictionary representation of model
        """
        return dict(self.__dict__)

    @classmethod
    async def get(cls, id, **kwargs):
        """Mock database get method.

        Args:
            id: ID to fetch
            **kwargs: Additional query parameters

        Returns:
            Model: A new instance of this model
        """
        if hasattr(cls, "instances"):
            for instance in getattr(cls, "instances"):
                if instance.id == id:
                    return instance
        # Return a new instance if not found
        return cls(id=id, **kwargs)

    @classmethod
    async def create(cls, **kwargs):
        """Mock database create method.

        Args:
            **kwargs: Attributes for the new instance

        Returns:
            Model: A new instance of this model
        """
        instance = cls(**kwargs)
        if hasattr(cls, "instances"):
            getattr(cls, "instances").append(instance)
        return instance

    @classmethod
    async def filter(cls, **kwargs):
        """Mock database filter method.

        Args:
            **kwargs: Filter criteria

        Returns:
            list: List of matching instances or empty list
        """
        if not hasattr(cls, "instances"):
            return []
        
        results = []
        for instance in getattr(cls, "instances"):
            matches = True
            for key, value in kwargs.items():
                if getattr(instance, key, None) != value:
                    matches = False
                    break
            if matches:
                results.append(instance)
        
        return results
