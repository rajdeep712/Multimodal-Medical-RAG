import React from 'react';
import { DocumentProvider } from '../stores/useDocumentStore.ts';
import { CitationProvider } from '../stores/useCitationStore.ts';
import { ChatProvider } from '../stores/useChatStore.ts';
import { WorkspaceLayout } from '../components/layout/WorkspaceLayout.tsx';

export const WorkspacePage: React.FC = () => {
  return (
    <DocumentProvider>
      <CitationProvider>
        <ChatProvider>
          <WorkspaceLayout />
        </ChatProvider>
      </CitationProvider>
    </DocumentProvider>
  );
};
