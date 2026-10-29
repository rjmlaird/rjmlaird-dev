// Single place for site-wide constants. Change a hostname here, not in pages.

export const SITE = {
  name: "Ryan Laird · Dev",
  shortName: "Dev",
  author: "Ryan J. M. Laird",
  url: "https://dev.rjmlaird.co.uk",
  description:
    "Developer hub of Ryan Laird: labs, tools, apps, APIs and open-source work, built where physics, communication and code meet.",

  github: "rjmlaird",
  orgs: [
    { login: "impactorbitco", label: "Impact Orbit Creative Group" },
    { login: "spaceforneuro", label: "Space for Neurodiversity" },
    { login: "spaceintegrity", label: "Space Integrity Initiative" },
    { login: "spaceimpactforum", label: "Space Impact Forum"},
    { login: "leicesterspaceweek", label: "Leicester Space Week" }
  ],

  // Canonical Person node lives on the apex site; this site only references it.
  // Keep in sync with the @id used by rjmlaird.co.uk's JSON-LD.
  personId: "https://rjmlaird.co.uk/#person",

  links: {
    main: "https://rjmlaird.co.uk",
    contact: "https://rjmlaird.co.uk/contact",
    cv: "https://cv.rjmlaird.co.uk",
    github: "https://github.com/rjmlaird",
    linkedin: "https://www.linkedin.com/in/rjmlaird",
    labs: "https://labs.rjmlaird.co.uk",
    tools: "https://tools.rjmlaird.co.uk",
    apps: "https://apps.rjmlaird.co.uk",
    api: "https://api.rjmlaird.co.uk",
    status: "https://status.rjmlaird.co.uk",
    // Docs are served separately (see README); update when that moves.
    docs: "https://docs.rjmlaird.co.uk",
  },
} as const;

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/repos/", label: "Repos" },
  { href: "/projects/", label: "Projects" },
  { href: "/open-source/", label: "Open source" },
  { href: "/stack/", label: "Stack" },
  { href: "/about/", label: "About" },
] as const;
