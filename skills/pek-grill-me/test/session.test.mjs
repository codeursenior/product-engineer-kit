import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startSession } from "../scripts/relay.mjs";

async function withSession(t) {
  const session = await startSession();
  t.after(() => session.stop());
  const request = async (
    path,
    { method = "GET", body, token = session.token, origin } = {},
  ) => {
    const response = await fetch(`${session.base}/api/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(origin ? { Origin: origin } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  return { session, request };
}

test("browser and current agent complete an ordered interview without a document", async (t) => {
  const { session, request } = await withSession(t);
  const page = await fetch(session.base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Votre réponse/);
  const firstQuestion =
    "Quel objectif ?\nRecommandation : clarifier la décision.";
  assert.equal(
    (
      await request("question", {
        method: "POST",
        body: { text: firstQuestion },
      })
    ).status,
    201,
  );
  const firstSeen = await request("events?after=0");
  assert.deepEqual(
    firstSeen.data.events.map(({ role, text }) => [role, text]),
    [["agent", firstQuestion]],
  );
  const firstAnswer =
    "Je veux clarifier mon public.\nJe vise les développeurs seniors.";
  const answer = { text: firstAnswer, key: "answer-0001" };
  assert.equal(
    (await request("answer", { method: "POST", body: answer })).status,
    201,
  );
  assert.equal(
    (await request("answer", { method: "POST", body: answer })).data.duplicate,
    true,
  );
  const agentSeen = await request("events?after=1");
  assert.deepEqual(
    agentSeen.data.events.map(({ role, text }) => [role, text]),
    [["user", firstAnswer]],
  );
  const secondQuestion =
    "Quels développeurs ?\nRecommandation : ceux qui portent les décisions.";
  assert.equal(
    (
      await request("question", {
        method: "POST",
        body: { text: secondQuestion },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request("answer", {
        method: "POST",
        body: { key: "answer-0002", text: "Ceux qui défendent leurs choix." },
      })
    ).status,
    201,
  );
  const close = await request("close", { method: "POST", body: {} });
  assert.equal(close.data.closed, true);
  const final = await request("history");
  assert.deepEqual(
    final.data.history.map(({ role }) => role),
    ["agent", "user", "agent", "user", "system"],
  );
  assert.deepEqual(
    final.data.history
      .filter(({ role }) => role === "user")
      .map(({ text }) => text),
    [firstAnswer, "Ceux qui défendent leurs choix."],
  );
  assert.equal(final.data.closed, true);
  assert.equal(
    (await request("question", { method: "POST", body: { text: "Encore ?" } }))
      .status,
    410,
  );
});

test("closing while the agent waits releases the wait", async (t) => {
  const { request } = await withSession(t);
  const waiting = request("events?after=0");
  assert.equal(
    (await request("close", { method: "POST", body: {} })).status,
    200,
  );
  const result = await waiting;
  assert.equal(result.data.closed, true);
  assert.deepEqual(
    result.data.events.map(({ role }) => role),
    ["system"],
  );
});

test("the local relay rejects unauthorized, repeated, and malformed submissions", async (t) => {
  const { session, request } = await withSession(t);
  assert.equal((await request("history", { token: "bad" })).status, 401);
  assert.equal(
    (await request("history", { origin: "https://other.example" })).status,
    403,
  );
  const foreignHostStatus = await new Promise((resolve) => {
    http.get(
      session.base,
      { headers: { Host: "other.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal(
    (
      await request("answer", {
        method: "POST",
        body: { key: "answer-0001", text: "Early" },
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("question", { method: "POST", body: { text: "Question" } }))
      .status,
    201,
  );
  assert.equal(
    (await request("question", { method: "POST", body: { text: "Second" } }))
      .status,
    409,
  );
  assert.equal(
    (await request("answer", { method: "POST", body: null })).status,
    400,
  );
  assert.equal(
    (
      await request("answer", {
        method: "POST",
        body: { key: "answer-0001", text: "Answer" },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request("answer", {
        method: "POST",
        body: { key: "answer-0002", text: "Duplicate turn" },
      })
    ).status,
    409,
  );
});

test("overlapping requests cannot publish two questions or two answers for one turn", async (t) => {
  const { session, request } = await withSession(t);
  const delayedPost = (path, body) => {
    const payload = JSON.stringify(body);
    let finish;
    const result = new Promise((resolve, reject) => {
      const req = http.request(
        `${session.base}/api/${path}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.token}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      );
      req.on("error", reject);
      req.write(payload.slice(0, 1));
      finish = () => req.end(payload.slice(1));
    });
    return { result, finish };
  };
  const slowQuestion = delayedPost("question", { text: "Slow question" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    (
      await request("question", {
        method: "POST",
        body: { text: "First question" },
      })
    ).status,
    201,
  );
  slowQuestion.finish();
  assert.equal(await slowQuestion.result, 409);
  const slowAnswer = delayedPost("answer", {
    key: "answer-slow",
    text: "Slow answer",
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    (
      await request("answer", {
        method: "POST",
        body: { key: "answer-fast", text: "Fast answer" },
      })
    ).status,
    201,
  );
  slowAnswer.finish();
  assert.equal(await slowAnswer.result, 409);
  const { data } = await request("history");
  assert.deepEqual(
    data.history.map(({ text }) => text),
    ["First question", "Fast answer"],
  );
});
