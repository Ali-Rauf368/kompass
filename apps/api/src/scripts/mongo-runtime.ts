/**
 * Finds a mongod binary for local development and tests (production uses a real MongoDB server).
 *
 * MongoDB 5.0+ needs a CPU with AVX. On older CPUs (e.g. Pentium/Celeron N-series) we fall back to
 * MongoDB 4.4, which needs OpenSSL 1.1; that library is downloaded into ~/.cache, not installed system-wide.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const LIBSSL_DEB = "http://archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb";
const LIBSSL_SHA256 = "7cf39d70a639017d1dd7c8d36daa2258063608688e449fddf40ffdd46f992a78";

export function cpuHasAvx(): boolean {
  try {
    return /\bavx\b/.test(readFileSync("/proc/cpuinfo", "utf8"));
  } catch {
    return true; // non-Linux: assume a modern CPU
  }
}

async function ensureLibssl11(): Promise<string> {
  const dir = path.join(homedir(), ".cache", "kompass-libssl");
  const libDir = path.join(dir, "extracted", "usr", "lib", "x86_64-linux-gnu");
  if (existsSync(path.join(libDir, "libssl.so.1.1"))) return libDir;
  mkdirSync(dir, { recursive: true });
  const deb = path.join(dir, "libssl1.1.deb");
  const res = await fetch(LIBSSL_DEB);
  if (!res.ok) throw new Error(`Could not download libssl1.1 (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { createHash } = await import("node:crypto");
  if (createHash("sha256").update(buf).digest("hex") !== LIBSSL_SHA256) throw new Error("libssl1.1 checksum mismatch");
  writeFileSync(deb, buf);
  execFileSync("dpkg-deb", ["-x", deb, path.join(dir, "extracted")]);
  return libDir;
}

export interface MongoRuntime {
  version: string;
  /** Environment variables mongodb-memory-server needs to download/launch the binary. */
  env: Record<string, string>;
}

export async function mongoRuntime(): Promise<MongoRuntime> {
  if (process.env.MONGOMS_SYSTEM_BINARY) return { version: "system", env: {} };
  if (cpuHasAvx()) return { version: "8.0.15", env: {} };
  const libDir = await ensureLibssl11();
  return {
    version: "4.4.29",
    env: {
      MONGOMS_DISTRO: "ubuntu-20.04",
      LD_LIBRARY_PATH: [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"),
    },
  };
}
