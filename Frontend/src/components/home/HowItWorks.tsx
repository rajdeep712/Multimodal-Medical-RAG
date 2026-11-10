import React from 'react';
import { motion } from 'motion/react';
import { UploadCloud, MessageSquareText, SearchCode } from 'lucide-react';

const STEPS = [
  {
    step: '01',
    title: 'Upload Your Documents',
    description: 'Drag and drop lab reports, discharge notes, prescriptions, or imaging summaries into your secure workspace.',
    icon: UploadCloud,
    previewBadge: 'PDF, Images, Tables',
    detail: 'Automated OCR & multimodal vector embedding',
  },
  {
    step: '02',
    title: 'Ask Your Questions',
    description: 'Ask complex clinical questions in plain English or filter retrieval by specific documents or date intervals.',
    icon: MessageSquareText,
    previewBadge: 'Natural Language',
    detail: 'Semantic search with cross-document synthesis',
  },
  {
    step: '03',
    title: 'Explore Answers With Evidence',
    description: 'Click any citation badge to jump straight to the source document, page, and exact bounding box highlight.',
    icon: SearchCode,
    previewBadge: 'Interactive Bounding Box',
    detail: 'Instant verification of every clinical claim',
  },
];

export const HowItWorks: React.FC = () => {
  return (
    <section id="how-it-works" className="py-20 bg-[#F7FAFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DDF5EB] text-[#16A34A] text-xs font-semibold mb-3">
            Simple 3-Step Workflow
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#123047] tracking-tight">
            How MediLens AI Works
          </h2>
          <p className="mt-4 text-base sm:text-lg text-[#64748B]">
            From document upload to interactive citation navigation in three transparent steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector line between the steps (desktop) */}
          <div
            className="hidden md:block absolute top-24 left-[18%] right-[18%] h-px bg-gradient-to-r from-[#BDEFE7] via-[#087F8C]/40 to-[#BDEFE7]"
            aria-hidden
          />
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: idx * 0.12 }}
                className="relative bg-white rounded-2xl p-8 border border-[#E2E8F0] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-3xl font-black text-[#DDF4F5] tracking-tight">
                      {step.step}
                    </span>
                    <div className="relative z-10 w-12 h-12 rounded-xl bg-[#DDF4F5] text-[#087F8C] flex items-center justify-center font-bold ring-4 ring-[#F7FAFC]">
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-[#123047] mb-3">
                    {step.title}
                  </h3>
                  <p className="text-sm text-[#64748B] leading-relaxed mb-6">
                    {step.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#F1F5F9] flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#087F8C] bg-[#DDF4F5] px-2.5 py-1 rounded-md">
                    {step.previewBadge}
                  </span>
                  <span className="text-[#64748B] text-[11px]">{step.detail}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
