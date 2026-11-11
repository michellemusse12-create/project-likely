import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import express from "express";
import { fileURLToPath } from "node:url";
import { initializeStore, readDatabase, updateDatabase } from "./store.js";
import { generateQuestions, rejectProtectedTraitPreferences, validateQuestions } from "./questionnaire.js";
import { scoreSubmission } from "./scoring.js";

const scrypt = promisify(crypto.scrypt);
const here = path.dirname(fileURLToPath(import.meta.url));
const sessions = new Map();
const limits = new Map();
const app = express();
const PORT = Number(process.env.PORT || 4173);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const recent = (limits.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= max) {
      res.set("Retry-After", String(Math.ceil((windowMs - (now - recent[0])) / 1000)));
      return res.status(429).json({ error: "Too many attempts. Please wait a moment and try again." });
    }
    recent.push(now);
    limits.set(key, recent);
    return next();
  };
}

function authenticated(req, res, next) {
  const token = req.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: "Please sign in to continue." });
  }
  req.userId = session.userId;
  req.sessionToken = token;
  return next();
}

function fail(res, error) {
  const status = Number.isInteger(error.status) ? error.status : 400;
  return res.status(status).json({ error: error.message || "The request could not be completed." });
}

function publicTest(test) {
  return {
    id: test.shareId,
    title: test.title,
    introduction: test.introduction,
    questions: test.questions.map(({ id, type, text, choices }) => ({
      id,
      type,
      text,
      choices: choices.map(({ text: choice }) => choice)
    }))
  };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

app.get("/api/status", (_req, res) => {
  res.json({ aiConfigured: Boolean(process.env.OPENAI_API_KEY) });
});

app.post("/api/auth/signup", rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < 12 || password.length > 256) {
      return res.status(400).json({ error: "Use a password between 12 and 256 characters." });
    }
    const user = await updateDatabase(async (db) => {
      if (db.users.some((item) => item.email === email)) throw Object.assign(new Error("An account already exists for that email."), { status: 409 });
      const salt = crypto.randomBytes(16);
      const passwordHash = await scrypt(password, salt, 64);
      const created = {
        id: crypto.randomUUID(),
        email,
        salt: salt.toString("base64"),
        passwordHash: passwordHash.toString("base64"),
        createdAt: new Date().toISOString()
      };
      db.users.push(created);
      return created;
    });
    return res.status(201).json({ token: createSession(user.id), user: { email: user.email } });
  } catch (error) {
    return fail(res, error);
  }
});

app.post("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const user = await readDatabase((db) => db.users.find((item) => item.email === email));
    if (!user || password.length > 256) return res.status(401).json({ error: "Email or password is incorrect." });
    const candidate = await scrypt(password, Buffer.from(user.salt, "base64"), 64);
    const expected = Buffer.from(user.passwordHash, "base64");
    if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    return res.json({ token: createSession(user.id), user: { email: user.email } });
  } catch (error) {
    return fail(res, error);
  }
});

app.post("/api/auth/logout", authenticated, (req, res) => {
  sessions.delete(req.sessionToken);
  return res.json({ ok: true });
});

app.delete("/api/account", authenticated, async (req, res) => {
  try {
    await updateDatabase((db) => {
      const ownedIds = db.tests.filter((test) => test.ownerId === req.userId).map((test) => test.id);
      db.users = db.users.filter((user) => user.id !== req.userId);
      db.tests = db.tests.filter((test) => test.ownerId !== req.userId);
      db.submissions = db.submissions.filter((submission) => !ownedIds.includes(submission.testId));
    });
    for (const [token, session] of sessions) {
      if (session.userId === req.userId) sessions.delete(token);
    }
    return res.json({ ok: true });
  } catch (error) {
    return fail(res, error);
  }
});

app.post("/api/ai/questions", authenticated, rateLimit({ windowMs: 60 * 1000, max: 4 }), async (req, res) => {
  try {
    const preferences = typeof req.body.preferences === "string" ? req.body.preferences.trim() : "";
    if (preferences.length < 20 || preferences.length > 2000) {
      return res.status(400).json({ error: "Describe your preferences in 20 to 2,000 characters." });
    }
    return res.json({ questions: await generateQuestions(preferences) });
  } catch (error) {
    return fail(res, error);
  }
});

app.get("/api/tests", authenticated, async (req, res) => {
  const result = await readDatabase((db) => db.tests
    .filter((test) => test.ownerId === req.userId)
    .map((test) => {
      const submissions = db.submissions.filter((item) => item.testId === test.id);
      const average = submissions.length
        ? Math.round(submissions.reduce((sum, item) => sum + item.score, 0) / submissions.length)
        : 0;
      return { ...test, submissionCount: submissions.length, averageScore: average, submissions: undefined };
    }));
  return res.json({ tests: result });
});

app.post("/api/tests", authenticated, async (req, res) => {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const introduction = typeof req.body.introduction === "string" ? req.body.introduction.trim() : "";
    if (title.length < 3 || title.length > 80) throw new Error("Test title must contain 3 to 80 characters.");
    if (introduction.length < 1 || introduction.length > 500) throw new Error("Introduction must contain 1 to 500 characters.");
    if (typeof req.body.preferences === "string") rejectProtectedTraitPreferences(req.body.preferences);
    const test = {
      id: crypto.randomUUID(),
      ownerId: req.userId,
      title,
      introduction,
      preferences: "",
      questions: validateQuestions(req.body.questions),
      published: false,
      shareId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await updateDatabase((db) => db.tests.push(test));
    return res.status(201).json({ test });
  } catch (error) {
    return fail(res, error);
  }
});

app.get("/api/tests/:testId", authenticated, async (req, res) => {
  const result = await readDatabase((db) => {
    const test = db.tests.find((item) => item.id === req.params.testId && item.ownerId === req.userId);
    if (!test) return null;
    const submissions = db.submissions
      .filter((item) => item.testId === test.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map(({ resultToken, ...submission }) => submission);
    return { test, submissions };
  });
  if (!result) return res.status(404).json({ error: "Test not found." });
  return res.json(result);
});

app.put("/api/tests/:testId", authenticated, async (req, res) => {
  try {
    const test = await updateDatabase((db) => {
      const current = db.tests.find((item) => item.id === req.params.testId && item.ownerId === req.userId);
      if (!current) throw Object.assign(new Error("Test not found."), { status: 404 });
      if (current.published) throw Object.assign(new Error("Published tests are immutable. Create a new test to change its scoring."), { status: 409 });
      const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
      const introduction = typeof req.body.introduction === "string" ? req.body.introduction.trim() : "";
      if (title.length < 3 || title.length > 80) throw new Error("Test title must contain 3 to 80 characters.");
      if (introduction.length < 1 || introduction.length > 500) throw new Error("Introduction must contain 1 to 500 characters.");
      if (typeof req.body.preferences === "string") rejectProtectedTraitPreferences(req.body.preferences);
      current.title = title;
      current.introduction = introduction;
      current.preferences = typeof req.body.preferences === "string" ? req.body.preferences.slice(0, 2000) : "";
      current.questions = validateQuestions(req.body.questions);
      current.updatedAt = new Date().toISOString();
      return current;
    });
    return res.json({ test });
  } catch (error) {
    return fail(res, error);
  }
});

app.post("/api/tests/:testId/publish", authenticated, async (req, res) => {
  try {
    const test = await updateDatabase((db) => {
      const current = db.tests.find((item) => item.id === req.params.testId && item.ownerId === req.userId);
      if (!current) throw Object.assign(new Error("Test not found."), { status: 404 });
      if (!current.published) {
        current.published = true;
        current.shareId = crypto.randomBytes(18).toString("base64url");
        current.publishedAt = new Date().toISOString();
      }
      return current;
    });
    return res.json({ test });
  } catch (error) {
    return fail(res, error);
  }
});

app.delete("/api/tests/:testId", authenticated, async (req, res) => {
  try {
    await updateDatabase((db) => {
      const test = db.tests.find((item) => item.id === req.params.testId && item.ownerId === req.userId);
      if (!test) throw Object.assign(new Error("Test not found."), { status: 404 });
      db.tests = db.tests.filter((item) => item.id !== test.id);
      db.submissions = db.submissions.filter((item) => item.testId !== test.id);
    });
    return res.json({ ok: true });
  } catch (error) {
    return fail(res, error);
  }
});

app.get("/api/public/tests/:shareId", async (req, res) => {
  const test = await readDatabase((db) => db.tests.find((item) =>
    item.published && item.shareId === req.params.shareId));
  if (!test) return res.status(404).json({ error: "This LIKELY could not be found." });
  return res.json({ test: publicTest(test) });
});

app.post("/api/public/tests/:shareId/submissions", rateLimit({ windowMs: 60 * 1000, max: 8 }), async (req, res) => {
  try {
    const result = await updateDatabase((db) => {
      const test = db.tests.find((item) => item.published && item.shareId === req.params.shareId);
      if (!test) throw Object.assign(new Error("This LIKELY could not be found."), { status: 404 });
      const answers = req.body.answers;
      const score = scoreSubmission(test.questions, answers);
      const submission = {
        id: crypto.randomBytes(4).toString("hex").toUpperCase(),
        resultToken: crypto.randomBytes(32).toString("base64url"),
        testId: test.id,
        score: score.score,
        label: score.label,
        strongest: score.strongest,
        differences: score.differences,
        answers: [...answers],
        questionSnapshot: test.questions,
        submittedAt: new Date().toISOString()
      };
      db.submissions.push(submission);
      return {
        resultToken: submission.resultToken,
        result: {
          score: submission.score,
          label: submission.label,
          strongest: submission.strongest,
          differences: submission.differences,
          disclaimer: "Your score reflects how closely your answers align with this person's stated preferences. It does not guarantee romantic attraction or predict how they will respond to you."
        }
      };
    });
    return res.status(201).json(result);
  } catch (error) {
    return fail(res, error);
  }
});

app.get("/api/public/results/:resultToken", async (req, res) => {
  const result = await readDatabase((db) => {
    const submission = db.submissions.find((item) => item.resultToken === req.params.resultToken);
    if (!submission) return null;
    const test = db.tests.find((item) => item.id === submission.testId);
    return test ? {
      title: test.title,
      score: submission.score,
      label: submission.label,
      strongest: submission.strongest,
      differences: submission.differences,
      disclaimer: "Your score reflects how closely your answers align with this person's stated preferences. It does not guarantee romantic attraction or predict how they will respond to you."
    } : null;
  });
  if (!result) return res.status(404).json({ error: "Results not found." });
  return res.json({ result });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));

const frontendDirectory = path.resolve(here, "..", "dist");
try {
  await fs.access(frontendDirectory);
  app.use(express.static(frontendDirectory));
  app.get("*", (_req, res) => res.sendFile(path.join(frontendDirectory, "index.html")));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

app.use((error, _req, res, _next) => {
  console.error("Request failed:", error.message);
  if (res.headersSent) return;
  const status = error instanceof SyntaxError && "body" in error ? 400 : 500;
  return res.status(status).json({ error: status === 400 ? "Request body must be valid JSON." : "An unexpected server error occurred." });
});

await initializeStore();
app.listen(PORT, "127.0.0.1", () => {
  console.log(`LIKELY server listening on http://127.0.0.1:${PORT}`);
});
