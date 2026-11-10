import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCitationsFromText, filterDocuments } from './citationMatcher.ts';
import { Citation, MedicalDocument } from '../types/document.ts';

test('parseCitationsFromText splits text into readable and citation tokens', () => {
  const dummyCitations: Citation[] = [
    {
      id: 'cit-1',
      documentId: 'doc-cbc',
      elementId: 'elem-1',
      documentName: 'CBC_Blood_Report.pdf',
      pageNumber: 1,
      contentType: 'table',
      coordinates: [],
    },
    {
      id: 'cit-2',
      documentId: 'doc-rx',
      elementId: 'elem-2',
      documentName: 'Prescription_November.pdf',
      pageNumber: 1,
      contentType: 'text',
      coordinates: [],
    },
  ];

  const text = 'Your haemoglobin is normal [1]. However, platelet count is low [2].';
  const tokens = parseCitationsFromText(text, dummyCitations);

  assert.equal(tokens.length, 5);
  assert.equal(tokens[0].type, 'text');
  assert.equal(tokens[0].content, 'Your haemoglobin is normal ');
  assert.equal(tokens[1].type, 'citation');
  assert.equal(tokens[1].citationIndex, 1);
  assert.equal(tokens[1].citation?.documentName, 'CBC_Blood_Report.pdf');
  assert.equal(tokens[2].type, 'text');
  assert.equal(tokens[3].type, 'citation');
  assert.equal(tokens[3].citationIndex, 2);
  assert.equal(tokens[3].citation?.documentName, 'Prescription_November.pdf');
});

test('filterDocuments filters by selected IDs', () => {
  const docs: MedicalDocument[] = [
    {
      id: 'doc-1',
      fileName: 'A.pdf',
      title: 'A',
      mimeType: 'application/pdf',
      uploadedAt: '2026-11-01T10:00:00Z',
      fileSize: '1.2MB',
      status: 'ready',
      pageCount: 1,
      category: 'Laboratory',
      pages: [],
    },
    {
      id: 'doc-2',
      fileName: 'B.pdf',
      title: 'B',
      mimeType: 'application/pdf',
      uploadedAt: '2026-11-05T10:00:00Z',
      fileSize: '2.5MB',
      status: 'ready',
      pageCount: 2,
      category: 'Prescription',
      pages: [],
    },
  ];

  const filtered = filterDocuments(docs, ['doc-2']);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'doc-2');
});
