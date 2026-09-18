import { fail } from 'k6';
import http from 'k6/http';
import { Counter, Rate } from 'k6/metrics';

import { gatewayGetJson, gatewayRequestWithContext } from './api-client.js';
import { clearCartAfterOrderConflict } from './cart.js';
import { checkHttpResponse, checkJsonResponse } from './checks.js';

const ORDER_STATUSES = ['pending', 'completed', 'canceled'];
const ORDER_CREATE_EXPECTED_STATUSES = http.expectedStatuses({ min: 200, max: 399 }, 409);
const orderStockConflicts = new Counter('order_stock_conflicts');
const orderCreateUnexpectedConflicts = new Rate('order_create_unexpected_conflicts');

function isStockConflict(response) {
  if (response.status !== 409) {
    return false;
  }

  try {
    return response.json()?.message === 'insufficient stock.';
  } catch (error) {
    return false;
  }
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function isOrderStatus(value) {
  return ORDER_STATUSES.includes(value);
}

function isMoneyString(value) {
  return typeof value === 'string';
}

function isOrderSummary(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isInteger(value.id)
    && isOrderStatus(value.status)
    && isMoneyString(value.totalPrice)
    && isMoneyString(value.totalDiscount)
    && isMoneyString(value.finalPrice)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

function isOrderItem(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isInteger(value.id)
    && Number.isInteger(value.productSnapshotId)
    && Number.isInteger(value.quantity)
    && isMoneyString(value.unitPrice)
    && isMoneyString(value.unitDiscount)
    && isMoneyString(value.finalUnitPrice)
    && isMoneyString(value.lineTotal)
    && Number.isInteger(value.sort)
    && typeof value.createdAt === 'string';
}

function isSnapshotProduct(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isInteger(value.id)
    && Number.isInteger(value.createdBy)
    && typeof value.name === 'string'
    && isNullableString(value.description)
    && isNullableString(value.pictureId)
    && typeof value.createdAt === 'string'
    && typeof value.slug === 'string'
    && typeof value.active === 'boolean';
}

function isProductSnapshot(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isInteger(value.id)
    && Number.isInteger(value.originalProductId)
    && isSnapshotProduct(value.product);
}

function isOrderDetailItem(value) {
  return isOrderItem(value)
    && isProductSnapshot(value.productSnapshot);
}

function isCreatedOrder(value) {
  return isOrderSummary(value)
    && Array.isArray(value.items)
    && value.items.every(isOrderItem);
}

function isOrderDetail(value) {
  return isOrderSummary(value)
    && Array.isArray(value.items)
    && value.items.every(isOrderDetailItem);
}

function isPagination(value) {
  return value !== null
    && typeof value === 'object'
    && Number.isInteger(value.page)
    && Number.isInteger(value.limit)
    && Number.isInteger(value.total)
    && Number.isInteger(value.pages);
}

function isOrdersList(value) {
  return value !== null
    && typeof value === 'object'
    && Array.isArray(value.items)
    && value.items.every(isOrderSummary)
    && isPagination(value.pagination);
}

export function createOrder(session) {
  const { response, context } = gatewayRequestWithContext(
    'POST',
    '/api/v1/orders',
    session,
    'orders_create',
    null,
    { responseCallback: ORDER_CREATE_EXPECTED_STATUSES },
  );

  const stockConflict = isStockConflict(response);
  orderCreateUnexpectedConflicts.add(response.status === 409 && !stockConflict);

  if (response.status === 409) {
    clearCartAfterOrderConflict(session);

    if (stockConflict) {
      orderStockConflicts.add(1);
      checkHttpResponse(response, 'orders create', 409, context);

      return null;
    }
  }

  return checkJsonResponse(response, 'orders create', 201, isCreatedOrder, context);
}

export function getOrder(orderId, session) {
  if (!Number.isInteger(orderId)) {
    fail(`orders item: expected an integer order id, got ${String(orderId)}`);
  }

  return gatewayGetJson(
    `/api/v1/orders/${orderId}`,
    session,
    'orders_item',
    200,
    isOrderDetail,
  );
}

export function getOrders(session) {
  return gatewayGetJson(
    '/api/v1/orders?page=1&limit=20',
    session,
    'orders_list',
    200,
    isOrdersList,
  );
}
