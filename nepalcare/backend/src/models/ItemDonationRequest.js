import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  condition: { type: String, enum: ['NEW', 'GOOD', 'USED'], required: true },
  description: { type: String, trim: true, maxlength: 1000, default: '' }
}, { _id: false });

const fileSchema = new mongoose.Schema({
  storageKey: { type: String, required: true, select: false },
  originalName: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true, maxlength: 100 },
  size: { type: Number, required: true, min: 1 }
}, { _id: true });

const historySchema = new mongoose.Schema({
  status: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, trim: true, maxlength: 1000, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const schema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, index: true },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO', required: true, index: true },
  donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  donorName: { type: String, required: true, trim: true, maxlength: 100 },
  donorEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  donorPhone: { type: String, required: true, trim: true, maxlength: 30 },
  address: { type: String, required: true, trim: true, maxlength: 500 },
  pickupLocation: { type: String, required: true, trim: true, maxlength: 500 },
  mapUrl: { type: String, trim: true, maxlength: 2048, default: '' },
  coordinates: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 }
  },
  items: { type: [itemSchema], required: true, validate: (items) => items.length > 0 },
  photos: { type: [fileSchema], default: [] },
  preferredPickupDate: { type: Date, required: true },
  preferredPickupTime: { type: String, required: true, trim: true, maxlength: 120 },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'CONTACTED', 'PICKUP_SCHEDULED', 'COLLECTED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  rejectionReason: { type: String, trim: true, maxlength: 1000, default: '' },
  ngoNote: { type: String, trim: true, maxlength: 1000, default: '' },
  scheduledPickupAt: { type: Date, default: null },
  assignedVolunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'VolunteerApplication', default: null },
  collectedAt: { type: Date, default: null },
  statusHistory: { type: [historySchema], default: [] }
}, { timestamps: true });

schema.index({ donor: 1, createdAt: -1 });
schema.index({ ngo: 1, status: 1, createdAt: -1 });
schema.index({ campaign: 1, status: 1 });

export default mongoose.model('ItemDonationRequest', schema);
