import { addCartItem, cartHasProduct, deleteCartItem, getCart, updateCartItem } from './cart.js';
import { getProduct, getRandomSectionWithProducts } from './catalog.js';
import { createOrder, getOrder, getOrders } from './orders.js';
import { randomDifferentItem, randomItem } from './random.js';
import { thinkTime } from './think-time.js';

function cartProductCandidate(product, cart) {
  return Number.isInteger(product.totalStock)
    && product.totalStock >= 2
    && !cartHasProduct(cart, product.id);
}

function checkoutProductCandidate(product) {
  return Number.isInteger(product.totalStock)
    && product.totalStock > 0;
}

export function runBrowsingFlow(session) {
  // User opens the catalog, chooses a random section with products, and loads its products.
  const { section, products } = getRandomSectionWithProducts(session);

  // User opens a random product card from the selected section.
  const firstProduct = randomItem(products, `catalog section ${section.id} products`);
  getProduct(firstProduct.id, session);

  // Small pause between page views, controlled by THINK_TIME_MIN/THINK_TIME_MAX.
  thinkTime();

  // User continues browsing and opens another product card from the same section.
  const secondProduct = randomDifferentItem(products, firstProduct.id, `catalog section ${section.id} products`);
  getProduct(secondProduct.id, session);
}

export function runShoppingFlow(session) {
  // User checks the current cart before choosing a product for shopping.
  const initialCart = getCart(session);

  // User opens the catalog, chooses a random section with products, and loads its products.
  const { section, products } = getRandomSectionWithProducts(session);

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

export function runCheckoutFlow(session) {
  // User opens the catalog, chooses a random section with products, and loads its products.
  const { section, products } = getRandomSectionWithProducts(session);

  // User chooses an available product, opens its card, and adds it to the cart.
  const productCandidates = products.filter(checkoutProductCandidate);
  const product = randomItem(productCandidates, `catalog section ${section.id} checkout products`);
  getProduct(product.id, session);

  addCartItem(product.id, 1, session);
  getCart(session);

  // User creates an order from the current cart and checks order endpoints.
  const order = createOrder(session);

  if (order === null) {
    return;
  }

  getOrder(order.id, session);
  getOrders(session);

  thinkTime();
}
