"""One-off import of the Phase 1 Notion 学员库 into the students table.

    python tools/notion-import/import_students.py            # dry-run
    python tools/notion-import/import_students.py --apply    # writes

Dry-run is the default and the only safeguard: this script points at whatever
BACKEND_URL says, which in the end is production. In dry-run the backend is
only ever read from — the single POST call site is guarded by `--apply`.

Credentials come from the environment, never from this repo:
    NOTION_API_KEY   Notion integration token, must have the 学员库 shared with it
                     (not needed with --pages-file)
    BACKEND_URL      e.g. https://<service>.onrender.com
    BACKEND_SECRET   value of the X-Backend-Secret header
    NOTION_STUDENT_DB_ID   optional, overrides the default database id

`--pages-file` reads the same page dicts from a JSON file instead of calling
Notion. Phase 1 never used an integration token — the 学员库 was always driven
through the Notion MCP connector, which a plain script cannot reach. This is
the seam that lets the export come from there while the mapping and conflict
rules below stay the code that gets verified. The file holds real students, so
it belongs outside the repo (CLAUDE.md §隐私).

No student data is hard-coded here — names and emails are read from Notion at
run time (CLAUDE.md §隐私).
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx
from notion_client import Client
from notion_client.errors import APIResponseError

from mapping import IMPORT_TAG, map_pages, mask_email

# ai-course/tools/student-sync/config.json → students_db_id. An id, not student
# data; safe to keep in the repo and overridable for a test database.
DEFAULT_DB_ID = "1a8662722baa4615a5c746c49173dcc8"

# Render's free tier sleeps after 15 idle minutes and takes tens of seconds to
# wake. A default-length timeout would fail on the very first request of a run.
TIMEOUT = httpx.Timeout(60.0)


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"error: {name} is not set")
    return value


def fetch_pages(notion: Client, db_id: str) -> list[dict[str, Any]]:
    """Read every page of the database, following pagination.

    The database is small enough today to arrive in one page, but a silent
    truncation at 100 records would look exactly like "those students were
    never in Notion", so the cursor is followed rather than assumed absent.
    """
    pages: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        try:
            response = notion.databases.query(database_id=db_id, start_cursor=cursor)
        except APIResponseError as exc:
            sys.exit(f"error: Notion query failed: {exc}")
        pages.extend(response["results"])
        if not response.get("has_more"):
            return pages
        cursor = response["next_cursor"]


def fetch_existing_emails(client: httpx.Client) -> set[str]:
    """Emails already in the target database, archived ones included.

    Archived records count as conflicts: the API returns 409 for them too, and
    they hold notes and tags collected earlier that must not be overwritten.
    """
    emails: set[str] = set()
    for archived in (False, True):
        response = client.get("/api/students", params={"archived": archived})
        response.raise_for_status()
        emails.update(row["email"].lower() for row in response.json())
    return emails


def create_student(client: httpx.Client, body: dict[str, Any]) -> tuple[bool, str]:
    """POST one student. Returns (created, message).

    A 409 is an expected outcome, not a failure: rerunning this script must be
    safe, and an existing record — active or archived — is left untouched.
    """
    response = client.post("/api/students", json=body)
    if response.status_code == 201:
        return True, "created"
    if response.status_code == 409:
        return False, response.json().get("detail", "conflict")
    return False, f"HTTP {response.status_code}: {response.text[:200]}"


def _format(body: dict[str, Any], reveal: bool) -> str:
    email = body["email"] if reveal else mask_email(body["email"])
    extra = [t for t in body["tags"] if t != IMPORT_TAG]
    tag_note = f" tags={extra}" if extra else ""
    note_note = " +note" if body["note"] else ""
    return f"{body['name']:<16} {email}{tag_note}{note_note}"


def main() -> int:
    # Every line this script prints — student names, tag names, the help text —
    # contains Chinese, and a default Windows console is cp1252: without this
    # the first print raises UnicodeEncodeError and the run dies before it has
    # said anything useful.
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="actually write; omit for a dry-run"
    )
    parser.add_argument(
        "--reveal",
        action="store_true",
        help="print full email addresses (for local field verification only)",
    )
    parser.add_argument(
        "--pages-file",
        metavar="PATH",
        help="read Notion page dicts from this JSON file instead of calling Notion",
    )
    args = parser.parse_args()

    backend_url = _require_env("BACKEND_URL").rstrip("/")
    backend_secret = _require_env("BACKEND_SECRET")

    if args.pages_file:
        pages = json.loads(Path(args.pages_file).read_text(encoding="utf-8"))
        print(f"Source: {args.pages_file}")
    else:
        db_id = os.environ.get("NOTION_STUDENT_DB_ID") or DEFAULT_DB_ID
        pages = fetch_pages(Client(auth=_require_env("NOTION_API_KEY")), db_id)
    bodies, skipped = map_pages(pages)

    print(f"Notion 学员库: {len(pages)} records")
    print(f"  mappable (has email + name): {len(bodies)}")
    print(f"  skipped (no email): {len(skipped)} -> {', '.join(skipped) or '—'}")
    print(f"Target: {backend_url}  mode: {'APPLY' if args.apply else 'DRY-RUN'}\n")

    headers = {"X-Backend-Secret": backend_secret}
    with httpx.Client(base_url=backend_url, headers=headers, timeout=TIMEOUT) as client:
        existing = fetch_existing_emails(client)
        print(f"Existing students in target: {len(existing)}\n")

        created = conflicts = failed = 0
        for body in bodies:
            line = _format(body, args.reveal)
            if not args.apply:
                clash = body["email"].lower() in existing
                if clash:
                    conflicts += 1
                print(f"  [{'CONFLICT' if clash else 'would create'}] {line}")
                continue

            ok, message = create_student(client, body)
            if ok:
                created += 1
            elif message.startswith("HTTP"):
                failed += 1
            else:
                conflicts += 1
            print(f"  [{message}] {line}")

        print()
        if args.apply:
            print(f"created={created} skipped_conflict={conflicts} failed={failed}")
            after = fetch_existing_emails(client)
            print(f"Students in target: {len(existing)} -> {len(after)}")
            return 1 if failed else 0

        print(
            f"would create={len(bodies) - conflicts} conflict={conflicts} "
            "(nothing was written)"
        )
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
