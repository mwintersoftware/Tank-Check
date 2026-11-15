import fs from "fs";
const t = fs.readFileSync(process.argv[2] || ".env.check", "utf8");
for (const key of ["CRON_SECRET", "DATABASE_URL"]) {
  const m = t.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) {
    console.log(key, "missing");
    continue;
  }
  let v = m[1];
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  console.log(
    key,
    "len=",
    v.length,
    "trimEq=",
    v === v.trim(),
    "lastCodes=",
    [...v.slice(-3)].map((c) => c.charCodeAt(0)),
  );
}
