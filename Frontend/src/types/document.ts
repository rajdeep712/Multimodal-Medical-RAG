export type ContentType = 'text' | 'table' | 'image';

export interface SourceCoordinates {
  points: [number, number][]; // 4 points [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
  system: 'PixelSpace' | 'Normalized';
  layout_width: number;
  layout_height: number;
  label?: string;
}

export interface Citation {
  id: string;
  documentId: string;
  elementId: string;
  documentName: string;
  pageNumber: number;
  contentType: ContentType;
  coordinates: SourceCoordinates[];
  excerpt?: string;
  imageSummary?: string;
  finding?: string;
}

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface DocumentSection {
  id: string;
  pageNumber: number;
  title: string;
  contentType: ContentType;
  coordinates: SourceCoordinates[];
  contentSummary: string;
}

export type IngestionStatus =
  | 'SECURED'
  | 'PROCESSING'
  | 'INDEXED'
  | 'ERROR'
  | 'DELETED'
  | null;

export interface MedicalDocument {
  id: string;
  fileName: string;
  title: string;
  mimeType: string;
  uploadedAt: string;
  fileSize: string;
  status: DocumentStatus;
  pageCount: number;
  category: 'Laboratory' | 'Prescription' | 'Clinical Summary' | 'Radiology / Imaging';
  /** Indexed state from the backend pipeline. */
  isReady: boolean;
  ingestionStatus: IngestionStatus;
  ingestionError?: string | null;
  patientRef?: string;
  doctorRef?: string;
  facilityRef?: string;
  sections?: DocumentSection[];
  // For rendering multi-page realistic vector/canvas medical reports
  pages: MedicalDocumentPageData[];
}

export interface MedicalDocumentPageData {
  pageNumber: number;
  header: {
    hospitalOrClinic: string;
    department: string;
    patientName: string;
    patientId: string;
    dob: string;
    gender: string;
    collectedDate: string;
    reportedDate: string;
  };
  contentSections: {
    type: 'table' | 'keyValue' | 'paragraph' | 'rxList' | 'radiologyViewer';
    heading?: string;
    rows?: {
      testName: string;
      result: string;
      unit: string;
      referenceRange: string;
      flag?: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL';
      notes?: string;
      coordRef?: string;
    }[];
    pairs?: { key: string; value: string }[];
    paragraphs?: string[];
    rxItems?: {
      medication: string;
      dosage: string;
      frequency: string;
      duration: string;
      instructions: string;
      coordRef?: string;
    }[];
    radiologyData?: {
      modality: string;
      view: string;
      anatomy: string;
      findings: string;
      impression: string;
      coordRef?: string;
    };
  }[];
  footerNotes: string;
}
