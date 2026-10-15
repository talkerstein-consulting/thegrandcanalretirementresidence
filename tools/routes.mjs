// Every public route on https://www.grandcanal.ca, taken from the live sitemaps
// (pages-sitemap.xml, blog-posts-sitemap.xml, blog-categories-sitemap.xml).
export const ORIGIN = 'https://www.grandcanal.ca';

// Redirects configured on the live site (verified with curl -I).
export const REDIRECTS = {
  '/review': 'https://g.page/r/CcJxCH5hN_VUEAg/review',
};

export const PAGES = [
  '',
  'about-us',
  'care',
  'our-services',
  'amenities',
  'dining-services',
  'floor-plans',
  'our-location',
  'gallery',
  'faq',
  'blogs',
  'sitemap',
  'thankyou',
  'retirement-residence-welland-lp',
];

export const POSTS = [
  'why-retirement-living-is-the-best-option-for-seniors',
  'which-is-better-for-senior-retirement-living-buying-or-renting',
  'how-surrounding-yourself-with-nature-can-improve-your-quality-of-life',
  'discover-serene-and-tranquil-retirement-living-at-the-grand-canal-retirement-residence',
  'average-cost-of-retirement-home-welland-2022',
  'how-to-choose-a-retirement-living-home-and-senior-community',
  'experience-tranquil-senior-retirement-living-in-welland-niagara-falls-region',
  'discover-serene-retirement-living-at-the-grand-canal-retirement-residence',
  'choose-grand-canal-retirement-residence',
  'the-benefits-of-retirement-in-a-seniors-retirement-home-compared-to-staying-in-your-own-home',
  'why-welland-is-the-ultimate-retirement-destination-for-seniors',
  'why-retirement-communities-with-outdoor-activities-are-popular',
  'when-should-you-move-into-a-retirement-residence-in-welland',
  'winter-health-safety-tips-for-seniors-at-retirement-residences',
  'difference-between-retirement-home-and-nursing-home',
  'debunking-myths-about-retirement-residences',
  'why-younger-seniors-are-moving-into-retirement-communities',
  'retiring-along-a-natural-canal-the-benefits-of-senior-living-in-niagara-region',
  'grand-canal-retirement-residence-welland-community-wellness-centre',
  'indoor-activities-for-senior-at-independent-supportive-living',
  'what-is-independent-senior-living-and-what-are-the-benefits',
  'benefits-of-choosing-a-pet-friendly-retirement-residence',
  'why-is-winter-the-best-time-to-move-into-a-new-senior-living-housing',
  'seniors-summer-health-safety-tips-at-retirement-residences',
  'discover-the-best-of-welland-ontario-a-guide-to-some-retirement-activities-and-attractions',
  'welland',
].map((s) => `blog/${s}`);

export const ROUTES = [...PAGES, ...POSTS];

// The live site's main phone number, verified in its header ("Call: 289-480-0125")
// and its existing tel: link.
export const PHONE_DISPLAY = '289-480-0125';
export const PHONE_TEL = 'tel:+12894800125';

// Wix serves its separate mobile layout to phone user agents (tablets get desktop).
export const MOBILE_UA_RE = 'iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|BB10|Opera Mini|IEMobile|webOS.*Mobile';
