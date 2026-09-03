// ==========================================
// attachments.js - THE ATTACH (FILES) BUTTON
// ==========================================
// WHAT THIS FILE DOES:
// Lets the user pick files with the Attach button and shows them as
// little removable chips above the message input.
//
// PHASE 1 (now): we keep only METADATA - name, size, type. The chips
// travel with the message when sent, so everyone can see a file was
// attached.
//
// PHASE 2 (later): once the server has a POST /api/files endpoint,
// uploadFile() below is where the real bytes get sent, and the returned
// id/url would be stored on the attachment instead.

import { el, clear } from "../dom.js";
import { createAttachment } from "../models.js";

/**
 * Turn the Attach button into a working file picker.
 *
 * parts.button -> the "Attach" <button>
 * parts.input  -> hidden <input type="file">
 * parts.list   -> <ul> where chips appear
 *
 * Returns an object chat.js uses when sending a message:
 *   getAttachments() -> array of attachment objects currently picked
 *   clear()          -> empty the selection after sending
 */
export function initAttachmentPicker(parts) {
    // Every chosen file lands here until the message is sent.
    let picked = [];

    if (!parts.button || !parts.input || !parts.list) {
        console.warn("[attachments] Missing button/input/list elements.");
        return {
            getAttachments: () => [],
            clear: () => {},
            retarget: () => {},
        };
    }

    /** Open the OS file dialog when the Attach button is clicked. */
    function openPicker() {
        parts.input.click();
    }

    /** Fires after the user picks files and closes the dialog. */
    function handleSelection() {
        Array.from(parts.input.files).forEach((file) => {
            // file is a browser File object: .name .size .type
            picked.push(createAttachment(file));
        });

        drawChips();
        parts.input.value = ""; // allows re-picking the same file later
    }

    parts.button.addEventListener("click", openPicker);
    parts.input.addEventListener("change", handleSelection);

    /** Redraw all chips from the picked array. */
    function drawChips() {
        clear(parts.list);

        picked.forEach((attachment) => {
            const chip = el("li", "chip");
            chip.appendChild(el("span", "", attachment.name));

            const removeButton = el("button", "chip-remove", "\u00d7");
            removeButton.type = "button";
            removeButton.setAttribute("aria-label", `Remove ${attachment.name}`);

            removeButton.addEventListener("click", () => {
                picked = picked.filter((a) => a.id !== attachment.id);
                drawChips();
            });

            chip.appendChild(removeButton);
            parts.list.appendChild(chip);
        });
    }

    return {
        getAttachments() {
            return [...picked]; // copy so callers cannot mutate ours
        },

        clear() {
            picked = [];
            drawChips();
        },

        /**
         * Point the picker at NEW button/list elements (used when a page
         * rebuilds its composer but wants to keep the same picked files).
         * The hidden <input> normally stays the same, so its listener
         * keeps working; the button simply gets a fresh click listener.
         */
        retarget(nextParts) {
            if (nextParts.button && nextParts.button !== parts.button) {
                parts = { ...parts, button: nextParts.button };
                parts.button.addEventListener("click", openPicker);
            }

            if (nextParts.list) {
                parts = { ...parts, list: nextParts.list };
                drawChips(); // redraw saved chips in the new spot
            }
        },
    };
}

/*
 * PHASE 2 PREVIEW - real uploads will look like this:
 *
 * import { request } from "../api_fetch.js";   (exported there then)
 *
 * export async function uploadFile(file) {
 *     const body = new FormData();             // multipart form
 *     body.append("file", file);
 *     return request("/api/files", { method: "POST", body });
 * }
 */
