import mongoose from 'mongoose';
export const EXPENSE_CATEGORIES = ['FOOD', 'MEDICAL', 'TRANSPORT', 'SUPPLIES', 'EDUCATION', 'SHELTER', 'LOGISTICS', 'OTHER'];
const fileSchema = new mongoose.Schema({
  storageKey: { type: String, required: true, select: false },
  originalName: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true, maxlength: 100 },
  size: { type: Number, required: true, min: 1 }
}, { _id: true });
const reviewHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedAt: { type: Date, default: Date.now },
  reviewNote: { type: String, maxlength: 1000, default: '' },
  publishToPublic: { type: Boolean, default: false },
  publishReceipt: { type: Boolean, default: false }
}, { _id: false });
const schema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, trim: true, maxlength: 80, enum: EXPENSE_CATEGORIES, default: 'OTHER' },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, default: 'NPR', enum: ['NPR'] },
  expenseDate: { type: Date, default: Date.now },
  vendorName: { type: String, trim: true, maxlength: 160, default: '' },
  invoiceReference: { type: String, default: '', maxlength: 500 },
  notes: { type: String, default: '', maxlength: 2000 },
  receipt: { type: fileSchema, default: null },
  documents: { type: [fileSchema], default: [] },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_MORE_INFORMATION', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED'],
    default: 'PENDING',
    index: true
  },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewHistory: { type: [reviewHistorySchema], default: [] },
  publicDescription: { type: String, trim: true, maxlength: 1000, default: '' },
  publishToPublic: { type: Boolean, default: false },
  publishReceipt: { type: Boolean, default: false }
}, { timestamps: true });
schema.index({ campaign: 1, status: 1, expenseDate: -1 });
export default mongoose.model('Expense', schema);
