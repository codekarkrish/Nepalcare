
import NGO from '../models/NGO.js';
import Campaign from '../models/Campaign.js';
import VolunteerApplication from '../models/VolunteerApplication.js';
import ItemDonationRequest from '../models/ItemDonationRequest.js';

import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit } from '../utils/audit.js';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

// Register NGO
export const registerNGO = asyncHandler(async (req, res) => {
  if (req.user.role !== 'NGO') {
    throw new HttpError(403, 'Only an NGO account can submit organization details.');
  }

  const existing = await NGO.findOne({ user: req.user._id });

  if (existing) {
    throw new HttpError(409, 'An organization profile already exists for this account.');
  }

  const ngo = await NGO.create({
    user: req.user._id,
    organizationName: req.body.organizationName,
    registrationNumber: req.body.registrationNumber,
    address: req.body.address,
    description: req.body.description || '',
    documentReferences: [],
    submittedAt: new Date()
  });

  res.status(201).json({
    success: true,
    data: { ngo }
  });
});

// Get logged-in NGO profile
export const myNGO = asyncHandler(async (req, res) => {
  const ngo = await NGO.findOne({ user: req.user._id });

  if (!ngo) {
    throw new HttpError(404, 'Organization profile not found. Submit your organization details first.');
  }

  res.json({
    success: true,
    data: { ngo }
  });
});

// NGO can correct organization details while rejected or resubmission is required
export const updateMyNGO = asyncHandler(async (req, res) => {
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'Organization profile not found.');
  if (!['REJECTED', 'RESUBMISSION_REQUIRED', 'PENDING'].includes(ngo.verificationStatus)) {
    throw new HttpError(409, 'Organization details can only be corrected after a review return.');
  }

  for (const key of ['organizationName', 'registrationNumber', 'address', 'description']) {
    if (req.body[key] !== undefined) ngo[key] = String(req.body[key]).trim();
  }

  await ngo.save();
  res.json({ success: true, message: 'Organization details updated.', data: { ngo } });
});

// Get NGO dashboard summary
export const mySummary = asyncHandler(async (req, res) => {
  const ngo = await NGO.findOne({ user: req.user._id });

  if (!ngo) {
    return res.json({
      success: true,
      data: {
        verificationStatus: 'NOT_SUBMITTED',
        campaigns: 0,
        volunteers: 0,
        itemRequests: 0
      }
    });
  }

  const campaigns = await Campaign.find({ ngo: ngo._id }).select('_id');
  const ids = campaigns.map((campaign) => campaign._id);

  const [volunteers, itemRequests] = await Promise.all([
    VolunteerApplication.countDocuments({ campaign: { $in: ids } }),
    ItemDonationRequest.countDocuments({ ngo: ngo._id, status: { $in: ['PENDING', 'ACCEPTED', 'CONTACTED', 'PICKUP_SCHEDULED'] } })
  ]);

  res.json({
    success: true,
    data: {
      verificationStatus: ngo.verificationStatus,
      campaigns: campaigns.length,
      volunteers,
      itemRequests
    }
  });
});

// List NGOs waiting for admin review
export const listPending = asyncHandler(async (_req, res) => {
  const items = await NGO.find({
    verificationStatus: {
      $in: ['PENDING', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED']
    }
  })
    .populate('user', 'name email')
    .sort({ createdAt: 1 })
    .limit(100);

  res.json({
    success: true,
    data: { items }
  });
});

// Review NGO
export const reviewNGO = asyncHandler(async (req, res) => {
  const { status, reviewNote = '' } = req.body;

  const allowedStatuses = [
    'VERIFIED',
    'REJECTED',
    'RESUBMISSION_REQUIRED',
    'UNDER_REVIEW',
    'SUSPENDED'
  ];

  if (!allowedStatuses.includes(status)) {
    throw new HttpError(400, 'Unsupported NGO review status.');
  }
  if (['REJECTED', 'RESUBMISSION_REQUIRED'].includes(status) && !String(reviewNote).trim()) {
    throw new HttpError(400, 'A review reason is required for rejection or resubmission.');
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new HttpError(400, 'Invalid NGO ID.');
  }
  const ngo = await NGO.findById(req.params.id);
  if (!ngo) throw new HttpError(404, 'NGO not found.');

  const previousStatus = ngo.verificationStatus;
  ngo.verificationStatus = status;
  ngo.reviewNote = String(reviewNote).slice(0, 1000);
  ngo.reviewedBy = req.user._id;
  ngo.reviewedAt = new Date();
  ngo.reviewHistory.push({
    status,
    reviewNote: String(reviewNote).slice(0, 1000),
    reviewedBy: req.user._id,
    reviewedAt: new Date()
  });
  if (status === 'PENDING') ngo.submittedAt = new Date();

  await ngo.save();

  await writeAudit({
    actor: req.user._id,
    action: 'NGO_REVIEWED',
    resourceType: 'NGO',
    resourceId: ngo._id,
    metadata: { previousStatus, newStatus: status, reviewNote: String(reviewNote).slice(0, 1000) }
  });

  res.json({
    success: true,
    message: 'NGO review saved.',
    data: { ngo }
  });
});

// Upload NGO documents
export const uploadNGODocuments = asyncHandler(async (req, res) => {
  const ngo = await NGO.findOne({ user: req.user._id });

  if (!ngo) {
    throw new HttpError(
      404,
      'NGO profile not found. Register your organization first.'
    );
  }

  if (!req.files || req.files.length === 0) {
    throw new HttpError(400, 'Please upload at least one document.');
  }

  const uploadedDocuments = req.files.map((file) => ({
    filename: file.filename,
    originalName: file.originalname,
    path: `uploads/ngo-documents/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size
  }));

  ngo.documentReferences.push(...uploadedDocuments);

  // New documents require fresh verification
  ngo.verificationStatus = 'PENDING';
  ngo.submittedAt = new Date();
  ngo.reviewNote = '';
  ngo.reviewedBy = null;
  ngo.reviewedAt = null;

  await ngo.save();

  // Do not expose the server's internal storage path
  const responseDocuments = uploadedDocuments.map(
    ({ path, ...document }) => document
  );

  res.status(200).json({
    success: true,
    message: 'NGO documents uploaded successfully.',
    data: {
      documents: responseDocuments,
      verificationStatus: ngo.verificationStatus
    }
  });
});

export const getNGODocument = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.documentId)) {
    throw new HttpError(400, 'Invalid NGO or document ID.');
  }

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) throw new HttpError(404, 'NGO not found.');

  const document = ngo.documentReferences.id(req.params.documentId);
  if (!document) throw new HttpError(404, 'Document not found.');

  const uploadDir = path.join(process.cwd(), 'uploads', 'ngo-documents');
  if (!document.filename || path.basename(document.filename) !== document.filename) {
    throw new HttpError(400, 'Invalid document reference.');
  }
  const filePath = path.resolve(uploadDir, document.filename);
  if (!filePath.startsWith(path.resolve(uploadDir) + path.sep) || !fs.existsSync(filePath)) {
    throw new HttpError(404, 'Document file not found.');
  }

  res.setHeader('Content-Type', document.mimeType);
  res.setHeader(
    'Content-Disposition',
    `${req.path.endsWith('/download') ? 'attachment' : 'inline'}; filename="${encodeURIComponent(document.originalName)}"`
  );
  res.sendFile(filePath);
});
