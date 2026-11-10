import { ChatMessage, ChatConversation } from '../types/chat.ts';
import { Citation } from '../types/document.ts';
import { SEED_CONVERSATION, SAMPLE_CITATIONS } from './mockData.ts';
import { delay } from './api.ts';

let conversationsStore: ChatConversation[] = [{ ...SEED_CONVERSATION }];

interface GenerateResponseOptions {
  conversationId: string;
  query: string;
  selectedDocIds?: string[];
  dateFilter?: { startDate?: string; endDate?: string };
  onChunk?: (chunk: string, accumulated: string) => void;
  onCitation?: (citation: Citation) => void;
}

export const chatService = {
  async getConversations(): Promise<ChatConversation[]> {
    await delay(100);
    return [...conversationsStore];
  },

  async getConversation(id: string): Promise<ChatConversation | null> {
    await delay(50);
    return conversationsStore.find((c) => c.id === id) || null;
  },

  async createConversation(title = 'New Consultation'): Promise<ChatConversation> {
    await delay(100);
    const newConv: ChatConversation = {
      id: `conv_${Date.now()}`,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      selectedDocumentIds: ['doc_cbc_2026', 'doc_rx_2026', 'doc_xray_2026'],
    };
    conversationsStore = [newConv, ...conversationsStore];
    return newConv;
  },

  async deleteConversation(id: string): Promise<boolean> {
    await delay(80);
    const lenBefore = conversationsStore.length;
    conversationsStore = conversationsStore.filter((c) => c.id !== id);
    return conversationsStore.length < lenBefore;
  },

  async renameConversation(id: string, newTitle: string): Promise<boolean> {
    await delay(50);
    const conv = conversationsStore.find((c) => c.id === id);
    if (conv) {
      conv.title = newTitle;
      conv.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  },

  async queryMedicalRAG(options: GenerateResponseOptions): Promise<ChatMessage> {
    const { conversationId, query, onChunk } = options;
    const lower = query.toLowerCase();

    // Determine relevant response and citations based on query context
    let fullText = '';
    let citations: Citation[] = [];
    let followUps: string[] = [];

    if (lower.includes('abnormal') || lower.includes('platelet') || lower.includes('cbc')) {
      citations = [SAMPLE_CITATIONS.platelet_low, SAMPLE_CITATIONS.hemoglobin_normal];
      fullText = `### Analysis of Abnormal Findings in Complete Blood Count

Upon analyzing your laboratory results from **CBC_Blood_Report.pdf**:

1. **Platelet Count (Isolated Mild Thrombocytopenia):**
   * **Measured Result:** **120 x10^9/L**
   * **Reference Interval:** **150 – 450 x10^9/L** [1]
   * **Flag:** **LOW**
   * **Clinical Significance:** The laboratory peripheral smear review notes mild isolated thrombocytopenia with occasional giant platelets, but critically mentions that no schistocytes, blast forms, or microangiopathic changes are present [1].

2. **Normal Co-parameters:**
   * Hemoglobin is healthy and stable at **14.2 g/dL** (reference 13.5 – 17.5 g/dL) [2].
   * Hematocrit is **42.8%** and Total WBC count is **6.8 x10^9/L** [2].

> **Recommendation:** In the absence of petechiae, bruising, or spontaneous epistaxis, the ordering clinician advises repeat testing in 2–4 weeks.`;

      followUps = [
        'Could any medication affect my platelet count?',
        'What symptoms should prompt urgent evaluation?',
        'Show me the metabolic panel from page 2',
      ];
    } else if (lower.includes('medication') || lower.includes('prescription') || lower.includes('rx') || lower.includes('augmentin')) {
      citations = [SAMPLE_CITATIONS.augmentin_rx, SAMPLE_CITATIONS.xray_chest_scan];
      fullText = `### Documented Medications & Outpatient Regimen

According to **Prescription_November.pdf** issued by Dr. Emily Vance:

1. **Amoxicillin-Clavulanate (Augmentin):**
   * **Dosing:** **875 mg / 125 mg** oral tablet [1].
   * **Schedule:** Twice daily (every 12 hours) with meals for **10 days** (#20 tablets total).
   * **Indication:** Acute maxillary rhinosinusitis.
   * **Special Instructions:** Take with food to minimize nausea or GI distress; finish the complete 10-day regimen [1].

2. **Montelukast Sodium (Singulair):**
   * **Dosing:** 10 mg oral tablet once daily at bedtime (QHS) for 30 days.

3. **Related Imaging Check:**
   * The chest radiograph ruled out acute lower respiratory infection, indicating symptoms stem primarily from upper sinus congestion [2].`;

      followUps = [
        'Are there any drug interactions with Augmentin?',
        'What should I do if I miss a morning dose?',
        'Show me the doctor signature and prescription details',
      ];
    } else if (lower.includes('xray') || lower.includes('x-ray') || lower.includes('chest') || lower.includes('lungs') || lower.includes('heart')) {
      citations = [SAMPLE_CITATIONS.xray_chest_scan, SAMPLE_CITATIONS.hemoglobin_normal];
      fullText = `### Chest Radiograph Diagnostic Review

From the official diagnostic radiology report **Chest_XRay_Report.pdf** (Dr. Gregory Thorne):

* **Technique:** PA and Lateral views of the thoracic cage [1].
* **Pulmonary Parenchyma:** Clear bilateral lung fields. No focal consolidations, acute air-space opacity, lobar infiltrates, or pleural effusion [1].
* **Cardiomediastinal Silhouette:** The cardiothoracic ratio is calculated at **0.52**, which is noted as borderline mild cardiomegaly without overt vascular congestion or pulmonary venous hypertension [1].
* **Systemic Correlation:** Good oxygen delivery is supported by normal hemoglobin of **14.2 g/dL** from your hematology workup [2].

> **Radiologist Summary:** No radiographic evidence of acute pneumonia. Mild borderline cardiomegaly suggests blood pressure follow-up.`;

      followUps = [
        'What does a cardiothoracic ratio of 0.52 mean?',
        'Does this rule out bacterial bronchitis?',
        'Compare this with my hospital discharge notes',
      ];
    } else {
      // General synthesis
      citations = [SAMPLE_CITATIONS.platelet_low, SAMPLE_CITATIONS.augmentin_rx, SAMPLE_CITATIONS.xray_chest_scan];
      fullText = `### Synthesis Across Uploaded Medical Documents

In response to your query regarding: **"${query}"**:

1. **Hematology Overview:**
   * Your Complete Blood Count shows normal hemoglobin and WBC, with a mildly reduced platelet count of **120 x10^9/L** [1].
2. **Current Therapy:**
   * You are currently prescribed **Augmentin 875/125mg BID** for 10 days for sinusitis [2].
3. **Cardiothoracic Findings:**
   * Chest imaging demonstrates clear lung fields with no consolidation, alongside a borderline cardiothoracic index of 0.52 [3].

All retrieved passages are highlighted in the document viewer. Click on any citation badge to inspect the original clinical text.`;

      followUps = [
        'Explain the abnormal values in my CBC',
        'What medications are mentioned in my prescription?',
        'Summarize findings from the chest X-ray',
      ];
    }

    // Stream text simulation
    const words = fullText.split(' ');
    let currentAccumulated = '';
    const chunkSize = 4;

    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ') + ' ';
      currentAccumulated += chunk;
      onChunk?.(chunk, currentAccumulated);
      await delay(25);
    }

    const assistantMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: fullText,
      citations,
      createdAt: new Date().toISOString(),
      status: 'complete',
      suggestedFollowUps: followUps,
      retrievalMetadata: {
        searchedDocuments: options.selectedDocIds || ['CBC_Blood_Report.pdf', 'Prescription_November.pdf'],
        latencyMs: 290,
      },
    };

    // Update conversation store
    const conv = conversationsStore.find((c) => c.id === conversationId);
    if (conv) {
      conv.messages.push(assistantMsg);
      conv.updatedAt = new Date().toISOString();
    }

    return assistantMsg;
  },

  async addUserMessage(conversationId: string, content: string): Promise<ChatMessage> {
    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      status: 'complete',
    };

    const conv = conversationsStore.find((c) => c.id === conversationId);
    if (conv) {
      conv.messages.push(userMsg);
      conv.updatedAt = new Date().toISOString();
    }

    return userMsg;
  },
};
