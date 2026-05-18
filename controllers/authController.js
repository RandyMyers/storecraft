const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const Site = require("../models/Site");
const TemplateCatalog = require("../models/Template");
const { sanitizeSubdomain, newId } = require("../lib/ids");
const { signUserToken } = require("../lib/tokens");
const { serializeAuthUser } = require("../lib/serializeAuthUser");
const { DEFAULT_BLOCKS } = require("../defaults/blocks");
const { getTemplateDefinition, buildSitePagesFromTemplate } = require("../lib/siteTemplates");
const { queueProvisionPlatformSubdomain } = require("../services/hostingerProvisionQueue");

exports.register = async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const subdomainRaw = sanitizeSubdomain(req.body.subdomain || "");

  if (!email || !password || password.length < 6) {
    res.status(400).json({ error: "Valid email and password (6+ chars) required" });
    return;
  }
  if (!subdomainRaw || subdomainRaw.length < 2) {
    res.status(400).json({ error: "Choose a subdomain (letters, numbers, hyphens)" });
    return;
  }

  const dupEmail = await User.findOne({ email }).lean();
  if (dupEmail) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }
  const takenSub = await Site.findOne({ subdomain: subdomainRaw }).lean();
  if (takenSub) {
    res.status(409).json({ error: "Subdomain already taken" });
    return;
  }

  const name = subdomainRaw.slice(0, 1).toUpperCase() + subdomainRaw.slice(1);
  const hash = bcrypt.hashSync(password, 10);

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const [user] = await User.create([{ email, passwordHash: hash }], { session });
    const defaultCatalog = await TemplateCatalog.findOne({ slug: "default", isActive: true })
      .session(session)
      .lean();
    const signupTpl = defaultCatalog ? getTemplateDefinition("default") : null;
    const seedPages = signupTpl
      ? buildSitePagesFromTemplate(signupTpl)
      : [
          {
            pageId: newId("p"),
            slug: "home",
            title: "Home",
            metaDescription: "",
            ogTitle: "",
            ogDescription: "",
            ogImage: "",
            twitterCard: "",
            draft: [...DEFAULT_BLOCKS],
            published: null,
            publishedAt: null,
          },
        ];
    const [site] = await Site.create(
      [
        {
          userId: user._id,
          name,
          subdomain: subdomainRaw,
          templateSlug: signupTpl ? signupTpl.slug : "default",
          templateVersion: signupTpl ? signupTpl.version : "1",
          pages: seedPages,
          publishedAt: null,
        },
      ],
      { session },
    );
    await session.commitTransaction();
    queueProvisionPlatformSubdomain(site._id.toString());
    const token = signUserToken(user._id.toString());
    const freshUser = await User.findById(user._id).lean();
    res.status(201).json({
      token,
      user: await serializeAuthUser(freshUser),
      site: { id: site._id.toString(), name, subdomain: subdomainRaw },
    });
  } catch (e) {
    await session.abortTransaction().catch(() => {});
    if (e && e.code === 11000) {
      res.status(409).json({ error: "Email or subdomain already in use" });
      return;
    }
    res.status(500).json({ error: "Could not create account" });
  } finally {
    session.endSession();
  }
};

exports.login = async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const user = await User.findOne({ email });
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const token = signUserToken(user._id.toString());
  const lean = await User.findById(user._id).lean();
  res.json({ token, user: await serializeAuthUser(lean) });
};

exports.me = async (req, res) => {
  const user = await User.findById(req.userId).lean();
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({
    user: await serializeAuthUser(user),
  });
};
