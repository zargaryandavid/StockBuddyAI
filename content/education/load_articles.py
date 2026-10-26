"""Adds the articles in financial-freedom-basics.json to Education as drafts.

Uploads each cover to the public "education" bucket and inserts a draft article, so an
admin can review and publish it in Admin -> Education. Articles whose title already
exists are skipped, so running it twice is safe.

Usage (service role key, server-side only):
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python load_articles.py
"""

import json
import os
import sys
from pathlib import Path

import httpx

from make_covers import slug

HERE = Path(__file__).parent


def main() -> int:
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    articles = json.loads((HERE / "financial-freedom-basics.json").read_text())

    with httpx.Client(timeout=30) as client:
        existing = client.get(
            f"{url}/rest/v1/education_articles", headers=headers, params={"select": "title"}
        )
        existing.raise_for_status()
        titles = {row["title"] for row in existing.json()}

        added = 0
        for position, article in enumerate(articles):
            if article["title"] in titles:
                print("skip (exists):", article["title"])
                continue
            path = f"articles/{slug(article['title'])}.jpg"
            cover = (HERE / "covers" / f"{slug(article['title'])}.jpg").read_bytes()
            upload = client.post(
                f"{url}/storage/v1/object/education/{path}",
                headers={**headers, "Content-Type": "image/jpeg", "x-upsert": "true"},
                content=cover,
            )
            upload.raise_for_status()
            created = client.post(
                f"{url}/rest/v1/education_articles",
                headers={**headers, "Prefer": "return=minimal"},
                json={
                    "title": article["title"],
                    "body": article["body"],
                    "image_path": path,
                    "published": False,
                    "position": position,
                },
            )
            created.raise_for_status()
            added += 1
            print("added draft:", article["title"])
    print(f"{added} added, {len(articles) - added} skipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
