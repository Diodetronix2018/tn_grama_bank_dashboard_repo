"""The one interface every data source implements.

Everything above this layer -- the API routes, the response models, the
frontend -- talks to `DataSource.list_branches()` and never knows or cares
whether the answer came from generated sample data or a real DynamoDB
scan. Swapping the backing store is a one-file change (see
`app/data/__init__.py`), by design.
"""

from abc import ABC, abstractmethod

from app.models import Branch


class DataSource(ABC):
    @abstractmethod
    def list_branches(self) -> list[Branch]:
        """Return every branch record, in the dashboard's expected shape."""
        raise NotImplementedError
