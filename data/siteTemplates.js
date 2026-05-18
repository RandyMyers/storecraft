const { DEFAULT_BLOCKS } = require("../defaults/blocks");

const MINIMAL_HOME = [
  { id: "m1", type: "heading", label: "Heading", content: "Hello — start from a clean canvas." },
  { id: "m2", type: "text", label: "Text", content: "Use the left panel to add sections, or edit this copy." },
];

/** Unsplash placeholders — swap for your CDN in production. */
const BLOOM_IMG = {
  hero: "https://images.unsplash.com/photo-1517840933442-d2e5e764c6c4?auto=format&fit=crop&w=1600&q=80",
  p1: "https://images.unsplash.com/photo-1578748496689-bbddbdeabfbf?auto=format&fit=crop&w=1200&q=80",
  p2: "https://images.unsplash.com/photo-1584186045877-a61b90874a53?auto=format&fit=crop&w=1200&q=80",
  p3: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80",
  author: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80",
};

/**
 * Mirrors bloom-sites-main layout via `bloomSlot` grouping (BloomPageBody partitions these).
 */
const BLOOM_HOME_DRAFT = [
  {
    id: "bl-im1",
    type: "image",
    label: "Featured cover",
    variant: "heroCover",
    bloomSlot: "featured-cover",
    src: BLOOM_IMG.hero,
    alt: "Morning notebook — editorial cover",
  },
  {
    id: "bl-e1",
    type: "heading",
    label: "Eyebrow",
    variant: "eyebrow",
    bloomSlot: "featured-copy",
    content: "The Featured Essay · Essay",
  },
  {
    id: "bl-t1",
    type: "heading",
    label: "Featured title",
    variant: "hero",
    bloomSlot: "featured-copy",
    content: "The Quiet Discipline of Morning Pages",
  },
  {
    id: "bl-x1",
    type: "text",
    label: "Dek",
    variant: "lead",
    bloomSlot: "featured-copy",
    content:
      "On the small, almost invisible ritual that has shaped a decade of writing — and why the page asks for nothing in return.",
  },
  {
    id: "bl-m1",
    type: "text",
    label: "Byline row",
    variant: "featureMeta",
    bloomSlot: "featured-copy",
    content: "Elena Marsh · May 4, 2026 · 7 min read",
  },
  {
    id: "bl-b1",
    type: "button",
    label: "Read link",
    variant: "minimal",
    bloomSlot: "featured-copy",
    content: "Read the essay",
  },
  /* Recent notes column 1 (image-first, like bloom home grid) */
  {
    id: "bl-im2",
    type: "image",
    label: "Note image",
    variant: "cardCover",
    bloomSlot: "recent-1",
    src: BLOOM_IMG.p1,
    alt: "Hands shaping clay on a wheel",
  },
  {
    id: "bl-e2",
    type: "heading",
    label: "Eyebrow",
    variant: "eyebrow",
    bloomSlot: "recent-1",
    content: "01 · Craft",
  },
  {
    id: "bl-h2",
    type: "heading",
    label: "Title",
    variant: "cardTitle",
    bloomSlot: "recent-1",
    content: "On Craft, and the Patience of Clay",
  },
  {
    id: "bl-t2",
    type: "text",
    label: "Excerpt",
    variant: "cardExcerpt",
    bloomSlot: "recent-1",
    content: "A visit to a small studio outside Lisbon, where time is measured in turns of the wheel.",
  },
  {
    id: "bl-mt2",
    type: "text",
    label: "Meta line",
    variant: "cardMeta",
    bloomSlot: "recent-1",
    content: "Júlia Reis · Apr 28, 2026",
  },
  {
    id: "bl-im3",
    type: "image",
    label: "Note image",
    variant: "cardCover",
    bloomSlot: "recent-2",
    src: BLOOM_IMG.p2,
    alt: "Folded natural linen fabric",
  },
  {
    id: "bl-e3",
    type: "heading",
    label: "Eyebrow",
    variant: "eyebrow",
    bloomSlot: "recent-2",
    content: "02 · Material",
  },
  {
    id: "bl-h3",
    type: "heading",
    label: "Title",
    variant: "cardTitle",
    bloomSlot: "recent-2",
    content: "The Weight of Linen",
  },
  {
    id: "bl-t3",
    type: "text",
    label: "Excerpt",
    variant: "cardExcerpt",
    bloomSlot: "recent-2",
    content: "Notes on a fabric that asks to be lived in, and a quiet argument against newness.",
  },
  {
    id: "bl-mt3",
    type: "text",
    label: "Meta line",
    variant: "cardMeta",
    bloomSlot: "recent-2",
    content: "Hana Ito · Apr 19, 2026",
  },
  {
    id: "bl-im4",
    type: "image",
    label: "Note image",
    variant: "cardCover",
    bloomSlot: "recent-3",
    src: BLOOM_IMG.p3,
    alt: "Calm interior with natural light",
  },
  {
    id: "bl-e4",
    type: "heading",
    label: "Eyebrow",
    variant: "eyebrow",
    bloomSlot: "recent-3",
    content: "03 · Interiors",
  },
  {
    id: "bl-h4",
    type: "heading",
    label: "Title",
    variant: "cardTitle",
    bloomSlot: "recent-3",
    content: "Rooms That Listen",
  },
  {
    id: "bl-t4",
    type: "text",
    label: "Excerpt",
    variant: "cardExcerpt",
    bloomSlot: "recent-3",
    content: "A short meditation on interiors that hold space for the people inside them.",
  },
  {
    id: "bl-mt4",
    type: "text",
    label: "Meta line",
    variant: "cardMeta",
    bloomSlot: "recent-3",
    content: "Mateus Alves · Apr 11, 2026",
  },
  /* Sunday Letter band (marginalia) */
  {
    id: "bl-letter-e",
    type: "heading",
    label: "Eyebrow",
    variant: "eyebrow",
    bloomSlot: "sunday",
    content: "The Sunday Letter",
  },
  {
    id: "bl-quote",
    type: "text",
    label: "Quote",
    variant: "pullquote",
    bloomSlot: "sunday",
    content:
      '"We do not write to be understood. We write to understand — and then, sometimes, to share the small clarity we found."',
  },
  {
    id: "bl-form",
    type: "form",
    label: "Subscribe",
    bloomSlot: "sunday",
    submitLabel: "Subscribe",
    emailPlaceholder: "your@email.com",
    collectMessage: false,
  },
];

const BLOOM_ABOUT_DRAFT = [
  {
    id: "bla-im",
    type: "image",
    label: "Portrait",
    variant: "square",
    bloomSlot: "about-photo",
    src: BLOOM_IMG.author,
    alt: "Editor portrait",
  },
  {
    id: "bla-cap",
    type: "text",
    label: "Caption",
    variant: "caption",
    bloomSlot: "about-caption",
    content: "Elena Marsh, founding editor",
  },
  {
    id: "bla-e",
    type: "heading",
    label: "Eyebrow",
    variant: "eyebrow",
    bloomSlot: "about-copy",
    content: "About the Journal",
  },
  {
    id: "bla-h",
    type: "heading",
    label: "Heading",
    variant: "hero",
    bloomSlot: "about-copy",
    content: "Small attentions, gathered weekly.",
  },
  {
    id: "bla-p1",
    type: "text",
    label: "Text",
    variant: "prose",
    bloomSlot: "about-copy",
    content:
      "Marginalia began as a notebook — a place to keep the sentences that did not yet belong anywhere. In time it became a letter, then a quiet correspondence with a few hundred readers who, like us, believed that the most worthwhile things were rarely the loudest.",
  },
  {
    id: "bla-p2",
    type: "text",
    label: "Text",
    variant: "prose",
    bloomSlot: "about-copy",
    content:
      "We publish one essay each Sunday morning. We do not chase trends. We try, instead, to notice — a fabric, a room, a ritual, the way a particular light falls across a particular table — and to set those noticings down with care.",
  },
  {
    id: "bla-div",
    type: "divider",
    label: "Divider",
    bloomSlot: "about-copy",
    content: "",
  },
  {
    id: "bla-foot",
    type: "text",
    label: "Text",
    variant: "footnote",
    bloomSlot: "about-copy",
    content:
      "Founded 2019 · Lisbon & Kyoto · Independent and reader-supported. Set locale in Site settings for GEO meta.",
  },
];

/** Registry of starter sites (versioned strings; add rows here as you ship new themes). */
const SITE_TEMPLATES = {
  default: {
    slug: "default",
    label: "Starter",
    description: "Hero, text, CTA, and image blocks — classic Nestpage landing layout.",
    version: "1",
    isActive: true,
    sortOrder: 0,
    pages: [{ slug: "home", title: "Home", draft: DEFAULT_BLOCKS }],
  },
  minimal: {
    slug: "minimal",
    label: "Minimal",
    description: "Single page with heading and paragraph — fastest path to a custom layout.",
    version: "1",
    isActive: true,
    sortOrder: 10,
    pages: [{ slug: "home", title: "Home", draft: MINIMAL_HOME }],
  },
  landing: {
    slug: "landing",
    label: "Landing + About",
    description: "Home plus a ready-made About page you can reshape.",
    version: "1",
    isActive: true,
    sortOrder: 20,
    pages: [
      { slug: "home", title: "Home", draft: DEFAULT_BLOCKS },
      {
        slug: "about",
        title: "About",
        draft: [
          { id: "a1", type: "heading", label: "Heading", content: "About us" },
          { id: "a2", type: "text", label: "Text", content: "Tell your story — team, mission, or values." },
        ],
      },
    ],
  },
  bloom: {
    slug: "bloom",
    label: "Bloom (Editorial)",
    description:
      "Marginalia-style home (featured 12-col row, recent grid, Sunday letter band) + about two-column page. Blocks use optional bloomSlot for layout; new sites get full structure from seed.",
    version: "2",
    isActive: true,
    sortOrder: 25,
    pages: [
      {
        slug: "home",
        title: "Home",
        metaDescription:
          "Essays, field notes, and quiet observations on craft, materials, and the disciplines of a thoughtful life.",
        ogTitle: "Bloom — Editorial journal starter",
        ogDescription: "Weekly essays on craft, attention, and slow living.",
        ogImage: BLOOM_IMG.hero,
        twitterCard: "summary_large_image",
        draft: BLOOM_HOME_DRAFT,
      },
      {
        slug: "about",
        title: "About",
        metaDescription:
          "About this journal — craft, attention, and the small disciplines behind each issue.",
        ogTitle: "About — Editorial journal",
        ogDescription: "A quiet editorial journal you can make your own.",
        ogImage: BLOOM_IMG.author,
        twitterCard: "summary_large_image",
        draft: BLOOM_ABOUT_DRAFT,
      },
    ],
  },
};

module.exports = { SITE_TEMPLATES };
