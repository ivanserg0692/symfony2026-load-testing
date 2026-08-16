import { checkoutOptions } from '../configs/checkout.js';
import { login } from '../lib/auth.js';
import { runCheckoutFlow } from '../lib/flows.js';

export const options = checkoutOptions;

let session = null;

export default function () {
  // k6 runs this module separately for each VU, so the session is reused only
  // inside one virtual user and the login request is not repeated every iteration.
  if (session === null) {
    session = login();
  }

  runCheckoutFlow(session);
}
