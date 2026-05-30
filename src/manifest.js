/**
 * manifest.js
 * Stremio addon manifest for MissAV
 */

module.exports = {
  id: 'community.missav.dedicated',
  version: '2.0.0',
  name: 'MissAV',
  description:
    'Browse, search and stream MissAV content — JAV, uncensored leaks, and more. ' +
    'Full search support with rich categories.',
  logo: 'https://missav.com/favicon.ico',
  background:
    'https://raw.githubusercontent.com/Mast3rCh1ef/addon-asset/main/bg.png',
  contactEmail: '',

  resources: ['catalog', 'meta', 'stream'],
  types: ['movie'],
  idPrefixes: ['missav:'],

  catalogs: [
    // ── Main browsing catalogs ──────────────────────────────────────────
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

    // ── Genre / tag catalogs ────────────────────────────────────────────
    {
      type: 'movie',
      id: 'missav-genre',
      name: '🏷 Browse by Genre',
      extra: [
        {
          name: 'genre',
          isRequired: false,
          options: [
            // Resolution / format
            'Uncensored',
            'Censored',
            'Uncensored Leak',
            '4K',
            // Style
            'Amateur',
            'Cosplay',
            'Solo',
            'Lesbian',
            // Body type
            'Big Tits',
            'Small Tits',
            'Busty',
            // Act
            'Creampie',
            'Blowjob',
            'Handjob',
            'Anal',
            'Squirting',
            'Gangbang',
            'Orgy',
            'Masturbation',
            'Toys',
            // Character
            'MILF',
            'Schoolgirl',
            'Office Lady',
            'Nurse',
            'Maid',
            'Idol',
            'Model',
            // Ethnicity / origin
            'Chinese',
            'Korean',
            'Thai',
            // Other
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

    // ── Actress browsing catalog ────────────────────────────────────────
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
