// ============================================================
// ui/chat-tests.js  -  CHAT TEST CONFIGURATION PANEL (index page)
// ============================================================
// Renders a "Chat Tests" section below the main config on index.html.
// Each discovered agent gets its own collapsible card that shows its
// saved tests (from /api/settings), lets the user add/delete/toggle
// tests, and runs them INLINE against /api/chat - no page switch.
//
// Tests are stored globally in app_settings.json under:
//   settings.chatTests.tests[]
//
// Each test object may include an "agentId" field to scope it to a
// specific agent. Tests without an agentId are shared/global and run
// for every agent. Scoped + global tests both run for their agent;
// tests scoped to OTHER agents are filtered out.
//
// The runner drives the same server-owned session flow as the chat
// page: one session per agent-run (new_chat on the first turn, then the
// returned session_id is reused), with an in-memory history chain and
// the same string/regex/type expectation engine.
// ============================================================

import { sendChat } from "../api/api.js";

/**
 * Render the chat-tests section and mount it into `mountEl`.
 *
 * @param {HTMLElement}  mountEl   - Container to append into
 * @param {object[]}     agents    - [{id, name, mode, description}]
 * @param {object}       settings  - Full app settings object from /api/settings
 * @param {Function}     onSave    - (newSettings) => void, called after a successful save
 */
export function renderChatTests({ mountEl, agents = [], settings = {}, onSave }) {

    const allTests = Array.isArray((settings.chatTests || {}).tests)
        ? (settings.chatTests.tests)
        : [];

    const heading = el("h2", "config-section-heading", "Chat Tests");
    mountEl.appendChild(heading);

    const intro = el("p", "config-note",
        "Configure and run automated tests per agent. Tests are saved to app_settings.json " +
        "and executed inline against /api/chat - each run uses one live server session."
    );
    mountEl.appendChild(intro);

    // Enable All / Disable All control (top of the section).
    const toolbar = el("div", "chat-tests-toolbar");
    const enableBtn = el("button", "btn btn-secondary btn-small", "Enable all");
    const disableBtn = el("button", "btn btn-secondary btn-small", "Disable all");
    toolbar.appendChild(enableBtn);
    toolbar.appendChild(disableBtn);
    mountEl.appendChild(toolbar);

    // One collapsible card per agent.
    const cards = el("div", "chat-tests-cards");
    mountEl.appendChild(cards);

    function setAllEnabled(enabled) {
        allTests.forEach(test => { test.enabled = enabled; });
    }

    async function applyAll(enabled) {
        const previously = allTests.map(t => t.enabled);
        setAllEnabled(enabled);
        try {
            await saveTests(allTests, settings, onSave);
            redraw();
        } catch (_) {
            setAllEnabledTo(previously);
            redraw();
        }
    }

    function setAllEnabledTo(values) {
        allTests.forEach((test, index) => { test.enabled = values[index]; });
    }

    function redraw() {
        cards.replaceChildren();
        agents.forEach(agent => {
            cards.appendChild(buildAgentTestCard(agent, allTests, settings, onSave));
        });
    }

    enableBtn.addEventListener("click", () => applyAll(true));
    disableBtn.addEventListener("click", () => applyAll(false));

    redraw();
}


// ----------------------------------------------------------------
// CARD BUILDERS
// ----------------------------------------------------------------

function buildAgentTestCard(agent, allTests, settings, onSave) {

    const agentTests = allTests.filter(t => !t.agentId || t.agentId === agent.id);

    const card = document.createElement("div");
    card.className = "panel agent-test-card";
    card.style.marginBottom = "16px";

    // Header
    const header = document.createElement("div");
    header.className = "agent-test-card-header";
    header.style.cssText =
        "display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;" +
        "padding:14px 16px;border-bottom:1px solid var(--color-border,#e1e5e8);";

    const chevron = el("span", "agent-test-chevron", "v");
    chevron.style.cssText = "font-size:11px;transition:transform .15s ease;color:var(--color-text-muted,#64748b);font-weight:bold;";

    const nameEl = el("span", "", agent.name);
    nameEl.style.cssText = "font-weight:700;font-size:15px;flex:1;";

    const modeBadge = el("span", "badge", agent.mode || "chat");

    const countBadge = el("span", "", agentTests.length + " test" + (agentTests.length !== 1 ? "s" : ""));
    countBadge.style.cssText = "font-size:11px;color:var(--color-text-faint,#94a3b8);";

    header.appendChild(chevron);
    header.appendChild(nameEl);
    header.appendChild(modeBadge);
    header.appendChild(countBadge);
    card.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "agent-test-card-body";
    body.style.cssText = "padding:14px 16px;display:none;";  // collapsed by default
    card.appendChild(body);

    let collapsed = true;
    header.addEventListener("click", () => {
        collapsed = !collapsed;
        body.style.display = collapsed ? "none" : "";
        chevron.style.transform = collapsed ? "rotate(-90deg)" : "";
    });

    // Test list container
    const listContainer = document.createElement("div");
    listContainer.className = "agent-test-list";
    renderTestList(listContainer, agentTests, agent, allTests, settings, onSave, countBadge);
    body.appendChild(listContainer);

    const hr = document.createElement("hr");
    hr.style.cssText = "border:none;border-top:1px dashed var(--color-border,#e1e5e8);margin:14px 0;";
    body.appendChild(hr);

    const builderTitle = el("p", "", "Add a new test");
    builderTitle.style.cssText = "font-weight:700;margin:0 0 10px;font-size:12px;color:var(--color-text-muted,#64748b);text-transform:uppercase;letter-spacing:.4px;";
    body.appendChild(builderTitle);

    const builder = buildStepBuilder(agent, allTests, settings, onSave, listContainer, agentTests, countBadge);
    body.appendChild(builder);

    const hr2 = document.createElement("hr");
    hr2.style.cssText = "border:none;border-top:1px dashed var(--color-border,#e1e5e8);margin:14px 0;";
    body.appendChild(hr2);

    // ---- Inline runner ----
    const runnerWrap = el("div", "agent-test-runner");

    const runStatusEl = el("p", "config-note", "");
    runStatusEl.className = "test-run-status";
    runStatusEl.style.cssText = "font-size:12px;font-weight:600;margin:0 0 6px;min-height:16px;";

    const runResultsEl = document.createElement("div");
    runResultsEl.className = "test-run-results";
    runResultsEl.style.cssText = "margin-bottom:10px;";
    runResultsEl.style.display = "none";

    const runBtn = document.createElement("button");
    runBtn.type = "button";
    runBtn.className = "btn btn-primary btn-small";
    runBtn.textContent = "Run tests for " + agent.name;

    const stopBtn = document.createElement("button");
    stopBtn.type = "button";
    stopBtn.className = "btn btn-secondary btn-small";
    stopBtn.textContent = "Stop";
    stopBtn.style.marginLeft = "6px";
    stopBtn.style.display = "none";

    runnerWrap.appendChild(runStatusEl);
    runnerWrap.appendChild(runResultsEl);
    runnerWrap.appendChild(runBtn);
    runnerWrap.appendChild(stopBtn);
    body.appendChild(runnerWrap);

    // Reflect enable-all/disable-all onto the toggles already rendered.
    // (renderTestList creates fresh nodes each time, so this is handled by
    //  redraw() + the global toggle handlers.)

    // Runner wiring
    const chatRunBtn = document.createElement("button");
    chatRunBtn.type = "button";
    chatRunBtn.className = "btn btn-secondary btn-small";
    chatRunBtn.textContent = "Run tests in chat \u2192";
    chatRunBtn.title =
        "Opens chat.html in run mode and plays every enabled test for this agent " +
        "as real chat messages so you can see the output.";
    chatRunBtn.style.marginLeft = "6px";
    runnerWrap.appendChild(chatRunBtn);

    chatRunBtn.addEventListener("click", () => {
        const url = "static/chat.html" +
            "?agent=" + encodeURIComponent(agent.id) +
            "&runTests=1";
        window.open(url, "_blank");
    });

    runBtn.addEventListener("click", () => {
        startTestRun({
            agent,
            model: settings.defaultModel || "",
            allTests,
            runStatusEl,
            runResultsEl,
            runBtn,
            stopBtn,
        });
    });

    stopBtn.addEventListener("click", () => {
        const run = runs.get(agent.id);
        if (run) {
            run.cancelled = true;
            stopBtn.disabled = true;
        }
    });

    return card;
}


// ----------------------------------------------------------------
// TEST LIST RENDERER
// ----------------------------------------------------------------

function renderTestList(container, agentTests, agent, allTests, settings, onSave, countBadge) {
    container.replaceChildren();

    if (!agentTests.length) {
        container.appendChild(el("p", "config-note", "No tests yet. Add one below."));
        return;
    }

    agentTests.forEach(test => {

        const row = document.createElement("div");
        row.className = "test-row";
        row.style.cssText =
            "display:flex;align-items:center;gap:8px;padding:6px 0;" +
            "border-bottom:1px dashed var(--color-border,#e1e5e8);font-size:13px;";

        const tog = document.createElement("input");
        tog.type = "checkbox";
        tog.checked = test.enabled !== false;
        tog.title = "Toggle test enabled";
        tog.addEventListener("change", async () => {
            test.enabled = tog.checked;
            try { await saveTests(allTests, settings, onSave); } catch (_) {}
        });
        row.appendChild(tog);

        const nameEl = el("span", "", test.name || test.id);
        nameEl.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        nameEl.title = test.name || test.id;
        row.appendChild(nameEl);

        const steps = getSteps(test);
        const badge = el("span", "badge", steps.length + " step" + (steps.length !== 1 ? "s" : ""));
        badge.style.cssText = "font-size:10px;";
        row.appendChild(badge);

        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-small";
        del.textContent = "x";
        del.title = "Delete this test";
        del.style.cssText = "padding:2px 7px;font-size:11px;color:var(--color-danger,#b91c1c);border-color:var(--color-danger,#b91c1c);";
        del.addEventListener("click", async () => {
            const idx = allTests.findIndex(t => t.id === test.id);
            if (idx >= 0) {
                allTests.splice(idx, 1);
                try { await saveTests(allTests, settings, onSave); } catch (_) {}
                const fresh = allTests.filter(t => !t.agentId || t.agentId === agent.id);
                renderTestList(container, fresh, agent, allTests, settings, onSave, countBadge);
                updateCountBadge(countBadge, fresh.length);
            }
        });
        row.appendChild(del);

        container.appendChild(row);
    });
}


// ----------------------------------------------------------------
// STEP BUILDER
// ----------------------------------------------------------------

function buildStepBuilder(agent, allTests, settings, onSave, listContainer, agentTests, countBadge) {

    const wrapper = document.createElement("div");

    const inputRow = document.createElement("div");
    inputRow.style.cssText = "display:flex;gap:8px;margin-bottom:8px;";

    const stepInput = document.createElement("input");
    stepInput.type = "text";
    stepInput.placeholder = "Type a message / question for the agent...";
    stepInput.style.cssText = "flex:1;padding:7px 10px;border:1px solid var(--color-border,#e1e5e8);border-radius:6px;font:inherit;font-size:13px;";
    inputRow.appendChild(stepInput);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-secondary btn-small";
    addBtn.textContent = "+ Add Step";
    inputRow.appendChild(addBtn);
    wrapper.appendChild(inputRow);

    const draftSteps = [];
    const draftList = document.createElement("div");
    draftList.style.cssText =
        "min-height:32px;padding:7px 9px;border:1px dashed var(--color-border-strong,#cbd5e1);" +
        "border-radius:7px;background:var(--color-surface-alt,#fafafa);font-size:12px;margin-bottom:10px;color:var(--color-text-faint,#94a3b8);font-style:italic;";
    draftList.textContent = "No steps yet.";
    wrapper.appendChild(draftList);

    function refreshDraft() {
        draftList.replaceChildren();
        draftList.style.fontStyle = "";
        draftList.style.color = "";
        if (!draftSteps.length) {
            draftList.style.fontStyle = "italic";
            draftList.style.color = "var(--color-text-faint,#94a3b8)";
            draftList.textContent = "No steps yet.";
            return;
        }
        draftSteps.forEach((step, i) => {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;gap:7px;padding:3px 0;" + (i > 0 ? "border-top:1px dashed var(--color-border,#e1e5e8);" : "");
            const idx = document.createElement("span");
            idx.style.cssText = "color:var(--color-text-faint,#94a3b8);min-width:18px;text-align:right;font-weight:600;";
            idx.textContent = (i + 1) + ".";
            row.appendChild(idx);
            row.appendChild(el("span", "", step));
            draftList.appendChild(row);
        });
    }

    addBtn.addEventListener("click", () => {
        const val = stepInput.value.trim();
        if (!val) return;
        draftSteps.push(val);
        stepInput.value = "";
        stepInput.focus();
        refreshDraft();
    });

    stepInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addBtn.click(); }
    });

    const actionRow = document.createElement("div");
    actionRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;";

    const commitBtn = document.createElement("button");
    commitBtn.type = "button";
    commitBtn.className = "btn btn-primary btn-small";
    commitBtn.textContent = "Commit as Test";
    actionRow.appendChild(commitBtn);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn-secondary btn-small";
    clearBtn.textContent = "Clear Steps";
    actionRow.appendChild(clearBtn);

    const statusEl = el("span", "config-note", "");
    statusEl.style.cssText = "font-size:11px;";

    wrapper.appendChild(actionRow);

    const statusWrap = document.createElement("div");
    statusWrap.style.marginTop = "6px";
    statusWrap.appendChild(statusEl);
    wrapper.appendChild(statusWrap);

    clearBtn.addEventListener("click", () => {
        draftSteps.length = 0;
        refreshDraft();
    });

    commitBtn.addEventListener("click", async () => {
        if (!draftSteps.length) {
            statusEl.textContent = "Add at least one step first.";
            return;
        }

        const name = draftSteps[0].length > 60
            ? draftSteps[0].slice(0, 60).trimEnd() + "..."
            : draftSteps[0];

        const newTest = {
            id: "custom-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
            name,
            agentId: agent.id,
            steps: [...draftSteps],
            expectedResult: { mode: "type", value: "nonEmpty" },
            enabled: true,
        };

        const normalized = draftSteps.join("\n---\n");
        const existing = allTests.findIndex(t => getSteps(t).join("\n---\n") === normalized);
        if (existing >= 0) {
            allTests.splice(existing, 1, newTest);
        } else {
            allTests.push(newTest);
        }

        try {
            await saveTests(allTests, settings, onSave);
        } catch (e) {
            statusEl.textContent = "Save failed: " + e.message;
            return;
        }

        draftSteps.length = 0;
        refreshDraft();
        statusEl.textContent = 'Test "' + name + '" saved.';

        const fresh = allTests.filter(t => !t.agentId || t.agentId === agent.id);
        renderTestList(listContainer, fresh, agent, allTests, settings, onSave, countBadge);
        updateCountBadge(countBadge, fresh.length);

        setTimeout(() => { statusEl.textContent = ""; }, 3500);
    });

    return wrapper;
}


// ----------------------------------------------------------------
// INLINE TEST RUNNER
// ----------------------------------------------------------------

/** One runner per agent (indexed by agent.id) so each agent can have its own
    in-flight or finished run state. */
const runs = new Map(); // agentId -> run object

function makeRun() {
    return {
        running: false,
        cancelled: false,
        results: [],
        sessionId: "",
        history: [],
    };
}

/** The tests that would run for an agent: enabled tests that are either
    global (no agentId) or scoped to this agent. */
function testsForAgent(allTests, agent) {
    return allTests.filter(t =>
        (t.enabled !== false) &&
        (!t.agentId || t.agentId === agent.id)
    );
}

function testScript(test) {
    if (Array.isArray(test.steps) && test.steps.length) {
        return test.steps.map(step => String(step).trim()).filter(Boolean);
    }
    return String(test.input || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
}

function checkExpectation(reply, expectation) {
    const mode = expectation.mode ||
        (typeof expectation === "string" ? "string" : "regex");
    const value = typeof expectation === "string"
        ? expectation
        : expectation.value;
    const text = String(reply || "");

    switch (mode) {
        case "string": {
            if (text.toLowerCase().includes(String(value).toLowerCase())) {
                return { ok: true };
            }
            return { ok: false, message: `Expected "${value}" in reply.` };
        }
        case "regex": {
            try {
                if (new RegExp(value, "i").test(text)) {
                    return { ok: true };
                }
                return { ok: false, message: `Reply did not match "${value}".` };
            } catch (_) {
                return { ok: false, message: `Bad regex "${value}".` };
            }
        }
        case "type": {
            if (value === "nonEmpty") {
                if (text.trim()) return { ok: true };
                return { ok: false, message: "Reply was empty." };
            }
            if (value === "number") {
                const digits = text.replace(/[^\d.-]/g, "");
                if (digits && !Number.isNaN(Number(digits))) {
                    return { ok: true };
                }
                return { ok: false, message: "Reply was not a number." };
            }
            return { ok: false, message: `Unknown type check "${value}".` };
        }
        default:
            return { ok: false, message: `Unknown mode "${mode}".` };
    }
}

/**
 * Run every enabled test for `agent` inline. Drives the same server-owned
 * session flow as the chat page: new_chat on the first turn, session_id
 * reused afterwards. Results are rendered into the card's runner UI.
 */
async function startTestRun({ agent, model, allTests, runStatusEl, runResultsEl, runBtn, stopBtn }) {

    if (runs.get(agent.id)?.running) return;

    const tests = testsForAgent(allTests, agent);
    const run = makeRun();
    run.running = true;
    runs.set(agent.id, run);

    const render = () => renderRun(agent, run, { runStatusEl, runResultsEl, runBtn, stopBtn });

    if (!tests.length) {
        run.status = runStatusEl.textContent = "No enabled tests for this agent.";
        run.running = false;
        render();
        return;
    }

    runBtn.disabled = true;
    runBtn.textContent = "Running...";
    stopBtn.style.display = "";
    stopBtn.disabled = false;
    render();

    try {
        for (const test of tests) {
            if (run.cancelled) break;

            const script = testScript(test);
            const expectations = Array.isArray(test.expectations) ? test.expectations : [];
            let finalReply = null;
            let failedStep = null;

            run.current = { name: test.name, status: "Running..." };
            render();

            for (let index = 0; index < script.length; index++) {
                if (run.cancelled) break;

                try {
                    const result = await sendChat({
                        message: script[index],
                        agentId: agent.id,
                        model,
                        history: run.history,
                        sessionId: run.sessionId,
                        title: test.name,
                        newChat: !run.sessionId,
                    });

                    if (!run.sessionId) {
                        run.sessionId = result.session_id || "";
                    }

                    finalReply = result.reply || "";
                    run.history.push({ role: "user", content: script[index] });
                    run.history.push({ role: "assistant", content: finalReply });

                    const expected = expectations[index];
                    if (expected) {
                        const check = checkExpectation(finalReply, expected);
                        if (!check.ok) {
                            failedStep = `${check.message} (step ${index + 1})`;
                            break;
                        }
                    }
                } catch (error) {
                    run.results.push({
                        id: test.id,
                        name: test.name,
                        ok: false,
                        status: "Error",
                        detail: error.message,
                    });
                    failedStep = null;
                    finalReply = null;
                    break;
                }
            }

            if (failedStep) {
                run.results.push({
                    id: test.id,
                    name: test.name,
                    ok: false,
                    status: "Failed",
                    detail: failedStep,
                });
            } else if (finalReply !== null && !run.cancelled) {
                if (test.expectedResult) {
                    const check = checkExpectation(finalReply, test.expectedResult);
                    if (!check.ok) {
                        run.results.push({
                            id: test.id,
                            name: test.name,
                            ok: false,
                            status: "Failed",
                            detail: check.message,
                        });
                        render();
                        continue;
                    }
                }
                run.results.push({
                    id: test.id,
                    name: test.name,
                    ok: true,
                    status: "Passed",
                    detail: "",
                });
            }

            run.current = null;
            render();
        }
    } finally {
        run.running = false;
        run.current = null;
        runBtn.disabled = false;
        runBtn.textContent = "Run tests for " + agent.name;
        stopBtn.style.display = "none";

        if (run.cancelled) {
            run.status = `Stopped after ${run.results.length}/${tests.length} tests.`;
        } else {
            const passed = run.results.filter(r => r.ok).length;
            const anyError = run.results.some(r => r.status === "Error");
            const summary = `${passed}/${run.results.length} passed`;
            run.status = anyError ? `Errored - ${summary}` : `${summary} ${run.results.length ? "" : "(no tests)"}`.trim();
        }
        render();
    }
}

function renderRun(agent, run, { runStatusEl, runResultsEl, runBtn, stopBtn }) {

    runStatusEl.style.color = "";

    if (run.running && run.current) {
        runStatusEl.textContent = `Running "${run.current.name}"...  (${run.results.length} done)`;
        runStatusEl.style.color = "var(--color-primary,#075985)";
    } else if (run.running) {
        runStatusEl.textContent = "Preparing...";
        runStatusEl.style.color = "var(--color-primary,#075985)";
    } else if (run.status) {
        runStatusEl.textContent = run.status;
        const failed = run.results.some(r => !r.ok);
        const errored = run.results.some(r => r.status === "Error");
        if (errored) {
            runStatusEl.style.color = "var(--color-danger,#b91c1c)";
        } else if (failed) {
            runStatusEl.style.color = "#b45309";
        } else {
            runStatusEl.style.color = "var(--color-success,#16803c)";
        }
    }

    runResultsEl.replaceChildren();
    if (run.results.length) {
        runResultsEl.style.display = "";
        run.results.forEach(result => {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;justify-content:space-between;gap:8px;padding:4px 0;font-size:12px;" +
                "border-bottom:1px dashed var(--color-border,#e1e5e8);";
            const name = el("span", "", result.name);
            name.style.cssText = "overflow:hidden;white-space:nowrap;text-overflow:ellipsis;";
            name.title = result.detail || result.name;
            const verdict = el("span", "", result.status);
            verdict.style.cssText = "flex:0 0 auto;font-weight:700;color:" +
                (result.ok ? "var(--color-success,#16803c)" : "var(--color-danger,#b91c1c)");
            verdict.title = result.detail || result.status;
            row.appendChild(name);
            row.appendChild(verdict);
            runResultsEl.appendChild(row);
        });
        if (run.running) {
            runResultsEl.style.display = "";
        }
    } else if (!run.running) {
        runResultsEl.style.display = "none";
    }
}


// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function getSteps(test) {
    if (Array.isArray(test.steps) && test.steps.length) return test.steps;
    return String(test.input || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

function updateCountBadge(badge, count) {
    badge.textContent = count + " test" + (count !== 1 ? "s" : "");
}

async function saveTests(allTests, settings, onSave) {
    const payload = {
        chatTests: {
            enabled: (settings.chatTests || {}).enabled !== false,
            tests: allTests,
        },
    };
    const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Server error " + response.status);
    const data = await response.json();
    if (data.settings && typeof onSave === "function") onSave(data.settings);
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}