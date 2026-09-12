import { describe, it, expect } from 'vitest';
import { groupSubmissionFiles, type SubmissionFileRow } from './submissionFiles.js';

function row(
  over: Partial<SubmissionFileRow> & { submission_id: string; key: string },
): SubmissionFileRow {
  return {
    filename: 'dosya.jpg',
    size: 100,
    mime: 'image/jpeg',
    ext: 'jpg',
    ...over,
  };
}

describe('groupSubmissionFiles', () => {
  it('boş girdi → boş harita', () => {
    expect(groupSubmissionFiles([]).size).toBe(0);
  });

  it('aynı submission altındaki dosyaları sırayla gruplar', () => {
    const map = groupSubmissionFiles([
      row({ submission_id: 's1', key: 'a' }),
      row({ submission_id: 's2', key: 'b' }),
      row({
        submission_id: 's1',
        key: 'c',
        filename: 'ikinci.png',
        ext: 'png',
        mime: 'image/png',
      }),
    ]);

    expect(map.size).toBe(2);
    expect(map.get('s1')!.map((f) => f.key)).toEqual(['a', 'c']);
    expect(map.get('s2')!.map((f) => f.key)).toEqual(['b']);
    expect(map.get('s1')![1]).toMatchObject({
      filename: 'ikinci.png',
      ext: 'png',
      mime: 'image/png',
    });
  });

  it('görülmeyen submission için kayıt üretilmez', () => {
    const map = groupSubmissionFiles([row({ submission_id: 's1', key: 'a' })]);
    expect(map.get('yok')).toBeUndefined();
  });
});
