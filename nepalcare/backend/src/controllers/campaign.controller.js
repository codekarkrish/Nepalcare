import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import Campaign, { CAMPAIGN_CATEGORIES, CAMPAIGN_TYPES } from '../models/Campaign.js';
import NGO from '../models/NGO.js';
import VolunteerApplication from '../models/VolunteerApplication.js';
import Donation from '../models/Donation.js';
import Expense from '../models/Expense.js';
import ReliefActivity from '../models/ReliefActivity.js';
import ItemDonationRequest from '../models/ItemDonationRequest.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit } from '../utils/audit.js';
import mongoose from 'mongoose';

const editable = [
  'type',
  'title',
  'description',
  'category',
  'location',
  'coverImage',
  'startDate',
  'endDate',
  'targetAmount',
  'paymentDetails',
  'requiredItems',
  'collectionInstructions',
  'requiredVolunteers',
  'images'
];
const publicStatuses = ['PUBLISHED', 'ACTIVE', 'COMPLETED'];
const campaignImageDirectory = path.resolve(process.cwd(), 'uploads', 'campaign-images');

function parseCampaignRequest(req) {
  const input = { ...req.body };
  for (const field of ['paymentDetails', 'requiredItems']) {
    if (typeof input[field] !== 'string') continue;
    try {
      input[field] = JSON.parse(input[field]);
    } catch {
      throw new HttpError(400, `Campaign ${field} must contain valid JSON.`);
    }
  }
  return input;
}

function uploadedImage(req, field) {
  return req.files?.[field]?.[0] || null;
}

function hasInlineImageFields(input) {
  const paymentDetails = input.paymentDetails || {};
  return input.coverImage !== undefined ||
    ['qrImage', 'qrImageUrl'].some((field) => Object.prototype.hasOwnProperty.call(paymentDetails, field));
}

function validateImage(file) {
  const bytes = file.buffer;
  const jpeg = file.mimetype === 'image/jpeg' && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const png = file.mimetype === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = file.mimetype === 'image/webp' &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP';
  if (!jpeg && !png && !webp) {
    throw new HttpError(400, 'Campaign image content must be a valid JPG, PNG or WebP image.');
  }
  return jpeg ? '.jpg' : png ? '.png' : '.webp';
}

async function storeCampaignImage(file) {
  const extension = validateImage(file);
  await fs.mkdir(campaignImageDirectory, { recursive: true });
  const filename = `${crypto.randomBytes(24).toString('hex')}${extension}`;
  const filePath = path.join(campaignImageDirectory, filename);
  const handle = await fs.open(filePath, 'wx');
  try {
    await handle.writeFile(file.buffer);
  } catch (error) {
    await handle.close();
    await fs.rm(filePath, { force: true });
    throw error;
  }
  await handle.close();
  return { filename, filePath };
}

async function removeStoredImages(images) {
  await Promise.all(images.map(({ filePath }) => fs.rm(filePath, { force: true })));
}

function validateCampaignInput(input, {
  allowMissingType = false,
  allowLegacyCategory = false,
  allowLegacyDates = false
} = {}) {
  const type = input.type || (allowMissingType ? 'MONEY' : '');
  if (!CAMPAIGN_TYPES.includes(type)) {
    throw new HttpError(400, 'Campaign type must be MONEY, PHYSICAL or HYBRID.');
  }
  if (!CAMPAIGN_CATEGORIES.includes(input.category) && !allowLegacyCategory) {
    throw new HttpError(400, 'Select a supported campaign category.');
  }
  if (input.paymentDetails !== undefined) {
    if (!input.paymentDetails || typeof input.paymentDetails !== 'object' || Array.isArray(input.paymentDetails)) {
      throw new HttpError(400, 'Campaign payment details must be an object.');
    }
    const bankFields = ['bankName', 'accountName', 'accountNumber'];
    const hasBankDetails = bankFields.some((field) => String(input.paymentDetails[field] || '').trim());
    const hasCompleteBankDetails = bankFields.every((field) => String(input.paymentDetails[field] || '').trim());
    if (hasBankDetails && !hasCompleteBankDetails) {
      throw new HttpError(400, 'Provide the bank name, account name and account number together.');
    }
  }
  if (['MONEY', 'HYBRID'].includes(type)) {
    const targetAmount = Number(input.targetAmount);
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      throw new HttpError(400, 'Fundraising goal must be greater than zero for money campaigns.');
    }
  }
  if (['PHYSICAL', 'HYBRID'].includes(type)) {
    if (!Array.isArray(input.requiredItems) || input.requiredItems.length === 0) {
      throw new HttpError(400, 'Add at least one required item for physical campaigns.');
    }
    for (const item of input.requiredItems) {
      if (!item || typeof item.name !== 'string' || !item.name.trim()) {
        throw new HttpError(400, 'Every required item must have a name.');
      }
      if (!CAMPAIGN_CATEGORIES.includes(item.category)) {
        throw new HttpError(400, 'Select a valid category for every required item.');
      }
      if (!Number.isInteger(Number(item.requiredQuantity)) || Number(item.requiredQuantity) < 1) {
        throw new HttpError(400, 'Required item quantities must be positive whole numbers.');
      }
      if (item.acceptedCondition && !['NEW', 'LIKE_NEW', 'GOOD', 'ANY'].includes(item.acceptedCondition)) {
        throw new HttpError(400, 'Select a valid accepted item condition.');
      }
    }
    if (!String(input.collectionInstructions || '').trim()) {
      throw new HttpError(400, 'Collection instructions are required for physical campaigns.');
    }
  }
  if (input.requiredItems !== undefined && !Array.isArray(input.requiredItems)) {
    throw new HttpError(400, 'Required items must be provided as a list.');
  }
  if (
    input.requiredVolunteers !== undefined &&
    (!Number.isInteger(Number(input.requiredVolunteers)) || Number(input.requiredVolunteers) < 0 || Number(input.requiredVolunteers) > 10000)
  ) {
    throw new HttpError(400, 'Volunteer slots must be a whole number between 0 and 10,000.');
  }
  if (!allowLegacyDates && (!input.startDate || !input.endDate)) {
    throw new HttpError(400, 'Campaign start and end dates are required.');
  }
  if (input.startDate && input.endDate) {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new HttpError(400, 'Enter valid campaign start and end dates.');
    }
    if (endDate < startDate) {
      throw new HttpError(400, 'Campaign end date must be on or after the start date.');
    }
  }
  return type;
}

function campaignItemsFromInput(items, existingItems = []) {
  return items.map((item) => {
    const existing = item._id
      ? existingItems.find((saved) => String(saved._id) === String(item._id))
      : null;
    return {
      ...(existing ? { _id: existing._id } : {}),
      name: item.name,
      category: item.category,
      requiredQuantity: item.requiredQuantity,
      acceptedCondition: item.acceptedCondition || 'ANY',
      receivedQuantity: existing?.receivedQuantity || 0
    };
  });
}

async function campaignMetrics(campaignIds) {
  if (!campaignIds.length) return new Map();
  const [donationTotals, pendingTotals, volunteerTotals, expenseTotals] = await Promise.all([
    Donation.aggregate([
      { $match: { campaign: { $in: campaignIds }, status: 'SUCCESS', verifiedAt: { $ne: null } } },
      { $group: { _id: '$campaign', amount: { $sum: '$amount' }, donors: { $addToSet: '$citizen' } } }
    ]),
    Donation.aggregate([
      { $match: { campaign: { $in: campaignIds }, status: 'PENDING' } },
      { $group: { _id: '$campaign', amount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    VolunteerApplication.aggregate([
      { $match: { campaign: { $in: campaignIds } } },
      {
        $group: {
          _id: '$campaign',
          total: { $sum: 1 },
          filled: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } }
        }
      }
    ]),
    Expense.aggregate([
      { $match: { campaign: { $in: campaignIds }, status: { $in: ['APPROVED', 'VERIFIED'] } } },
      { $group: { _id: '$campaign', amount: { $sum: '$amount' } } }
    ])
  ]);
  const metrics = new Map();
  for (const id of campaignIds) {
    metrics.set(String(id), {
      confirmedAmount: 0,
      donorCount: 0,
      pendingAmount: 0,
      pendingDonationCount: 0,
      volunteerCount: 0,
      volunteerSlotsFilled: 0,
      verifiedExpenses: 0,
      pendingExpenses: 0,
      submittedExpenses: 0
    });
  }
  for (const entry of donationTotals) {
    const metric = metrics.get(String(entry._id));
    metric.confirmedAmount = entry.amount;
    metric.donorCount = entry.donors.length;
  }
  for (const entry of pendingTotals) {
    const metric = metrics.get(String(entry._id));
    metric.pendingAmount = entry.amount;
    metric.pendingDonationCount = entry.count;
  }
  for (const entry of volunteerTotals) {
    const metric = metrics.get(String(entry._id));
    metric.volunteerCount = entry.total;
    metric.volunteerSlotsFilled = entry.filled;
  }
  for (const entry of expenseTotals) {
    metrics.get(String(entry._id)).verifiedExpenses = entry.amount;
  }
  const [pendingExpenses, submittedExpenses] = await Promise.all([
    Expense.aggregate([
      { $match: { campaign: { $in: campaignIds }, status: { $in: ['PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_MORE_INFORMATION'] } } },
      { $group: { _id: '$campaign', amount: { $sum: '$amount' } } }
    ]),
    Expense.aggregate([
      { $match: { campaign: { $in: campaignIds } } },
      { $group: { _id: '$campaign', amount: { $sum: '$amount' } } }
    ])
  ]);
  for (const entry of pendingExpenses) metrics.get(String(entry._id)).pendingExpenses = entry.amount;
  for (const entry of submittedExpenses) metrics.get(String(entry._id)).submittedExpenses = entry.amount;
  return metrics;
}

export const listPublic = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
  const filter = { status: { $in: publicStatuses } };
  if (req.query.q) {
    const query = String(req.query.q).slice(0, 80);
    filter.$or = [
      { title: { $regex: query, $options: 'i' } },
      { location: { $regex: query, $options: 'i' } }
    ];
  }
  const [items, total] = await Promise.all([
    Campaign.find(filter)
      .select('-reviewNote -reviewedBy -reviewedAt -deletionRequests -archivedAt -archivedBy -archivedFromStatus')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: 'ngo', select: 'organizationName verificationStatus' }),
    Campaign.countDocuments(filter)
  ]);
  const totals = items.length ? await Donation.aggregate([
    {
      $match: {
        campaign: { $in: items.map((item) => item._id) },
        status: 'SUCCESS',
        verifiedAt: { $ne: null }
      }
    },
    { $group: { _id: '$campaign', amount: { $sum: '$amount' } } }
  ]) : [];
  const raisedByCampaign = new Map(totals.map((entry) => [String(entry._id), entry.amount]));
  res.json({
    success: true,
    data: {
      items: items.map((item) => ({
        ...item.toObject(),
        raisedAmount: raisedByCampaign.get(String(item._id)) || 0
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    }
  });
});

export const detail = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid campaign ID.');
  const campaign = await Campaign.findOne({
    _id: req.params.id,
    status: { $in: publicStatuses }
  })
    .select('+acceptedVolunteerIds -reviewNote -reviewedBy -reviewedAt -deletionRequests -archivedAt -archivedBy -archivedFromStatus')
    .populate({ path: 'ngo', select: 'organizationName verificationStatus' });
  if (!campaign) throw new HttpError(404, 'Campaign not found.');
  const [totals, expenseTotals, expenseBreakdown, publicExpenses, updates, collectedItems] = await Promise.all([
    Donation.aggregate([
      { $match: { campaign: campaign._id, status: 'SUCCESS', verifiedAt: { $ne: null } } },
      { $group: { _id: '$campaign', amount: { $sum: '$amount' } } }
    ]),
    Expense.aggregate([
      { $match: { campaign: campaign._id, status: { $in: ['APPROVED', 'VERIFIED'] } } },
      { $group: { _id: null, amount: { $sum: '$amount' } } }
    ]),
    Expense.aggregate([
      { $match: { campaign: campaign._id, status: { $in: ['APPROVED', 'VERIFIED'] } } },
      { $group: { _id: '$category', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } }
    ]),
    Expense.find({
      campaign: campaign._id,
      status: { $in: ['APPROVED', 'VERIFIED'] },
      publishToPublic: true
    }).select('title category publicDescription description amount expenseDate publishReceipt').sort({ expenseDate: -1 }).limit(100),
    ReliefActivity.find({ campaign: campaign._id, isPublic: true })
      .select('title location activityDate beneficiaryCount publicSummary photos relatedExpenses')
      .sort({ activityDate: -1 })
      .limit(100),
    ItemDonationRequest.aggregate([
      { $match: { campaign: campaign._id, status: 'COLLECTED' } },
      { $unwind: '$items' },
      { $group: { _id: { name: '$items.name', category: '$items.category' }, quantity: { $sum: '$items.quantity' } } }
    ])
  ]);
  const confirmedDonations = totals[0]?.amount || 0;
  const approvedExpenses = expenseTotals[0]?.amount || 0;
  const acceptedVolunteerCount = campaign.acceptedVolunteerIds?.length || 0;
  const campaignData = campaign.toObject();
  delete campaignData.acceptedVolunteerIds;
  res.json({
    success: true,
    data: {
      campaign: {
        ...campaignData,
        raisedAmount: confirmedDonations,
        acceptedVolunteerCount,
        remainingVolunteerSlots: Math.max(Number(campaign.requiredVolunteers || 0) - acceptedVolunteerCount, 0),
        volunteerCapacityFull: acceptedVolunteerCount >= Number(campaign.requiredVolunteers || 0),
        volunteerCapacityStatus: acceptedVolunteerCount >= Number(campaign.requiredVolunteers || 0) ? 'FULL' : 'OPEN'
      },
      financialUtilization: {
        confirmedDonations,
        approvedExpenses,
        remainingFunds: confirmedDonations - approvedExpenses,
        expenseBreakdown: expenseBreakdown.map((entry) => ({
          category: entry._id || 'OTHER',
          amount: entry.amount,
          count: entry.count
        })),
        expenses: publicExpenses.map((expense) => ({
          _id: expense._id,
          title: expense.title,
          category: expense.category,
          description: expense.publicDescription || expense.description,
          amount: expense.amount,
          expenseDate: expense.expenseDate,
          receiptAvailable: Boolean(expense.publishReceipt)
        }))
      },
      updates: updates.map((update) => ({
        ...update.toObject(),
        photos: update.photos.map((photo) => ({ _id: photo._id, originalName: photo.originalName, mimeType: photo.mimeType }))
      }))
    }
  });
});

async function sendCampaignImage(res, campaign, kind) {
  const filename = kind === 'cover'
    ? campaign.coverImage
    : campaign.paymentDetails?.qrImage;
  if (!filename || path.basename(filename) !== filename) {
    throw new HttpError(404, 'Campaign image not found.');
  }
  const imagePath = path.resolve(campaignImageDirectory, filename);
  if (!imagePath.startsWith(`${campaignImageDirectory}${path.sep}`)) {
    throw new HttpError(404, 'Campaign image not found.');
  }
  try {
    const imageStat = await fs.stat(imagePath);
    if (!imageStat.isFile()) throw new HttpError(404, 'Campaign image not found.');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.code === 'ENOENT') throw new HttpError(404, 'Campaign image not found.');
    throw error;
  }
  const mimeType = {
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  }[path.extname(filename)];
  if (!mimeType) throw new HttpError(404, 'Campaign image not found.');
  res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', mimeType);
  res.sendFile(imagePath);
}

export const getCampaignImage = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid campaign ID.');
  if (!['cover', 'qr'].includes(req.params.kind)) throw new HttpError(404, 'Campaign image not found.');
  const campaign = await Campaign.findOne({
    _id: req.params.id,
    status: { $in: publicStatuses }
  }).select('coverImage paymentDetails');
  if (!campaign) throw new HttpError(404, 'Campaign image not found.');
  await sendCampaignImage(res, campaign, req.params.kind);
});

export const getNGOCampaignImage = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid campaign ID.');
  if (!['cover', 'qr'].includes(req.params.kind)) throw new HttpError(404, 'Campaign image not found.');
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const campaign = await Campaign.findOne({ _id: req.params.id, ngo: ngo._id })
    .select('coverImage paymentDetails');
  if (!campaign) throw new HttpError(404, 'Campaign image not found.');
  await sendCampaignImage(res, campaign, req.params.kind);
});

export const create = asyncHandler(async (req, res) => {
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(400, 'Submit your NGO profile first.');
  if (ngo.verificationStatus !== 'VERIFIED') {
    throw new HttpError(403, 'Your NGO must be verified before creating campaigns.');
  }
  if (!req.user.isActive) throw new HttpError(403, 'This NGO account is inactive.');

  const input = parseCampaignRequest(req);
  if (hasInlineImageFields(input)) {
    throw new HttpError(400, 'Campaign cover and QR images must be uploaded as image files.');
  }
  const type = validateCampaignInput(input, { allowMissingType: true });
  const coverFile = uploadedImage(req, 'coverImage');
  const qrFile = uploadedImage(req, 'qrImage');
  if (['MONEY', 'HYBRID'].includes(type) && !qrFile) {
    throw new HttpError(400, 'Upload a QR image for every money or hybrid campaign.');
  }
  if (!['MONEY', 'HYBRID'].includes(type) && qrFile) {
    throw new HttpError(400, 'QR images are only accepted for money or hybrid campaigns.');
  }

  const payload = {};
  for (const key of editable) {
    if (!['coverImage', 'paymentDetails'].includes(key) && input[key] !== undefined) {
      payload[key] = input[key];
    }
  }
  payload.type = type;
  if (payload.requiredItems) payload.requiredItems = campaignItemsFromInput(payload.requiredItems);
  if (payload.targetAmount === undefined) payload.targetAmount = 0;
  const savedImages = [];
  let campaign;
  try {
    const coverImage = coverFile ? await storeCampaignImage(coverFile) : null;
    if (coverImage) savedImages.push(coverImage);
    const qrImage = qrFile ? await storeCampaignImage(qrFile) : null;
    if (qrImage) savedImages.push(qrImage);
    payload.coverImage = coverImage?.filename || '';
    payload.paymentDetails = {
      ...(input.paymentDetails || {}),
      ...(qrImage ? { qrImage: qrImage.filename } : {})
    };
    campaign = await Campaign.create({
      ...payload,
      ngo: ngo._id,
      status: 'DRAFT',
      reviewStatus: 'DRAFT',
      publicationStatus: 'UNPUBLISHED'
    });
  } catch (error) {
    await removeStoredImages(savedImages);
    throw error;
  }
  res.status(201).json({ success: true, data: { campaign } });
});

export const myCampaigns = asyncHandler(async (req, res) => {
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const items = await Campaign.find({ ngo: ngo._id }).sort({ createdAt: -1 }).limit(100);
  const metrics = await campaignMetrics(items.map((item) => item._id));
  res.json({
    success: true,
    data: {
      items: items.map((item) => {
        const stats = metrics.get(String(item._id));
        const goal = Number(item.targetAmount || 0);
        return {
          ...item.toObject(),
          raisedAmount: stats.confirmedAmount,
          remainingAmount: Math.max(goal - stats.confirmedAmount, 0),
          progressPercent: goal > 0 ? Math.min((stats.confirmedAmount / goal) * 100, 100) : 0,
          donorCount: stats.donorCount,
          volunteerSlotsFilled: stats.volunteerSlotsFilled,
          volunteerCapacityFull: stats.volunteerSlotsFilled >= Number(item.requiredVolunteers ?? 5),
          volunteerCapacityStatus: stats.volunteerSlotsFilled >= Number(item.requiredVolunteers ?? 5) ? 'FULL' : 'OPEN'
        };
      })
    }
  });
});

export const ngoManagement = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid campaign ID.');
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const campaign = await Campaign.findOne({ _id: req.params.id, ngo: ngo._id }).select('+acceptedVolunteerIds');
  if (!campaign) throw new HttpError(404, 'Campaign not found.');

  const [stats, donations, volunteers, expenses, activities, collectedItems] = await Promise.all([
    campaignMetrics([campaign._id]),
    Donation.find({ campaign: campaign._id })
      .select('campaign amount provider status verifiedAt reviewedAt createdAt')
      .sort({ createdAt: -1 })
      .limit(100),
    VolunteerApplication.find({ campaign: campaign._id })
      .populate('citizen', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(100),
    Expense.find({ campaign: campaign._id, ngo: ngo._id })
      .sort({ createdAt: -1 })
      .limit(100),
    ReliefActivity.find({ campaign: campaign._id, ngo: ngo._id })
      .sort({ activityDate: -1 })
      .limit(100),
    ItemDonationRequest.aggregate([
      { $match: { campaign: campaign._id, status: 'COLLECTED' } },
      { $unwind: '$items' },
      { $group: { _id: { name: '$items.name', category: '$items.category' }, quantity: { $sum: '$items.quantity' } } }
    ])
  ]);
  const financialSummary = stats.get(String(campaign._id));
  const campaignData = campaign.toObject();
  const acceptedVolunteerCount = campaign.acceptedVolunteerIds?.length || 0;
  const collectedByItem = new Map(collectedItems.map((entry) => [
    `${entry._id.name.toLowerCase()}|${entry._id.category}`,
    entry.quantity
  ]));
  campaignData.requiredItems = (campaignData.requiredItems || []).map((item) => ({
    ...item,
    receivedQuantity: Number(item.receivedQuantity || 0) +
      (collectedByItem.get(`${String(item.name).toLowerCase()}|${item.category}`) || 0)
  }));
  delete campaignData.acceptedVolunteerIds;
  res.json({
    success: true,
    data: {
      campaign: {
        ...campaignData,
        acceptedVolunteerCount,
        remainingVolunteerSlots: Math.max(Number(campaign.requiredVolunteers || 0) - acceptedVolunteerCount, 0),
        volunteerCapacityFull: acceptedVolunteerCount >= Number(campaign.requiredVolunteers || 0),
        volunteerCapacityStatus: acceptedVolunteerCount >= Number(campaign.requiredVolunteers || 0) ? 'FULL' : 'OPEN'
      },
      financialSummary: {
        ...financialSummary,
        goal: Number(campaign.targetAmount || 0),
        remainingBalance: financialSummary.confirmedAmount - financialSummary.verifiedExpenses,
        progressPercent: campaign.targetAmount > 0
          ? Math.min((financialSummary.confirmedAmount / campaign.targetAmount) * 100, 100)
          : 0
      },
      donations,
      volunteers,
      expenses,
      activities
    }
  });
});

export const ngoDonations = asyncHandler(async (req, res) => {
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const campaignIds = await Campaign.find({ ngo: ngo._id }).distinct('_id');
  const items = await Donation.find({ campaign: { $in: campaignIds } })
    .select('campaign amount provider status verifiedAt createdAt')
    .populate({ path: 'campaign', select: 'title type category' })
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ success: true, data: { items } });
});

export const ngoFinancialSummary = asyncHandler(async (req, res) => {
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const campaigns = await Campaign.find({ ngo: ngo._id }).sort({ createdAt: -1 }).limit(100);
  const metrics = await campaignMetrics(campaigns.map((campaign) => campaign._id));
  const items = campaigns.map((campaign) => {
    const stats = metrics.get(String(campaign._id));
    const goal = Number(campaign.targetAmount || 0);
    return {
      campaign: { _id: campaign._id, title: campaign.title, status: campaign.status, type: campaign.type },
      ...stats,
      goal,
      remainingBalance: stats.confirmedAmount - stats.verifiedExpenses,
      progressPercent: goal > 0 ? Math.min((stats.confirmedAmount / goal) * 100, 100) : 0
    };
  });
  res.json({ success: true, data: { items } });
});

export const update = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid campaign ID.');
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  if (ngo.verificationStatus === 'SUSPENDED') {
    throw new HttpError(403, 'Suspended NGOs cannot manage campaigns.');
  }
  const campaign = await Campaign.findOne({ _id: req.params.id, ngo: ngo._id });
  if (!campaign) throw new HttpError(404, 'Campaign not found.');
  if (!['DRAFT', 'REJECTED', 'RESUBMISSION_REQUIRED'].includes(campaign.status)) {
    throw new HttpError(409, 'Only draft or returned campaigns can be edited.');
  }
  const input = parseCampaignRequest(req);
  if (hasInlineImageFields(input)) {
    throw new HttpError(400, 'Campaign cover and QR images must be uploaded as image files.');
  }
  const coverFile = uploadedImage(req, 'coverImage');
  const qrFile = uploadedImage(req, 'qrImage');
  const next = { ...campaign.toObject() };
  for (const key of editable) {
    if (!['coverImage', 'paymentDetails'].includes(key) && input[key] !== undefined) {
      next[key] = input[key];
    }
  }
  if (input.paymentDetails !== undefined) {
    next.paymentDetails = { ...campaign.paymentDetails?.toObject(), ...input.paymentDetails };
  }
  const type = validateCampaignInput(next, {
    allowMissingType: true,
    allowLegacyCategory: !input.category || input.category === campaign.category,
    allowLegacyDates: (!input.startDate && !input.endDate)
  });
  if (!['MONEY', 'HYBRID'].includes(type) && qrFile) {
    throw new HttpError(400, 'QR images are only accepted for money or hybrid campaigns.');
  }
  if (
    ['MONEY', 'HYBRID'].includes(type) &&
    !qrFile &&
    !campaign.paymentDetails?.qrImage &&
    !campaign.paymentDetails?.qrImageUrl
  ) {
    throw new HttpError(400, 'Upload a QR image for every money or hybrid campaign.');
  }

  const savedImages = [];
  try {
    const coverImage = coverFile ? await storeCampaignImage(coverFile) : null;
    if (coverImage) savedImages.push(coverImage);
    const qrImage = qrFile ? await storeCampaignImage(qrFile) : null;
    if (qrImage) savedImages.push(qrImage);
    for (const key of editable) {
      if (key === 'coverImage' || key === 'paymentDetails') continue;
      if (input[key] !== undefined) {
        campaign[key] = key === 'requiredItems'
          ? campaignItemsFromInput(input[key], campaign.requiredItems)
          : input[key];
      }
    }
    if (coverImage) campaign.coverImage = coverImage.filename;
    if (input.paymentDetails !== undefined || qrImage) {
      campaign.paymentDetails = {
        ...campaign.paymentDetails?.toObject(),
        ...(input.paymentDetails || {}),
        ...(qrImage ? { qrImage: qrImage.filename, qrImageUrl: '' } : {})
      };
    }
    campaign.type = type;
    await campaign.save();
  } catch (error) {
    await removeStoredImages(savedImages);
    throw error;
  }
  res.json({ success: true, data: { campaign } });
});

export const requestDeletion = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid campaign ID.');
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 5 || reason.length > 1000) {
    throw new HttpError(400, 'Deletion reason must be between 5 and 1,000 characters.');
  }
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const ownedCampaign = await Campaign.findOne({ _id: req.params.id, ngo: ngo._id });
  if (!ownedCampaign) throw new HttpError(404, 'Campaign not found.');
  if (ownedCampaign.status === 'ARCHIVED') throw new HttpError(409, 'This campaign is already archived.');

  const campaign = await Campaign.findOneAndUpdate(
    {
      _id: ownedCampaign._id,
      ngo: ngo._id,
      status: { $ne: 'ARCHIVED' },
      deletionRequests: { $not: { $elemMatch: { status: 'PENDING' } } }
    },
    {
      $push: {
        deletionRequests: {
          reason,
          requestedBy: req.user._id,
          requestedAt: new Date()
        }
      }
    },
    { new: true, runValidators: true }
  );
  if (!campaign) throw new HttpError(409, 'A deletion request is already pending for this campaign.');
  const deletionRequest = campaign.deletionRequests[campaign.deletionRequests.length - 1];
  await writeAudit({
    actor: req.user._id,
    action: 'CAMPAIGN_DELETION_REQUESTED',
    resourceType: 'Campaign',
    resourceId: campaign._id,
    metadata: { requestId: String(deletionRequest._id), reason }
  });
  res.status(201).json({ success: true, data: { deletionRequest } });
});

export const listDeletionRequests = asyncHandler(async (_req, res) => {
  const campaigns = await Campaign.find({
    status: { $ne: 'ARCHIVED' },
    'deletionRequests.status': 'PENDING'
  })
    .populate('ngo', 'organizationName')
    .populate('deletionRequests.requestedBy', 'name email')
    .sort({ updatedAt: 1 })
    .limit(200);
  const items = campaigns.flatMap((campaign) =>
    campaign.deletionRequests
      .filter((request) => request.status === 'PENDING')
      .map((request) => ({
        ...request.toObject(),
        campaign: {
          _id: campaign._id,
          title: campaign.title,
          status: campaign.status,
          type: campaign.type
        },
        ngo: campaign.ngo
      }))
  );
  res.json({ success: true, data: { items } });
});

export const reviewDeletionRequest = asyncHandler(async (req, res) => {
  const { campaignId, requestId } = req.params;
  if (!mongoose.isValidObjectId(campaignId) || !mongoose.isValidObjectId(requestId)) {
    throw new HttpError(400, 'Invalid campaign deletion request ID.');
  }
  const { status, reviewNote = '' } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    throw new HttpError(400, 'Deletion request status must be APPROVED or REJECTED.');
  }
  const note = String(reviewNote).trim();
  if (status === 'REJECTED' && !note) {
    throw new HttpError(400, 'A reason is required when rejecting a deletion request.');
  }

  const now = new Date();
  const changes = {
    'deletionRequests.$.status': status,
    'deletionRequests.$.reviewedBy': req.user._id,
    'deletionRequests.$.reviewNote': note.slice(0, 1000),
    'deletionRequests.$.reviewedAt': now
  };
  if (status === 'APPROVED') {
    const current = await Campaign.findOne({
      _id: campaignId,
      deletionRequests: { $elemMatch: { _id: requestId, status: 'PENDING' } }
    }).select('status');
    if (!current) throw new HttpError(409, 'This deletion request is no longer pending.');
    changes.status = 'ARCHIVED';
    changes.archivedAt = now;
    changes.archivedBy = req.user._id;
    changes.archivedFromStatus = current.status;
  }
  const campaign = await Campaign.findOneAndUpdate(
    {
      _id: campaignId,
      deletionRequests: { $elemMatch: { _id: requestId, status: 'PENDING' } }
    },
    { $set: changes },
    { new: true, runValidators: true }
  );
  if (!campaign) throw new HttpError(409, 'This deletion request has already been reviewed.');

  await writeAudit({
    actor: req.user._id,
    action: status === 'APPROVED' ? 'CAMPAIGN_DELETION_APPROVED' : 'CAMPAIGN_DELETION_REJECTED',
    resourceType: 'Campaign',
    resourceId: campaign._id,
    metadata: {
      requestId,
      newStatus: status,
      reviewNote: note.slice(0, 1000)
    }
  });
  const deletionRequest = campaign.deletionRequests.id(requestId);
  res.json({ success: true, data: { campaign, deletionRequest } });
});

export const submit = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid campaign ID.');
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo || ngo.verificationStatus !== 'VERIFIED') {
    throw new HttpError(403, 'Verified NGO profile required.');
  }
  const campaign = await Campaign.findOne({ _id: req.params.id, ngo: ngo._id });
  if (!campaign) throw new HttpError(404, 'Campaign not found.');
  if (!['DRAFT', 'REJECTED', 'RESUBMISSION_REQUIRED'].includes(campaign.status)) {
    throw new HttpError(409, 'Campaign cannot be submitted from its current status.');
  }
  validateCampaignInput(campaign.toObject(), {
    allowMissingType: true,
    allowLegacyCategory: true,
    allowLegacyDates: true
  });
  campaign.status = 'SUBMITTED';
  campaign.reviewStatus = 'PENDING';
  campaign.publicationStatus = 'UNPUBLISHED';
  await campaign.save();
  res.json({ success: true, data: { campaign } });
});

export const pending = asyncHandler(async (_req, res) => {
  const items = await Campaign.find({
    status: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED'] }
  })
    .populate({ path: 'ngo', select: 'organizationName registrationNumber address verificationStatus user' })
    .sort({ createdAt: 1 })
    .limit(100);
  res.json({ success: true, data: { items } });
});

export const review = asyncHandler(async (req, res) => {
  const { status, reviewNote = '' } = req.body;
  if (!['APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED'].includes(status)) {
    throw new HttpError(400, 'Unsupported review status.');
  }
  if (['REJECTED', 'RESUBMISSION_REQUIRED'].includes(status) && !String(reviewNote).trim()) {
    throw new HttpError(400, 'A review reason is required.');
  }
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid campaign ID.');
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) throw new HttpError(404, 'Campaign not found.');
  if (!['SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED'].includes(campaign.status)) {
    throw new HttpError(409, 'Campaign is not awaiting review.');
  }

  const previousStatus = campaign.status;
  campaign.reviewStatus = status;
  campaign.status = status === 'APPROVED' ? 'PUBLISHED' : status;
  campaign.publicationStatus = status === 'APPROVED' ? 'PUBLISHED' : 'UNPUBLISHED';
  campaign.reviewNote = String(reviewNote).slice(0, 1000);
  campaign.reviewedBy = req.user._id;
  campaign.reviewedAt = new Date();
  await campaign.save();
  await writeAudit({
    actor: req.user._id,
    action: 'CAMPAIGN_REVIEWED',
    resourceType: 'Campaign',
    resourceId: campaign._id,
    metadata: {
      previousStatus,
      newStatus: campaign.status,
      reviewNote: campaign.reviewNote
    }
  });
  res.json({ success: true, data: { campaign } });
});

export const citizenSummary = asyncHandler(async (req, res) => {
  const [donations, supportedCampaigns, volunteerApplications, activeVolunteerRoles] = await Promise.all([
    Donation.aggregate([
      { $match: { citizen: req.user._id, status: 'SUCCESS', verifiedAt: { $ne: null } } },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    Donation.distinct('campaign', { citizen: req.user._id, status: 'SUCCESS', verifiedAt: { $ne: null } }),
    VolunteerApplication.countDocuments({ citizen: req.user._id }),
    VolunteerApplication.countDocuments({ citizen: req.user._id, status: 'ACCEPTED' })
  ]);
  res.json({
    success: true,
    data: {
      donations: donations[0]?.count || 0,
      totalDonationAmount: donations[0]?.amount || 0,
      campaignsSupported: supportedCampaigns.length,
      volunteerApplications,
      activeVolunteerRoles
    }
  });
});

export const adminOverview = asyncHandler(async (_req, res) => {
  const User = (await import('../models/User.js')).default;
  const DonationModel = (await import('../models/Donation.js')).default;
  const [pendingNgos, pendingCampaigns, users, donations] = await Promise.all([
    NGO.countDocuments({ verificationStatus: { $in: ['PENDING', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED'] } }),
    Campaign.countDocuments({ status: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED'] } }),
    User.countDocuments(),
    DonationModel.countDocuments()
  ]);
  res.json({ success: true, data: { pendingNgos, pendingCampaigns, users, donations } });
});
