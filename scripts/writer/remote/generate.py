#!/usr/bin/env python3
"""«Райтер»: one Cloud.ru Foundation Models call on the Moscow host.

Runs only on the Moscow host. Reads request.json from the current directory,
reads the API key in-process from /etc/audiolad/cloudru-fm.env and never prints,
logs or writes it. Writes article.json (model answer only) or article.txt (when the
answer is not JSON), meta.json (usage, cost, status) and response.json (raw answer,
stays on the host). No automatic retries except one free fallback without
response_format when the API rejects structured output with HTTP 400.
"""
import json
import os
import stat
import sys
import time
import urllib.error
import urllib.request
from decimal import Decimal

ENV_PATH = "/etc/audiolad/cloudru-fm.env"
DEFAULT_BASE = "https://foundation-models.api.cloud.ru/v1"
ALLOWED_VARS = {"CLOUDRU_FM_API_KEY", "CLOUDRU_FM_BASE_URL"}
PRICES = {
    "openai/gpt-oss-120b": ("15.86", "61.00"),
    "Qwen/Qwen3.6-35B-A3B": ("219.60", "329.40"),
}


def fail(message):
    json.dump({"ok": False, "error": message}, open("meta.json", "w"), ensure_ascii=False)
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    sys.exit(1)


def read_env():
    try:
        info = os.lstat(ENV_PATH)
    except OSError:
        fail("env-файл недоступен")
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or (info.st_mode & 0o077):
        fail("env-файл должен быть обычным файлом root с правами не шире 600")
    with open(ENV_PATH, "rb") as handle:
        raw = handle.read()
    if b"\x00" in raw:
        fail("env-файл повреждён")
    values = {}
    for line in raw.decode("utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        name, sep, value = line.partition("=")
        name = name.strip()
        if not sep or name not in ALLOWED_VARS:
            fail("env-файл содержит неожиданные строки")
        values[name] = value.strip().strip('"').strip("'")
    if not values.get("CLOUDRU_FM_API_KEY"):
        fail("ключ не задан")
    base = values.get("CLOUDRU_FM_BASE_URL") or DEFAULT_BASE
    if not base.startswith("https://foundation-models.api.cloud.ru"):
        fail("недопустимый базовый URL")
    return values["CLOUDRU_FM_API_KEY"], base.rstrip("/")


def post(base, key, payload):
    request = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=900) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")
    except Exception as error:  # network errors: no retry, report the class only
        return 0, type(error).__name__


def extract_json(content):
    text = content.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except ValueError:
        return None


def main():
    payload = json.load(open("request.json", encoding="utf-8"))
    model = payload.get("model")
    if model not in PRICES:
        fail(f"модель {model} не в списке тарифов")
    key, base = read_env()

    def scrub(text):
        return str(text).replace(key, "[скрыто]")

    started = time.time()
    status, body = post(base, key, payload)
    fallback = False
    if status == 400 and "response_format" in payload:
        lowered = body.lower()
        if any(word in lowered for word in ("response_format", "json_schema", "guided", "schema")):
            payload = {name: value for name, value in payload.items() if name != "response_format"}
            fallback = True
            status, body = post(base, key, payload)
    seconds = round(time.time() - started, 1)

    with open("response.json", "w", encoding="utf-8") as handle:
        handle.write(scrub(body))

    meta = {"ok": False, "http": status, "seconds": seconds, "model": model,
            "response_format_fallback": fallback}
    if status != 200:
        meta["error"] = scrub(body)[:500]
        json.dump(meta, open("meta.json", "w"), ensure_ascii=False)
        print(json.dumps(meta, ensure_ascii=False))
        sys.exit(1)

    data = json.loads(body)
    usage = data.get("usage") or {}
    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    price_in, price_out = map(Decimal, PRICES[model])
    cost = (prompt_tokens * price_in + completion_tokens * price_out) / Decimal(1000000)
    choice = (data.get("choices") or [{}])[0]
    content = (choice.get("message") or {}).get("content") or ""
    details = usage.get("completion_tokens_details") or {}
    meta.update({
        "ok": True,
        "model": data.get("model", model),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "reasoning_tokens": details.get("reasoning_tokens"),
        "cost_rub": float(round(cost, 6)),
        "finish_reason": choice.get("finish_reason"),
        "content_chars": len(content),
    })
    article = extract_json(content)
    if article is None:
        meta["ok"] = False
        meta["error"] = "ответ модели не является JSON"
        with open("article.txt", "w", encoding="utf-8") as handle:
            handle.write(scrub(content))
    else:
        with open("article.json", "w", encoding="utf-8") as handle:
            json.dump(article, handle, ensure_ascii=False, indent=2)
    json.dump(meta, open("meta.json", "w"), ensure_ascii=False)
    print(json.dumps(meta, ensure_ascii=False))
    sys.exit(0 if meta["ok"] else 1)


if __name__ == "__main__":
    main()
