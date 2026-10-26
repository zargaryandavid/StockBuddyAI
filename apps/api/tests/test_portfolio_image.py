import json

import pytest

from stockbuddy.portfolio_image import PortfolioImageError, PortfolioImageExtractor


class FakeResponse:
    status_code = 200

    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeClient:
    def __init__(self, payload):
        self.payload = payload
        self.request = None

    def post(self, url, headers, json):
        self.request = {"url": url, "headers": headers, "json": json}
        return FakeResponse(self.payload)


def test_extracts_and_normalizes_positions_for_review():
    client = FakeClient(
        {
            "output": [
                {
                    "content": [
                        {
                            "type": "output_text",
                            "text": json.dumps(
                                {
                                    "positions": [
                                        {"ticker": "aapl", "shares": 20},
                                        {"ticker": "MSFT", "shares": 10},
                                    ]
                                }
                            ),
                        }
                    ]
                }
            ]
        }
    )
    extractor = PortfolioImageExtractor("test-key", "gpt-test", client=client)

    positions = extractor.extract(b"image-bytes", "image/png")

    assert [position.model_dump(exclude_none=True) for position in positions] == [
        {
            "ticker": "AAPL",
            "shares": 20,
            "asset_type": "Other",
            "classification_source": "automatic",
            "lifecycle_phase": "Not Analyzed",
            "lifecycle_evidence": {},
        },
        {
            "ticker": "MSFT",
            "shares": 10,
            "asset_type": "Other",
            "classification_source": "automatic",
            "lifecycle_phase": "Not Analyzed",
            "lifecycle_evidence": {},
        },
    ]
    assert client.request["url"] == "https://api.openai.com/v1/responses"
    assert client.request["json"]["model"] == "gpt-test"
    assert "data:image/png;base64," in client.request["json"]["input"][0]["content"][1]["image_url"]


def test_rejects_unsupported_or_oversized_images():
    extractor = PortfolioImageExtractor("test-key", "gpt-test", client=FakeClient({}))

    with pytest.raises(PortfolioImageError, match="PNG"):
        extractor.extract(b"image", "image/gif")
    with pytest.raises(PortfolioImageError, match="8 MB"):
        extractor.extract(b"x" * (8 * 1024 * 1024 + 1), "image/jpeg")
