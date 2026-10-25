"""Изолированный PostgreSQL в /tmp, без сокетов и внешних подключений.

Проверяет новую миграцию на минимальных FK-заглушках, не всю историю схемы.
Запуск: python3 scripts/music-analyzer-migration-isolated.py [каталог bin PostgreSQL]
"""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
pg_bin = Path(sys.argv[1] if len(sys.argv) > 1 else "/usr/lib/postgresql/17/bin")
setup = """
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.music_analyzer_runs(id uuid PRIMARY KEY);
"""
append_check = """
INSERT INTO auth.users VALUES ('11111111-1111-4111-a111-111111111111');
INSERT INTO public.music_analyzer_runs VALUES ('22222222-2222-4222-a222-222222222222');
SET ROLE service_role;
INSERT INTO public.music_analyzer_feature_overrides(run_id,created_by,schema_version,reason,patch)
VALUES ('22222222-2222-4222-a222-222222222222','11111111-1111-4111-a111-111111111111','audiolad-features:1','Тестовая проверка','{"energy_0_100":40}');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.music_analyzer_feature_overrides) <> 1 THEN
    RAISE EXCEPTION 'append/read failed';
  END IF;
END $$;
RESET ROLE;
SELECT 'ISOLATED_MIGRATION_OK';
"""

with tempfile.TemporaryDirectory(prefix="audiolad-feature-migration-") as scratch:
    data = Path(scratch) / "data"
    subprocess.run([str(pg_bin / "initdb"), "-D", str(data), "-A", "trust", "--no-locale"],
                   check=True, capture_output=True)
    texts = [setup, (root / "supabase/migrations/20270123120000_music_analyzer_feature_overrides.sql").read_text(),
             (root / "supabase/tests/music_analyzer_features_smoke.sql").read_text(), append_check]
    # Single-user backend принимает один SQL-блок на строку. Здесь нет внешней БД.
    sql = "\n".join(" ".join(line for line in text.splitlines() if not line.lstrip().startswith("--"))
                    for text in texts) + "\n"
    result = subprocess.run([str(pg_bin / "postgres"), "--single", "-D", str(data),
                             "-c", "exit_on_error=on", "postgres"], input=sql, text=True, capture_output=True)
    if result.returncode or "ERROR:" in result.stderr or "FATAL:" in result.stderr or "ISOLATED_MIGRATION_OK" not in result.stdout:
        print(result.stdout, result.stderr)
        raise SystemExit(1)
    print("Миграция: PostgreSQL single-user, создание таблицы, RLS/права, append/read – успешно.")
