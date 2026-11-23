import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  citizen: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  provider: {
    type: String,
    enum: ['KHALTI', 'ESEWA', 'BANK_TRANSFER', 'QR', 'MANUAL_TEST'],
    default: 'KHALTI'
  },
  status: {
    type: String,
    enum: ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED'],
    default: 'INITIATED',
    index: true
  },
  transactionUuid: { type: String, trim: true, default: undefined },
  providerReference: { type: String, trim: true, default: '' },
  transferReference: { type: String, trim: true, default: undefined },
  paymentProofKey: { type: String, select: false },
  paymentProofName: { type: String, maxlength: 255, default: '' },
  paymentProofMimeType: { type: String, maxlength: 100, default: '' },
  paymentProofSize: { type: Number, min: 0, default: 0 },
  idempotencyKey: { type: String, required: true },
  paymentInitiatedAt: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewNote: { type: String, maxlength: 1000, default: '' }
}, { timestamps: true });

schema.index({ citizen: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ transactionUuid: 1 }, { unique: true, sparse: true });
schema.index({ transferReference: 1 }, { unique: true, sparse: true });
schema.index({ campaign: 1, status: 1, verifiedAt: 1 });
schema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.paymentProofKey;
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Donation', schema);
