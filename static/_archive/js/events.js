// ==========================================
// events.js - THE APP'S INTERNAL MESSAGE BOARD
// ==========================================
// WHAT THIS FILE DOES:
// Lets completely separate files talk to each other WITHOUT importing
// each other. One file "emits" (announces) an event, and any other file
// can "listen" for it and react.
//
// Example:
//   emit("discussion:updated", discussion);      <- sender
//   on("discussion:updated", (event) => {...});  <- listener
//
// This keeps modules loosely connected: the chat page does not need to
// know that some other part of the app cares about its updates.

// A private EventTarget object. Think of it as a radio station that only
// our modules can broadcast on.
const bus = new EventTarget();

/**
 * Announce that something happened.
 *
 * name   -> event name, written like "thing:happened"
 * detail -> any data you want to attach (object, string, whatever)
 */
export function emit(name, detail = null) {
    bus.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * React when an event is announced.
 *
 * name     -> the event name to listen for
 * callback -> function called every time it happens.
 *             The event's data lives on callback(event).detail
 *
 * Returns an "off" function you can call to stop listening.
 */
export function on(name, callback) {
    bus.addEventListener(name, callback);

    return function off() {
        bus.removeEventListener(name, callback);
    };
}
