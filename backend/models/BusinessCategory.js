const mongoose = require("mongoose");

const businessCategorySchema = new mongoose.Schema(
  {
    userId: {
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
  { userId: 1, nameKey: 1 },
  { unique: true },
);

module.exports = {
  BusinessCategory: mongoose.model("BusinessCategory", businessCategorySchema),
};
