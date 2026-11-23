import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import Donation from '../models/Donation.js';
import Campaign from '../models/Campaign.js';
import NGO from '../models/NGO.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit } from '../utils/audit.js';
import {
  checkEsewaTransaction,
  createEsewaForm,
  getEsewaClientUrl,
  getEsewaConfig,
  isEsewaConfigured,
  verifyEsewaCallback
} from '../services/esewa.service.js';
import mongoose from 'mongoose';

const manualProviders = ['BANK_TRANSFER', 'QR'];
const maximumDonationAmount = 100000000;
const paymentProofDirectory = path.resolve(process.cwd(), 'uploads', 'payment-proofs');

function parseAmount(value) {
  const amount = Number(value);
  const cents = amount * 100;
  if (!Number.isFinite(amount) || amount < 1 || amount > maximumDonationAmount || Math.abs(cents - Math.round(cents)) > 1e-8) {
    throw new HttpError(400, 'Donation amount must be between 1 and 100,000,000 NPR with at most two decimal places.');
  }
  return amount;
}

function hasBankDetails(paymentDetails = {}) {
  return Boolean(paymentDetails.bankName && paymentDetails.accountName && paymentDetails.accountNumber);
}

function hasQrImage(paymentDetails = {}) {
  return Boolean(paymentDetails.qrImage || paymentDetails.qrImageUrl);
}

function ensurePaymentProof(file) {
  if (!file) return null;
  const pdf = file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-';
  const jpeg = file.mimetype === 'image/jpeg' && file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const png = file.mimetype === 'image/png' && file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!pdf && !jpeg && !png) {
    throw new HttpError(400, 'Payment proof content must be a valid PDF, JPG or PNG file.');
  }
  return {
    extension: pdf ? '.pdf' : jpeg ? '.jpg' : '.png',
    mimeType: file.mimetype
  };
}

async function updateEsewaStatus(donation, statusResult) {
  const gatewayStatus = String(statusResult.status || '').toUpperCase();
  const set = {};

  if (gatewayStatus === 'COMPLETE') {
    set.status = 'SUCCESS';
    set.providerReference = String(statusResult.ref_id || '');
    set.verifiedAt = donation.verifiedAt || new Date();
  } else if (['FULL_REFUND', 'PARTIAL_REFUND'].includes(gatewayStatus)) {
    if (donation.status !== 'SUCCESS') return donation;
    set.status = 'REFUNDED';
  } else if (['PENDING', 'AMBIGUOUS'].includes(gatewayStatus)) {
    if (donation.status === 'SUCCESS') return donation;
    set.status = 'PENDING';
  } else if (['NOT_FOUND', 'CANCELED'].includes(gatewayStatus)) {
    if (donation.status === 'SUCCESS') return donation;
    set.status = 'FAILED';
  } else {
    throw new HttpError(502, 'eSewa returned an unsupported transaction status.');
  }

  const allowedCurrentStatuses = gatewayStatus === 'COMPLETE'
    ? ['INITIATED', 'PENDING']
    : gatewayStatus === 'FULL_REFUND' || gatewayStatus === 'PARTIAL_REFUND'
      ? ['SUCCESS']
      : ['INITIATED', 'PENDING'];
  const updated = await Donation.findOneAndUpdate(
    { _id: donation._id, status: { $in: allowedCurrentStatuses } },
    { $set: set },
    { new: true }
  );
  return updated || Donation.findById(donation._id);
}

async function verifyEsewaDonation(donation) {
  const result = await checkEsewaTransaction({
    transactionUuid: donation.transactionUuid,
    amount: donation.amount
  });
  return updateEsewaStatus(donation, result);
}

function getFrontendResultUrl(campaignId, donationId, status) {
  const url = new URL(`/campaigns/${campaignId}`, getEsewaClientUrl());
  url.searchParams.set('payment', status.toLowerCase());
  url.searchParams.set('donationId', String(donationId));
  return url.toString();
}

export const paymentOptions = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.campaignId)) throw new HttpError(400, 'Invalid campaign ID.');
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    status: { $in: ['PUBLISHED', 'ACTIVE'] },
    type: { $in: ['MONEY', 'HYBRID'] }
  }).select('paymentDetails');
  if (!campaign) throw new HttpError(404, 'Campaign not found or not accepting money donations.');
  res.json({
    success: true,
    data: {
      methods: {
        ESEWA: isEsewaConfigured(),
        BANK_TRANSFER: hasBankDetails(campaign.paymentDetails),
        QR: hasQrImage(campaign.paymentDetails)
      }
    }
  });
});

export const create = asyncHandler(async (req, res) => {
  const amount = parseAmount(req.body.amount);
  const provider = String(req.body.provider || '').toUpperCase();
  if (!['ESEWA', ...manualProviders].includes(provider)) {
    throw new HttpError(400, 'Select eSewa, bank transfer or QR payment.');
  }
  if (!mongoose.isValidObjectId(req.body.campaignId)) throw new HttpError(400, 'Invalid campaign ID.');
  const campaign = await Campaign.findOne({
    _id: req.body.campaignId,
    status: { $in: ['PUBLISHED', 'ACTIVE'] },
    type: { $in: ['MONEY', 'HYBRID'] }
  });
  if (!campaign) throw new HttpError(404, 'Campaign not found or not accepting money donations.');

  if (provider === 'ESEWA' && !isEsewaConfigured()) {
    throw new HttpError(503, 'eSewa payments are not configured on this server.');
  }
  if (provider === 'BANK_TRANSFER' && !hasBankDetails(campaign.paymentDetails)) {
    throw new HttpError(409, 'Bank transfer details are not available for this campaign.');
  }
  if (provider === 'QR' && !hasQrImage(campaign.paymentDetails)) {
    throw new HttpError(409, 'QR payment is not available for this campaign.');
  }

  const key = String(req.headers['idempotency-key'] || req.body.idempotencyKey || '').trim();
  if (key.length < 8 || key.length > 120) {
    throw new HttpError(400, 'Provide a unique Idempotency-Key header (8–120 characters).');
  }
  const existing = await Donation.findOne({ citizen: req.user._id, idempotencyKey: key });
  if (existing) {
    if (
      String(existing.campaign) !== String(campaign._id) ||
      existing.amount !== amount ||
      existing.provider !== provider
    ) {
      throw new HttpError(409, 'This idempotency key was already used for a different donation.');
    }
    return res.json({
      success: true,
      message: 'Existing donation intent returned.',
      data: { donation: existing, paymentConfigured: true }
    });
  }

  const donation = await Donation.create({
    campaign: campaign._id,
    citizen: req.user._id,
    amount,
    provider,
    status: 'INITIATED',
    transactionUuid: provider === 'ESEWA' ? crypto.randomUUID() : undefined,
    idempotencyKey: key
  });
  res.status(201).json({
    success: true,
    message: 'Donation intent created. Payment is not confirmed until verified.',
    data: { donation, paymentConfigured: true }
  });
});

export const initiateEsewa = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid donation ID.');
  const donation = await Donation.findOne({ _id: req.params.id, citizen: req.user._id });
  if (!donation) throw new HttpError(404, 'Donation not found.');
  if (donation.provider !== 'ESEWA') throw new HttpError(409, 'This donation does not use eSewa.');
  if (!['INITIATED', 'PENDING'].includes(donation.status)) {
    throw new HttpError(409, 'This donation is no longer awaiting eSewa payment.');
  }

  const config = getEsewaConfig();
  if (!config) throw new HttpError(503, 'eSewa payments are not configured on this server.');
  const successUrl = new URL('/api/donations/esewa/success', config.publicApiUrl).toString();
  const failureUrl = new URL('/api/donations/esewa/failure', config.publicApiUrl);
  failureUrl.searchParams.set('transaction_uuid', donation.transactionUuid);
  const form = createEsewaForm({
    amount: donation.amount,
    transactionUuid: donation.transactionUuid,
    successUrl,
    failureUrl: failureUrl.toString()
  });

  if (donation.status === 'INITIATED') {
    donation.status = 'PENDING';
    donation.paymentInitiatedAt = new Date();
    await donation.save();
  }
  res.json({ success: true, data: { donation, ...form } });
});

export const verifyEsewa = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid donation ID.');
  const donation = await Donation.findOne({ _id: req.params.id, citizen: req.user._id });
  if (!donation) throw new HttpError(404, 'Donation not found.');
  if (donation.provider !== 'ESEWA') throw new HttpError(409, 'This donation does not use eSewa.');
  const updated = await verifyEsewaDonation(donation);
  res.json({
    success: true,
    message: updated.status === 'SUCCESS' ? 'Payment verified by eSewa.' : `Payment status: ${updated.status}.`,
    data: { donation: updated }
  });
});

export const handleEsewaSuccess = asyncHandler(async (req, res) => {
  const encoded = String(req.query.data || '');
  if (!encoded || encoded.length > 10000) throw new HttpError(400, 'Missing or invalid eSewa callback data.');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    throw new HttpError(400, 'eSewa returned invalid callback data.');
  }
  const callback = verifyEsewaCallback(payload);
  const donation = await Donation.findOne({
    provider: 'ESEWA',
    transactionUuid: callback.transactionUuid
  });
  if (!donation) throw new HttpError(404, 'Donation for this eSewa transaction was not found.');
  if (!Number.isFinite(callback.totalAmount) || Math.abs(callback.totalAmount - donation.amount) > 0.001) {
    throw new HttpError(400, 'eSewa callback amount does not match the donation.');
  }
  const updated = await verifyEsewaDonation(donation);
  res.redirect(303, getFrontendResultUrl(
    donation.campaign,
    donation._id,
    updated.status
  ));
});

export const handleEsewaFailure = asyncHandler(async (req, res) => {
  const transactionUuid = String(req.query.transaction_uuid || '');
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(transactionUuid)) {
    throw new HttpError(400, 'Invalid eSewa transaction identifier.');
  }
  const donation = await Donation.findOne({ provider: 'ESEWA', transactionUuid });
  if (!donation) throw new HttpError(404, 'Donation for this eSewa transaction was not found.');
  const updated = await verifyEsewaDonation(donation);
  res.redirect(303, getFrontendResultUrl(donation.campaign, donation._id, updated.status));
});

export const submitTransfer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid donation ID.');
  const donation = await Donation.findOne({ _id: req.params.id, citizen: req.user._id });
  if (!donation) throw new HttpError(404, 'Donation not found.');
  if (!manualProviders.includes(donation.provider)) {
    throw new HttpError(409, 'This donation does not use manual bank or QR transfer.');
  }
  if (donation.status !== 'INITIATED') {
    throw new HttpError(409, 'Transfer details can only be submitted once for an initiated donation.');
  }
  const reference = String(req.body.transactionReference || '').trim();
  if (reference.length < 3 || reference.length > 120) {
    throw new HttpError(400, 'Transaction reference must be between 3 and 120 characters.');
  }

  const proofType = ensurePaymentProof(req.file);
  const proofKey = req.file ? `${crypto.randomBytes(24).toString('hex')}${proofType.extension}` : '';
  let proofPath = '';
  let proofCreated = false;
  try {
    if (req.file) {
      await fs.mkdir(paymentProofDirectory, { recursive: true });
      proofPath = path.join(paymentProofDirectory, proofKey);
      const handle = await fs.open(proofPath, 'wx');
      proofCreated = true;
      try {
        await handle.writeFile(req.file.buffer);
      } finally {
        await handle.close();
      }
    }
    donation.transferReference = reference;
    donation.paymentProofKey = proofKey || undefined;
    donation.paymentProofName = req.file ? path.basename(req.file.originalname).slice(0, 255) : '';
    donation.paymentProofMimeType = req.file ? proofType.mimeType : '';
    donation.paymentProofSize = req.file?.size || 0;
    donation.status = 'PENDING';
    await donation.save();
  } catch (error) {
    if (proofCreated) await fs.rm(proofPath, { force: true });
    throw error;
  }

  res.status(200).json({
    success: true,
    message: 'Transfer submitted and awaiting verification. It is not yet a confirmed donation.',
    data: { donation }
  });
});

export const reviewQueue = asyncHandler(async (req, res) => {
  const filter = {
    status: 'PENDING',
    provider: { $in: manualProviders }
  };
  if (req.user.role === 'NGO') {
    const ngo = await NGO.findOne({ user: req.user._id });
    if (!ngo) throw new HttpError(404, 'NGO profile not found.');
    const campaignIds = await Campaign.find({ ngo: ngo._id }).distinct('_id');
    filter.campaign = { $in: campaignIds };
  }
  const items = await Donation.find(filter)
    .populate({
      path: 'campaign',
      select: 'title ngo',
      populate: { path: 'ngo', select: 'organizationName' }
    })
    .populate('citizen', 'name email')
    .sort({ createdAt: 1 })
    .limit(200);
  res.json({ success: true, data: { items } });
});

export const reviewTransfer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid donation ID.');
  const { status, reviewNote = '' } = req.body;
  if (!['SUCCESS', 'FAILED'].includes(status)) {
    throw new HttpError(400, 'Transfer review status must be SUCCESS or FAILED.');
  }
  if (status === 'FAILED' && !String(reviewNote).trim()) {
    throw new HttpError(400, 'A reason is required to reject a transfer.');
  }
  const donation = await Donation.findById(req.params.id);
  if (!donation) throw new HttpError(404, 'Donation not found.');
  if (!manualProviders.includes(donation.provider) || donation.status !== 'PENDING') {
    throw new HttpError(409, 'This transfer is not awaiting verification.');
  }
  if (req.user.role === 'NGO') {
    const ngo = await NGO.findOne({ user: req.user._id });
    if (!ngo) throw new HttpError(404, 'NGO profile not found.');
    const ownsCampaign = await Campaign.exists({ _id: donation.campaign, ngo: ngo._id });
    if (!ownsCampaign) throw new HttpError(403, 'This donation belongs to another organization.');
  }

  const reviewedAt = new Date();
  const updated = await Donation.findOneAndUpdate(
    { _id: donation._id, status: 'PENDING', provider: { $in: manualProviders } },
    {
      $set: {
        status,
        reviewedBy: req.user._id,
        reviewNote: String(reviewNote).slice(0, 1000),
        verifiedAt: status === 'SUCCESS' ? reviewedAt : null
      }
    },
    { new: true }
  );
  if (!updated) throw new HttpError(409, 'This transfer has already been reviewed.');
  await writeAudit({
    actor: req.user._id,
    action: status === 'SUCCESS' ? 'DONATION_TRANSFER_VERIFIED' : 'DONATION_TRANSFER_REJECTED',
    resourceType: 'Donation',
    resourceId: updated._id,
    metadata: {
      campaign: String(updated.campaign),
      previousStatus: 'PENDING',
      newStatus: status,
      reviewNote: updated.reviewNote
    }
  });
  res.json({ success: true, data: { donation: updated } });
});

export const getPaymentProof = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid donation ID.');
  const donation = await Donation.findById(req.params.id).select('+paymentProofKey');
  if (!donation || !donation.paymentProofKey) throw new HttpError(404, 'Payment proof not found.');

  if (req.user.role === 'CITIZEN' && String(donation.citizen) !== String(req.user._id)) {
    throw new HttpError(403, 'You cannot access another donor’s payment proof.');
  }
  if (req.user.role === 'NGO') {
    const ngo = await NGO.findOne({ user: req.user._id });
    if (!ngo || !(await Campaign.exists({ _id: donation.campaign, ngo: ngo._id }))) {
      throw new HttpError(403, 'You cannot access this payment proof.');
    }
  }

  if (path.basename(donation.paymentProofKey) !== donation.paymentProofKey) {
    throw new HttpError(400, 'Invalid payment proof reference.');
  }
  const proofPath = path.resolve(paymentProofDirectory, donation.paymentProofKey);
  if (!proofPath.startsWith(`${paymentProofDirectory}${path.sep}`)) {
    throw new HttpError(400, 'Invalid payment proof reference.');
  }
  try {
    const proofStat = await fs.stat(proofPath);
    if (!proofStat.isFile()) throw new HttpError(404, 'Payment proof not found.');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.code === 'ENOENT') throw new HttpError(404, 'Payment proof not found.');
    throw error;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', donation.paymentProofMimeType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(donation.paymentProofName || 'payment-proof')}"`
  );
  res.sendFile(proofPath);
});

export const mine = asyncHandler(async (req, res) => {
  const items = await Donation.find({ citizen: req.user._id })
    .populate({
      path: 'campaign',
      select: 'title coverImage type category ngo',
      populate: { path: 'ngo', select: 'organizationName' }
    })
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ success: true, data: { items } });
});

export const listAdmin = asyncHandler(async (_req, res) => {
  const items = await Donation.find()
    .populate('campaign', 'title')
    .populate('citizen', 'name email')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ success: true, data: { items } });
});
