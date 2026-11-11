import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(process.env.LIKELY_DATA_DIR || path.join(here, "..", "data"));
const keyPath = path.join(dataDirectory, "storage.key");
const databasePath = path.join(dataDirectory, "likely.enc");
const emptyDatabase = () => ({ users: [], tests: [], submissions: [] });

let storageKey;
let database;
let writeQueue = Promise.resolve();

export async function initializeStore() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    storageKey = await fs.readFile(keyPath);
    if (storageKey.length !== 32) throw new Error("The LIKELY storage key must be 32 bytes.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    storageKey = crypto.randomBytes(32);
    await fs.writeFile(keyPath, storageKey, { flag: "wx", mode: 0o600 });
  }

  try {
    const envelope = JSON.parse(await fs.readFile(databasePath, "utf8"));
    if (envelope.version !== 1) throw new Error("Unsupported LIKELY data file version.");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      storageKey,
      Buffer.from(envelope.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final()
    ]).toString("utf8");
    database = JSON.parse(plaintext);
    if (!database || !Array.isArray(database.users) || !Array.isArray(database.tests) ||
      !Array.isArray(database.submissions)) {
      throw new Error("The LIKELY data file has an invalid structure.");
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      database = emptyDatabase();
      await persist();
      return;
    }
    throw new Error(`Could not open encrypted LIKELY data: ${error.message}`, { cause: error });
  }
}

function persist() {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", storageKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(database), "utf8"), cipher.final()]);
  const envelope = JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64")
  });
  const temporaryPath = `${databasePath}.${crypto.randomUUID()}.tmp`;
  writeQueue = writeQueue.then(async () => {
    await fs.writeFile(temporaryPath, envelope, { mode: 0o600 });
    await fs.rename(temporaryPath, databasePath);
  });
  return writeQueue;
}

export async function readDatabase(read) {
  await writeQueue;
  return read(database);
}

export async function updateDatabase(update) {
  await writeQueue;
  const result = await update(database);
  await persist();
  return result;
}
