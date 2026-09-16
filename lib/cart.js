import {
  gatewayGetJson,
  gatewayJsonRequest,
  gatewayRequest,
  gatewayRequestWithContext,
} from './api-client.js';
import { checkHttpResponse } from './checks.js';

function isNullableInteger(value) {
  return value === null || Number.isInteger(value);
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function isCartItem(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isInteger(value.id)
    && Number.isInteger(value.catalogElementId)
    && Number.isInteger(value.quantity)
    && Number.isInteger(value.sort)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

function isCart(value) {
  return value !== null
    && typeof value === 'object'
    && isNullableInteger(value.id)
    && isNullableString(value.status)
    && isNullableString(value.createdAt)
    && isNullableString(value.updatedAt)
    && Array.isArray(value.items)
    && value.items.every(isCartItem);
}

function jsonParams() {
  return {
    headers: {
      'Content-Type': 'application/json',
    },
  };
}

export function cartHasProduct(cart, productId) {
  return Array.isArray(cart.items)
    && cart.items.some((item) => item.catalogElementId === productId);
}

export function getCart(session) {
  return gatewayGetJson('/api/v1/cart', session, 'cart', 200, isCart);
}

export function addCartItem(productId, quantity, session) {
  return gatewayJsonRequest(
    'POST',
    '/api/v1/cart/items',
    session,
    'cart_item_add',
    [200, 201],
    isCartItem,
    JSON.stringify({ productId, quantity }),
    jsonParams(),
  );
}

export function updateCartItem(itemId, quantity, session) {
  return gatewayJsonRequest(
    'PATCH',
    `/api/v1/cart/items/${itemId}`,
    session,
    'cart_item_update',
    200,
    isCartItem,
    JSON.stringify({ quantity }),
    jsonParams(),
  );
}

export function deleteCartItem(itemId, session) {
  const response = gatewayRequest('DELETE', `/api/v1/cart/items/${itemId}`, session, 'cart_item_delete');

  return checkHttpResponse(response, 'cart delete item', 204);
}

export function clearCartAfterOrderConflict(session) {
  const { response, context } = gatewayRequestWithContext(
    'DELETE',
    '/api/v1/cart',
    session,
    'cart_clear_after_order_conflict',
  );

  return checkHttpResponse(response, 'cart clear after order conflict', 204, context);
}
