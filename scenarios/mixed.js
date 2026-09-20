import { mixedOptions } from '../configs/mixed.js';
import { getVuSession, initializeSessions } from '../lib/auth.js';
import { runBrowsingFlow, runCheckoutFlow, runShoppingFlow } from '../lib/flows.js';

export const options = mixedOptions;

let browsingSession = null;
let shoppingSession = null;
let checkoutSession = null;

export function setup() {
  return initializeSessions();
}

function ensureSession(currentSession, setupData) {
  return currentSession === null ? getVuSession(setupData) : currentSession;
}

export function browsing(setupData) {
  browsingSession = ensureSession(browsingSession, setupData);
  runBrowsingFlow(browsingSession);
}

export function shopping(setupData) {
  shoppingSession = ensureSession(shoppingSession, setupData);
  runShoppingFlow(shoppingSession);
}

export function checkout(setupData) {
  checkoutSession = ensureSession(checkoutSession, setupData);
  runCheckoutFlow(checkoutSession);
}
