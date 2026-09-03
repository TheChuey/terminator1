// ==========================================
// dom.js - TINY HELPERS FOR TOUCHING THE PAGE
// ==========================================
// WHAT THIS FILE DOES:
// The browser's own document.getElementById / createElement code is long
// and repetitive. These helpers make the rest of our code shorter and
// easier to read.
//
// Nothing in here knows anything about chat or agents - it is 100%
// generic. Every other file may import from this one.

/**
 * Find the FIRST element on the page that matches a CSS selector.
 * Example: get("#thread") returns the element with id="thread".
 * Returns null when nothing matches.
 */
export function get(selector) {
    return document.querySelector(selector);
}

/**
 * Find ALL elements that match a selector, as a real Array
 * (so we can use .forEach on the result).
 */
export function getAll(selector) {
    return Array.from(document.querySelectorAll(selector));
}

/**
 * Remove every child of an element (empties a container).
 * Useful before re-drawing a list.
 */
export function clear(element) {
    if (element) {
        element.replaceChildren();
    }
}

/**
 * Create a new element in one line.
 * Example: el("p", "note", "hello") makes <p class="note">hello</p>.
 *
 * tag      -> the HTML tag name ("div", "p", "button"...)
 * className-> optional class list to add
 * text     -> optional text content (safe: never parsed as HTML)
 */
export function el(tag, className = "", text = "") {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text) {
        element.textContent = text;
    }

    return element;
}
