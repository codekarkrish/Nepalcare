import mongoose from 'mongoose';
import Campaign from '../models/Campaign.js';
import Expense, { EXPENSE_CATEGORIES } from '../models/Expense.js';
import NGO from '../models/NGO.js';
import ReliefActivity from '../models/ReliefActivity.js';
import VolunteerApplication from '../models/VolunteerApplication.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { removePrivateFiles, sendPrivateFile, storePrivateFile } from '../utils/privateFiles.js';
import { writeAudit } from '../utils/audit.js';

const approvedExpenseStatuses = ['APPROVED', 'VERIFIED'];
const pendingExpenseStatuses = ['PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_MORE_INFORMATION'];

async function ownedCampaign(user, id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid campaign ID.');
  const ngo = await NGO.findOne({ user: user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const campaign = await Campaign.findOne({ _id: id, ngo: ngo._id });
  if (!campaign) throw new HttpError(404, 'Campaign not found.');
  if (campaign.status === 'ARCHIVED') throw new HttpError(409, 'Archived campaigns cannot accept new activities or expenses.');
  return { ngo, campaign };
}

function filesFor(req, name) {
  return req.files?.[name] || [];
}

function parseIdList(value) {
  if (!value) return [];
  let ids = value;
  if (typeof value === 'string') {
    try { ids = JSON.parse(value); } catch { throw new HttpError(400, 'Related expenses must contain valid JSON.'); }
  }
  if (!Array.isArray(ids) || ids.some((id) => !mongoose.isValidObjectId(id))) {
    throw new HttpError(400, 'Related expenses must be a list of valid expense IDs.');
  }
  return [...new Set(ids.map(String))];
}

function cleanFileFields(record) {
  const object = record.toObject();
  for (const field of ['receipt', 'photos', 'documents']) {
    if (Array.isArray(object[field])) object[field] = object[field].map(({ storageKey, ...file }) => file);
    else if (object[field]) {
      const { storageKey, ...file } = object[field];
      object[field] = file;
    }
  }
  return object;
}

export const createActivity = asyncHandler(async (req, res) => {
  const { ngo, campaign } = await ownedCampaign(req.user, req.body.campaignId);
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const publicSummary = String(req.body.publicSummary || '').trim();
  const location = String(req.body.location || campaign.location || '').trim();
  const activityDate = new Date(req.body.activityDate);
  const beneficiaryCount = Number(req.body.beneficiaryCount || 0);
  if (!title || title.length > 160 || !description || description.length > 3000 ||
      !publicSummary || publicSummary.length > 2000 || !location || location.length > 200) {
    throw new HttpError(400, 'Provide a title, description, public summary and location within the allowed lengths.');
  }
  if (Number.isNaN(activityDate.getTime()) || !Number.isInteger(beneficiaryCount) || beneficiaryCount < 0) {
    throw new HttpError(400, 'Enter a valid update date and whole-number beneficiary count.');
  }
  const relatedExpenses = parseIdList(req.body.relatedExpenses);
  if (relatedExpenses.length && await Expense.countDocuments({
    _id: { $in: relatedExpenses },
    campaign: campaign._id,
    ngo: ngo._id,
    status: { $in: approvedExpenseStatuses }
  }) !== relatedExpenses.length) {
    throw new HttpError(400, 'Only approved expenses for this campaign can be linked to an update.');
  }
  const photos = filesFor(req, 'photos');
  const documents = filesFor(req, 'documents');
  if (photos.length > 8 || documents.length > 5) throw new HttpError(400, 'Upload at most 8 photos and 5 supporting documents.');
  const savedPhotos = [];
  const savedDocuments = [];
  let activity;
  try {
    for (const file of photos) savedPhotos.push(await storePrivateFile(file, 'campaign-updates', { imagesOnly: true }));
    for (const file of documents) savedDocuments.push(await storePrivateFile(file, 'campaign-updates'));
    activity = await ReliefActivity.create({
      campaign: campaign._id,
      ngo: ngo._id,
      title,
      description,
      location,
      activityDate,
      beneficiaryCount,
      status: 'COMPLETED',
      publicSummary,
      photos: savedPhotos,
      documents: savedDocuments,
      relatedExpenses,
      isPublic: req.body.isPublic !== 'false'
    });
  } catch (error) {
    await removePrivateFiles([...savedPhotos, ...savedDocuments], 'campaign-updates');
    throw error;
  }
  await writeAudit({
    actor: req.user._id,
    action: 'CAMPAIGN_UPDATE_CREATED',
    resourceType: 'ReliefActivity',
    resourceId: activity._id,
    metadata: { campaign: String(campaign._id), photoCount: savedPhotos.length }
  });
  res.status(201).json({ success: true, data: { activity: cleanFileFields(activity) } });
});

export const listActivities = asyncHandler(async (req, res) => {
  const filter = { isPublic: true };
  if (req.query.campaignId) {
    if (!mongoose.isValidObjectId(req.query.campaignId)) throw new HttpError(400, 'Invalid campaign ID.');
    filter.campaign = req.query.campaignId;
    if (!(await Campaign.exists({ _id: req.query.campaignId, status: { $in: ['PUBLISHED', 'ACTIVE', 'COMPLETED'] } }))) {
      return res.json({ success: true, data: { items: [] } });
    }
  } else {
    filter.campaign = {
      $in: await Campaign.find({ status: { $in: ['PUBLISHED', 'ACTIVE', 'COMPLETED'] } }).distinct('_id')
    };
  }
  const items = await ReliefActivity.find(filter)
    .select('campaign title location activityDate beneficiaryCount publicSummary photos relatedExpenses createdAt')
    .populate('campaign', 'title status')
    .sort({ activityDate: -1 })
    .limit(100);
  res.json({
    success: true,
    data: {
      items: items.map((item) => ({
        ...item.toObject(),
        photos: item.photos.map((photo) => ({ _id: photo._id, originalName: photo.originalName, mimeType: photo.mimeType }))
      }))
    }
  });
});

export const listNGOActivities = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.query.campaignId)) throw new HttpError(400, 'Invalid campaign ID.');
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const campaign = await Campaign.findOne({ _id: req.query.campaignId, ngo: ngo._id });
  if (!campaign) throw new HttpError(404, 'Campaign not found.');
  const items = await ReliefActivity.find({ campaign: campaign._id })
    .sort({ activityDate: -1 })
    .limit(100);
  res.json({ success: true, data: { items } });
});

export const createExpense = asyncHandler(async (req, res) => {
  const { ngo, campaign } = await ownedCampaign(req.user, req.body.campaignId);
  const title = String(req.body.title || '').trim();
  const category = String(req.body.category || '').trim().toUpperCase();
  const description = String(req.body.description || '').trim();
  const amount = Number(req.body.amount);
  const expenseDate = new Date(req.body.expenseDate);
  const receiptFile = filesFor(req, 'receipt')[0];
  const documentFiles = filesFor(req, 'documents');
  if (!title || title.length > 160 || !description || description.length > 2000) {
    throw new HttpError(400, 'Expense title and description are required.');
  }
  if (!EXPENSE_CATEGORIES.includes(category)) throw new HttpError(400, 'Select a valid expense category.');
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) throw new HttpError(400, 'Enter a valid expense amount in NPR.');
  if (Number.isNaN(expenseDate.getTime())) throw new HttpError(400, 'Enter a valid expense date.');
  if (!receiptFile) throw new HttpError(400, 'A bill or receipt is required for every expense.');
  if (documentFiles.length > 5) throw new HttpError(400, 'Upload no more than five supporting documents.');

  const savedFiles = [];
  let expense;
  try {
    const receipt = await storePrivateFile(receiptFile, 'expenses');
    savedFiles.push(receipt);
    const documents = [];
    for (const file of documentFiles) {
      const stored = await storePrivateFile(file, 'expenses');
      savedFiles.push(stored);
      documents.push(stored);
    }
    expense = await Expense.create({
      campaign: campaign._id,
      ngo: ngo._id,
      title,
      category,
      description,
      amount,
      expenseDate,
      vendorName: String(req.body.vendorName || '').trim().slice(0, 160),
      invoiceReference: String(req.body.invoiceReference || '').trim().slice(0, 500),
      notes: String(req.body.notes || '').trim().slice(0, 2000),
      receipt,
      documents,
      status: 'PENDING'
    });
  } catch (error) {
    await removePrivateFiles(savedFiles, 'expenses');
    throw error;
  }
  await writeAudit({
    actor: req.user._id,
    action: 'CAMPAIGN_EXPENSE_SUBMITTED',
    resourceType: 'Expense',
    resourceId: expense._id,
    metadata: { campaign: String(campaign._id), amount, category }
  });
  res.status(201).json({ success: true, data: { expense: cleanFileFields(expense) } });
});

export const listExpenses = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === 'NGO') {
    const ngo = await NGO.findOne({ user: req.user._id });
    if (!ngo) throw new HttpError(404, 'NGO profile not found.');
    filter.ngo = ngo._id;
    if (req.query.campaignId) {
      if (!mongoose.isValidObjectId(req.query.campaignId) ||
          !(await Campaign.exists({ _id: req.query.campaignId, ngo: ngo._id }))) {
        throw new HttpError(404, 'Campaign not found.');
      }
      filter.campaign = req.query.campaignId;
    }
  } else {
    if (req.query.status) filter.status = req.query.status;
    if (req.query.campaignId) {
      if (!mongoose.isValidObjectId(req.query.campaignId)) throw new HttpError(400, 'Invalid campaign ID.');
      filter.campaign = req.query.campaignId;
    }
  }
  const items = await Expense.find(filter)
    .populate('campaign', 'title type status')
    .populate('ngo', 'organizationName')
    .sort({ createdAt: -1 })
    .limit(300);
  res.json({ success: true, data: { items } });
});

export const expenseReviewQueue = asyncHandler(async (_req, res) => {
  const items = await Expense.find({ status: { $in: pendingExpenseStatuses } })
    .populate('campaign', 'title location')
    .populate('ngo', 'organizationName')
    .sort({ createdAt: 1 })
    .limit(300);
  res.json({ success: true, data: { items } });
});

export const reviewExpense = asyncHandler(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new HttpError(403, 'Only authorized administrators can review expenses.');
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid expense ID.');
  const { status } = req.body;
  if (!['APPROVED', 'REJECTED', 'NEEDS_MORE_INFORMATION'].includes(status)) {
    throw new HttpError(400, 'Select APPROVED, REJECTED or NEEDS_MORE_INFORMATION.');
  }
  const note = String(req.body.reviewNote || '').trim().slice(0, 1000);
  if (status !== 'APPROVED' && !note) throw new HttpError(400, 'A review note is required for this decision.');
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new HttpError(404, 'Expense not found.');
  if (!pendingExpenseStatuses.includes(expense.status)) throw new HttpError(409, 'This expense is no longer awaiting review.');
  if (req.body.publishReceipt === true && !expense.receipt) throw new HttpError(409, 'This expense does not have a receipt to publish.');
  const publishToPublic = status === 'APPROVED' && req.body.publishToPublic === true;
  const publishReceipt = publishToPublic && req.body.publishReceipt === true;
  const reviewedAt = new Date();
  const updated = await Expense.findOneAndUpdate(
    { _id: expense._id, status: { $in: pendingExpenseStatuses } },
    {
      $set: {
        status,
        reviewNote: note,
        reviewedBy: req.user._id,
        reviewedAt,
        publicDescription: String(req.body.publicDescription || '').trim().slice(0, 1000),
        publishToPublic,
        publishReceipt
      },
      $push: {
        reviewHistory: {
          status,
          reviewedBy: req.user._id,
          reviewedAt,
          reviewNote: note,
          publishToPublic,
          publishReceipt
        }
      }
    },
    { new: true, runValidators: true }
  );
  if (!updated) throw new HttpError(409, 'This expense has already been reviewed.');
  await writeAudit({
    actor: req.user._id,
    action: `CAMPAIGN_EXPENSE_${status}`,
    resourceType: 'Expense',
    resourceId: updated._id,
    metadata: {
      campaign: String(updated.campaign),
      ngo: String(updated.ngo),
      amount: updated.amount,
      publishToPublic,
      publishReceipt,
      reviewNote: note
    }
  });
  res.json({ success: true, data: { expense: updated } });
});

export const resubmitExpense = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid expense ID.');
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const expense = await Expense.findOne({ _id: req.params.id, ngo: ngo._id, status: 'NEEDS_MORE_INFORMATION' })
    .select('+receipt.storageKey +documents.storageKey');
  if (!expense) throw new HttpError(404, 'Expense requiring additional information not found.');
  const replacementReceipt = filesFor(req, 'receipt')[0];
  const additionalDocuments = filesFor(req, 'documents');
  if (!replacementReceipt && !additionalDocuments.length && !String(req.body.notes || '').trim() && !String(req.body.description || '').trim()) {
    throw new HttpError(400, 'Add a replacement receipt, supporting document or additional expense information.');
  }
  const savedFiles = [];
  let oldReceipt;
  try {
    if (replacementReceipt) {
      const newReceipt = await storePrivateFile(replacementReceipt, 'expenses');
      savedFiles.push(newReceipt);
      oldReceipt = expense.receipt;
      expense.receipt = newReceipt;
    }
    for (const file of additionalDocuments) {
      const document = await storePrivateFile(file, 'expenses');
      savedFiles.push(document);
      expense.documents.push(document);
    }
    if (req.body.description !== undefined) expense.description = String(req.body.description).trim().slice(0, 2000);
    if (req.body.notes !== undefined) expense.notes = String(req.body.notes).trim().slice(0, 2000);
    expense.status = 'PENDING';
    expense.reviewNote = '';
    expense.reviewedBy = null;
    expense.reviewedAt = null;
    expense.publishToPublic = false;
    expense.publishReceipt = false;
    await expense.save();
  } catch (error) {
    await removePrivateFiles(savedFiles, 'expenses');
    throw error;
  }
  if (oldReceipt?.storageKey) await removePrivateFiles([oldReceipt], 'expenses');
  await writeAudit({
    actor: req.user._id,
    action: 'CAMPAIGN_EXPENSE_RESUBMITTED',
    resourceType: 'Expense',
    resourceId: expense._id,
    metadata: { campaign: String(expense.campaign), ngo: String(ngo._id) }
  });
  res.json({ success: true, data: { expense: cleanFileFields(expense) } });
});

export const getExpenseFile = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid expense ID.');
  const expense = await Expense.findById(req.params.id).select('+receipt.storageKey +documents.storageKey');
  if (!expense) throw new HttpError(404, 'Expense not found.');
  if (req.user.role === 'NGO') {
    const ngo = await NGO.findOne({ user: req.user._id });
    if (!ngo || String(expense.ngo) !== String(ngo._id)) throw new HttpError(403, 'You cannot access this expense file.');
  } else if (req.user.role !== 'ADMIN') {
    throw new HttpError(403, 'You cannot access this expense file.');
  }
  const file = req.params.fileId === 'receipt'
    ? expense.receipt
    : expense.documents.id(req.params.fileId);
  if (!file) throw new HttpError(404, 'Expense file not found.');
  await sendPrivateFile(res, file, 'expenses');
});

export const getPublicExpenseReceipt = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid expense ID.');
  const expense = await Expense.findOne({
    _id: req.params.id,
    status: { $in: approvedExpenseStatuses },
    publishToPublic: true,
    publishReceipt: true
  }).select('+receipt.storageKey');
  if (!expense?.receipt) throw new HttpError(404, 'Public expense receipt not found.');
  await sendPrivateFile(res, expense.receipt, 'expenses', { inline: true });
});

export const getActivityFile = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.fileId)) {
    throw new HttpError(400, 'Invalid update or file ID.');
  }
  const activity = await ReliefActivity.findById(req.params.id).select('+photos.storageKey +documents.storageKey');
  if (!activity) throw new HttpError(404, 'Campaign update not found.');
  if (req.user.role === 'NGO') {
    const ngo = await NGO.findOne({ user: req.user._id });
    if (!ngo || String(activity.ngo) !== String(ngo._id)) throw new HttpError(403, 'You cannot access this update file.');
  } else if (req.user.role !== 'ADMIN') {
    throw new HttpError(403, 'You cannot access this update file.');
  }
  const file = activity.photos.id(req.params.fileId) || activity.documents.id(req.params.fileId);
  if (!file) throw new HttpError(404, 'Update file not found.');
  await sendPrivateFile(res, file, 'campaign-updates');
});

export const getPublicActivityPhoto = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.photoId)) {
    throw new HttpError(400, 'Invalid update or photo ID.');
  }
  const activity = await ReliefActivity.findOne({ _id: req.params.id, isPublic: true })
    .populate({ path: 'campaign', match: { status: { $in: ['PUBLISHED', 'ACTIVE', 'COMPLETED'] } }, select: '_id' })
    .select('+photos.storageKey');
  if (!activity?.campaign) throw new HttpError(404, 'Campaign update photo not found.');
  const photo = activity.photos.id(req.params.photoId);
  if (!photo) throw new HttpError(404, 'Campaign update photo not found.');
  await sendPrivateFile(res, photo, 'campaign-updates', { inline: true });
});
