'use strict';

module.exports = {
  id: 'community.missav.magnets',
  version: '1.0.0',
  name: 'MissAV Magnets',
  description:
    'Extracts magnet / torrent links from MissAV.ws and serves them as ' +
    'native Stremio torrent streams. Search by JAV code or browse by category.',
  logo: 'https://missav.ws/favicon.ico',

  resources: ['catalog', 'meta', 'stream'],
  types: ['movie'],
  idPrefixes: ['missav:'],

  catalogs: [
    {
      type: 'movie',
      id: 'missav-magnets-new',
      name: '🧲 MissAV — New (Magnets)',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip' }],
      extraSupported: ['search', 'skip'],
    },
    {
      type: 'movie',
      id: 'missav-magnets-hot',
      name: '🔥 MissAV — Today\'s Hot (Magnets)',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip' }],
      extraSupported: ['search', 'skip'],
    },
    {
      type: 'movie',
      id: 'missav-magnets-uncensored',
      name: '🔓 MissAV — Uncensored Leak (Magnets)',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip' }],
      extraSupported: ['search', 'skip'],
    },
  ],
};
