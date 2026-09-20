import { checkoutOptions } from '../configs/checkout.js';
import { getVuSession, initializeSessions } from '../lib/auth.js';
import { runCheckoutFlow } from '../lib/flows.js';

export const options = checkoutOptions;

let session = null;

export function setup() {
  return initializeSessions();
}

export default function (setupData) {
  if (session === null) {
    session = getVuSession(setupData);
  }

  runCheckoutFlow(session);
}
