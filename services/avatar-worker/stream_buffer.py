"""Small bounded buffers used by the future low-latency replica transport."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from threading import Condition
from typing import Generic, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class BufferStats:
    queued: int
    dropped: int
    closed: bool


class LatestFrameBuffer(Generic[T]):
    """Bounded producer/consumer queue that drops stale frames under pressure.

    Keeping the newest frame is preferable to letting live avatar latency grow
    without bound. Presenter/batch rendering does not use this queue.
    """

    def __init__(self, capacity: int = 8) -> None:
        if capacity < 1:
            raise ValueError("capacity must be positive")
        self._items: deque[T] = deque(maxlen=capacity)
        self._condition = Condition()
        self._dropped = 0
        self._closed = False

    def put(self, item: T) -> None:
        with self._condition:
            if self._closed:
                raise RuntimeError("buffer is closed")
            if len(self._items) == self._items.maxlen:
                self._items.popleft()
                self._dropped += 1
            self._items.append(item)
            self._condition.notify()

    def get(self, timeout: float | None = None) -> T | None:
        with self._condition:
            self._condition.wait_for(lambda: bool(self._items) or self._closed, timeout)
            return self._items.popleft() if self._items else None

    def close(self) -> None:
        with self._condition:
            self._closed = True
            self._condition.notify_all()

    @property
    def stats(self) -> BufferStats:
        with self._condition:
            return BufferStats(len(self._items), self._dropped, self._closed)
