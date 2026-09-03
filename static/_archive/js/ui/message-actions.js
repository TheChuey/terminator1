// ==========================================
// message-actions.js - BUTTONS UNDER EACH MESSAGE
// ==========================================
// WHAT THIS FILE DOES:
// Builds the little button row under a message:
//
//   Reply | Save/Unsave | Copy | Edit (user only) | Delete
//
// and handles the inline "edit mode" (text swaps to a textarea).
//
// It creates the buttons but does NOT decide what Save/Delete mean -
// chat.js passes in handler functions. That keeps this file reusable.

import { el } from "../dom.js";

/**
 * Build the action row for one message.
 *
 * message  -> the message object the row belongs to
 * handlers -> object of callbacks, all optional:
 *   onReply(message)              - user wants to answer THIS message
 *   onSaveToggle(message, button) - save or unsave it
 *   onDelete(message)             - remove it
 *   onEditFinish(message, newText)- inline edit accepted
 */
export function buildMessageActions(message, handlers = {}) {
    const row = el("div", "message-actions");

    // Small factory so every button gets identical wiring.
    function addButton(label, className, onClick) {
        const button = el("button", className, label);
        button.type = "button";
        button.addEventListener("click", () => onClick());
        row.appendChild(button);
        return button;
    }

    // --- Reply ---------------------------------------------
    if (handlers.onReply) {
        addButton("Reply", "", () => handlers.onReply(message));
    }

    // --- Save / Unsave --------------------------------------
    if (handlers.onSaveToggle) {
        const label = message.saved ? "Unsave" : "Save";
        addButton(label, "", () => handlers.onSaveToggle(message));
    }

    // --- Copy -------------------------------------------------
    addButton("Copy", "", async () => {
        try {
            await navigator.clipboard.writeText(message.text);
        } catch {
            // Clipboard can be blocked; select-free fallback for old browsers.
            window.prompt("Copy this message:", message.text);
        }
    });

    // --- Edit (user messages only) ----------------------------
    if (handlers.onEditFinish && message.role === "user") {
        const article = row.closest(".message"); // bubble containing these buttons
        addButton("Edit", "", () =>
            startInlineEdit(article, message, handlers.onEditFinish)
        );
    }

    // --- Delete ------------------------------------------------
    if (handlers.onDelete) {
        addButton("Delete", "danger", () => handlers.onDelete(message));
    }

    return row;
}


/**
 * Replace a message body with an editable textarea + Save/Cancel.
 *
 * article     -> the .message element on screen
 * message     -> its data object
 * onFinish(newText) -> called when the user confirms.
 *                      The CALLER updates data/storage/DOM.
 */
export function startInlineEdit(article, message, onFinish) {
    const contentBox = article.querySelector(".message-content");
    const originalBody = contentBox.querySelector(".message-body");

    if (!contentBox || !originalBody || article.querySelector(".inline-edit")) {
        return; // already editing, or pieces are missing
    }

    // Hide normal content while editing.
    originalBody.classList.add("hidden");
    contentBox
        .querySelectorAll(".message-replies, .message-actions")
        .forEach((part) => part.classList.add("hidden"));

    // Build the editor box.
    const editor = el("div", "inline-edit");
    const textarea = el("textarea");
    textarea.value = message.text;
    editor.appendChild(textarea);

    const buttons = el("div", "inline-edit-buttons");
    const saveButton = el("button", "btn btn-primary btn-small", "Save");
    const cancelButton = el("button", "btn btn-secondary btn-small", "Cancel");
    buttons.append(saveButton, cancelButton);
    editor.appendChild(buttons);

    // Insert right where the body was.
    originalBody.insertAdjacentElement("beforebegin", editor);
    textarea.focus();

    function closeEditor() {
        editor.remove();
        originalBody.classList.remove("hidden");
        contentBox
            .querySelectorAll(".message-replies, .message-actions")
            .forEach((part) => part.classList.remove("hidden"));
    }

    saveButton.addEventListener("click", () => {
        const newText = textarea.value.trim();
        if (!newText) {
            return; // empty text is not allowed
        }
        closeEditor();
        onFinish(newText);
    });

    cancelButton.addEventListener("click", closeEditor);

    // Ctrl/Cmd+Enter also saves while typing.
    textarea.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            saveButton.click();
        }
    });
}
