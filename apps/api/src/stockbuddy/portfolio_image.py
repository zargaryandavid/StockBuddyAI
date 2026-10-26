from __future__ import annotations

import base64
import json
from typing import Any

import httpx

from stockbuddy.schemas import PositionInput

_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_IMAGE_BYTES = 8 * 1024 * 1024


class PortfolioImageError(ValueError):
    pass


class PortfolioImageExtractor:
    def __init__(
        self,
        api_key: str,
        model: str,
        client: httpx.Client | None = None,
    ) -> None:
        if not api_key:
            raise PortfolioImageError("OPENAI_API_KEY is required for picture extraction")
        self.api_key = api_key
        self.model = model
        self.client = client or httpx.Client(timeout=60)

    def extract(self, image: bytes, content_type: str) -> list[PositionInput]:
        if content_type not in _ALLOWED_TYPES:
            raise PortfolioImageError("Upload a PNG, JPEG, or WebP image")
        if not image or len(image) > _MAX_IMAGE_BYTES:
            raise PortfolioImageError("Image must be between 1 byte and 8 MB")

        encoded = base64.b64encode(image).decode("ascii")
        response = self.client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "input": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": (
                                    "Read this portfolio screenshot. Extract only clearly "
                                    "visible US stock ticker symbols and whole share counts. "
                                    "Do not infer obscured values, prices, cash, totals, options, "
                                    "or percentages. Return an empty positions array if uncertain."
                                ),
                            },
                            {
                                "type": "input_image",
                                "image_url": f"data:{content_type};base64,{encoded}",
                            },
                        ],
                    }
                ],
                "text": {
                    "format": {
                        "type": "json_schema",
                        "name": "portfolio_positions",
                        "strict": True,
                        "schema": {
                            "type": "object",
                            "properties": {
                                "positions": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "ticker": {"type": "string"},
                                            "shares": {"type": "integer", "minimum": 0},
                                        },
                                        "required": ["ticker", "shares"],
                                        "additionalProperties": False,
                                    },
                                }
                            },
                            "required": ["positions"],
                            "additionalProperties": False,
                        },
                    }
                },
            },
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise PortfolioImageError(
                f"OpenAI picture extraction failed ({response.status_code})"
            ) from exc

        try:
            payload = json.loads(self._output_text(response.json()))
            rows = payload["positions"]
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise PortfolioImageError("OpenAI returned an invalid portfolio result") from exc

        combined: dict[str, int] = {}
        for row in rows:
            position = PositionInput.model_validate(row)
            combined[position.ticker] = combined.get(position.ticker, 0) + position.shares
        return [
            PositionInput(ticker=ticker, shares=shares)
            for ticker, shares in sorted(combined.items())
        ]

    @staticmethod
    def _output_text(payload: dict[str, Any]) -> str:
        direct = payload.get("output_text")
        if isinstance(direct, str):
            return direct
        for output in payload.get("output", []):
            for content in output.get("content", []):
                if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                    return content["text"]
        raise PortfolioImageError("OpenAI response did not contain output text")
