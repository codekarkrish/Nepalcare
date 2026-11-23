
import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    }
  },
  { _id: true }
);

const ngoSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },

    organizationName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },

    registrationNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ''
    },

    documentReferences: {
      type: [documentSchema],
      default: []
    },

    verificationStatus: {
      type: String,
      enum: [
        'PENDING',
        'UNDER_REVIEW',
        'VERIFIED',
        'REJECTED',
        'RESUBMISSION_REQUIRED',
        'SUSPENDED'
      ],
      default: 'PENDING'
    },

    reviewNote: {
      type: String,
      maxlength: 1000,
      default: ''
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    reviewedAt: {
      type: Date,
      default: null
    },

    submittedAt: {
      type: Date,
      default: null
    },

    reviewHistory: {
      type: [{
        status: { type: String, required: true },
        reviewNote: { type: String, default: '' },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: Date.now }
      }],
      default: []
    }
  },
  { timestamps: true }
);

export default mongoose.model('NGO', ngoSchema);
