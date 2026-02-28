import type { CollectionConfig } from 'payload'

export const Players: CollectionConfig = {
  slug: 'players',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    read: () => true,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'ablyClientId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'avatar',
      type: 'text',
      required: true,
    },
    {
      name: 'lastSeenAt',
      type: 'date',
      required: true,
    },
  ],
}
