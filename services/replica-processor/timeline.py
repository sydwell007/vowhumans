"""Timeline conversion shared by capture validation and lightweight tests."""


def normalise_chapter_range(
    source_duration_ms: int,
    trim_start_ms: int | None,
    trim_end_ms: int | None,
    declared_source_duration_ms: int | None = None,
) -> tuple[int, int]:
    start_ms = trim_start_ms or 0
    end_ms = trim_end_ms or source_duration_ms
    if declared_source_duration_ms is not None and trim_end_ms is not None:
        if start_ms < 0 or end_ms <= start_ms or end_ms > declared_source_duration_ms + 1000:
            raise ValueError("CAPTURE_CHAPTER_RANGE_INVALID")
        scale = source_duration_ms / declared_source_duration_ms
        start_ms = round(start_ms * scale)
        end_ms = round(end_ms * scale)
    end_ms = min(end_ms, source_duration_ms)
    if start_ms < 0 or end_ms <= start_ms or start_ms >= source_duration_ms:
        raise ValueError("CAPTURE_CHAPTER_RANGE_INVALID")
    return start_ms, end_ms


def infer_declared_source_duration(explicit_duration_ms: int | None, chapter_end_times_ms: list[int]) -> int | None:
    """Recover the browser timeline for legacy mapped captures.

    Early complete-video records did not persist ``source_duration_ms`` on
    every virtual chapter. Their largest chapter end is the only durable copy
    of that browser timeline and is safe to use for proportional conversion.
    """
    valid_end_times = [value for value in chapter_end_times_ms if value > 0]
    latest_chapter_end = max(valid_end_times, default=None)
    if explicit_duration_ms is not None and explicit_duration_ms > 0:
        # Some legacy source rows contain a short per-chapter duration rather
        # than the complete browser timeline. Trust it only when it can
        # actually contain every mapped chapter (allowing normal rounding).
        if latest_chapter_end is None or latest_chapter_end <= explicit_duration_ms + 1000:
            return explicit_duration_ms
    return latest_chapter_end
