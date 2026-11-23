import mongoose from 'mongoose';
const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, maxlength: 1000, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });
const communicationSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });
const offerSchema = new mongoose.Schema({
  role: { type: String, required: true, trim: true, maxlength: 120 },
  roleDescription: { type: String, required: true, trim: true, maxlength: 2000 },
  responsibilities: { type: String, required: true, trim: true, maxlength: 3000 },
  policies: { type: String, required: true, trim: true, maxlength: 3000 },
  expectedHours: { type: String, required: true, trim: true, maxlength: 120 },
  startDate: { type: Date, required: true },
  duration: { type: String, required: true, trim: true, maxlength: 120 },
  benefits: { type: String, trim: true, maxlength: 1000, default: '' },
  contactPerson: { type: String, required: true, trim: true, maxlength: 120 },
  contactEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  contactPhone: { type: String, required: true, trim: true, maxlength: 30 },
  instructions: { type: String, trim: true, maxlength: 2000, default: '' },
  sentAt: { type: Date, default: Date.now },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { _id: false });
const certificateSchema = new mongoose.Schema({
  storageKey: { type: String, required: true, select: false },
  originalName: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true, maxlength: 100 },
  size: { type: Number, required: true, min: 1 },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });
const schema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  citizen: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO', index: true },
  fullName: { type: String, trim: true, maxlength: 100, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  skills: { type: String, trim: true, maxlength: 2000, default: '' },
  preferredDates: { type: [Date], default: [] },
  availability: { type: String, trim: true, maxlength: 1000, default: '' },
  commitmentHours: { type: String, trim: true, maxlength: 120, default: '' },
  currentLocation: { type: String, trim: true, maxlength: 300, default: '' },
  message: { type: String, maxlength: 1000, default: '' },
  additionalMessage: { type: String, trim: true, maxlength: 2000, default: '' },
  status: {
    type: String,
    enum: ['PENDING', 'UNDER_REVIEW', 'OFFER_SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'COMPLETED', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  offer: { type: offerSchema, default: null },
  responseReason: { type: String, trim: true, maxlength: 1000, default: '' },
  rejectionReason: { type: String, trim: true, maxlength: 1000, default: '' },
  statusHistory: { type: [statusHistorySchema], default: [] },
  communicationHistory: { type: [communicationSchema], default: [] },
  certificate: { type: certificateSchema, default: null }
}, { timestamps: true });
schema.index({ campaign: 1, citizen: 1 }, { unique: true });
schema.index({ ngo: 1, status: 1, createdAt: -1 });
schema.index({ citizen: 1, status: 1, createdAt: -1 });
export default mongoose.model('VolunteerApplication', schema);
