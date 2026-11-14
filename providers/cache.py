"""Einfacher In-Memory-Cache (~5 Minuten)."""

from __future__ import annotations

import time
from typing import Any

_DEFAULT_TTL_S = 300.0
_store: dict[str, tuple[float, Any]] = {}


def get(key: str) -> Any | None:
    item = _store.get(key)
    if item is None:
        return None
    expires, value = item
    if time.monotonic() > expires:
        _store.pop(key, None)
        return None
    return value


def set(key: str, value: Any, ttl_s: float = _DEFAULT_TTL_S) -> None:
    _store[key] = (time.monotonic() + ttl_s, value)


def clear() -> None:
    _store.clear()
