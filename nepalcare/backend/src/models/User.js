
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: ''
    },

    password: {
      type: String,
      required: true,
      select: false
    },

    role: {
      type: String,
      enum: ['CITIZEN', 'NGO', 'ADMIN'],
      default: 'CITIZEN',
      required: true
    },

    // Admin hierarchy
    adminLevel: {
      type: String,
      enum: ['MAIN_ADMIN', 'STAFF', null],
      default: null
    },

    // Permissions assigned to admin staff
    permissions: {
      type: [String],
      default: []
    },

    isVerified: {
      type: Boolean,
      default: false
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

// Remove sensitive fields from JSON responses
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('User', userSchema);
