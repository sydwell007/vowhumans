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
