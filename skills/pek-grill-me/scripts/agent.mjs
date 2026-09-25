#!/usr/bin/env node
const [command, base, token, argument] = process.argv.slice(2);
if (
  !["question", "wait", "history", "close", "close-ack"].includes(command) ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(base || "") ||
  !/^[a-f0-9]{64}$/.test(token || "")
) {
  console.error(
    "Usage: node agent.mjs <question|wait|history|close|close-ack> <base> <token> [json|cursor]",
  );
  process.exit(2);
}
const path =
  command === "wait"
    ? `/api/events?after=${Number(argument || 0)}`
    : command === "history"
      ? "/api/history"
      : command === "close"
        ? "/api/close"
        : command === "close-ack"
          ? "/api/close-ack"
          : "/api/question";
if (
  command === "wait" &&
  (!Number.isSafeInteger(Number(argument || 0)) || Number(argument || 0) < 0)
) {
  console.error("Invalid cursor.");
  process.exit(2);
}
try {
  let body;
  if (command === "question") {
    body = "";
    for await (const chunk of process.stdin) body += chunk;
    body = JSON.stringify(
      argument === "json" ? JSON.parse(body) : { text: body },
    );
  } else if (command === "close") body = "{}";
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  console.log(JSON.stringify(data));
} catch (error) {
  console.error(`Chat relay failed: ${error.message}`);
  process.exitCode = 1;
}
