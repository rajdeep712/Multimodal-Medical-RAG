import React from 'react';
import {
  Layers,
  Search,
  FileCheck,
  ImageIcon,
  Lock,
  MousePointerClick,
  FileText,
  Table,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Layers,
    title: 'Multimodal Understanding',
    description: 'Analyze text, tables, clinical images, and complex medical documents within a unified embedding space.',
    badge: 'Text & Visuals',
  },
  {
    icon: Search,
    title: 'Intelligent Medical Search',
    description: 'Retrieve relevant information using advanced semantic, keyword, and multimodal clinical retrieval.',
    badge: 'Sub-second Retrieval',
  },
  {
    icon: FileCheck,
    title: 'Source-Grounded Answers',
    description: 'Explore answers with inline citations directly mapped to original document locations and reference intervals.',
    badge: '100% Traceable',
  },
  {
    icon: ImageIcon,
    title: 'Medical Image Intelligence',
    description: 'Understand relevant visual content, including radiographs and scanned charts, alongside accompanying clinical text.',
    badge: 'Imaging Reports',
  },
  {
    icon: Lock,
    title: 'Secure Document Workspace',
    description: 'Organize, inspect, and manage documents within a private, authenticated workspace with tenant-level isolation.',
    badge: 'Private & Isolated',
  },
  {
    icon: MousePointerClick,
    title: 'Interactive Document Exploration',
    description: 'Navigate directly to the supporting page, table, image, or text passage with automatic bounding box highlights.',
    badge: 'Direct Jump',
  },
];

export const FeatureCards: React.FC = () => {
  return (
    <section id="features" className="py-20 bg-white border-y border-[#E2E8F0]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DDF4F5] text-[#087F8C] text-xs font-semibold mb-3">
            Core Capabilities
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#123047] tracking-tight">
            Intelligence Across Every Medical Document
          </h2>
          <p className="mt-4 text-base sm:text-lg text-[#64748B]">
            From complete blood counts to complex discharge summaries and radiological impressions, MediLens AI bridges clinical documents with verified AI synthesis.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div
                key={idx}
                className="group relative p-7 rounded-2xl bg-[#F7FAFC] border border-[#E2E8F0] hover:border-[#087F8C]/40 hover:bg-white hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-[#DDF4F5] text-[#087F8C] flex items-center justify-center group-hover:scale-110 group-hover:bg-[#087F8C] group-hover:text-white transition-all duration-300">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#087F8C] bg-white px-2.5 py-1 rounded-full border border-[#BDEFE7]">
                      {feat.badge}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-[#123047] mb-2 group-hover:text-[#087F8C] transition-colors">
                    {feat.title}
                  </h3>
                  <p className="text-sm text-[#64748B] leading-relaxed">
                    {feat.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
