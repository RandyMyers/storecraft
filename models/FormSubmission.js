const mongoose = require("mongoose");

const formSubmissionSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "Site", required: true, index: true },
    subdomain: { type: String, required: true, lowercase: true, trim: true },
    pageSlug: { type: String, default: "home", lowercase: true, trim: true },
    email: { type: String, trim: true, default: "" },
    message: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

formSubmissionSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports =
  mongoose.models.FormSubmission || mongoose.model("FormSubmission", formSubmissionSchema);
