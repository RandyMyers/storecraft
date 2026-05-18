const User = require("../models/User");
const Site = require("../models/Site");
const Domain = require("../models/Domain");
const Plan = require("../models/Plan");
const PaymentRequest = require("../models/PaymentRequest");
const IntegrationSecret = require("../models/IntegrationSecret");
const Template = require("../models/Template");
const AuditLog = require("../models/AuditLog");
const FormSubmission = require("../models/FormSubmission");

/** GET /api/admin/overview/stats — aggregate counts for operator dashboard */
exports.stats = async (_req, res) => {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    usersTotal,
    sitesTotal,
    sitesDisabled,
    domainsTotal,
    plansTotal,
    plansActive,
    paymentRequestsPending,
    paymentRequestsApprovedWeek,
    integrationSecretsTotal,
    integrationSecretsActive,
    templatesTotal,
    auditEntries24h,
    auditEntries7d,
    formSubmissionsTotal,
    formSubmissionsWeek,
    templatesTopAgg,
  ] = await Promise.all([
    User.countDocuments(),
    Site.countDocuments(),
    Site.countDocuments({ disabled: true }),
    Domain.countDocuments(),
    Plan.countDocuments(),
    Plan.countDocuments({ isActive: true }),
    PaymentRequest.countDocuments({ status: "pending" }),
    PaymentRequest.countDocuments({ status: "approved", decidedAt: { $gte: weekAgo } }),
    IntegrationSecret.countDocuments(),
    IntegrationSecret.countDocuments({ status: { $ne: "disabled" } }),
    Template.countDocuments(),
    AuditLog.countDocuments({ createdAt: { $gte: dayAgo } }),
    AuditLog.countDocuments({ createdAt: { $gte: weekAgo } }),
    FormSubmission.countDocuments(),
    FormSubmission.countDocuments({ createdAt: { $gte: weekAgo } }),
    Site.aggregate([
      {
        $project: {
          normSlug: {
            $let: {
              vars: {
                t: {
                  $toLower: {
                    $trim: {
                      input: { $ifNull: ["$templateSlug", ""] },
                    },
                  },
                },
              },
              in: {
                $cond: [{ $eq: ["$$t", ""] }, "default", "$$t"],
              },
            },
          },
        },
      },
      { $group: { _id: "$normSlug", sitesCount: { $sum: 1 } } },
      { $sort: { sitesCount: -1 } },
      { $limit: 12 },
    ]),
  ]);

  const topSlugs = templatesTopAgg.map((r) => r._id).filter(Boolean);
  const topTemplatesMeta =
    topSlugs.length > 0
      ? await Template.find({ slug: { $in: topSlugs } })
          .select({ slug: 1, label: 1 })
          .lean()
      : [];
  const labelBySlug = Object.fromEntries(topTemplatesMeta.map((t) => [t.slug, t.label]));

  const templatesTop = templatesTopAgg.map((row) => ({
    slug: row._id,
    sitesCount: row.sitesCount,
    label: labelBySlug[row._id] || row._id,
  }));

  res.json({
    usersTotal,
    sitesTotal,
    sitesDisabled,
    domainsTotal,
    plansTotal,
    plansActive,
    paymentRequestsPending,
    paymentRequestsApprovedWeek,
    integrationSecretsTotal,
    integrationSecretsActive,
    templatesTotal,
    auditEntries24h,
    auditEntries7d,
    formSubmissionsTotal,
    formSubmissionsWeek,
    templatesTop,
    generatedAt: new Date().toISOString(),
  });
};
