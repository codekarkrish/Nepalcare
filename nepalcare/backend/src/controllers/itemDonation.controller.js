import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Campaign from '../models/Campaign.js';
import ItemDonationRequest from '../models/ItemDonationRequest.js';
import NGO from '../models/NGO.js';
import VolunteerApplication from '../models/VolunteerApplication.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { removePrivateFiles, sendPrivateFile, storePrivateFile } from '../utils/privateFiles.js';
import { writeAudit } from '../utils/audit.js';

const itemCategories = new Set([
  'FOOD', 'CLOTHES', 'BLANKETS', 'EDUCATION', 'BOOKS', 'STATIONERY',
  'UTENSILS', 'MEDICAL', 'DISASTER_RELIEF', 'OTHER'
]);

function parseItems(value) {
  let items = value;
  if (typeof value === 'string') {
    try { items = JSON.parse(value); } catch { throw new HttpError(400, 'Items must contain valid JSON.'); }
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) {
    throw new HttpError(400, 'Add between 1 and 10 item types per request.');
  }
  return items.map((item) => {
    const name = String(item?.name || '').trim();
    const category = String(item?.category || '').trim().toUpperCase();
    const quantity = Number(item?.quantity);
    const condition = String(item?.condition || '').trim().toUpperCase();
    if (!name || name.length > 120 || !itemCategories.has(category)) {
      throw new HttpError(400, 'Every item needs a name and a valid category.');
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
      throw new HttpError(400, 'Item quantities must be whole numbers between 1 and 100,000.');
    }
    if (!['NEW', 'GOOD', 'USED'].includes(condition)) {
      throw new HttpError(400, 'Select NEW, GOOD or USED item condition.');
    }
    return {
      name,
      category,
      quantity,
      condition,
      description: String(item.description || '').trim().slice(0, 1000)
    };
  });
}

function requireText(value, label, maxLength) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength) throw new HttpError(400, `${label} is required and must be at most ${maxLength} characters.`);
  return text;
}

export const create = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.campaignId)) throw new HttpError(400, 'Invalid campaign ID.');
  const campaign = await Campaign.findOne({
    _id: req.body.campaignId,
    status: { $in: ['PUBLISHED', 'ACTIVE'] },
    type: { $in: ['PHYSICAL', 'HYBRID'] }
  }).select('ngo status type title');
  if (!campaign) throw new HttpError(404, 'Campaign is not accepting physical item donations.');

  const preferredPickupDate = new Date(req.body.preferredPickupDate);
  if (Number.isNaN(preferredPickupDate.getTime())) throw new HttpError(400, 'Choose a valid preferred pickup date.');
  if (preferredPickupDate < new Date(new Date().setHours(0, 0, 0, 0))) {
    throw new HttpError(400, 'Preferred pickup date cannot be in the past.');
  }
  const mapUrl = String(req.body.mapUrl || '').trim();
  if (mapUrl) {
    let parsed;
    try { parsed = new URL(mapUrl); } catch { throw new HttpError(400, 'Enter a valid Google Maps link.'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || !/google\.[^/]+|maps\.app\.goo\.gl/i.test(parsed.hostname)) {
      throw new HttpError(400, 'The map link must be a Google Maps URL.');
    }
  }
  const items = parseItems(req.body.items);
  const files = req.files || [];
  if (files.length > 5) throw new HttpError(400, 'Upload no more than five item photos.');
  const latitude = req.body.latitude === undefined || req.body.latitude === '' ? undefined : Number(req.body.latitude);
  const longitude = req.body.longitude === undefined || req.body.longitude === '' ? undefined : Number(req.body.longitude);
  if ((latitude === undefined) !== (longitude === undefined) ||
      (latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== undefined && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
    throw new HttpError(400, 'Provide valid latitude and longitude coordinates together.');
  }

  const savedPhotos = [];
  let request;
  try {
    for (const file of files) savedPhotos.push(await storePrivateFile(file, 'item-donations', { imagesOnly: true }));
    request = await ItemDonationRequest.create({
      reference: `ITEM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      campaign: campaign._id,
      ngo: campaign.ngo,
      donor: req.user._id,
      donorName: req.user.name,
      donorEmail: req.user.email,
      donorPhone: requireText(req.body.phone || req.user.phone, 'Phone number', 30),
      address: requireText(req.body.address, 'Current address', 500),
      pickupLocation: requireText(req.body.pickupLocation, 'Pickup location', 500),
      mapUrl,
      coordinates: latitude === undefined ? undefined : { latitude, longitude },
      items,
      photos: savedPhotos,
      preferredPickupDate,
      preferredPickupTime: requireText(req.body.preferredPickupTime, 'Preferred pickup time', 120),
      statusHistory: [{ status: 'PENDING', actor: req.user._id, note: 'Item donation request submitted.' }]
    });
  } catch (error) {
    await removePrivateFiles(savedPhotos, 'item-donations');
    throw error;
  }
  await writeAudit({
    actor: req.user._id,
    action: 'ITEM_DONATION_REQUESTED',
    resourceType: 'ItemDonationRequest',
    resourceId: request._id,
    metadata: { campaign: String(campaign._id), reference: request.reference }
  });
  const requestData = request.toObject();
  requestData.photos = requestData.photos.map(({ storageKey, ...photo }) => photo);
  res.status(201).json({ success: true, data: { request: requestData } });
});

export const mine = asyncHandler(async (req, res) => {
  const items = await ItemDonationRequest.find({ donor: req.user._id })
    .populate({ path: 'campaign', select: 'title location status coverImage ngo', populate: { path: 'ngo', select: 'organizationName' } })
    .populate('assignedVolunteer', 'fullName offer status')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ success: true, data: { items } });
});

export const listNGO = asyncHandler(async (req, res) => {
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const filter = { ngo: ngo._id };
  if (req.query.status) {
    const statuses = ['PENDING', 'ACCEPTED', 'CONTACTED', 'PICKUP_SCHEDULED', 'COLLECTED', 'REJECTED', 'CANCELLED'];
    if (!statuses.includes(req.query.status)) throw new HttpError(400, 'Unsupported item request status filter.');
    filter.status = req.query.status;
  }
  if (req.query.campaignId) {
    if (!mongoose.isValidObjectId(req.query.campaignId)) throw new HttpError(400, 'Invalid campaign ID.');
    if (!(await Campaign.exists({ _id: req.query.campaignId, ngo: ngo._id }))) throw new HttpError(404, 'Campaign not found.');
    filter.campaign = req.query.campaignId;
  }
  const items = await ItemDonationRequest.find(filter)
    .populate('campaign', 'title location type')
    .populate('donor', 'name email phone')
    .populate('assignedVolunteer', 'fullName email phone offer status')
    .sort({ createdAt: -1 })
    .limit(300);
  res.json({ success: true, data: { items } });
});

export const updateStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid item request ID.');
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const request = await ItemDonationRequest.findOne({ _id: req.params.id, ngo: ngo._id });
  if (!request) throw new HttpError(404, 'Item donation request not found.');
  const { status } = req.body;
  const transitions = {
    PENDING: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: ['CONTACTED', 'PICKUP_SCHEDULED', 'REJECTED'],
    CONTACTED: ['PICKUP_SCHEDULED', 'REJECTED'],
    PICKUP_SCHEDULED: ['COLLECTED', 'CONTACTED']
  };
  if (!transitions[request.status]?.includes(status)) throw new HttpError(409, 'This item request cannot move to the selected status.');

  const note = String(req.body.note || '').trim().slice(0, 1000);
  if (status === 'REJECTED' && !note) throw new HttpError(400, 'A reason is required when rejecting an item request.');
  let assignedVolunteer = request.assignedVolunteer;
  if (req.body.volunteerApplicationId) {
    if (!mongoose.isValidObjectId(req.body.volunteerApplicationId)) throw new HttpError(400, 'Invalid volunteer application ID.');
    const volunteer = await VolunteerApplication.findOne({
      _id: req.body.volunteerApplicationId,
      campaign: request.campaign,
      status: 'ACCEPTED'
    });
    if (!volunteer) throw new HttpError(400, 'Assign only an accepted volunteer for this campaign.');
    assignedVolunteer = volunteer._id;
  }
  let scheduledPickupAt = request.scheduledPickupAt;
  if (status === 'PICKUP_SCHEDULED') {
    scheduledPickupAt = new Date(req.body.scheduledPickupAt);
    if (Number.isNaN(scheduledPickupAt.getTime())) throw new HttpError(400, 'Choose a valid scheduled pickup date and time.');
  }
  const expectedStatus = request.status;
  const changes = {
    status,
    ngoNote: note,
    assignedVolunteer,
    scheduledPickupAt,
    ...(status === 'REJECTED' ? { rejectionReason: note } : {}),
    ...(status === 'COLLECTED' ? { collectedAt: new Date() } : {})
  };
  const updated = await ItemDonationRequest.findOneAndUpdate(
    { _id: request._id, ngo: ngo._id, status: expectedStatus },
    { $set: changes, $push: { statusHistory: { status, actor: req.user._id, note } } },
    { new: true, runValidators: true }
  );
  if (!updated) throw new HttpError(409, 'This item request has already changed.');
  await writeAudit({
    actor: req.user._id,
    action: `ITEM_DONATION_${status}`,
    resourceType: 'ItemDonationRequest',
    resourceId: updated._id,
    metadata: { campaign: String(updated.campaign), reference: updated.reference, note }
  });
  res.json({ success: true, data: { request: updated } });
});

export const cancelMine = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid item request ID.');
  const request = await ItemDonationRequest.findOne({ _id: req.params.id, donor: req.user._id });
  if (!request) throw new HttpError(404, 'Item donation request not found.');
  if (!['PENDING', 'ACCEPTED', 'CONTACTED', 'PICKUP_SCHEDULED'].includes(request.status)) {
    throw new HttpError(409, 'This request can no longer be cancelled.');
  }
  const updated = await ItemDonationRequest.findOneAndUpdate(
    { _id: request._id, donor: req.user._id, status: request.status },
    { $set: { status: 'CANCELLED' }, $push: { statusHistory: { status: 'CANCELLED', actor: req.user._id, note: 'Cancelled by donor.' } } },
    { new: true }
  );
  if (!updated) throw new HttpError(409, 'This item request has already changed.');
  await writeAudit({
    actor: req.user._id,
    action: 'ITEM_DONATION_CANCELLED',
    resourceType: 'ItemDonationRequest',
    resourceId: updated._id,
    metadata: { reference: updated.reference }
  });
  res.json({ success: true, data: { request: updated } });
});

export const getPhoto = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.photoId)) {
    throw new HttpError(400, 'Invalid item request or photo ID.');
  }
  const request = await ItemDonationRequest.findById(req.params.id).select('+photos.storageKey');
  if (!request) throw new HttpError(404, 'Item donation request not found.');
  let allowed = String(request.donor) === String(req.user._id);
  if (req.user.role === 'NGO') {
    const ngo = await NGO.findOne({ user: req.user._id });
    allowed = Boolean(ngo && String(ngo._id) === String(request.ngo));
  } else if (req.user.role === 'CITIZEN' && !allowed && request.assignedVolunteer) {
    allowed = await VolunteerApplication.exists({
      _id: request.assignedVolunteer,
      citizen: req.user._id,
      status: { $in: ['ACCEPTED', 'COMPLETED'] }
    });
  }
  if (!allowed) throw new HttpError(403, 'You cannot access these item photos.');
  const photo = request.photos.id(req.params.photoId);
  if (!photo) throw new HttpError(404, 'Item donation photo not found.');
  await sendPrivateFile(res, photo, 'item-donations', { inline: true });
});
