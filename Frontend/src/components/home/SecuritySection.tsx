import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, UserCheck, KeyRound, Lock, ArrowRight, EyeOff } from 'lucide-react';

const SECURITY_PILLARS = [
  {
    icon: UserCheck,
    title: 'Authenticated Document Access',
    description: 'Every medical record is strictly bound to verified user sessions, preventing unauthorized access across accounts.',
  },
  {
    icon: Lock,
    title: 'User-Specific Document Isolation',
    description: 'Multi-tenant architecture enforces rigid boundaries at both the document storage and vector database layers.',
  },
  {
    icon: KeyRound,
    title: 'Controlled Retrieval & Grounding',
    description: 'Answers are generated strictly from the user’s selected document context, preventing out-of-domain hallucinations.',
  },
  {
    icon: EyeOff,
    title: 'Privacy-Conscious Architecture',
    description: 'Designed from the ground up for minimal data exposure, localized document indexing, and ephemeral memory modes.',
  },
];

export const SecuritySection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section id="security" className="py-20 bg-gradient-to-b from-[#F7FAFC] to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DDF4F5] text-[#087F8C] text-xs font-semibold mb-3">
            Trust & Security Architecture
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#123047] tracking-tight">
            Built With Healthcare Privacy in Mind
          </h2>
          <p className="mt-4 text-base sm:text-lg text-[#64748B]">
            Medical records contain sensitive personal health information. MediLens AI treats data isolation and privacy as foundational engineering principles.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {SECURITY_PILLARS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs hover:shadow-md transition-all flex flex-col justify-start"
              >
                <div className="w-11 h-11 rounded-xl bg-[#DDF4F5] text-[#087F8C] flex items-center justify-center mb-5 shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[#123047] mb-2">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Final CTA Banner */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#123047] via-[#0E2436] to-[#087F8C] text-white p-8 sm:p-14 shadow-2xl">
          <div className="relative z-10 max-w-3xl">
            <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Turn Complex Medical Documents Into Clearer Answers.
            </h3>
            <p className="text-base sm:text-lg text-slate-200 mb-8 max-w-2xl leading-relaxed">
              Explore your complete blood counts, prescriptions, and radiology reports in a unified multimodal AI workspace.
            </p>
            <button
              onClick={() => navigate('/auth/signup')}
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-base font-bold bg-[#087F8C] text-white hover:bg-[#0AA1B2] transition-all shadow-lg hover:shadow-xl transform active:scale-98"
            >
              <span>Get Started for Free</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Decorative geometric patterns */}
          <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-15 pointer-events-none hidden md:block">
            <div className="w-full h-full bg-[radial-gradient(#DDF4F5_1px,transparent_1px)] [background-size:16px_16px]" />
          </div>
        </div>
      </div>
    </section>
  );
};
