import { readFileSync } from "node:fs";

const manifestPath = process.argv[2];
if (!manifestPath) {
  process.stderr.write("usage: manifest.mjs <manifest.json>\n");
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest.repos) || manifest.repos.length === 0) {
  process.stderr.write("manifest has no repos\n");
  process.exit(1);
}

for (const repo of manifest.repos) {
  const source = process.env[repo.sourceUrlEnv] || repo.defaultSourceUrl;
  const fields = [
    repo.name,
    repo.github,
    source,
    repo.targetPath,
    repo.primaryBranch,
    repo.required ? "1" : "0",
  ];
  if (fields.some((field) => /[\t\r\n]/.test(String(field ?? "")))) {
    process.stderr.write(`unsafe manifest field in ${repo.name}\n`);
    process.exit(1);
  }
  if (!repo.name || !source || !repo.targetPath || !repo.primaryBranch) {
    process.stderr.write(`incomplete manifest entry ${repo.name ?? ""}\n`);
    process.exit(1);
  }
  process.stdout.write(`${fields.join("\t")}\n`);
}
