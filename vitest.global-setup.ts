import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const TEST_DB = "file:./test.db";

export default function setup() {
  process.env.DATABASE_URL = TEST_DB;
  rmSync("test.db", { force: true });
  execSync("npx prisma db push", {
    stdio: "inherit",
    env: process.env,
  });
}
