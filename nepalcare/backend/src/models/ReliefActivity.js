import mongoose from 'mongoose';
const fileSchema = new mongoose.Schema({
  storageKey: { type: String, required: true, select: false },
  originalName: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true, maxlength: 100 },
  size: { type: Number, required: true, min: 1 }
}, { _id: true });
const schema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO', required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, required: true, maxlength: 3000 },
  location: { type: String, required: true, maxlength: 200 },
  activityDate: { type: Date, default: Date.now },
  beneficiaryCount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['PLANNED','IN_PROGRESS','COMPLETED'], default: 'PLANNED' },
  publicSummary: { type: String, maxlength: 2000, default: '' },
  photos: { type: [fileSchema], default: [] },
  documents: { type: [fileSchema], default: [] },
  relatedExpenses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }],
  isPublic: { type: Boolean, default: true }
}, { timestamps: true });
schema.index({ campaign: 1, isPublic: 1, activityDate: -1 });
export default mongoose.model('ReliefActivity', schema);
