// ==========================================
// wizard.js - THE AI WIZARD (PROMPT BUILDER)
// ==========================================
// WHAT THIS FILE DOES:
// Opens a pop-up that guides the user from "I need help but don't know
// what to type" to a well-built prompt in three steps:
//
//   Step 1 - pick a task type      (explain / write / code / ...)
//   Step 2 - answer 2-3 questions  (topic, audience, format...)
//   Step 3 - review the assembled prompt, tweak it, optionally
//            EXPORT it as {name}.md + {name}.json on the server,
//            then drop it into the chat composer.
//
// HOW IT WORKS INTERNALLY:
// WIZARD_TASKS below is just DATA. Each task lists its questions and a
// template() function that stitches the answers into one prompt string.
// Adding a new task = adding one object here. No other file changes.
//
// The wizard does NOT send chat messages itself. When the user finishes,
// it calls the onUsePrompt callback handed over by chat.js, which fills
// the composer and lets the user press Send (full control stays with
// them). Exporting goes through api_fetch.js -> POST /api/exports.

import { el, clear, get } from "../dom.js";
import { exportWizardFiles } from "../api_fetch.js";


// ------------------------------------------
// TASK DEFINITIONS (pure data)
// ------------------------------------------

const WIZARD_TASKS = [
    {
        id: "explain",
        label: "Explain a topic",
        description: "A clear explanation of any subject.",
        questions: [
            { id: "topic", label: "What should be explained?", placeholder: "e.g. how HTTPS works" },
            { id: "audience", label: "Who is the audience?", placeholder: "e.g. a curious beginner" },
            { id: "format", label: "Preferred shape (optional)", placeholder: "e.g. bullets, an analogy, a short story" },
        ],
        template: (a) =>
            `Explain ${q(a.topic)} to ${q(a.audience)}.` +
            opt(" Structure it as", a.format) +
            " Use plain language and define any term a newcomer would not know.",
    },
    {
        id: "write",
        label: "Write something",
        description: "Emails, posts, docs, stories.",
        questions: [
            { id: "kind", label: "What kind of writing?", placeholder: "e.g. a polite follow-up email" },
            { id: "about", label: "What is it about?", placeholder: "key facts, names, goals..." },
            { id: "tone", label: "Tone / length (optional)", placeholder: "e.g. friendly, under 150 words" },
        ],
        template: (a) =>
            `Write ${q(a.kind)} about the following:\n${a.about}` +
            opt("\nTone and length: ", a.tone) +
            "\nGive me one draft I can edit.",
    },
    {
        id: "code",
        label: "Help me code",
        description: "Debug, design, or explain code.",
        questions: [
            { id: "goal", label: "What do you need?", placeholder: "e.g. fix this error, review my function" },
            { id: "detail", label: "Paste code or describe it", placeholder: "code, error message, context..." },
            { id: "language", label: "Language (optional)", placeholder: "e.g. Python 3, JavaScript" },
        ],
        template: (a) =>
            `I need help with code. Goal: ${q(a.goal)}.` +
            opt(" Language: ", a.language) +
            `\n\nDetails:\n${a.detail}` +
            "\n\nExplain your reasoning briefly before giving the final answer.",
    },
    {
        id: "summarize",
        label: "Summarize text",
        description: "Long text into key points.",
        questions: [
            { id: "text", label: "Paste the text", placeholder: "paste the article, notes or transcript..." },
            { id: "style", label: "Summary style (optional)", placeholder: "e.g. 5 bullet points, one paragraph" },
            { id: "focus", label: "Focus on (optional)", placeholder: "e.g. decisions and deadlines only" },
        ],
        template: (a) =>
            `Summarize the following text` +
            opt("", a.style, " ") +
            opt(" focusing on ", a.focus) +
            `.\n\n---\n${a.text}\n---`,
    },
    {
        id: "brainstorm",
        label: "Brainstorm ideas",
        description: "Options, names, plans, angles.",
        questions: [
            { id: "goal", label: "What do you need ideas for?", placeholder: "e.g. names for a study group" },
            { id: "count", label: "How many ideas?", placeholder: "e.g. ten wildly different ones" },
            { id: "constraints", label: "Constraints (optional)", placeholder: "e.g. must work for beginners" },
        ],
        template: (a) =>
            `Brainstorm ${q(a.count)} for ${q(a.goal)}.` +
            opt(" Constraints: ", a.constraints) +
            "\nFor each idea add a one-line reason why it could work.",
    },
    {
        id: "freeform",
        label: "Ask anything",
        description: "One guided question, then free.",
        questions: [
            { id: "goal", label: "What do you want from the agent?", placeholder: "describe your goal in your own words..." },
        ],
        template: (a) => a.goal,
    },
];

/** Wrap an answer in quotes when present. */
function q(value) {
    return value ? `"${value}"` : "";
}

/** Add " label value" only when the optional answer exists. */
function opt(label, value, separator = "") {
    return value ? `${separator}${label} ${value}` : "";
}


// ------------------------------------------
// WIZARD STATE + PUBLIC API
// ------------------------------------------

let currentStep = 0;       // 0 = choose task, 1 = questions, 2 = preview
let selectedTask = null;   // the WIZARD_TASKS entry picked in step 1
let answers = {};          // { questionId: typedText }
let callbacks = {};        // wiring provided by chat.js
let exportName = "";       // editable base name for the .md/.json files

/**
 * Connect the wizard to its HTML and open/close logic.
 *
 * ui          -> refs: {overlay, steps, body, back, next, close,
 *                        exportButton}
 * onUsePrompt -> function(promptText) called when the user finishes
 */
export function initWizard(ui, onUsePrompt) {
    callbacks = { ...ui, onUsePrompt };

    // Close buttons: the X and clicking the dark backdrop.
    ui.close.addEventListener("click", closeWizard);
    ui.overlay.addEventListener("click", (event) => {
        if (event.target === ui.overlay) {
            closeWizard(); // only when clicking OUTSIDE the white box
        }
    });

    // Footer navigation.
    ui.back.addEventListener("click", goBack);
    ui.next.addEventListener("click", goNext);

    // Export lives on step 3 only (visibility set in renderStep).
    if (ui.exportButton) {
        ui.exportButton.addEventListener("click", handleExport);
    }

    // Escape key closes too.
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !ui.overlay.classList.contains("hidden")) {
            closeWizard();
        }
    });
}

/** Reset state and show the modal. */
export function openWizard() {
    currentStep = 0;
    selectedTask = null;
    answers = {};
    exportName = "";
    callbacks.overlay.classList.remove("hidden");
    renderStep();
}

export function closeWizard() {
    callbacks.overlay.classList.add("hidden");
}


// ------------------------------------------
// STEP NAVIGATION
// ------------------------------------------

function goBack() {
    if (currentStep > 0) {
        currentStep -= 1;
        renderStep();
    }
}

function goNext() {
    if (!canLeaveCurrentStep()) {
        return;
    }

    if (currentStep < 2) {
        currentStep += 1;
        renderStep();
        return;
    }

    // Final step pressed: hand the finished prompt to chat.js.
    const previewBox = get("#wizard-preview-text");

    if (previewBox && previewBox.value.trim()) {
        callbacks.onUsePrompt(previewBox.value.trim());
    }

    closeWizard();
}

/** Step-specific rules for moving forward. */
function canLeaveCurrentStep() {
    if (currentStep === 0 && !selectedTask) {
        return false; // nothing selected yet
    }

    return true;
}


// ------------------------------------------
// RENDERING (draws whichever step is active)
// ------------------------------------------

function renderStep() {
    renderStepPills();

    const body = callbacks.body;
    clear(body);

    if (currentStep === 0) {
        renderTaskPicker(body);
    } else if (currentStep === 1) {
        renderQuestions(body);
    } else {
        renderPreview(body);
    }

    // Footer button labels/state per step.
    callbacks.back.disabled = currentStep === 0;
    callbacks.next.textContent =
        currentStep === 2 ? "Use this prompt" : "Next";

    // Export is a step-3-only action.
    if (callbacks.exportButton) {
        callbacks.exportButton.classList.toggle("hidden", currentStep !== 2);
    }
}

/** The little numbered pills across the top of the modal. */
function renderStepPills() {
    const pills = callbacks.steps;
    clear(pills);

    ["Choose task", "Details", "Review"].forEach((label, index) => {
        let className = "wizard-step-pill";

        if (index === currentStep) {
            className += " current";
        } else if (index < currentStep) {
            className += " done";
        }

        pills.appendChild(el("span", className, `${index + 1}. ${label}`));
    });
}

/** STEP 1 - grid of task buttons. */
function renderTaskPicker(body) {
    const grid = el("div", "wizard-task-grid");

    WIZARD_TASKS.forEach((task) => {
        const button = el("button", "wizard-task-button");
        button.type = "button";

        const title = el("strong", "", task.label);
        const desc = el("span", "", task.description);
        button.append(title, desc);

        if (selectedTask && selectedTask.id === task.id) {
            button.classList.add("selected");
        }

        button.addEventListener("click", () => {
            selectedTask = task;
            answers = {}; // fresh answers for the new task
            renderStep(); // redraw to move highlight (Next still needed)
        });

        grid.appendChild(button);
    });

    body.appendChild(grid);
}

/** STEP 2 - one input per question of the chosen task. */
function renderQuestions(body) {
    const intro = el(
        "p",
        "",
        `A few quick details for "${selectedTask.label}". Only the first field is required.`
    );
    body.appendChild(intro);

    selectedTask.questions.forEach((question) => {
        const field = el("label", "field");
        field.appendChild(el("span", "", question.label));

        const input = el("input");
        input.type = "text";
        input.placeholder = question.placeholder || "";
        input.value = answers[question.id] || "";

        // Save typing into our answers object as the user types.
        input.addEventListener("input", () => {
            answers[question.id] = input.value;
        });

        field.appendChild(input);
        body.appendChild(field);
    });
}

/** STEP 3 - editable preview of the final prompt + export name. */
function renderPreview(body) {
    body.appendChild(el("p", "", "Here is the prompt the wizard built. Edit it freely:"));

    const preview = el("textarea", "wizard-preview");
    preview.id = "wizard-preview-text";
    preview.value = selectedTask.template(answers);
    body.appendChild(preview);

    body.appendChild(
        el(
            "p",
            "",
            "Pressing the button puts this into the composer - " +
                "you stay in control and press Send yourself."
        )
    );

    // --- Export naming -----------------------------------------
    // Prefilled once from task id + today's date; fully editable.
    if (!exportName) {
        exportName = `${slugify(selectedTask.id)}-${todayStamp()}`;
    }

    const nameField = el("label", "field wizard-export-field");
    nameField.appendChild(el("span", "", "File name for export (without extension)"));

    const nameInput = el("input");
    nameInput.type = "text";
    nameInput.value = exportName;
    nameInput.placeholder = "my-prompt-2026-08-23";
    nameInput.addEventListener("input", () => {
        exportName = nameInput.value;
    });

    nameField.appendChild(nameInput);
    body.appendChild(nameField);
}


// ------------------------------------------
// EXPORT (.md + .json saved on the server)
// ------------------------------------------

/**
 * Button handler: build both payloads and hand them to api_fetch.js
 * -> POST /api/exports. Feedback flashes on the button itself.
 */
async function handleExport() {
    const button = callbacks.exportButton;
    const promptText = String(get("#wizard-preview-text")?.value || "").trim();

    if (!promptText) {
        flashExportButton(button, "Nothing to save!", true);
        return;
    }

    const name = slugify(exportName) || `prompt-${todayStamp()}`;

    button.disabled = true;

    try {
        await exportWizardFiles({
            name,
            markdown: buildExportMarkdown(selectedTask, promptText),
            data: buildExportJson(name, selectedTask, promptText),
        });
        flashExportButton(button, "Saved on server!");
    } catch (error) {
        console.error("[wizard] export failed:", error);
        flashExportButton(button, "Save failed!", true);
    }
}

/** Brief label change so the user sees the outcome without popups. */
function flashExportButton(button, label, failed = false) {
    if (!button) {
        return;
    }

    const original = "Export .md + .json";
    button.textContent = label;
    button.disabled = false;

    window.setTimeout(() => {
        button.textContent = original;
    }, failed ? 2200 : 1400);
}

/** "Explain a topic!" -> "explain-a-topic" (URL/file-safe). */
function slugify(value) {
    return String(value)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

/** Local date as YYYY-MM-DD for file names. */
function todayStamp() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
}

/** Human-readable markdown copy of the prompt. */
function buildExportMarkdown(task, promptText) {
    return (
        `# ${task.label}\n\n` +
        `*Created with the AI Factory wizard on ${todayStamp()}.*\n\n` +
        `${promptText}\n`
    );
}

/** Machine-readable twin with everything the wizard knew. */
function buildExportJson(name, task, promptText) {
    return JSON.stringify(
        {
            name,
            taskId: task.id,
            taskLabel: task.label,
            createdAt: new Date().toISOString(),
            prompt: promptText,
            answers,
        },
        null,
        2
    );
}
