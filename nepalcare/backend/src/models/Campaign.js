import mongoose from 'mongoose';

export const CAMPAIGN_TYPES = ['MONEY', 'PHYSICAL', 'HYBRID'];
export const CAMPAIGN_CATEGORIES = [
  'FOOD',
  'CLOTHES',
  'BLANKETS',
  'EDUCATION',
  'BOOKS',
  'STATIONERY',
  'UTENSILS',
  'MEDICAL',
  'DISASTER_RELIEF',
  'FUNDRAISING',
  'OTHER'
];

const requiredItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: CAMPAIGN_CATEGORIES, required: true },
    requiredQuantity: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'Required quantity must be a whole number.' }
    },
    receivedQuantity: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isInteger, message: 'Received quantity must be a whole number.' }
    },
    acceptedCondition: {
      type: String,
      enum: ['NEW', 'LIKE_NEW', 'GOOD', 'ANY'],
      default: 'ANY'
    }
  },
  { _id: true }
);

const paymentDetailsSchema = new mongoose.Schema(
  {
    bankName: { type: String, trim: true, maxlength: 120, default: '' },
    accountName: { type: String, trim: true, maxlength: 160, default: '' },
    accountNumber: { type: String, trim: true, maxlength: 80, default: '' },
    branch: { type: String, trim: true, maxlength: 120, default: '' },
    qrImage: { type: String, trim: true, maxlength: 255, default: '' },
    qrImageUrl: { type: String, trim: true, maxlength: 2048, default: '' }
  },
  { _id: false }
);

const deletionRequestSchema = new mongoose.Schema({
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], required: true, default: 'PENDING' },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedAt: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
  reviewedAt: { type: Date, default: null }
}, { timestamps: false });

const campaignSchema = new mongoose.Schema(
  {
    ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO', required: true, index: true },
    type: { type: String, enum: CAMPAIGN_TYPES, default: 'MONEY', required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    category: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          // Keep legacy category values valid unless a campaign is new or its category is changed.
          return (!this.isNew && !this.isModified('category')) || CAMPAIGN_CATEGORIES.includes(value);
        },
        message: 'Select a supported campaign category.'
      }
    },
    location: { type: String, required: true, trim: true, maxlength: 200 },
    coverImage: { type: String, trim: true, maxlength: 2048, default: '' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    targetAmount: { type: Number, default: 0, min: 0 },
    raisedAmount: { type: Number, default: 0, min: 0 },
    paymentDetails: { type: paymentDetailsSchema, default: () => ({}) },
    requiredItems: { type: [requiredItemSchema], default: [] },
    collectionInstructions: { type: String, trim: true, maxlength: 2000, default: '' },
    requiredVolunteers: {
      type: Number,
      default: 5,
      min: 0,
      max: 10000,
      validate: { validator: Number.isInteger, message: 'Volunteer slots must be a whole number.' }
    },
    acceptedVolunteerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'VolunteerApplication' }],
      default: [],
      select: false
    },
    images: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'COMPLETED', 'REJECTED', 'RESUBMISSION_REQUIRED', 'ARCHIVED'],
      default: 'DRAFT',
      index: true
    },
    deletionRequests: { type: [deletionRequestSchema], default: [] },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    archivedFromStatus: { type: String, default: '' },
    reviewStatus: {
      type: String,
      enum: ['DRAFT', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED']
    },
    publicationStatus: {
      type: String,
      enum: ['UNPUBLISHED', 'PUBLISHED']
    },
    reviewNote: { type: String, maxlength: 1000, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

campaignSchema.index({ 'deletionRequests.status': 1, updatedAt: 1 });

campaignSchema.pre('validate', function validateCampaign(next) {
  const includesMoney = this.type === 'MONEY' || this.type === 'HYBRID';
  const includesItems = this.type === 'PHYSICAL' || this.type === 'HYBRID';

  if (this.isNew && includesMoney && !this.paymentDetails?.qrImage) {
    this.invalidate('paymentDetails.qrImage', 'Upload a QR image for money campaigns.');
  }
  const moneyFieldsChanged = this.isNew || this.isModified('type') || this.isModified('targetAmount');
  if (includesMoney && moneyFieldsChanged && (!Number.isFinite(this.targetAmount) || this.targetAmount <= 0)) {
    this.invalidate('targetAmount', 'Fundraising goal must be greater than zero for money campaigns.');
  }
  if (includesItems && (!this.requiredItems || this.requiredItems.length === 0)) {
    this.invalidate('requiredItems', 'Add at least one required item for physical campaigns.');
  }
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'Campaign end date must be on or after the start date.');
  }
  next();
});

export default mongoose.model('Campaign', campaignSchema);
