import { EntitySchema } from 'typeorm';
export const MediaSchema = new EntitySchema({
  name: 'MediaAsset',
  tableName: 'media_assets',
  columns: {
    id: { type: 'uuid', primary: true },
    owner_user_id: { type: 'uuid', nullable: true },
    storage_key: { type: 'text' },
    upload_key: { type: 'text' },
    mime: { type: 'text' },
    size: { type: 'integer' },
    status: { type: 'text' },
    created_at: { type: 'timestamptz' },
  },
});
