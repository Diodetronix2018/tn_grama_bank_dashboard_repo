"""Structured-enough logging: one line per event, machine-greppable.

CloudWatch (or any log aggregator) ingests this as plain lines; the
consistent "key=value" tail makes it filterable without needing a JSON
parser wired up on day one.
"""

import logging
import sys


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())

    # uvicorn's own loggers otherwise double-attach a handler.
    for noisy in ("uvicorn.access", "uvicorn.error"):
        logging.getLogger(noisy).handlers = [handler]
        logging.getLogger(noisy).propagate = False
