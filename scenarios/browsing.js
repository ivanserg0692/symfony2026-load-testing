import { browsingOptions } from '../configs/browsing.js';
import { getVuSession, initializeSessions } from '../lib/auth.js';
import { runBrowsingFlow } from '../lib/flows.js';

export const options = browsingOptions;

let session = null;

export function setup() {
  return initializeSessions();
}

export default function (setupData) {
  if (session === null) {
    session = getVuSession(setupData);
  }

  runBrowsingFlow(session);
}
