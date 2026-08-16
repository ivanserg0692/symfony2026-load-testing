import { shoppingOptions } from '../configs/shopping.js';
import { login } from '../lib/auth.js';
import { addCartItem, cartHasProduct, deleteCartItem, getCart, updateCartItem } from '../lib/cart.js';
import { getCatalog, getProduct, getSections } from '../lib/catalog.js';
import { randomItem } from '../lib/random.js';
import { thinkTime } from '../lib/think-time.js';

export const options = shoppingOptions;

let session = null;

function cartProductCandidate(product, cart) {
  return Number.isInteger(product.totalStock)
    && product.totalStock >= 2
    && !cartHasProduct(cart, product.id);
}

export default function () {
  // k6 runs this module separately for each VU, so the session is reused only
  // inside one virtual user and the login request is not repeated every iteration.
  if (session === null) {
    session = login();
  }

  // User checks the current cart before choosing a product for shopping.
  const initialCart = getCart(session);

  // User opens the catalog, chooses a random section, and loads its products.
  const sections = getSections(session);
  const section = randomItem(sections, 'catalog sections');
  const products = getCatalog(section.id, session);

  // User chooses a product that can be added and then updated to quantity 2.
  const productCandidates = products.filter((product) => cartProductCandidate(product, initialCart));
  const product = randomItem(productCandidates, `catalog section ${section.id} shopping products`);
  getProduct(product.id, session);

  // User adds the product, checks the cart, changes quantity, checks it again,
  // removes the item, and verifies the final cart state.
  const addedItem = addCartItem(product.id, 1, session);
  getCart(session);

  const updatedItem = updateCartItem(addedItem.id, 2, session);
  getCart(session);

  deleteCartItem(updatedItem.id, session);
  getCart(session);

  thinkTime();
}
