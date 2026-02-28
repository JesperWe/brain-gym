import type { CollectionConfig } from 'payload'

export const Games: CollectionConfig = {
  slug: 'games',
  admin: {
    useAsTitle: 'channel',
  },
  access: {
    read: () => true,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => !!req.user,
  },
  fields: [
    {
      name: 'gameId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'player1',
      type: 'relationship',
      relationTo: 'players',
      required: true,
    },
    {
      name: 'player2',
      type: 'relationship',
      relationTo: 'players',
      required: true,
    },
    {
      name: 'player1Score',
      type: 'number',
      required: true,
    },
    {
      name: 'player2Score',
      type: 'number',
      required: true,
    },
    {
      name: 'endedAt',
      type: 'date',
      required: true,
    },
    {
      name: 'channel',
      type: 'text',
      required: true,
    },
  ],
}
