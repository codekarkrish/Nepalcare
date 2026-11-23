import mongoose from 'mongoose';
import Campaign from '../models/Campaign.js';
import NGO from '../models/NGO.js';
import VolunteerApplication from '../models/VolunteerApplication.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { writeAudit } from '../utils/audit.js';
import { removePrivateFiles, sendPrivateFile, storePrivateFile } from '../utils/privateFiles.js';

const publicCampaignStatuses = ['PUBLISHED', 'ACTIVE'];
const applicationStatuses = ['PENDING', 'UNDER_REVIEW', 'OFFER_SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'COMPLETED', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'CANCELLED'];

function applicationHistory(application, status, actor, note = '') {
  application.status = status;
  application.statusHistory.push({ status, actor, note: String(note).trim().slice(0, 1000) });
}

function requireText(value, label, maxLength) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength) {
    throw new HttpError(400, `${label} is required and must be at most ${maxLength} characters.`);
  }
  return text;
}

function parsePreferredDates(value) {
  let dates = value;
  if (typeof value === 'string') {
    try {
      dates = JSON.parse(value);
    } catch {
      throw new HttpError(400, 'Preferred volunteering dates must be a valid list.');
    }
  }
  if (!Array.isArray(dates) || dates.length > 10) {
    throw new HttpError(400, 'Provide up to 10 preferred volunteering dates.');
  }
  const parsed = dates.map((date) => new Date(date));
  if (parsed.some((date) => Number.isNaN(date.getTime()))) {
    throw new HttpError(400, 'Preferred volunteering dates must be valid dates.');
  }
  return parsed;
}

function validateOffer(rawOffer, user) {
  const offer = {
    role: requireText(rawOffer?.role, 'Volunteer role', 120),
    roleDescription: requireText(rawOffer?.roleDescription, 'Role description', 2000),
    responsibilities: requireText(rawOffer?.responsibilities, 'Responsibilities', 3000),
    policies: requireText(rawOffer?.policies, 'Volunteer policies', 3000),
    expectedHours: requireText(rawOffer?.expectedHours, 'Expected hours', 120),
    startDate: new Date(rawOffer?.startDate),
    duration: requireText(rawOffer?.duration, 'Expected duration', 120),
    benefits: String(rawOffer?.benefits || '').trim().slice(0, 1000),
    contactPerson: requireText(rawOffer?.contactPerson, 'Contact person', 120),
    contactEmail: String(rawOffer?.contactEmail || user.email || '').trim().toLowerCase(),
    contactPhone: requireText(rawOffer?.contactPhone || user.phone, 'Contact phone', 30),
    instructions: String(rawOffer?.instructions || '').trim().slice(0, 2000),
    sentAt: new Date(),
    sentBy: user._id
  };
  if (Number.isNaN(offer.startDate.getTime()) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(offer.contactEmail)) {
    throw new HttpError(400, 'Provide a valid offer start date and contact email.');
  }
  return offer;
}

async function campaignHasSlot(campaignId, applicationId) {
  return Campaign.exists({
    _id: campaignId,
    status: { $in: publicCampaignStatuses },
    acceptedVolunteerIds: applicationId
  });
}

export const apply = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.campaignId)) throw new HttpError(400, 'Invalid campaign ID.');
  const campaign = await Campaign.findOne({
    _id: req.body.campaignId,
    status: { $in: publicCampaignStatuses }
  }).select('+acceptedVolunteerIds');
  if (!campaign) throw new HttpError(404, 'Campaign is not open for applications.');
  const required = Number(campaign.requiredVolunteers ?? 5);
  if ((campaign.acceptedVolunteerIds?.length || 0) >= required) {
    throw new HttpError(409, 'Volunteer positions are full.');
  }

  const preferredDates = parsePreferredDates(req.body.preferredDates || []);
  const application = new VolunteerApplication({
    campaign: campaign._id,
    ngo: campaign.ngo,
    citizen: req.user._id,
    fullName: req.user.name,
    email: req.user.email,
    phone: requireText(req.body.phone || req.user.phone, 'Phone number', 30),
    skills: String(req.body.skills || '').trim().slice(0, 2000),
    preferredDates,
    availability: requireText(req.body.availability, 'Available days and time', 1000),
    commitmentHours: requireText(req.body.commitmentHours, 'Expected hours or commitment', 120),
    currentLocation: requireText(req.body.currentLocation, 'Current location', 300),
    message: requireText(req.body.message, 'Why you want to volunteer', 1000),
    additionalMessage: String(req.body.additionalMessage || '').trim().slice(0, 2000),
    status: 'PENDING',
    statusHistory: [{ status: 'PENDING', actor: req.user._id, note: 'Application submitted.' }]
  });
  try {
    await application.save();
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'You have already applied to volunteer for this campaign.');
    throw error;
  }
  res.status(201).json({ success: true, data: { application } });
});

export const mine = asyncHandler(async (req, res) => {
  const items = await VolunteerApplication.find({ citizen: req.user._id })
    .populate({
      path: 'campaign',
      select: 'title location status type coverImage ngo',
      populate: { path: 'ngo', select: 'organizationName' }
    })
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ success: true, data: { items } });
});

export const ngoList = asyncHandler(async (req, res) => {
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const campaignIds = await Campaign.find({ ngo: ngo._id }).distinct('_id');
  const filter = { campaign: { $in: campaignIds } };
  if (req.query.campaignId) {
    if (!mongoose.isValidObjectId(req.query.campaignId)) throw new HttpError(400, 'Invalid campaign ID.');
    if (!campaignIds.some((id) => String(id) === String(req.query.campaignId))) {
      throw new HttpError(404, 'Campaign not found.');
    }
    filter.campaign = req.query.campaignId;
  }
  if (req.query.status) {
    if (!applicationStatuses.includes(req.query.status)) throw new HttpError(400, 'Unsupported application status filter.');
    filter.status = req.query.status;
  }
  const items = await VolunteerApplication.find(filter)
    .populate('citizen', 'name email phone')
    .populate('campaign', 'title location status requiredVolunteers')
    .sort({ createdAt: -1 })
    .limit(300);
  res.json({ success: true, data: { items } });
});

export const review = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid application ID.');
  const ngo = await NGO.findOne({ user: req.user._id });
  if (!ngo) throw new HttpError(404, 'NGO profile not found.');
  const application = await VolunteerApplication.findOne({ _id: req.params.id, campaign: { $in: await Campaign.find({ ngo: ngo._id }).distinct('_id') } });
  if (!application) throw new HttpError(404, 'Application not found.');

  const { action } = req.body;
  if (action === 'UNDER_REVIEW') {
    if (!['PENDING', 'UNDER_REVIEW'].includes(application.status)) throw new HttpError(409, 'This application can no longer be reviewed.');
    const note = requireText(req.body.message, 'Message to applicant', 2000);
    application.communicationHistory.push({ actor: req.user._id, message: note });
    applicationHistory(application, 'UNDER_REVIEW', req.user._id, note);
  } else if (action === 'REJECTED') {
    if (!['PENDING', 'UNDER_REVIEW'].includes(application.status)) throw new HttpError(409, 'This application can no longer be rejected.');
    const reason = requireText(req.body.reason, 'Rejection reason', 1000);
    application.rejectionReason = reason;
    application.communicationHistory.push({ actor: req.user._id, message: reason });
    applicationHistory(application, 'REJECTED', req.user._id, reason);
  } else if (action === 'OFFER_SENT') {
    if (!['PENDING', 'UNDER_REVIEW'].includes(application.status)) throw new HttpError(409, 'An offer cannot be sent for this application.');
    const offer = validateOffer(req.body.offer, req.user);
    application.offer = offer;
    application.communicationHistory.push({ actor: req.user._id, message: `Volunteer offer sent for the role "${offer.role}".` });
    applicationHistory(application, 'OFFER_SENT', req.user._id, 'Official volunteer offer sent.');
  } else if (action === 'COMPLETED') {
    if (application.status !== 'ACCEPTED') throw new HttpError(409, 'Only accepted volunteer roles can be completed.');
    applicationHistory(application, 'COMPLETED', req.user._id, 'NGO marked the volunteer role completed.');
  } else {
    throw new HttpError(400, 'Select UNDER_REVIEW, REJECTED, OFFER_SENT or COMPLETED.');
  }
  await application.save();
  if (action === 'COMPLETED') {
    await Campaign.updateOne({ _id: application.campaign }, { $pull: { acceptedVolunteerIds: application._id } });
  }
  await writeAudit({
    actor: req.user._id,
    action: `VOLUNTEER_${action}`,
    resourceType: 'VolunteerApplication',
    resourceId: application._id,
    metadata: { campaign: String(application.campaign), citizen: String(application.citizen) }
  });
  res.json({ success: true, data: { application } });
});

export const respondToOffer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid application ID.');
  const status = req.body.status;
  if (!['ACCEPTED', 'WITHDRAWN'].includes(status)) throw new HttpError(400, 'Select ACCEPTED or WITHDRAWN.');
  const application = await VolunteerApplication.findOne({ _id: req.params.id, citizen: req.user._id });
  if (!application) throw new HttpError(404, 'Application not found.');

  if (status === 'ACCEPTED') {
    if (application.status === 'ACCEPTED') return res.json({ success: true, data: { application } });
    if (application.status !== 'OFFER_SENT') throw new HttpError(409, 'Only an offered role can be accepted.');
    const claimFilter = {
      _id: application.campaign,
      status: { $in: publicCampaignStatuses },
      $expr: {
        $lt: [
          { $size: { $ifNull: ['$acceptedVolunteerIds', []] } },
          { $ifNull: ['$requiredVolunteers', 5] }
        ]
      }
    };
    const claimed = await Campaign.findOneAndUpdate(
      claimFilter,
      { $addToSet: { acceptedVolunteerIds: application._id } },
      { new: true }
    ).select('+acceptedVolunteerIds');
    if (!claimed && !(await campaignHasSlot(application.campaign, application._id))) {
      throw new HttpError(409, 'Volunteer positions are full.');
    }
    const updated = await VolunteerApplication.findOneAndUpdate(
      { _id: application._id, citizen: req.user._id, status: 'OFFER_SENT' },
      {
        $set: { status: 'ACCEPTED', responseReason: String(req.body.reason || '').trim().slice(0, 1000) },
        $push: {
          statusHistory: { status: 'ACCEPTED', actor: req.user._id, note: 'Volunteer offer accepted.' },
          communicationHistory: { actor: req.user._id, message: 'Volunteer offer accepted.' }
        }
      },
      { new: true }
    );
    if (!updated) {
      const current = await VolunteerApplication.findOne({ _id: application._id, citizen: req.user._id });
      if (current?.status === 'ACCEPTED') return res.json({ success: true, data: { application: current } });
      await Campaign.updateOne({ _id: application.campaign }, { $pull: { acceptedVolunteerIds: application._id } });
      throw new HttpError(409, 'This offer has changed and can no longer be accepted.');
    }
    await writeAudit({
      actor: req.user._id,
      action: 'VOLUNTEER_OFFER_ACCEPTED',
      resourceType: 'VolunteerApplication',
      resourceId: updated._id,
      metadata: { campaign: String(updated.campaign) }
    });
    return res.json({ success: true, data: { application: updated } });
  }

  if (!['PENDING', 'UNDER_REVIEW', 'OFFER_SENT', 'ACCEPTED'].includes(application.status)) {
    throw new HttpError(409, 'This application cannot be withdrawn.');
  }
  const reason = String(req.body.reason || '').trim().slice(0, 1000);
  const updated = await VolunteerApplication.findOneAndUpdate(
    { _id: application._id, citizen: req.user._id, status: application.status },
    {
      $set: { status: 'WITHDRAWN', responseReason: reason },
      $push: {
        statusHistory: { status: 'WITHDRAWN', actor: req.user._id, note: reason || 'Application withdrawn.' },
        communicationHistory: { actor: req.user._id, message: reason || 'Application withdrawn.' }
      }
    },
    { new: true }
  );
  if (!updated) throw new HttpError(409, 'This application has already changed.');
  await Campaign.updateOne({ _id: application.campaign }, { $pull: { acceptedVolunteerIds: application._id } });
  await writeAudit({
    actor: req.user._id,
    action: 'VOLUNTEER_APPLICATION_WITHDRAWN',
    resourceType: 'VolunteerApplication',
    resourceId: updated._id,
    metadata: { campaign: String(updated.campaign), previousStatus: application.status }
  });
  res.json({ success: true, data: { application: updated } });
});

export const uploadCertificate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid application ID.');
  if (!req.file) throw new HttpError(400, 'Choose a PDF, JPG or PNG certificate file.');
  const application = await VolunteerApplication.findOne({
    _id: req.params.id,
    citizen: req.user._id,
    status: 'COMPLETED'
  }).select('+certificate.storageKey');
  if (!application) throw new HttpError(404, 'Completed volunteer role not found.');
  const certificate = await storePrivateFile(req.file, 'volunteer-certificates');
  const oldCertificate = application.certificate;
  application.certificate = { ...certificate, uploadedAt: new Date() };
  try {
    await application.save();
  } catch (error) {
    await removePrivateFiles([certificate], 'volunteer-certificates');
    throw error;
  }
  if (oldCertificate?.storageKey) await removePrivateFiles([oldCertificate], 'volunteer-certificates');
  res.status(201).json({ success: true, data: { certificate: application.certificate } });
});

export const getCertificate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid application ID.');
  const application = await VolunteerApplication.findOne({
    _id: req.params.id,
    citizen: req.user._id,
    status: 'COMPLETED'
  }).select('+certificate.storageKey');
  if (!application?.certificate) throw new HttpError(404, 'Volunteer certificate not found.');
  await sendPrivateFile(res, application.certificate, 'volunteer-certificates');
});
