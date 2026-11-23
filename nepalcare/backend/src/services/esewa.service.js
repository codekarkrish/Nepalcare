import crypto from 'node:crypto';
import { HttpError } from '../utils/httpError.js';

const responseSignedFields = [
  'transaction_code',
  'status',
  'total_amount',
  'transaction_uuid',
  'product_code',
  'signed_field_names'
];

export function getEsewaConfig(env = process.env) {
  const mode = env.ESEWA_ENV || 'test';
  if (!['test', 'production'].includes(mode)) {
    throw new HttpError(500, 'ESEWA_ENV must be either test or production.');
  }
  if (!env.ESEWA_PRODUCT_CODE || !env.ESEWA_SECRET_KEY || !env.API_PUBLIC_URL) {
    return null;
  }
  let publicApiUrl;
  try {
    const url = new URL(env.API_PUBLIC_URL);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (mode === 'production' && url.protocol !== 'https:')
    ) {
      throw new Error('Invalid public API origin.');
    }
    publicApiUrl = url.origin;
  } catch {
    throw new HttpError(500, 'API_PUBLIC_URL must be a valid public HTTP origin and use HTTPS in production.');
  }
  return {
    mode,
    productCode: env.ESEWA_PRODUCT_CODE,
    secretKey: env.ESEWA_SECRET_KEY,
    publicApiUrl,
    formUrl: mode === 'production'
      ? 'https://epay.esewa.com.np/api/epay/main/v2/form'
      : 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    statusUrl: mode === 'production'
      ? 'https://esewa.com.np/api/epay/transaction/status/'
      : 'https://rc.esewa.com.np/api/epay/transaction/status/'
  };
}

export function isEsewaConfigured(env = process.env) {
  return Boolean(getEsewaConfig(env));
}

function sign(message, secretKey) {
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

function amountString(amount) {
  return Number(amount).toString();
}

export function createEsewaForm({ amount, transactionUuid, successUrl, failureUrl }, env = process.env) {
  const config = getEsewaConfig(env);
  if (!config) throw new HttpError(503, 'eSewa payments are not configured on this server.');
  const totalAmount = amountString(amount);
  const signedFieldNames = 'total_amount,transaction_uuid,product_code';
  const signature = sign(
    `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${config.productCode}`,
    config.secretKey
  );
  return {
    checkoutUrl: config.formUrl,
    fields: {
      amount: totalAmount,
      tax_amount: '0',
      total_amount: totalAmount,
      transaction_uuid: transactionUuid,
      product_code: config.productCode,
      product_service_charge: '0',
      product_delivery_charge: '0',
      success_url: successUrl,
      failure_url: failureUrl,
      signed_field_names: signedFieldNames,
      signature
    }
  };
}

export function verifyEsewaCallback(payload, env = process.env) {
  const config = getEsewaConfig(env);
  if (!config) throw new HttpError(503, 'eSewa payments are not configured on this server.');
  const signedFieldNames = String(payload?.signed_field_names || '').split(',');
  if (
    signedFieldNames.length !== responseSignedFields.length ||
    new Set(signedFieldNames).size !== responseSignedFields.length ||
    !responseSignedFields.every((field) => signedFieldNames.includes(field)) ||
    signedFieldNames.some((field) => !responseSignedFields.includes(field))
  ) {
    throw new HttpError(400, 'Invalid eSewa callback signature fields.');
  }
  if (payload.product_code !== config.productCode || !payload.transaction_uuid) {
    throw new HttpError(400, 'eSewa callback does not match this merchant transaction.');
  }
  const message = signedFieldNames.map((field) => `${field}=${payload[field]}`).join(',');
  const expected = Buffer.from(sign(message, config.secretKey));
  const received = Buffer.from(String(payload.signature || ''));
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new HttpError(400, 'eSewa callback signature verification failed.');
  }
  return {
    transactionUuid: String(payload.transaction_uuid),
    productCode: String(payload.product_code),
    totalAmount: Number(String(payload.total_amount).replace(/,/g, '')),
    status: String(payload.status)
  };
}

export async function checkEsewaTransaction({ transactionUuid, amount }, env = process.env) {
  const config = getEsewaConfig(env);
  if (!config) throw new HttpError(503, 'eSewa payments are not configured on this server.');
  const url = new URL(config.statusUrl);
  url.searchParams.set('product_code', config.productCode);
  url.searchParams.set('total_amount', amountString(amount));
  url.searchParams.set('transaction_uuid', transactionUuid);
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new HttpError(502, 'Could not reach eSewa to verify this transaction.');
  }
  if (!response.ok) throw new HttpError(502, 'eSewa could not verify this transaction.');
  let result;
  try {
    result = await response.json();
  } catch {
    throw new HttpError(502, 'eSewa returned an invalid transaction status response.');
  }
  const verifiedAmount = Number(String(result.total_amount).replace(/,/g, ''));
  if (
    result.product_code !== config.productCode ||
    result.transaction_uuid !== transactionUuid ||
    !Number.isFinite(verifiedAmount) ||
    Math.abs(verifiedAmount - Number(amount)) > 0.001
  ) {
    throw new HttpError(502, 'eSewa transaction details did not match the donation.');
  }
  return result;
}

export function getEsewaClientUrl(env = process.env) {
  const clientUrl = String(env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();
  try {
    const url = new URL(clientUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol.');
    return url.origin;
  } catch {
    throw new HttpError(500, 'CLIENT_URL must contain a valid HTTP or HTTPS origin.');
  }
}
