import { gatewayGetJson } from './api-client.js';
import { ensureArrayNotEmpty } from './checks.js';
import { config } from './config.js';

function toQuery(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function isSection(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isInteger(value.id)
    && typeof value.name === 'string'
    && typeof value.slug === 'string'
    && typeof value.active === 'boolean';
}

function isCatalogElement(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isInteger(value.id)
    && typeof value.name === 'string'
    && typeof value.slug === 'string'
    && typeof value.active === 'boolean'
    && Array.isArray(value.productPrices)
    && Number.isInteger(value.totalStock);
}

function isPagination(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isInteger(value.page)
    && Number.isInteger(value.limit)
    && Number.isInteger(value.total);
}

export function getSections(session) {
  const body = gatewayGetJson('/api/v1/catalog/sections', session, 'catalog_sections', 200, (payload) => (
    Array.isArray(payload) && payload.every(isSection)
  ));

  return ensureArrayNotEmpty(body, 'catalog sections');
}

export function getCatalogPage(sectionId, session) {
  const query = toQuery({
    sectionId,
    active: true,
    page: 1,
    limit: config.catalogLimit,
  });

  const body = gatewayGetJson(
    `/api/v1/catalog/elements?${query}`,
    session,
    'catalog_elements',
    200,
    (payload) => (
      payload !== null
      && typeof payload === 'object'
      && Array.isArray(payload.items)
      && payload.items.every(isCatalogElement)
      && isPagination(payload.pagination)
    ),
  );

  return body;
}

export function getRandomSectionWithProducts(session) {
  const sections = getSections(session);
  const shuffledSections = [...sections].sort(() => Math.random() - 0.5);

  for (const section of shuffledSections) {
    const catalog = getCatalogPage(section.id, session);

    if (Array.isArray(catalog.items) && catalog.items.length > 0) {
      return {
        section,
        products: catalog.items,
      };
    }
  }

  return {
    section: sections[0],
    products: ensureArrayNotEmpty([], 'catalog products'),
  };
}

export function getProduct(productId, session) {
  return gatewayGetJson(
    `/api/v1/catalog/elements/${productId}`,
    session,
    'catalog_product',
    200,
    (payload) => (
      isCatalogElement(payload)
      && Array.isArray(payload.sections)
      && payload.sections.every(isSection)
    ),
  );
}
