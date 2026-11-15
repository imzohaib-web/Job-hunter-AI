import pytest

from app.core.config import Settings, get_settings, load_settings


def test_load_settings_missing_key_lists_variable(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("AI_SERVICE_KEY", raising=False)
    get_settings.cache_clear()

    with pytest.raises(SystemExit) as exc:
        load_settings(env_file=None)

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "Missing or invalid environment variables" in err
    assert "ai_service_key" in err


def test_settings_reads_ai_service_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_SERVICE_KEY", "from-env")
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert settings.ai_service_key == "from-env"
    get_settings.cache_clear()


def test_env_list_parsing_and_whitespace_trimming(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_SERVICE_KEY", "test-key")
    monkeypatch.setenv("GREENHOUSE_BOARDS", "  airbnb, stripe , cloudflare ,datadog  ")
    monkeypatch.setenv("LEVER_BOARDS", " spotify , palantir ")
    monkeypatch.setenv("LLM_PROVIDER_ORDER", " groq , gemini ")

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.greenhouse_boards_list == ["airbnb", "stripe", "cloudflare", "datadog"]
    assert settings.lever_boards_list == ["spotify", "palantir"]
    assert settings.provider_order_list == ["groq", "gemini"]
    get_settings.cache_clear()
