import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

Object.assign(process.env, JSON.parse(readFileSync(path.join(tmpdir(), "kompass-test-env.json"), "utf8")));
