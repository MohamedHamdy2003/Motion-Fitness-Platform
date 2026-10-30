import { EntitySchema } from 'typeorm';
export interface User {
  id: string;
  email_normalized: string | null;
  password_hash: string | null;
  status: string;
  verified_at: Date | null;
  created_at: Date;
}
export const UserSchema = new EntitySchema<User>({
  name: 'User',
  tableName: 'users',
  columns: {
    id: { type: 'uuid', primary: true },
    email_normalized: { type: 'text', nullable: true, unique: true },
    password_hash: { type: 'text', nullable: true },
    status: { type: 'text' },
    verified_at: { type: 'timestamptz', nullable: true },
    created_at: { type: 'timestamptz', createDate: true },
  },
});
