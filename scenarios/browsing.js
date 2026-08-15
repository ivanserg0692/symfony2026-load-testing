import { browsingOptions } from '../configs/browsing.js';
import { login } from '../lib/auth.js';
import { getCatalog, getProduct, getSections } from '../lib/catalog.js';
import { randomDifferentItem, randomItem } from '../lib/random.js';
import { thinkTime } from '../lib/think-time.js';

export const options = browsingOptions;

let session = null;

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

  // User opens a random product card from the selected section.
  const firstProduct = randomItem(products, `catalog section ${section.id} products`);
  getProduct(firstProduct.id, session);

  // Small pause between page views, controlled by THINK_TIME_MIN/THINK_TIME_MAX.
  thinkTime();

  // User continues browsing and opens another product card from the same section.
  const secondProduct = randomDifferentItem(products, firstProduct.id, `catalog section ${section.id} products`);
  getProduct(secondProduct.id, session);
}
