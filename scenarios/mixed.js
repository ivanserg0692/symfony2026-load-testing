import { mixedOptions } from '../configs/mixed.js';
import { login } from '../lib/auth.js';
import { runBrowsingFlow, runCheckoutFlow, runShoppingFlow } from '../lib/flows.js';

export const options = mixedOptions;

let browsingSession = null;
let shoppingSession = null;
let checkoutSession = null;

function ensureSession(currentSession) {
  // k6 runs this module separately for each VU, so the session is reused only
  // inside one virtual user and the login request is not repeated every iteration.
  return currentSession === null ? login() : currentSession;
}

export function browsing() {
  browsingSession = ensureSession(browsingSession);
  runBrowsingFlow(browsingSession);
}

export function shopping() {
  shoppingSession = ensureSession(shoppingSession);
  runShoppingFlow(shoppingSession);
}

export function checkout() {
  checkoutSession = ensureSession(checkoutSession);
  runCheckoutFlow(checkoutSession);
}
