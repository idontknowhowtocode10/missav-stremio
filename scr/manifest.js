/**
 * manifest.js
 *
 * Stremio addon manifest for MissAV.
 * Mirrors the CS3 plugin metadata:
 *   url:          https://raw.githubusercontent.com/phisher98/CXXX/builds/MissAV.cs3
 *   version:      9
 *   name:         MissAV
 *   internalName: MissAV
 */

module.exports = {
  id: 'community.missav.stremio',
  version: '9.0.0',
  name: 'MissAV',
  description:
    'Browse, search and stream MissAV content — JAV, uncensored leaks, and more. ' +
    'Full search support with rich genre and actress categories. ' +
    'Based on the MissAV CS3 source by phisher98.',
  logo: 'https://missav.ws/favicon.ico',
  background: 'https://missav.ws/favicon.ico',
  contactEmail: '',

  // CS3 source reference (informational)
  cs3Source: {
    url: 'https://raw.githubusercontent.com/phisher98/CXXX/builds/MissAV.cs3',
    status: 1,
    version: 9,
    name: 'MissAV',
    internalName: 'MissAV',
  },

  resources: ['catalog', 'meta', 'stream'],
  types: ['movie'],
  idPrefixes: ['missav:'],

  catalogs: [
    // ── Main browsing catalogs ──────────────────────────────────────────────
    {
      type: 'movie',
      id: 'missav-new',
      name: '🆕 New Releases',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip' }],
      extraSupported: ['search', 'skip'],
    },
    {
      type: 'movie',
      id: 'missav-today-hot',
      name: '🔥 Today\'s Hot',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip' }],
      extraSupported: ['search', 'skip'],
    },
    {
      type: 'movie',
      id: 'missav-weekly-hot',
      name: '📅 Weekly Hot',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip' }],
      extraSupported: ['search', 'skip'],
    },
    {
      type: 'movie',
      id: 'missav-monthly-hot',
      name: '📆 Monthly Hot',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip' }],
      extraSupported: ['search', 'skip'],
    },
    {
      type: 'movie',
      id: 'missav-uncensored-leak',
      name: '🔓 Uncensored Leak',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip' }],
      extraSupported: ['search', 'skip'],
    },

    // ── Genre / tag catalogs ────────────────────────────────────────────────
    {
      type: 'movie',
      id: 'missav-genre',
      name: '🏷 Browse by Genre',
      extra: [
        {
          name: 'genre',
          isRequired: false,
          options: [
            'Uncensored',
            'Censored',
            'Uncensored Leak',
            '4K',
            'Amateur',
            'Cosplay',
            'Solo',
            'Lesbian',
            'Big Tits',
            'Small Tits',
            'Busty',
            'Creampie',
            'Blowjob',
            'Handjob',
            'Anal',
            'Squirting',
            'Gangbang',
            'Orgy',
            'Masturbation',
            'Toys',
            'MILF',
            'Schoolgirl',
            'Office Lady',
            'Nurse',
            'Maid',
            'Idol',
            'Model',
            'Chinese',
            'Korean',
            'Thai',
            'Bondage',
            'Swimsuit',
            'Lingerie',
            'Pantyhose',
            'Outdoor',
            'Hotel',
          ],
        },
        { name: 'skip' },
      ],
      extraSupported: ['genre', 'skip'],
    },

    // ── Actress browsing catalog ────────────────────────────────────────────
    {
      type: 'movie',
      id: 'missav-actress',
      name: '⭐ Actresses',
      extra: [
        {
          name: 'genre',
          isRequired: false,
          options: [
            'Most Popular',
            'Newest',
            'Yua Mikami',
            'Eimi Fukada',
            'Minami Kojima',
            'Rion',
            'Julia',
            'Mia Khalifa',
            'Ai Mukai',
            'Aika',
          ],
        },
        { name: 'search', isRequired: false },
        { name: 'skip' },
      ],
      extraSupported: ['genre', 'search', 'skip'],
    },
  ],
};
