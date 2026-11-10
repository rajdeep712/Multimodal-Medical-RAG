import { MedicalDocument, Citation } from '../types/document.ts';
import { ChatMessage, ChatConversation } from '../types/chat.ts';
import { User } from '../types/auth.ts';

export const INITIAL_USER: User = {
  id: 'usr_med_8921',
  name: 'Dr. Sarah Lin',
  email: 's.lin@medresearch.org',
  role: 'clinician',
  organization: 'Stanford Health AI Institute',
  initials: 'SL',
  preferences: {
    theme: 'light',
    autoHighlightCitations: true,
  },
};

export const MOCK_DOCUMENTS: MedicalDocument[] = [
  {
    id: 'doc_cbc_2026',
    fileName: 'CBC_Blood_Report.pdf',
    title: 'Complete Blood Count & Metabolic Panel',
    mimeType: 'application/pdf',
    uploadedAt: '2026-11-04T08:30:00Z',
    fileSize: '1.8 MB',
    status: 'ready',
    pageCount: 2,
    category: 'Laboratory',
    patientRef: 'PT-94821 (Alexander Hayes, Age 42)',
    doctorRef: 'Dr. Robert Marcus, MD (Internal Medicine)',
    facilityRef: 'Apex Clinical Pathology Laboratories',
    sections: [
      {
        id: 'sec_cbc_1',
        pageNumber: 1,
        title: 'Hematology & Differential',
        contentType: 'table',
        coordinates: [
          {
            points: [[80, 240], [920, 240], [920, 560], [80, 560]],
            system: 'PixelSpace',
            layout_width: 1000,
            layout_height: 1400,
            label: 'CBC Panel Table',
          },
        ],
        contentSummary: 'Complete blood count with differential including Platelet Count (120 x10^9/L - LOW), Hemoglobin (14.2 g/dL - NORMAL).',
      },
      {
        id: 'sec_cbc_2',
        pageNumber: 2,
        title: 'Metabolic & Renal Profile',
        contentType: 'table',
        coordinates: [
          {
            points: [[80, 220], [920, 220], [920, 580], [80, 580]],
            system: 'PixelSpace',
            layout_width: 1000,
            layout_height: 1400,
            label: 'Metabolic Panel Table',
          },
        ],
        contentSummary: 'Serum Glucose (94 mg/dL), Creatinine (0.91 mg/dL), BUN (14 mg/dL), eGFR (>90 mL/min/1.73m²).',
      },
    ],
    pages: [
      {
        pageNumber: 1,
        header: {
          hospitalOrClinic: 'APEX CLINICAL PATHOLOGY LABORATORIES',
          department: 'Division of Diagnostic Hematology',
          patientName: 'Alexander Hayes',
          patientId: 'PT-94821-X',
          dob: '1984-06-14 (Age 42)',
          gender: 'Male',
          collectedDate: 'Nov 03, 2026 07:45 AM',
          reportedDate: 'Nov 03, 2026 01:15 PM',
        },
        contentSections: [
          {
            type: 'table',
            heading: 'COMPLETE BLOOD COUNT (CBC) WITH AUTOMATED DIFFERENTIAL',
            rows: [
              {
                testName: 'Hemoglobin (Hb)',
                result: '14.2',
                unit: 'g/dL',
                referenceRange: '13.5 - 17.5',
                flag: 'NORMAL',
                coordRef: 'hb_row',
              },
              {
                testName: 'Hematocrit (Hct)',
                result: '42.8',
                unit: '%',
                referenceRange: '41.0 - 50.0',
                flag: 'NORMAL',
                coordRef: 'hct_row',
              },
              {
                testName: 'RBC Count',
                result: '4.85',
                unit: 'x10^12/L',
                referenceRange: '4.50 - 5.90',
                flag: 'NORMAL',
              },
              {
                testName: 'MCV (Mean Corpuscular Volume)',
                result: '88.2',
                unit: 'fL',
                referenceRange: '80.0 - 96.0',
                flag: 'NORMAL',
              },
              {
                testName: 'WBC (Total White Cell Count)',
                result: '6.8',
                unit: 'x10^9/L',
                referenceRange: '4.5 - 11.0',
                flag: 'NORMAL',
              },
              {
                testName: 'Platelet Count',
                result: '120',
                unit: 'x10^9/L',
                referenceRange: '150 - 450',
                flag: 'LOW',
                notes: 'Verified by manual peripheral smear review. Mild isolated thrombocytopenia.',
                coordRef: 'platelet_row',
              },
              {
                testName: 'Absolute Neutrophil Count',
                result: '4.6',
                unit: 'x10^9/L',
                referenceRange: '2.0 - 7.5',
                flag: 'NORMAL',
              },
              {
                testName: 'Absolute Lymphocyte Count',
                result: '1.6',
                unit: 'x10^9/L',
                referenceRange: '1.0 - 4.0',
                flag: 'NORMAL',
              },
            ],
          },
          {
            type: 'paragraph',
            heading: 'PATHOLOGIST COMMENTS & CLINICAL REMARKS',
            paragraphs: [
              'Peripheral blood smear confirms true thrombocytopenia with giant platelets noted occasionally. No schistocytes, teardrop cells, or blast forms observed. White blood cell morphology appears mature and reactive. Re-check platelet count in 2-4 weeks or sooner if signs of cutaneous bleeding or petechiae manifest.',
            ],
          },
        ],
        footerNotes: 'Accredited by College of American Pathologists (CAP #819402). CLIA ID: 05D2938102. Authorized by: Dr. Evelyn Reed, MD, FCAP.',
      },
      {
        pageNumber: 2,
        header: {
          hospitalOrClinic: 'APEX CLINICAL PATHOLOGY LABORATORIES',
          department: 'Division of Clinical Chemistry',
          patientName: 'Alexander Hayes',
          patientId: 'PT-94821-X',
          dob: '1984-06-14 (Age 42)',
          gender: 'Male',
          collectedDate: 'Nov 03, 2026 07:45 AM',
          reportedDate: 'Nov 03, 2026 01:15 PM',
        },
        contentSections: [
          {
            type: 'table',
            heading: 'COMPREHENSIVE METABOLIC PANEL (CMP)',
            rows: [
              {
                testName: 'Glucose (Fasting)',
                result: '94',
                unit: 'mg/dL',
                referenceRange: '70 - 99',
                flag: 'NORMAL',
              },
              {
                testName: 'Blood Urea Nitrogen (BUN)',
                result: '14',
                unit: 'mg/dL',
                referenceRange: '7 - 20',
                flag: 'NORMAL',
              },
              {
                testName: 'Creatinine (Serum)',
                result: '0.91',
                unit: 'mg/dL',
                referenceRange: '0.70 - 1.30',
                flag: 'NORMAL',
                notes: 'eGFR > 90 mL/min/1.73m² (CKD-EPI formula)',
              },
              {
                testName: 'Sodium (Na)',
                result: '140',
                unit: 'mmol/L',
                referenceRange: '136 - 145',
                flag: 'NORMAL',
              },
              {
                testName: 'Potassium (K)',
                result: '4.2',
                unit: 'mmol/L',
                referenceRange: '3.5 - 5.1',
                flag: 'NORMAL',
              },
              {
                testName: 'Chloride (Cl)',
                result: '102',
                unit: 'mmol/L',
                referenceRange: '98 - 107',
                flag: 'NORMAL',
              },
              {
                testName: 'Carbon Dioxide (Total CO2)',
                result: '26',
                unit: 'mmol/L',
                referenceRange: '22 - 29',
                flag: 'NORMAL',
              },
              {
                testName: 'Calcium',
                result: '9.4',
                unit: 'mg/dL',
                referenceRange: '8.6 - 10.2',
                flag: 'NORMAL',
              },
              {
                testName: 'Total Protein',
                result: '7.1',
                unit: 'g/dL',
                referenceRange: '6.4 - 8.3',
                flag: 'NORMAL',
              },
              {
                testName: 'Albumin',
                result: '4.4',
                unit: 'g/dL',
                referenceRange: '3.5 - 5.0',
                flag: 'NORMAL',
              },
            ],
          },
          {
            type: 'paragraph',
            heading: 'LABORATORY METHODOLOGY NOTE',
            paragraphs: [
              'Spectrophotometric ion-selective electrode measurement via Roche Cobas 8000 analyzer. Fasting status confirmed by phlebotomist (10 hr overnight fast). Specimen showed no visible hemolysis, lipemia, or icterus.',
            ],
          },
        ],
        footerNotes: 'Confidential Medical Record. Electronically signed by Chief Biochemist Marcus Vance, PhD.',
      },
    ],
  },
  {
    id: 'doc_rx_2026',
    fileName: 'Prescription_November.pdf',
    title: 'Outpatient Medication Prescription',
    mimeType: 'application/pdf',
    uploadedAt: '2026-11-05T14:15:00Z',
    fileSize: '950 KB',
    status: 'ready',
    pageCount: 1,
    category: 'Prescription',
    patientRef: 'Alexander Hayes, DOB 06/14/1984',
    doctorRef: 'Dr. Emily Vance, MD (DEA: BV8492019)',
    facilityRef: 'Bayview Ambulatory Care Clinic',
    sections: [
      {
        id: 'sec_rx_1',
        pageNumber: 1,
        title: 'Prescribed Medications (Rx)',
        contentType: 'table',
        coordinates: [
          {
            points: [[90, 280], [910, 280], [910, 680], [90, 680]],
            system: 'PixelSpace',
            layout_width: 1000,
            layout_height: 1400,
            label: 'Prescription Rx Section',
          },
        ],
        contentSummary: 'Amoxicillin-Clavulanate 875/125mg PO BID x 10 days; Montelukast 10mg PO QHS x 30 days.',
      },
    ],
    pages: [
      {
        pageNumber: 1,
        header: {
          hospitalOrClinic: 'BAYVIEW AMBULATORY HEALTH SYSTEM',
          department: 'Department of Pulmonary & Family Medicine',
          patientName: 'Alexander Hayes',
          patientId: 'PT-94821-X',
          dob: '1984-06-14 (Age 42)',
          gender: 'Male',
          collectedDate: 'Nov 05, 2026',
          reportedDate: 'Nov 05, 2026',
        },
        contentSections: [
          {
            type: 'keyValue',
            heading: 'CLINICAL ENCOUNTER DETAILS',
            pairs: [
              { key: 'Encounter Diagnosis', value: 'Acute maxillary rhinosinusitis with allergic airway hyperresponsiveness' },
              { key: 'Allergies', value: 'Sulfa antibiotics (hives), Codeine (nausea)' },
              { key: 'Prescribing Physician', value: 'Dr. Emily Vance, MD — Lic #482910' },
            ],
          },
          {
            type: 'rxList',
            heading: 'ACTIVE PRESCRIPTIONS (Rx)',
            rxItems: [
              {
                medication: 'Amoxicillin-Clavulanate (Augmentin)',
                dosage: '875 mg / 125 mg oral tablet',
                frequency: 'Twice daily (every 12 hours) with meals',
                duration: '10 days (Dispense #20 tablets)',
                instructions: 'Take with food to minimize gastrointestinal discomfort. Complete the full 10-day course even if symptoms resolve earlier.',
                coordRef: 'augmentin_rx',
              },
              {
                medication: 'Montelukast Sodium (Singulair)',
                dosage: '10 mg oral tablet',
                frequency: 'Once daily at bedtime (QHS)',
                duration: '30 days (Dispense #30 tablets, Refills: 2)',
                instructions: 'Take at evening with water. Monitor for neuropsychiatric symptom changes. Do not discontinue abruptly.',
                coordRef: 'montelukast_rx',
              },
              {
                medication: 'Fluticasone Propionate Nasal Spray',
                dosage: '50 mcg/actuation',
                frequency: '2 sprays in each nostril once daily',
                duration: '30 days (Dispense 1 bottle, Refills: 1)',
                instructions: 'Blow nose gently before use. Aim spray slightly away from nasal septum.',
              },
            ],
          },
          {
            type: 'paragraph',
            heading: 'WARNINGS & PATIENT GUIDANCE',
            paragraphs: [
              'Avoid NSAIDs like Ibuprofen or Naproxen while on antibiotics if gastric irritation occurs. Acetaminophen (Tylenol) 500mg may be used as needed for sinus pain up to 2000mg/day. Notify the clinic immediately if fever exceeds 101.5°F or facial erythema worsens.',
            ],
          },
        ],
        footerNotes: 'Bayview Health Rx Service. Valid for 6 months from date issued. Electronic signature: Emily Vance, MD.',
      },
    ],
  },
  {
    id: 'doc_xray_2026',
    fileName: 'Chest_XRay_Report.pdf',
    title: 'Chest Radiograph (PA & Lateral) Diagnostic Report',
    mimeType: 'application/pdf',
    uploadedAt: '2026-11-06T10:00:00Z',
    fileSize: '3.2 MB',
    status: 'ready',
    pageCount: 1,
    category: 'Radiology / Imaging',
    patientRef: 'Alexander Hayes, Male, 42y',
    doctorRef: 'Dr. Gregory Thorne, MD (Diagnostic Radiology)',
    facilityRef: 'St. Jude Medical Imaging Center',
    sections: [
      {
        id: 'sec_xray_1',
        pageNumber: 1,
        title: 'Radiological Findings & Impression',
        contentType: 'image',
        coordinates: [
          {
            points: [[100, 320], [900, 320], [900, 850], [100, 850]],
            system: 'PixelSpace',
            layout_width: 1000,
            layout_height: 1400,
            label: 'Radiology Multimodal Scan & Findings',
          },
        ],
        contentSummary: 'PA and lateral chest radiograph demonstrating clear lung parenchymal fields without consolidation, and mild borderline cardiomegaly.',
      },
    ],
    pages: [
      {
        pageNumber: 1,
        header: {
          hospitalOrClinic: 'ST. JUDE REGIONAL DIAGNOSTIC RADIOLOGY',
          department: 'Cardiothoracic Imaging Department',
          patientName: 'Alexander Hayes',
          patientId: 'PT-94821-X',
          dob: '1984-06-14 (Age 42)',
          gender: 'Male',
          collectedDate: 'Nov 06, 2026 09:20 AM',
          reportedDate: 'Nov 06, 2026 11:45 AM',
        },
        contentSections: [
          {
            type: 'keyValue',
            heading: 'EXAMINATION & CLINICAL INDICATION',
            pairs: [
              { key: 'Procedure', value: 'XR CHEST 2 VIEWS (PA AND LATERAL)' },
              { key: 'Indication', value: 'Persistent cough, sinus drainage, rule out lower respiratory tract infection' },
              { key: 'Radiation Dose', value: 'DLP: 0.04 mGy·cm (ALARA compliance verified)' },
            ],
          },
          {
            type: 'radiologyViewer',
            heading: 'MULTIMODAL IMAGING VISUALIZATION & SCAN SCHEMATIC',
            radiologyData: {
              modality: 'Digital Radiography (DR)',
              view: 'Posterior-Anterior (PA) & Lateral Projection',
              anatomy: 'Thoracic Cavity, Bronchovascular Bundles, Diaphragm',
              findings: 'Lungs are well-expanded. No focal consolidations, lobar infiltrates, or suspicious mass lesions. Pleural spaces are clear with sharp bilateral costophrenic angles. The cardiothoracic ratio is approximately 0.52, representing borderline/mild cardiomegaly. Hilar and mediastinal contours are unremarkable. Bony thorax shows no acute fractures or destructive osseous lesions.',
              impression: '1. No radiographic evidence of acute pneumonia or active pulmonary edema. 2. Borderline mild cardiac enlargement without vascular congestion. Correlation with clinical blood pressure control is suggested.',
              coordRef: 'xray_findings_box',
            },
          },
          {
            type: 'paragraph',
            heading: 'RADIOLOGIST ATTESTATION',
            paragraphs: [
              'I have personally reviewed and interpreted these radiographs on a high-resolution Barco diagnostic workstation. Dictated and electronically finalized by Gregory Thorne, MD (American Board of Radiology).',
            ],
          },
        ],
        footerNotes: 'St. Jude Diagnostic Imaging. PACs ID: IMG-994021. For clinical inquiries call 1-800-555-RADS.',
      },
    ],
  },
  {
    id: 'doc_discharge_2026',
    fileName: 'Discharge_Summary.pdf',
    title: 'Inpatient Hospital Discharge Summary',
    mimeType: 'application/pdf',
    uploadedAt: '2026-10-28T16:45:00Z',
    fileSize: '1.4 MB',
    status: 'ready',
    pageCount: 1,
    category: 'Clinical Summary',
    patientRef: 'Alexander Hayes, PT-94821',
    doctorRef: 'Dr. Christopher Vance, MD',
    facilityRef: 'University Hospital Center',
    sections: [
      {
        id: 'sec_disch_1',
        pageNumber: 1,
        title: 'Hospital Course & Discharge Plan',
        contentType: 'text',
        coordinates: [
          {
            points: [[90, 260], [910, 260], [910, 650], [90, 650]],
            system: 'PixelSpace',
            layout_width: 1000,
            layout_height: 1400,
            label: 'Discharge Summary Text',
          },
        ],
        contentSummary: 'Hospital course for acute asthmatic exacerbation; vital signs stabilized; follow-up scheduled with primary care in 14 days.',
      },
    ],
    pages: [
      {
        pageNumber: 1,
        header: {
          hospitalOrClinic: 'UNIVERSITY HOSPITAL HEALTH SYSTEM',
          department: 'Division of Acute Care Medicine',
          patientName: 'Alexander Hayes',
          patientId: 'PT-94821-X',
          dob: '1984-06-14 (Age 42)',
          gender: 'Male',
          collectedDate: 'Oct 26, 2026 (Admission)',
          reportedDate: 'Oct 28, 2026 (Discharge)',
        },
        contentSections: [
          {
            type: 'keyValue',
            heading: 'ADMISSION & DISCHARGE SYNOPSIS',
            pairs: [
              { key: 'Admission Diagnosis', value: 'Moderate acute bronchial asthma exacerbation secondary to viral URI' },
              { key: 'Discharge Condition', value: 'Stable, ambulatory, resting comfortably on ambient room air (SpO2 98%)' },
              { key: 'Discharge Vitals', value: 'BP 128/82 mmHg, HR 72 bpm, RR 14/min, Temp 98.4°F' },
            ],
          },
          {
            type: 'paragraph',
            heading: 'BRIEF HOSPITAL COURSE',
            paragraphs: [
              'The patient presented with wheezing and shortness of breath. Initiated on nebulized bronchodilators and a short course of oral systemic corticosteroid (Prednisone 40mg daily for 5 days). Chest symptoms rapidly resolved over 36 hours. Peak flow improved from 320 L/min on presentation to 510 L/min at discharge. Blood cultures remained negative.',
            ],
          },
          {
            type: 'paragraph',
            heading: 'POST-DISCHARGE INSTRUCTIONS & FOLLOW-UP',
            paragraphs: [
              'Follow-up appointment with primary care physician Dr. Marcus in 2 weeks. Continue maintenance controller inhaler. Avoid known allergens and tobacco smoke. Return to emergency department immediately if shortness of breath recurs.',
            ],
          },
        ],
        footerNotes: 'Electronic Health Record certified. Attending Physician: Christopher Vance, MD.',
      },
    ],
  },
];

// Realistic Pre-computed Citations for Grounded Retrieval
export const SAMPLE_CITATIONS: Record<string, Citation> = {
  platelet_low: {
    id: 'cit_platelet_low',
    documentId: 'doc_cbc_2026',
    elementId: 'platelet_row',
    documentName: 'CBC_Blood_Report.pdf',
    pageNumber: 1,
    contentType: 'table',
    coordinates: [
      {
        points: [[75, 520], [925, 520], [925, 590], [75, 590]],
        system: 'PixelSpace',
        layout_width: 1000,
        layout_height: 1400,
        label: 'Platelet Count: 120 x10^9/L (LOW, ref: 150 - 450)',
      },
    ],
    excerpt: 'Platelet Count: 120 x10^9/L [Ref: 150 - 450]. Flag: LOW. Verified by manual peripheral smear review. Mild isolated thrombocytopenia.',
    finding: 'Platelet Count of 120 x10^9/L is below the normal laboratory reference range (150 - 450 x10^9/L).',
  },
  hemoglobin_normal: {
    id: 'cit_hb_normal',
    documentId: 'doc_cbc_2026',
    elementId: 'hb_row',
    documentName: 'CBC_Blood_Report.pdf',
    pageNumber: 1,
    contentType: 'table',
    coordinates: [
      {
        points: [[75, 365], [925, 365], [925, 415], [75, 415]],
        system: 'PixelSpace',
        layout_width: 1000,
        layout_height: 1400,
        label: 'Hemoglobin: 14.2 g/dL (NORMAL, ref: 13.5 - 17.5)',
      },
    ],
    excerpt: 'Hemoglobin (Hb): 14.2 g/dL [Reference range: 13.5 - 17.5 g/dL]. Result status: NORMAL.',
    finding: 'Hemoglobin level is 14.2 g/dL, well within the normal adult male reference range.',
  },
  metabolic_glucose: {
    id: 'cit_glucose_normal',
    documentId: 'doc_cbc_2026',
    elementId: 'glucose_row',
    documentName: 'CBC_Blood_Report.pdf',
    pageNumber: 2,
    contentType: 'table',
    coordinates: [
      {
        points: [[80, 255], [920, 255], [920, 305], [80, 305]],
        system: 'PixelSpace',
        layout_width: 1000,
        layout_height: 1400,
        label: 'Fasting Glucose: 94 mg/dL (NORMAL, ref: 70 - 99)',
      },
    ],
    excerpt: 'Glucose (Fasting): 94 mg/dL [Reference range: 70 - 99 mg/dL]. Fasting status confirmed (10 hr overnight fast).',
    finding: 'Fasting blood glucose is 94 mg/dL, indicating normal glycemic control.',
  },
  augmentin_rx: {
    id: 'cit_augmentin_rx',
    documentId: 'doc_rx_2026',
    elementId: 'augmentin_rx',
    documentName: 'Prescription_November.pdf',
    pageNumber: 1,
    contentType: 'table',
    coordinates: [
      {
        points: [[90, 360], [910, 360], [910, 460], [90, 460]],
        system: 'PixelSpace',
        layout_width: 1000,
        layout_height: 1400,
        label: 'Amoxicillin-Clavulanate 875/125mg BID x 10 days',
      },
    ],
    excerpt: 'Amoxicillin-Clavulanate (Augmentin) 875 mg / 125 mg oral tablet. Twice daily with meals for 10 days (#20 tablets). Take with food.',
    finding: 'Prescribed Augmentin 875/125mg twice daily for 10 days to treat acute maxillary rhinosinusitis.',
  },
  xray_chest_scan: {
    id: 'cit_xray_scan',
    documentId: 'doc_xray_2026',
    elementId: 'xray_findings_box',
    documentName: 'Chest_XRay_Report.pdf',
    pageNumber: 1,
    contentType: 'image',
    coordinates: [
      {
        points: [[60, 430], [940, 430], [940, 780], [60, 780]],
        system: 'PixelSpace',
        layout_width: 1000,
        layout_height: 1400,
        label: 'Chest X-Ray Findings: Clear lung fields, borderline cardiomegaly',
      },
    ],
    excerpt: 'PA and lateral views: Lungs are well-expanded with sharp costophrenic angles. Cardiothoracic ratio 0.52 (borderline mild cardiomegaly). No pneumonia or effusion.',
    imageSummary: 'Digital Radiography (PA & Lateral): clear bilateral lung parenchymal fields without acute infiltrate or consolidation.',
    finding: 'Clear lungs with no active consolidation or pneumonia; mild borderline cardiac enlargement noted.',
  },
};

// Seed conversation showcasing multi-source citations
export const SEED_CONVERSATION: ChatConversation = {
  id: 'conv_primary_demo',
  title: 'Complete Blood Count & Health Review',
  createdAt: '2026-11-09T14:00:00Z',
  updatedAt: '2026-11-09T14:15:00Z',
  selectedDocumentIds: ['doc_cbc_2026', 'doc_rx_2026', 'doc_xray_2026'],
  messages: [
    {
      id: 'msg_1',
      role: 'user',
      content: 'Can you summarize what my latest complete blood count report indicates, especially any abnormal values?',
      createdAt: '2026-11-09T14:05:00Z',
    },
    {
      id: 'msg_2',
      role: 'assistant',
      content: `Based on your **Complete Blood Count (CBC) with Automated Differential** report, here is an objective summary of your findings:

### 1. Key Laboratory Findings
* **Platelet Count:** Your platelet count is **120 x10^9/L**, which is flagged as **LOW** compared to the reference interval of **150 – 450 x10^9/L** [1]. The laboratory remarks indicate this was confirmed by a manual peripheral blood smear review, noting mild isolated thrombocytopenia with occasional giant platelets, but with no blast forms or schistocytes [1].
* **Hemoglobin & Red Blood Cells:** Your hemoglobin is **14.2 g/dL** (reference interval 13.5 – 17.5 g/dL) and hematocrit is **42.8%**, both resting comfortably within standard expected limits [2].
* **White Blood Cell Count:** Total WBC count is normal at **6.8 x10^9/L** with mature cell morphology [2].
* **Metabolic & Renal Profile:** Fasting blood glucose is well-regulated at **94 mg/dL** (normal range 70 – 99 mg/dL) with normal serum creatinine (0.91 mg/dL) on Page 2 [3].

### 2. Clinical Context & Cross-Document Insights
* Your active outpatient prescription lists **Amoxicillin-Clavulanate 875/125mg** for acute rhinosinusitis [4].
* The concomitant **Chest Radiograph** confirms clear lung parenchymal fields without acute infiltrate or pneumonic consolidation, noting only borderline mild cardiomegaly [5].

> **Clinical Guidance Note:** The mild thrombocytopenia (120 x10^9/L) is categorized as mild. Your physician's note recommends re-checking platelets in 2 to 4 weeks. Please consult your physician for individualized medical guidance.`,
      citations: [
        SAMPLE_CITATIONS.platelet_low,
        SAMPLE_CITATIONS.hemoglobin_normal,
        SAMPLE_CITATIONS.metabolic_glucose,
        SAMPLE_CITATIONS.augmentin_rx,
        SAMPLE_CITATIONS.xray_chest_scan,
      ],
      createdAt: '2026-11-09T14:05:04Z',
      status: 'complete',
      suggestedFollowUps: [
        'What could cause a mild drop in platelet count?',
        'Does my antibiotic interact with any of my other medications?',
        'Show me the radiologist note for the chest X-ray',
      ],
      retrievalMetadata: {
        searchedDocuments: ['CBC_Blood_Report.pdf', 'Prescription_November.pdf', 'Chest_XRay_Report.pdf'],
        latencyMs: 380,
      },
    },
  ],
};
