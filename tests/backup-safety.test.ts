import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const backupScript = await readFile(new URL("../scripts/backup-postgres.sh", import.meta.url), "utf8");
const restoreScript = await readFile(new URL("../scripts/restore-postgres.sh", import.meta.url), "utf8");

test("backup script tidak mencetak credential dan membuat checksum", () => {
  assert.match(backupScript, /pg_dump/);
  assert.match(backupScript, /sha256sum/);
  assert.doesNotMatch(backupScript, /echo.*SOURCE_DATABASE_URL|printf.*SOURCE_DATABASE_URL/);
});

test("restore script memiliki guard eksplisit dan single-job", () => {
  assert.match(restoreScript, /ALLOW_RESTORE/);
  assert.match(restoreScript, /ALLOW_RESTORE.*YES/);
  assert.match(restoreScript, /--jobs=1/);
  assert.match(restoreScript, /--single-transaction/);
});
