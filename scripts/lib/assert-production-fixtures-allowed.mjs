import { assertProductionFixturesAllowed } from "./guard-production-fixtures.mjs";

assertProductionFixturesAllowed({
  scriptName: process.argv[1],
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  dockerExec: process.env.AUDIOLAD_FIXTURE_DOCKER_SQL === "1",
});
