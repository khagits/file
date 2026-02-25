// Local Workspace (5 modules): Dashboard, Tasks, Notes, Budget, Bot
// Vanilla JS + localStorage + hash routing

const KEY = "local_workspace_v2";

const defaultState = {
    theme: "light",
    tasks: [],
    notes: [],
    budget: [],
    activity: [], // last 10
    chat: [] // {id, role:'user'|'bot', text, ts}
};

function structuredCloneSafe(x){ return JSON.parse(JSON.stringify(x)); }

function loadState() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return structuredCloneSafe(defaultState);
        const parsed = JSON.parse(raw);
        return {
            ...structuredCloneSafe(defaultState),
            ...parsed,
            tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
            notes: Array.isArray(parsed.notes) ? parsed.notes : [],
            budget: Array.isArray(parsed.budget) ? parsed.budget : [],
            activity: Array.isArray(parsed.activity) ? parsed.activity : [],
            chat: Array.isArray(parsed.chat) ? parsed.chat : []
        };
    } catch {
        return structuredCloneSafe(defaultState);
    }
}

let state = loadState();

function saveState() {
    localStorage.setItem(KEY, JSON.stringify(state));
}

function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function nowISO() { return new Date().toISOString(); }

function escapeHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function formatWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
}
function currency(n) {
    return (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// Toast
const toastEl = document.getElementById("toast");
let toastTimer = null;
function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1700);
}

// Theme
function applyTheme() {
    document.documentElement.dataset.theme = state.theme || "light";
}
applyTheme();

// Activity
function addActivity(text) {
    state.activity.unshift({ id: uid(), ts: nowISO(), text });
    state.activity = state.activity.slice(0, 10);
    saveState();
}

// Routing (hash-based, clickable links)
const routes = ["dashboard","tasks","notes","budget","bot"];
const navLinks = [...document.querySelectorAll(".nav-link")];
const views = [...document.querySelectorAll("[data-view]")];

function setActiveNav(route) {
    navLinks.forEach(a => {
        const active = a.dataset.route === route;
        if (active) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
    });
}

function showView(route) {
    views.forEach(v => v.hidden = v.id !== `view-${route}`);
}

function setRoute(route) {
    if (!routes.includes(route)) route = "dashboard";
    setActiveNav(route);
    showView(route);

    // render module
    if (route === "dashboard") renderDashboard();
    if (route === "tasks") renderTasks();
    if (route === "notes") renderNotes();
    if (route === "budget") renderBudget();
    if (route === "bot") renderBot();
}

window.addEventListener("hashchange", () => {
    const route = (location.hash || "#dashboard").slice(1);
    setRoute(route);
});

document.addEventListener("click", (e) => {
    const jump = e.target?.dataset?.jump;
    if (jump) location.hash = `#${jump}`;
});

// ---------- Dashboard ----------
function computeBudgetTotals() {
    const income = state.budget.filter(x => x.type === "income").reduce((s, x) => s + x.amount, 0);
    const expense = state.budget.filter(x => x.type === "expense").reduce((s, x) => s + x.amount, 0);
    return { income, expense, balance: income - expense, count: state.budget.length };
}

function renderDashboard() {
    const totalTasks = state.tasks.length;
    const done = state.tasks.filter(t => t.done).length;

    document.getElementById("dash-tasks-total").textContent = String(totalTasks);
    document.getElementById("dash-tasks-done").textContent = `${done} completed`;
    document.getElementById("dash-notes-total").textContent = String(state.notes.length);

    const { balance, count } = computeBudgetTotals();
    document.getElementById("dash-budget-balance").textContent = currency(balance);
    document.getElementById("dash-budget-lines").textContent = `${count} entries`;

    const ul = document.getElementById("dash-recent");
    const empty = document.getElementById("dash-recent-empty");
    ul.innerHTML = "";

    if (!state.activity.length) { empty.hidden = false; return; }
    empty.hidden = true;

    state.activity.forEach(a => {
        const li = document.createElement("li");
        li.className = "item";
        li.innerHTML = `
      <div class="checkbox">🕒</div>
      <div>
        <div class="item-title">${escapeHtml(a.text)}</div>
        <div class="item-sub">${escapeHtml(formatWhen(a.ts))}</div>
      </div>
      <div></div>
    `;
        ul.appendChild(li);
    });
}

// ---------- Tasks ----------
const tasksForm = document.getElementById("tasks-form");
const tasksList = document.getElementById("tasks-list");
const tasksEmpty = document.getElementById("tasks-empty");
const tasksMeta = document.getElementById("tasks-meta");
const tasksSearch = document.getElementById("tasks-search");
const tasksFilter = document.getElementById("tasks-filter");

tasksForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("task-title").value.trim();
    const tag = document.getElementById("task-tag").value.trim();
    const priority = document.getElementById("task-priority").value;
    if (!title) return;

    state.tasks.unshift({ id: uid(), title, tag, priority, done: false, createdAt: nowISO() });
    saveState();
    addActivity(`Added task: "${title}"`);
    toast("Task added");
    tasksForm.reset();
    renderTasks();
});

tasksSearch.addEventListener("input", renderTasks);
tasksFilter.addEventListener("change", renderTasks);

function normalizePriority(p) {
    const v = (p || "").toLowerCase().trim();
    if (v === "high") return "high";
    if (v === "low") return "low";
    return "med";
}
function badge(priority) {
    const p = (priority || "med").toLowerCase();
    const label = p === "high" ? "High" : p === "low" ? "Low" : "Med";
    return `<span class="pill" title="Priority">${label}</span>`;
}
function tagPill(tag) { return `<span class="pill" title="Tag">${escapeHtml(tag)}</span>`; }

function renderTasks() {
    const q = (tasksSearch.value || "").trim().toLowerCase();
    const f = tasksFilter.value;

    let list = [...state.tasks];
    if (f === "open") list = list.filter(t => !t.done);
    if (f === "done") list = list.filter(t => t.done);

    if (q) {
        list = list.filter(t =>
            t.title.toLowerCase().includes(q) ||
            (t.tag || "").toLowerCase().includes(q) ||
            (t.priority || "").toLowerCase().includes(q)
        );
    }

    tasksList.innerHTML = "";
    const done = state.tasks.filter(t => t.done).length;
    tasksMeta.textContent = `${state.tasks.length} total • ${done} completed`;

    if (!list.length) { tasksEmpty.hidden = false; return; }
    tasksEmpty.hidden = true;

    list.forEach(t => {
        const li = document.createElement("li");
        li.className = "item";
        li.innerHTML = `
      <input class="checkbox" type="checkbox" ${t.done ? "checked" : ""} aria-label="Toggle complete">
      <div>
        <div class="item-title">${escapeHtml(t.title)} ${badge(t.priority)} ${t.tag ? tagPill(t.tag) : ""}</div>
        <div class="item-sub">Created: ${escapeHtml(formatWhen(t.createdAt))}</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-act="edit" title="Edit">✏️</button>
        <button class="icon-btn" data-act="del" title="Delete">🗑️</button>
      </div>
    `;

        li.querySelector("input[type=checkbox]").addEventListener("change", (e) => {
            const target = state.tasks.find(x => x.id === t.id);
            if (!target) return;
            target.done = e.target.checked;
            saveState();
            addActivity(`${target.done ? "Completed" : "Reopened"} task: "${target.title}"`);
            toast(target.done ? "Marked complete" : "Marked open");
            renderTasks();
        });

        li.querySelector('[data-act="del"]').addEventListener("click", () => {
            if (!confirm("Delete this task?")) return;
            state.tasks = state.tasks.filter(x => x.id !== t.id);
            saveState();
            addActivity(`Deleted task: "${t.title}"`);
            toast("Task deleted");
            renderTasks();
        });

        li.querySelector('[data-act="edit"]').addEventListener("click", () => {
            const newTitle = prompt("Edit task title:", t.title);
            if (newTitle === null) return;
            const title = newTitle.trim();
            if (!title) return;

            const newTag = prompt("Edit tag (optional):", t.tag || "") ?? (t.tag || "");
            const newPriority = prompt("Priority: low / med / high", t.priority || "med") ?? (t.priority || "med");

            const target = state.tasks.find(x => x.id === t.id);
            if (!target) return;

            target.title = title;
            target.tag = (newTag || "").trim();
            target.priority = normalizePriority(newPriority);

            saveState();
            addActivity(`Edited task: "${title}"`);
            toast("Task updated");
            renderTasks();
        });

        tasksList.appendChild(li);
    });
}

// ---------- Notes ----------
const notesForm = document.getElementById("notes-form");
const notesList = document.getElementById("notes-list");
const notesEmpty = document.getElementById("notes-empty");
const notesSearch = document.getElementById("notes-search");

notesForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("note-title").value.trim();
    const body = document.getElementById("note-body").value.trim();
    if (!title || !body) return;

    state.notes.unshift({ id: uid(), title, body, updatedAt: nowISO() });
    saveState();
    addActivity(`Saved note: "${title}"`);
    toast("Note saved");
    notesForm.reset();
    renderNotes();
});

notesSearch.addEventListener("input", renderNotes);

function renderNotes() {
    const q = (notesSearch.value || "").trim().toLowerCase();
    let list = [...state.notes];
    if (q) list = list.filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));

    notesList.innerHTML = "";
    if (!list.length) { notesEmpty.hidden = false; return; }
    notesEmpty.hidden = true;

    list.forEach(n => {
        const div = document.createElement("div");
        div.className = "card note-card";
        div.innerHTML = `
      <h3>${escapeHtml(n.title)}</h3>
      <div class="muted tiny">Updated: ${escapeHtml(formatWhen(n.updatedAt))}</div>
      <div class="note-body">${escapeHtml(n.body)}</div>
      <div class="row">
        <button class="btn small" data-act="edit">Edit</button>
        <button class="btn small danger" data-act="del">Delete</button>
      </div>
    `;

        div.querySelector('[data-act="del"]').addEventListener("click", () => {
            if (!confirm("Delete this note?")) return;
            state.notes = state.notes.filter(x => x.id !== n.id);
            saveState();
            addActivity(`Deleted note: "${n.title}"`);
            toast("Note deleted");
            renderNotes();
        });

        div.querySelector('[data-act="edit"]').addEventListener("click", () => {
            const newTitle = prompt("Edit note title:", n.title);
            if (newTitle === null) return;
            const title = newTitle.trim();
            if (!title) return;

            const newBody = prompt("Edit note body:", n.body);
            if (newBody === null) return;
            const body = newBody.trim();
            if (!body) return;

            const target = state.notes.find(x => x.id === n.id);
            if (!target) return;

            target.title = title;
            target.body = body;
            target.updatedAt = nowISO();

            saveState();
            addActivity(`Edited note: "${title}"`);
            toast("Note updated");
            renderNotes();
        });

        notesList.appendChild(div);
    });
}

// ---------- Budget ----------
const budgetForm = document.getElementById("budget-form");
const budgetList = document.getElementById("budget-list");
const budgetEmpty = document.getElementById("budget-empty");
const budgetMeta = document.getElementById("budget-meta");
const budgetFilter = document.getElementById("budget-filter");

budgetForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const type = document.getElementById("budget-type").value;
    const label = document.getElementById("budget-label").value.trim();
    const amountRaw = document.getElementById("budget-amount").value;
    const amount = Number(amountRaw);

    if (!label || !Number.isFinite(amount)) return;

    state.budget.unshift({
        id: uid(),
        type: type === "income" ? "income" : "expense",
        label,
        amount: Math.abs(amount),
        createdAt: nowISO()
    });

    saveState();
    addActivity(`Added ${type}: "${label}" (${currency(amount)})`);
    toast("Budget entry added");
    budgetForm.reset();
    renderBudget();
});

budgetFilter.addEventListener("change", renderBudget);

function typePill(type) {
    const t = type === "income" ? "Income" : "Expense";
    return `<span class="pill">${t}</span>`;
}

function renderBudget() {
    const f = budgetFilter.value;
    let list = [...state.budget];
    if (f === "income") list = list.filter(x => x.type === "income");
    if (f === "expense") list = list.filter(x => x.type === "expense");

    const totals = computeBudgetTotals();
    document.getElementById("budget-income").textContent = currency(totals.income);
    document.getElementById("budget-expense").textContent = currency(totals.expense);
    document.getElementById("budget-balance").textContent = currency(totals.balance);
    budgetMeta.textContent = `${state.budget.length} total entries`;

    budgetList.innerHTML = "";
    if (!list.length) { budgetEmpty.hidden = false; return; }
    budgetEmpty.hidden = true;

    list.forEach(x => {
        const li = document.createElement("li");
        li.className = "item";
        const icon = x.type === "income" ? "➕" : "➖";
        const sign = x.type === "income" ? "+" : "-";
        li.innerHTML = `
      <div class="checkbox">${icon}</div>
      <div>
        <div class="item-title">${escapeHtml(x.label)} ${typePill(x.type)}</div>
        <div class="item-sub">${escapeHtml(formatWhen(x.createdAt))}</div>
      </div>
      <div class="item-actions">
        <div class="pill">${sign}${escapeHtml(currency(x.amount))}</div>
        <button class="icon-btn" data-act="edit" title="Edit">✏️</button>
        <button class="icon-btn" data-act="del" title="Delete">🗑️</button>
      </div>
    `;

        li.querySelector('[data-act="del"]').addEventListener("click", () => {
            if (!confirm("Delete this entry?")) return;
            state.budget = state.budget.filter(b => b.id !== x.id);
            saveState();
            addActivity(`Deleted budget entry: "${x.label}"`);
            toast("Entry deleted");
            renderBudget();
        });

        li.querySelector('[data-act="edit"]').addEventListener("click", () => {
            const newLabel = prompt("Edit label:", x.label);
            if (newLabel === null) return;
            const label = newLabel.trim();
            if (!label) return;

            const newAmount = prompt("Edit amount:", String(x.amount));
            if (newAmount === null) return;
            const amt = Number(newAmount);
            if (!Number.isFinite(amt)) return;

            const newType = prompt("Type: income / expense", x.type);
            const type = (newType || x.type).toLowerCase().trim() === "income" ? "income" : "expense";

            const target = state.budget.find(b => b.id === x.id);
            if (!target) return;

            target.label = label;
            target.amount = Math.abs(amt);
            target.type = type;

            saveState();
            addActivity(`Edited budget entry: "${label}"`);
            toast("Entry updated");
            renderBudget();
        });

        budgetList.appendChild(li);
    });
}

// ---------- BOT (offline, command-based) ----------
const botMessagesEl = document.getElementById("bot-messages");
const botForm = document.getElementById("bot-form");
const botInput = document.getElementById("bot-input");
const botClear = document.getElementById("bot-clear");

botForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = (botInput.value || "").trim();
    if (!text) return;
    botInput.value = "";
    chatAdd("user", text);
    const reply = botRespond(text);
    chatAdd("bot", reply);
    saveState();
    renderBot();
});

botClear.addEventListener("click", () => {
    if (!confirm("Clear chat history?")) return;
    state.chat = [];
    saveState();
    toast("Chat cleared");
    renderBot();
});

function chatAdd(role, text) {
    state.chat.push({ id: uid(), role, text, ts: nowISO() });
    // keep it from growing forever
    state.chat = state.chat.slice(-200);
}

function renderBot() {
    botMessagesEl.innerHTML = "";
    if (!state.chat.length) {
        // starter message
        const starter = "Hi! I’m your offline bot.\nType 'help' to see commands.\nTry: add task: Buy milk";
        state.chat.push({ id: uid(), role: "bot", text: starter, ts: nowISO() });
        saveState();
    }

    for (const m of state.chat) {
        const div = document.createElement("div");
        div.className = `bot-bubble ${m.role}`;
        div.innerHTML = `
      <div>${escapeHtml(m.text)}</div>
      <div class="bot-meta">${escapeHtml(m.role)} • ${escapeHtml(formatWhen(m.ts))}</div>
    `;
        botMessagesEl.appendChild(div);
    }
    botMessagesEl.scrollTop = botMessagesEl.scrollHeight;
}

function botRespond(input) {
    const t = input.trim();
    const lower = t.toLowerCase();

    if (lower === "help" || lower === "/help") {
        return [
            "Commands:",
            "- help",
            "- stats",
            "- add task: <title>",
            "- add note: <title> | <body>",
            "- add expense: <label> | <amount>",
            "- add income: <label> | <amount>",
            "",
            "Examples:",
            "add task: Finish report",
            "add note: Meeting | Discuss project timeline",
            "add expense: Groceries | 12.50",
            "add income: Salary | 1000"
        ].join("\n");
    }

    if (lower === "stats") {
        const totalTasks = state.tasks.length;
        const done = state.tasks.filter(x => x.done).length;
        const notes = state.notes.length;
        const totals = computeBudgetTotals();
        return [
            `Tasks: ${totalTasks} total (${done} completed)`,
            `Notes: ${notes}`,
            `Budget: ${totals.count} entries`,
            `Income: ${currency(totals.income)}`,
            `Expense: ${currency(totals.expense)}`,
            `Balance: ${currency(totals.balance)}`
        ].join("\n");
    }

    // add task
    if (lower.startsWith("add task:")) {
        const title = t.slice("add task:".length).trim();
        if (!title) return "Please provide a task title. Example: add task: Buy milk";
        state.tasks.unshift({ id: uid(), title, tag: "", priority: "med", done: false, createdAt: nowISO() });
        saveState();
        addActivity(`Bot added task: "${title}"`);
        return `✅ Added task: "${title}". Open Tasks to view it.`;
    }

    // add note
    if (lower.startsWith("add note:")) {
        const payload = t.slice("add note:".length).trim();
        const parts = payload.split("|").map(x => x.trim()).filter(Boolean);
        if (parts.length < 2) return "Format: add note: Title | Body";
        const title = parts[0];
        const body = parts.slice(1).join(" | ");
        state.notes.unshift({ id: uid(), title, body, updatedAt: nowISO() });
        saveState();
        addActivity(`Bot saved note: "${title}"`);
        return `📝 Saved note: "${title}". Open Notes to view it.`;
    }

    // add budget (income/expense)
    if (lower.startsWith("add expense:") || lower.startsWith("add income:")) {
        const type = lower.startsWith("add income:") ? "income" : "expense";
        const payload = t.slice(type === "income" ? "add income:".length : "add expense:".length).trim();
        const parts = payload.split("|").map(x => x.trim()).filter(Boolean);
        if (parts.length < 2) return `Format: add ${type}: Label | Amount`;
        const label = parts[0];
        const amt = Number(parts[1]);
        if (!Number.isFinite(amt)) return "Amount must be a number. Example: add expense: Groceries | 12.50";

        state.budget.unshift({ id: uid(), type, label, amount: Math.abs(amt), createdAt: nowISO() });
        saveState();
        addActivity(`Bot added ${type}: "${label}" (${currency(amt)})`);
        return `💰 Added ${type}: "${label}" for ${currency(amt)}. Open Budget to view it.`;
    }

    // lightweight FAQ / small talk
    if (lower.includes("hello") || lower.includes("hi")) return "Hello 👋 Type 'help' to see what I can do.";
    if (lower.includes("what can you do")) return "I can manage your local Tasks/Notes/Budget via commands. Type 'help'.";
    if (lower.includes("where is my data")) return "Your data is stored locally in your browser (localStorage).";

    return "I didn’t understand that. Type 'help' for commands, or try 'stats'.";
}

// ---------- Boot ----------
function boot() {
    // default route
    const route = (location.hash || "#dashboard").slice(1);
    setRoute(routes.includes(route) ? route : "dashboard");

    // initial renders
    renderDashboard();
}
boot();