const token =
  new URLSearchParams(location.hash.slice(1)).get("token") ||
  sessionStorage.getItem("pek-grill-token");
if (token) sessionStorage.setItem("pek-grill-token", token);
history.replaceState(null, "", location.pathname);
const list = document.querySelector("#history");
const status = document.querySelector("#status");
const form = document.querySelector("#reply");
const answer = document.querySelector("#answer");
const send = document.querySelector("#send");
const close = document.querySelector("#close");
let cursor = 0;
let closed = false;
let sending = false;
let pendingKey = null;
let canAnswer = false;

async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok)
    throw new Error((await response.json()).error || `HTTP ${response.status}`);
  return response.json();
}

function setStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle("error", error);
}

function finish() {
  closed = true;
  answer.disabled = true;
  send.disabled = true;
  close.disabled = true;
  setStatus(
    "Entretien terminé. Vous pouvez fermer cet onglet et revenir à Codex.",
  );
}

function render(events) {
  for (const event of events) {
    if (event.id <= cursor) continue;
    cursor = event.id;
    const item = document.createElement("li");
    item.className = `message ${event.role}`;
    const label = document.createElement("strong");
    label.textContent =
      event.role === "agent"
        ? "Codex"
        : event.role === "user"
          ? "Vous"
          : "Session";
    const content = document.createElement("span");
    content.textContent = event.text;
    item.append(label, content);
    list.append(item);
    item.scrollIntoView({ block: "nearest" });
    if (event.role === "agent") canAnswer = true;
    if (event.role === "user") canAnswer = false;
  }
  answer.disabled = closed || !canAnswer || sending;
  send.disabled = closed || !canAnswer || sending;
}

async function poll() {
  while (!closed) {
    try {
      const data = await api(`events?after=${cursor}`);
      render(data.events);
      if (data.closed) finish();
      else if (!sending)
        setStatus(
          cursor
            ? "En attente de Codex ou de votre réponse."
            : "Codex prépare sa première question…",
        );
    } catch {
      setStatus("Connexion interrompue. Nouvelle tentative…", true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (closed || sending || !canAnswer || !answer.value.trim()) return;
  sending = true;
  answer.disabled = true;
  send.disabled = true;
  pendingKey ||= crypto.randomUUID();
  setStatus("Envoi en cours…");
  try {
    await api("answer", {
      method: "POST",
      body: JSON.stringify({ key: pendingKey, text: answer.value }),
    });
    pendingKey = null;
    answer.value = "";
    setStatus("Réponse reçue. Codex prépare la suite…");
  } catch {
    setStatus(
      "Envoi échoué. Votre texte est conservé. Réessayez ou revenez à Codex.",
      true,
    );
  } finally {
    sending = false;
    answer.disabled = closed || !canAnswer;
    send.disabled = closed || !canAnswer;
  }
});

answer.addEventListener("input", () => {
  if (!sending) pendingKey = null;
});

answer.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

close.addEventListener("click", async () => {
  if (closed) return;
  close.disabled = true;
  try {
    await api("close", { method: "POST", body: "{}" });
    finish();
  } catch {
    close.disabled = false;
    setStatus("Fermeture échouée. Réessayez ou revenez à Codex.", true);
  }
});

if (!token)
  setStatus(
    "Lien de session invalide. Revenez à Codex pour relancer l’entretien.",
    true,
  );
else
  api("history")
    .then((data) => {
      render(data.history);
      if (data.closed) finish();
      else poll();
    })
    .catch(() =>
      setStatus(
        "Session inaccessible. Revenez à Codex pour relancer l’entretien.",
        true,
      ),
    );
