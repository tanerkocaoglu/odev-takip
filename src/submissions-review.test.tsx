/**
 * SubmissionsReviewPage testleri — teslim dosyaları: görsel → lightbox,
 * PDF → yeni sekme (openProtectedFile).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SubmissionsReviewPage from './pages/teacher/SubmissionsReviewPage';
import { teacherApi, openProtectedFile, fetchProtectedFileUrl, fetchProtectedThumbUrl } from './services/api';

vi.mock('./services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/api')>();
  return {
    ...actual,
    teacherApi: {
      submissionHomeworks: vi.fn(),
      submissions: vi.fn(),
      markReviewed: vi.fn(),
    },
    openProtectedFile: vi.fn(),
    fetchProtectedFileUrl: vi.fn(),
    fetchProtectedThumbUrl: vi.fn(),
    releaseProtectedFileUrl: vi.fn(),
  };
});

const HOMEWORK = {
  id: 'hw1',
  due_date: '2026-01-12',
  course_name: 'Matematik',
  class_name: 'ÖKLİD',
  week_no: 5,
  week_start: '2026-01-05',
  week_label: '05 - 11 Ocak',
  submission_count: 1,
};

const SUBMISSION = {
  id: 'sub1',
  student_id: 's1',
  student_name: 'Ali Yılmaz',
  note: null,
  submitted_at: '2026-01-09T18:00:00.000Z',
  is_late: false,
  status: 'submitted' as const,
  reviewed_at: null,
  files: [
    { key: '1111111111-aaaaaaaaaaaaaaaa.jpg', filename: 'sayfa1.jpg', size: 1024, mime: 'image/jpeg', ext: 'jpg' },
    { key: '2222222222-bbbbbbbbbbbbbbbb.pdf', filename: 'cozum.pdf', size: 2048, mime: 'application/pdf', ext: 'pdf' },
  ],
};

beforeEach(() => {
  vi.mocked(teacherApi.submissionHomeworks).mockResolvedValue({ items: [HOMEWORK] });
  vi.mocked(teacherApi.submissions).mockResolvedValue({ items: [SUBMISSION] });
  vi.mocked(openProtectedFile).mockResolvedValue(undefined);
  vi.mocked(fetchProtectedFileUrl).mockImplementation(async (key) => `blob:${key}`);
  vi.mocked(fetchProtectedThumbUrl).mockImplementation(async (key) => `blob:thumb-${key}`);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function openFirstSubmission() {
  render(
    <MemoryRouter>
      <SubmissionsReviewPage />
    </MemoryRouter>,
  );
  const picker = await screen.findByRole('button', { name: /Matematik · ÖKLİD/ });
  fireEvent.click(picker);
  return screen.findByText('Ali Yılmaz');
}

describe('SubmissionsReviewPage', () => {
  it('görsele tıklayınca lightbox açılır, openProtectedFile çağrılmaz', async () => {
    await openFirstSubmission();

    fireEvent.click(screen.getByRole('button', { name: /sayfa1\.jpg/ }));
    expect(await screen.findByAltText('sayfa1.jpg')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(openProtectedFile).not.toHaveBeenCalled();
  });

  it('PDF için openProtectedFile çağrılır (lightbox değil)', async () => {
    await openFirstSubmission();

    fireEvent.click(screen.getByRole('button', { name: /cozum\.pdf/ }));
    expect(openProtectedFile).toHaveBeenCalledWith('2222222222-bbbbbbbbbbbbbbbb.pdf');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
