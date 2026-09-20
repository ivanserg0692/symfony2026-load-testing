import { shoppingOptions } from '../configs/shopping.js';
import { getVuSession, initializeSessions } from '../lib/auth.js';
import { runShoppingFlow } from '../lib/flows.js';

export const options = shoppingOptions;

let session = null;

export function setup() {
  return initializeSessions();
}

export default function (setupData) {
  if (session === null) {
    session = getVuSession(setupData);
  }

  runShoppingFlow(session);
}
