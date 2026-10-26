from datetime import date, timedelta
from uuid import UUID

from fastapi.testclient import TestClient

from stockbuddy.main import app, current_user

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
HEADERS = {"Authorization": "Bearer test-token"}


class ProfileRepository:
    def __init__(self, saved=None):
        self.saved = saved
        self.written = None

    async def get_profile(self, token):
        assert token == "test-token"
        return self.saved

    async def save_profile(self, token, user_id, profile):
        self.written = (user_id, profile)
        return profile.model_dump(mode="json")


def run(repository, method, path, **kwargs):
    app.dependency_overrides[current_user] = lambda: USER_ID
    try:
        with TestClient(app) as client:
            app.state.repository = repository
            return getattr(client, method)(path, headers=HEADERS, **kwargs)
    finally:
        app.dependency_overrides.clear()


def test_profile_without_a_date_of_birth_reads_as_empty():
    response = run(ProfileRepository(), "get", "/api/profile")
    assert response.json() == {"date_of_birth": None, "display_name": None}


def test_profile_saves_a_date_of_birth_and_rejects_future_dates():
    repository = ProfileRepository()
    saved = run(repository, "put", "/api/profile", json={"date_of_birth": "1987-05-10"})
    future = (date.today() + timedelta(days=2)).isoformat()
    rejected = run(repository, "put", "/api/profile", json={"date_of_birth": future})

    assert saved.status_code == 200
    assert saved.json()["date_of_birth"] == "1987-05-10"
    assert repository.written[0] == USER_ID
    assert rejected.status_code == 422
