/**
 * Seed dummy student data into IndexedDB for local testing.
 * Only runs when VITE_API_URL is not configured.
 */

import type { Student } from '../types';
import { cacheStudents, getCachedStudents } from './db';

const DUMMY_STUDENTS: Student[] = [
  {
    id: 'RHA001',
    name: 'Aarav Sharma',
    age: 8,
    class: '3',
    guardian: 'Priya Sharma',
    contact: '9876543210',
    emergencyContact: '9876543211',
    status: 'Active',
  },
  {
    id: 'RHA002',
    name: 'Diya Patel',
    age: 9,
    class: '4',
    guardian: 'Ravi Patel',
    contact: '9876543212',
    emergencyContact: '9876543213',
    status: 'Active',
  },
  {
    id: 'RHA003',
    name: 'Kabir Singh',
    age: 7,
    class: '2',
    guardian: 'Anita Singh',
    contact: '9876543214',
    emergencyContact: '9876543215',
    status: 'Active',
  },
  {
    id: 'RHA004',
    name: 'Meera Joshi',
    age: 10,
    class: '5',
    guardian: 'Sunita Joshi',
    contact: '9876543216',
    emergencyContact: '9876543217',
    status: 'Active',
  },
  {
    id: 'RHA005',
    name: 'Rohan Gupta',
    age: 8,
    class: '3',
    guardian: 'Amit Gupta',
    contact: '9876543218',
    emergencyContact: '9876543219',
    status: 'Active',
  },
];

export async function seedDummyStudents(): Promise<void> {
  // Only seed if no API is configured (demo/dev mode)
  if (import.meta.env.VITE_API_URL) return;

  const existing = await getCachedStudents();
  if (existing.length > 0) return; // Already seeded

  console.log('🌱 Seeding dummy student data for demo mode...');
  await cacheStudents(DUMMY_STUDENTS);
  console.log(`✅ Seeded ${DUMMY_STUDENTS.length} students`);
}
