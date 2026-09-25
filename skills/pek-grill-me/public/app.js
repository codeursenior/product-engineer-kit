const token =
  new URLSearchParams(location.hash.slice(1)).get("token") ||
  sessionStorage.getItem("pek-grill-token");
if (token) sessionStorage.setItem("pek-grill-token", token);
history.replaceState(null, "", location.pathname);

const list = document.querySelector("#history");
const activity = document.querySelector("#activity");
const status = document.querySelector("#status");
const elapsed = document.querySelector("#elapsed");
const choices = document.querySelector("#choices");
const answerLabel = document.querySelector("#answer-label");
const form = document.querySelector("#reply");
const answer = document.querySelector("#answer");
const send = document.querySelector("#send");
const close = document.querySelector("#close");
const sessionLabel = document.querySelector(".session-label");
let cursor = 0;
let closed = false;
let sending = false;
let pendingKey = null;
let canAnswer = false;
let activityState = "";
let activitySince = Date.now();

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

function setActivity(state, text) {
  if (state !== activityState || status.textContent !== text) {
    activitySince = Date.now();
    activityState = state;
  }
  status.textContent = text;
  activity.className = `activity ${state}`;
  updateElapsed();
}

function updateElapsed() {
  elapsed.textContent =
    activityState === "busy"
      ? `${Math.floor((Date.now() - activitySince) / 1000)} s`
      : "";
}
setInterval(updateElapsed, 1000);

function selectedChoice() {
  return choices.querySelector('input[name="choice"]:checked')?.value;
}

function updateControls() {
  answer.disabled = closed || sending || !canAnswer;
  send.disabled =
    closed ||
    sending ||
    !canAnswer ||
    (!selectedChoice() && !answer.value.trim());
  close.disabled = closed;
}

function renderChoices(event) {
  choices.replaceChildren();
  const hasChoices = Array.isArray(event.choices);
  answerLabel.textContent = hasChoices
    ? "Votre précision ou votre propre réponse"
    : "Votre réponse";
  answer.placeholder = hasChoices
    ? "Précisez votre choix, ou écrivez une autre réponse…"
    : "Écrivez votre réponse…";
  if (!hasChoices) return;
  const title = document.createElement("p");
  title.className = "choices-title";
  title.textContent = "Choisissez une réponse, ou écrivez la vôtre";
  choices.append(title);
  for (const option of event.choices) {
    const label = document.createElement("label");
    label.className = "choice";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "choice";
    radio.value = option.id;
    const body = document.createElement("span");
    body.className = "choice-body";
    const heading = document.createElement("span");
    heading.className = "choice-title";
    heading.textContent = option.label;
    if (option.id === event.recommendedId) {
      const badge = document.createElement("span");
      badge.className = "choice-recommended";
      badge.textContent = "Conseillé";
      heading.append(badge);
    }
    body.append(heading);
    if (option.description) {
      const description = document.createElement("span");
      description.className = "choice-description";
      description.textContent = option.description;
      body.append(description);
    }
    if (option.id === event.recommendedId) {
      const reason = document.createElement("span");
      reason.className = "choice-reason";
      reason.textContent = event.recommendationReason;
      body.append(reason);
    }
    label.append(radio, body);
    choices.append(label);
  }
  const custom = document.createElement("label");
  custom.className = "choice";
  const customRadio = document.createElement("input");
  customRadio.type = "radio";
  customRadio.name = "choice";
  customRadio.value = "";
  const customTitle = document.createElement("span");
  customTitle.className = "choice-title";
  customTitle.textContent = "Autre réponse";
  custom.append(customRadio, customTitle);
  choices.append(custom);
}

function scrollToLatest() {
  requestAnimationFrame(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight }),
  );
}

function render(events) {
  let changed = false;
  for (const event of events) {
    if (event.id <= cursor) continue;
    changed = true;
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
    if (event.role === "agent") {
      canAnswer = true;
      renderChoices(event);
      setActivity("ready", "À vous de répondre.");
    } else if (event.role === "user") {
      canAnswer = false;
      choices.replaceChildren();
      setActivity("busy", "Codex prépare la suite…");
    }
  }
  updateControls();
  if (changed) scrollToLatest();
}

function finish() {
  if (closed) return;
  closed = true;
  canAnswer = false;
  choices.replaceChildren();
  sessionLabel.textContent = "Terminé";
  setActivity(
    "closed",
    "Entretien terminé. Vous pouvez fermer cet onglet et revenir à Codex.",
  );
  updateControls();
  api("close-ack", { method: "POST", body: "{}" })
    .catch(() => {})
    .finally(() => window.close());
}

async function poll() {
  while (!closed) {
    try {
      const data = await api(`events?after=${cursor}`);
      render(data.events);
      if (data.closed) finish();
    } catch {
      if (closed) return;
      setActivity("error", "Connexion interrompue. Nouvelle tentative…");
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const choiceId = selectedChoice();
  const text = answer.value;
  if (closed || sending || !canAnswer || (!choiceId && !text.trim())) return;
  sending = true;
  pendingKey ||= crypto.randomUUID();
  setActivity("busy", "Envoi de votre réponse…");
  updateControls();
  try {
    const data = await api("answer", {
      method: "POST",
      body: JSON.stringify({
        key: pendingKey,
        text,
        ...(choiceId ? { choiceId } : {}),
      }),
    });
    pendingKey = null;
    answer.value = "";
    render([{ id: data.id, role: "user", text: data.text }]);
    if (cursor === data.id) {
      canAnswer = false;
      setActivity("busy", "Codex prépare la suite…");
    }
    scrollToLatest();
  } catch {
    setActivity(
      "error",
      "Envoi échoué. Votre réponse est conservée. Réessayez.",
    );
  } finally {
    sending = false;
    updateControls();
  }
});

answer.addEventListener("input", () => {
  if (!sending) pendingKey = null;
  updateControls();
});
choices.addEventListener("change", () => {
  if (!sending) pendingKey = null;
  if (choices.querySelector('input[name="choice"]:checked')?.value === "")
    answer.focus();
  updateControls();
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
  setActivity("busy", "Fin de l’entretien…");
  try {
    await api("close", { method: "POST", body: "{}" });
    finish();
  } catch {
    close.disabled = false;
    setActivity("error", "Fermeture échouée. Réessayez ou revenez à Codex.");
  }
});

if (!token) {
  setActivity(
    "error",
    "Lien de session invalide. Revenez à Codex pour relancer l’entretien.",
  );
  answer.disabled = true;
  send.disabled = true;
  close.disabled = true;
} else {
  setActivity("busy", "Codex prépare sa première question…");
  updateControls();
  api("history")
    .then((data) => {
      render(data.history);
      if (data.closed) finish();
      else poll();
    })
    .catch(() =>
      setActivity(
        "error",
        "Session inaccessible. Revenez à Codex pour relancer l’entretien.",
      ),
    );
}
