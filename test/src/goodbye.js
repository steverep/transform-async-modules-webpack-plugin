// This module contains a simple TLA to await a string after a short delay.
// It will be wrapped in an async function by Webpack.
import { setTimeout } from "node:timers/promises";

export const PHRASE = "Goodby async!";
export const DELAY = 250;

const startTime = performance.now();
export const awaitedPhrase = await setTimeout(DELAY, PHRASE);
export const awaitedDelay = performance.now() - startTime;
