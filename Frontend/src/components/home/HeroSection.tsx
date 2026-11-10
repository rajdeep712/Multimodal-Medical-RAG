import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  CheckCircle2,
  Search,
  ExternalLink,
  Activity,
  FileCheck2,
} from 'lucide-react';

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-16 md:pb-28 bg-gradient-to-b from-[#F7FAFC] via-white to-[#F7FAFC]">
      {/* Subtle background decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-tr from-[#DDF4F5]/40 via-transparent to-[#DDF5EB]/40 blur-3xl -z-10 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Headline and CTAs */}
          <div className="lg:col-span-6 flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#DDF4F5] border border-[#BDEFE7] text-[#087F8C] text-xs font-semibold mb-6 tracking-wide shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#087F8C]" />
              <span>AI-Powered Medical Document Intelligence</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#123047] tracking-tight leading-[1.15] mb-6">
              Your Medical Documents.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#087F8C] to-[#0AA1B2]">
                Understood by AI.
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-[#64748B] mb-8 leading-relaxed max-w-xl">
              Upload medical reports, prescriptions, and clinical documents. Ask questions in natural language, discover meaningful insights, and explore AI answers backed by precise document citations.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto mb-10">
              <button
                onClick={() => navigate('/workspace')}
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold bg-[#087F8C] text-white hover:bg-[#066570] transition-all shadow-md hover:shadow-lg transform active:scale-98"
              >
                <span>Start Exploring</span>
                <ArrowRight className="w-5 h-5" />
              </button>
              <a
                href="#showcase"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-base font-medium text-[#123047] bg-white border border-[#E2E8F0] hover:bg-[#F7FAFC] hover:border-[#CBD5E1] transition-all shadow-xs"
              >
                <span>See How It Works</span>
              </a>
            </div>

            {/* Three compact trust highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-[#E2E8F0] w-full">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#DDF4F5] flex items-center justify-center text-[#087F8C] shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-[#334155]">Multimodal Document Understanding</span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#DDF5EB] flex items-center justify-center text-[#16A34A] shrink-0">
                  <FileCheck2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-[#334155]">Citation-Grounded Answers</span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[#123047] shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-[#334155]">Privacy-Focused Architecture</span>
              </div>
            </div>
          </div>

          {/* Right Column: Centerpiece realistic product mockup preview */}
          <div className="lg:col-span-6 relative">
            {/* Ambient glow behind card */}
            <div className="absolute -inset-2 bg-gradient-to-r from-[#087F8C]/20 via-[#0AA1B2]/10 to-[#123047]/10 rounded-2xl blur-xl opacity-70" />

            <div className="relative bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl overflow-hidden transition-all">
              {/* Mockup Window Titlebar */}
              <div className="px-4 py-3 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#EF4444]" />
                  <span className="w-3 h-3 rounded-full bg-[#F59E0B]" />
                  <span className="w-3 h-3 rounded-full bg-[#10B981]" />
                  <span className="ml-2 text-xs font-semibold text-[#64748B] flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#087F8C]" />
                    MediLens Workspace — CBC_Blood_Report.pdf
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                  <span className="px-2 py-0.5 rounded bg-white font-medium border border-[#E2E8F0]">Page 1 of 2</span>
                  <span className="px-2 py-0.5 rounded bg-[#DDF5EB] text-[#16A34A] font-semibold text-[11px]">Vector Ready</span>
                </div>
              </div>

              {/* Mockup Split Screen Body */}
              <div className="grid grid-cols-1 md:grid-cols-12 min-h-[420px] bg-[#F7FAFC]">
                {/* Left side of preview: Chat */}
                <div className="md:col-span-6 p-4 border-r border-[#E2E8F0] flex flex-col justify-between bg-white">
                  <div className="space-y-3">
                    {/* User bubble */}
                    <div className="flex justify-end">
                      <div className="bg-[#DDF4F5] text-[#123047] text-xs font-medium px-3 py-2 rounded-2xl rounded-tr-sm max-w-[90%] shadow-xs">
                        What does my complete blood count indicate about my platelets?
                      </div>
                    </div>

                    {/* Assistant bubble */}
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-md bg-[#123047] text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
                        AI
                      </div>
                      <div className="space-y-1.5 text-xs text-[#334155] leading-relaxed">
                        <p>
                          Your platelet count is recorded at <strong>120 x10^9/L</strong>, which is categorized as mildly low against the standard reference interval of 150 – 450 x10^9/L{' '}
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-[#087F8C] text-white font-bold text-[10px] cursor-pointer hover:bg-[#066570] transition-colors">
                            [1]
                          </span>
                          .
                        </p>
                        <p className="text-[11px] text-[#64748B]">
                          Peripheral smear review confirmed true isolated thrombocytopenia with occasional giant platelets, but with mature WBC morphology{' '}
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-[#087F8C] text-white font-bold text-[10px] cursor-pointer hover:bg-[#066570] transition-colors">
                            [2]
                          </span>
                          .
                        </p>
                      </div>
                    </div>

                    {/* Sources Badge */}
                    <div className="p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                      <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider flex items-center gap-1">
                        <Search className="w-3 h-3 text-[#087F8C]" />
                        Retrieved Evidence (2 sources)
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#087F8C] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#087F8C]" />
                        CBC_Blood_Report.pdf • Page 1, Table 1
                      </div>
                    </div>
                  </div>

                  {/* Mock Chat input */}
                  <div className="mt-3 pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#94A3B8]">
                    <span>Ask follow-up question...</span>
                    <div className="w-5 h-5 rounded bg-[#087F8C] text-white flex items-center justify-center">
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>

                {/* Right side of preview: Document Viewer with Citation Highlight */}
                <div className="md:col-span-6 p-4 bg-[#F8FAFC] flex flex-col justify-between relative overflow-hidden">
                  <div className="bg-white rounded-lg p-3 border border-[#E2E8F0] shadow-sm space-y-2 text-[11px] relative">
                    {/* Document Header in preview */}
                    <div className="border-b border-slate-200 pb-1.5 flex justify-between items-center text-[10px] text-slate-500">
                      <span className="font-bold text-[#123047]">APEX CLINICAL PATHOLOGY</span>
                      <span>PATIENT: HAYES, A.</span>
                    </div>

                    {/* Table rows */}
                    <div className="space-y-1">
                      <div className="grid grid-cols-4 text-[9px] font-semibold text-slate-400 uppercase">
                        <span className="col-span-2">Test Name</span>
                        <span>Result</span>
                        <span>Ref</span>
                      </div>
                      <div className="grid grid-cols-4 text-[10px] text-slate-600">
                        <span className="col-span-2">Hemoglobin</span>
                        <span className="font-medium text-slate-800">14.2 g/dL</span>
                        <span>13.5-17.5</span>
                      </div>

                      {/* Highlighted Bounding Box */}
                      <div className="relative bg-[#DDF4F5] border-2 border-[#087F8C] rounded p-1 -mx-1 shadow-xs">
                        <div className="absolute -top-2.5 right-1 px-1.5 py-0.2 bg-[#087F8C] text-white text-[9px] font-bold rounded shadow-xs flex items-center gap-1">
                          Citation [1]
                        </div>
                        <div className="grid grid-cols-4 text-[10px] font-semibold text-[#123047]">
                          <span className="col-span-2 text-[#087F8C]">Platelet Count</span>
                          <span className="text-[#DC2626] font-bold">120 L</span>
                          <span>150-450</span>
                        </div>
                        <div className="text-[9px] text-[#087F8C] mt-0.5 font-medium italic">
                          smear verified • isolated thrombocytopenia
                        </div>
                      </div>

                      <div className="grid grid-cols-4 text-[10px] text-slate-600">
                        <span className="col-span-2">WBC Count</span>
                        <span className="font-medium text-slate-800">6.8 x10^9</span>
                        <span>4.5-11.0</span>
                      </div>
                    </div>
                  </div>

                  {/* Floating badge bottom right */}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-[#64748B]">
                    <span className="flex items-center gap-1 text-[#16A34A] font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Grounded in PDF
                    </span>
                    <button
                      onClick={() => navigate('/workspace')}
                      className="text-[#087F8C] hover:underline font-semibold flex items-center gap-1"
                    >
                      Try Interactive Demo
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating decorative tags */}
            <div className="absolute -bottom-4 -left-4 bg-white/95 backdrop-blur-sm px-3.5 py-2 rounded-xl border border-[#CBD5E1] shadow-lg flex items-center gap-2 text-xs font-semibold text-[#123047] hidden sm:flex">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping" />
              <span>Multi-bounding box precision</span>
            </div>

            <div className="absolute -top-4 -right-4 bg-white/95 backdrop-blur-sm px-3.5 py-2 rounded-xl border border-[#CBD5E1] shadow-lg flex items-center gap-2 text-xs font-semibold text-[#123047] hidden sm:flex">
              <Sparkles className="w-3.5 h-3.5 text-[#087F8C]" />
              <span>Cross-document multimodal RAG</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
