const mongoose = require("mongoose");

const businessCategorySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    nameKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 280,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

businessCategorySchema.pre("validate", function normalizeCategoryName() {
  const rawName = typeof this.name === "string" ? this.name.trim() : "";
  this.name = rawName;
  this.nameKey = rawName.toLowerCase();

  if (typeof this.description === "string") {
    this.description = this.description.trim();
  }
});

businessCategorySchema.index(
  { owner: 1, nameKey: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

module.exports = {
  BusinessCategory: mongoose.model("BusinessCategory", businessCategorySchema),
};
