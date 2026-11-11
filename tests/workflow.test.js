import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverFile = fileURLToPath(new URL("../server/index.js", import.meta.url));
const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "likely-test-"));
const portProbe = net.createServer();
await new Promise((resolve, reject) => {
  portProbe.once("error", reject);
  portProbe.listen(0, "127.0.0.1", resolve);
});
const port = portProbe.address().port;
await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));

const server = spawn(process.execPath, [serverFile], {
  env: { ...process.env, PORT: String(port), LIKELY_DATA_DIR: dataDirectory },
  stdio: "ignore"
});
const baseUrl = `http://127.0.0.1:${port}`;

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Server exited with code ${server.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/status`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("LIKELY server did not start in time.");
}

await waitForServer();

async function request(endpoint, { token, ...options } = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers
    }
  });
  const body = await response.json();
  return { status: response.status, body };
}

test.after(async () => {
  server.kill();
  await once(server, "exit");
  await fs.rm(dataDirectory, { recursive: true, force: true });
});

test("creator-to-respondent flow keeps private data protected and returns an immediate result", async () => {
  const creator = await request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email: "creator@example.test", password: "example-test-password" })
  });
  assert.equal(creator.status, 201);

  const otherCreator = await request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email: "other@example.test", password: "another-test-password" })
  });
  assert.equal(otherCreator.status, 201);

  const questions = [
    { text: "How do you talk through a disagreement?", category: "Communication", preference: "Direct communication", weight: 10, choices: [{ text: "Talk openly", score: 100 }, { text: "Take time first", score: 50 }] },
    { text: "How do you like spending a free afternoon?", category: "Lifestyle", preference: "Shared relaxed time", weight: 5, choices: [{ text: "Explore together", score: 100 }, { text: "Relax at home", score: 50 }] },
    { text: "What do you do when a friend needs support?", category: "Values", preference: "Thoughtful support", weight: 8, choices: [{ text: "Ask and show up", score: 100 }, { text: "Give them space", score: 50 }] }
  ];
  const created = await request("/api/tests", {
    token: creator.body.token,
    method: "POST",
    body: JSON.stringify({ title: "A thoughtful match", introduction: "A few questions about the things that matter.", questions })
  });
  assert.equal(created.status, 201);
  const testId = created.body.test.id;
  assert.equal((await request(`/api/tests/${testId}`, { token: otherCreator.body.token })).status, 404);
  assert.equal((await request(`/api/tests/${testId}`)).status, 401);

  const published = await request(`/api/tests/${testId}/publish`, {
    token: creator.body.token,
    method: "POST"
  });
  assert.equal(published.status, 200);
  const shareId = published.body.test.shareId;
  const publicQuestionnaire = await request(`/api/public/tests/${shareId}`);
  assert.equal(publicQuestionnaire.status, 200);
  assert.equal(publicQuestionnaire.body.test.questions.length, 3);
  assert.equal("preference" in publicQuestionnaire.body.test.questions[0], false);
  assert.equal(typeof publicQuestionnaire.body.test.questions[0].choices[0], "string");
  assert.equal("ownerId" in publicQuestionnaire.body.test, false);

  const submission = await request(`/api/public/tests/${shareId}/submissions`, {
    method: "POST",
    body: JSON.stringify({ answers: [0, 0, 0] })
  });
  assert.equal(submission.status, 201);
  assert.equal(submission.body.result.score, 100);
  assert.equal(submission.body.result.label, "Strong alignment");
  assert.ok(submission.body.resultToken);
  assert.ok(submission.body.result.disclaimer.includes("does not guarantee romantic attraction"));

  const respondentResult = await request(`/api/public/results/${submission.body.resultToken}`);
  assert.equal(respondentResult.status, 200);
  assert.equal(respondentResult.body.result.score, 100);
  assert.equal("answers" in respondentResult.body.result, false);

  const privateDashboard = await request(`/api/tests/${testId}`, { token: creator.body.token });
  assert.equal(privateDashboard.status, 200);
  assert.equal(privateDashboard.body.submissions.length, 1);
  assert.equal(privateDashboard.body.submissions[0].score, 100);
  assert.equal("resultToken" in privateDashboard.body.submissions[0], false);
  assert.equal("email" in privateDashboard.body.submissions[0], false);
});
