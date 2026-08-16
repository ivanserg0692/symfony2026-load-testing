import { checkoutOptions } from '../configs/checkout.js';
import { login } from '../lib/auth.js';
import { addCartItem, getCart } from '../lib/cart.js';
import { getCatalog, getProduct, getSections } from '../lib/catalog.js';
import { createOrder, getOrder, getOrders } from '../lib/orders.js';
import { randomItem } from '../lib/random.js';
import { thinkTime } from '../lib/think-time.js';

export const options = checkoutOptions;

let session = null;

function checkoutProductCandidate(product) {
  return Number.isInteger(product.totalStock)
    && product.totalStock > 0;
}

export default function () {
  // k6 runs this module separately for each VU, so the session is reused only
  // inside one virtual user and the login request is not repeated every iteration.
  if (session === null) {
    session = login();
  }

  // User opens the catalog, chooses a random section, and loads its products.
  const sections = getSections(session);
  const section = randomItem(sections, 'catalog sections');
  const products = getCatalog(section.id, session);

  // User chooses an available product, opens its card, and adds it to the cart.
  const productCandidates = products.filter(checkoutProductCandidate);
  const product = randomItem(productCandidates, `catalog section ${section.id} checkout products`);
  getProduct(product.id, session);

  addCartItem(product.id, 1, session);
  getCart(session);

  // User creates an order from the current cart and checks order endpoints.
  const order = createOrder(session);
  getOrder(order.id, session);
  getOrders(session);

  thinkTime();
}
