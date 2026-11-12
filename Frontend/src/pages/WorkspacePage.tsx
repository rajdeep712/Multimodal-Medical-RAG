import React from 'react';
import { DocumentProvider } from '../stores/useDocumentStore.ts';
import { CitationProvider } from '../stores/useCitationStore.ts';
import { WorkspaceLayout } from '../components/layout/WorkspaceLayout.tsx';

/**
 * The chat provider lives at the App level (so an in-flight answer stream
 * survives the /workspace -> /c/:chatId navigation); this page only mounts
 * the document/citation providers around the layout.
 */
export const WorkspacePage: React.FC = () => {
  return (
    <DocumentProvider>
      <CitationProvider>
        <WorkspaceLayout />
      </CitationProvider>
    </DocumentProvider>
  );
};
