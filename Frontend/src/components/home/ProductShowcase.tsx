import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  BookmarkCheck,
  MousePointerClick,
  Maximize2,
} from 'lucide-react';

export const ProductShowcase: React.FC = () => {
  const navigate = useNavigate();
  const [activeCitationDemo, setActiveCitationDemo] = useState<number>(1);

  return (
    <section id="showcase" className="py-20 bg-white border-b border-[#E2E8F0]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DDF4F5] text-[#087F8C] text-xs font-semibold mb-3">
            Grounded AI Intelligence
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#123047] tracking-tight">
            See Evidence-Backed Retrieval in Action
          </h2>
          <p className="mt-4 text-base sm:text-lg text-[#64748B]">
            Every AI statement is linked directly to exact bounding boxes on laboratory reports, prescriptions, or imaging scans.
          </p>
        </div>

        {/* Interactive Showcase Sandbox */}
        <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-2xl shadow-xl overflow-hidden">
          {/* Header Bar */}
          <div className="bg-[#123047] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#087F8C] flex items-center justify-center text-white font-bold text-xs">
                AI
              </div>
              <div>
                <div className="text-sm font-bold flex items-center gap-2">
                  <span>Interactive Clinical Demo: Platelet & Hemoglobin Retrieval</span>
                  <span className="text-[10px] bg-[#DDF4F5] text-[#087F8C] px-2 py-0.5 rounded font-bold uppercase">
                    Interactive
                  </span>
                </div>
                <div className="text-xs text-slate-300">
                  Target Document: CBC_Blood_Report.pdf • Apex Clinical Pathology
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate('/workspace')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#087F8C] text-white hover:bg-[#0AA1B2] transition-all shadow-sm"
            >
              <span>Launch Full Workspace</span>
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Split Display */}
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[500px]">
            {/* Left: Conversational Answer */}
            <div className="lg:col-span-5 p-6 border-b lg:border-b-0 lg:border-r border-[#E2E8F0] bg-white flex flex-col justify-between">
              <div>
                {/* Question bubble */}
                <div className="mb-6">
                  <div className="text-xs font-bold text-[#64748B] mb-2 uppercase tracking-wider">
                    Example Query
                  </div>
                  <div className="bg-[#DDF4F5] text-[#123047] text-sm font-semibold p-3.5 rounded-xl border border-[#BDEFE7]">
                    "What does my complete blood count report indicate?"
                  </div>
                </div>

                {/* AI Grounded Response */}
                <div className="space-y-4">
                  <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider flex items-center justify-between">
                    <span>Synthesized Response</span>
                    <span className="text-[11px] text-[#087F8C] font-semibold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Click citation badges below
                    </span>
                  </div>

                  <div className="text-sm text-[#334155] leading-relaxed space-y-3">
                    <p>
                      Your Complete Blood Count demonstrates normal erythroid and leukocytic parameters, but highlights an isolated low platelet count:
                    </p>

                    <div
                      onClick={() => setActiveCitationDemo(1)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        activeCitationDemo === 1
                          ? 'bg-[#DDF4F5]/60 border-[#087F8C] shadow-sm'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-semibold text-[#123047] text-xs">
                          1. Platelet Count (Mild Thrombocytopenia)
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#087F8C] text-white">
                          [1]
                        </span>
                      </div>
                      <p className="text-xs text-[#475569] mt-1">
                        Platelet count is <strong>120 x10^9/L</strong>, below the standard range of 150 – 450 x10^9/L. Confirmed via smear review.
                      </p>
                    </div>

                    <div
                      onClick={() => setActiveCitationDemo(2)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        activeCitationDemo === 2
                          ? 'bg-[#DDF4F5]/60 border-[#087F8C] shadow-sm'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-semibold text-[#123047] text-xs">
                          2. Hemoglobin & Red Cells
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#087F8C] text-white">
                          [2]
                        </span>
                      </div>
                      <p className="text-xs text-[#475569] mt-1">
                        Hemoglobin level is <strong>14.2 g/dL</strong> (normal reference: 13.5 – 17.5 g/dL) with normal hematocrit of 42.8%.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="mt-6 pt-4 border-t border-[#E2E8F0] bg-[#FFFBEB] p-3 rounded-xl border border-[#FDE68A] flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                <p className="text-xs text-[#92400E] leading-normal">
                  <strong>Clinical Notice:</strong> MediLens AI assists document understanding and evidence retrieval. It does not replace clinical consultation, diagnostic confirmation, or professional medical advice.
                </p>
              </div>
            </div>

            {/* Right: PDF Viewer Simulation with Highlights */}
            <div className="lg:col-span-7 p-6 bg-[#F1F5F9] flex flex-col justify-between">
              <div className="bg-white rounded-xl shadow-md border border-[#CBD5E1] p-6 max-w-2xl mx-auto w-full relative">
                {/* PDF Header */}
                <div className="border-b-2 border-[#123047] pb-3 mb-4 flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-sm text-[#123047]">APEX CLINICAL PATHOLOGY LABORATORIES</h4>
                    <p className="text-[11px] text-[#64748B]">Automated Hematology Diagnostic Report</p>
                  </div>
                  <div className="text-right text-[11px] text-[#64748B]">
                    <p className="font-semibold text-[#123047]">Patient: Hayes, Alexander</p>
                    <p>ID: PT-94821-X • Age: 42</p>
                  </div>
                </div>

                {/* PDF Table */}
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-5 font-bold text-[#64748B] text-[11px] border-b pb-1">
                    <span className="col-span-2">Test Name</span>
                    <span>Result</span>
                    <span>Reference Range</span>
                    <span className="text-right">Flag</span>
                  </div>

                  {/* Row: Hemoglobin (Citation [2]) */}
                  <div
                    className={`grid grid-cols-5 py-1.5 px-2 rounded transition-all ${
                      activeCitationDemo === 2
                        ? 'bg-[#BDEFE7] border-2 border-[#087F8C] shadow-md ring-2 ring-[#087F8C]/20 font-semibold'
                        : 'text-[#334155]'
                    }`}
                  >
                    <span className="col-span-2">Hemoglobin (Hb)</span>
                    <span className="font-bold">14.2 g/dL</span>
                    <span>13.5 - 17.5</span>
                    <span className="text-right text-[#16A34A] font-semibold">NORMAL</span>
                  </div>

                  {/* Row: Hematocrit */}
                  <div className="grid grid-cols-5 py-1 px-2 text-[#64748B]">
                    <span className="col-span-2">Hematocrit (Hct)</span>
                    <span>42.8 %</span>
                    <span>41.0 - 50.0</span>
                    <span className="text-right text-[#16A34A]">NORMAL</span>
                  </div>

                  {/* Row: WBC */}
                  <div className="grid grid-cols-5 py-1 px-2 text-[#64748B]">
                    <span className="col-span-2">WBC Total Count</span>
                    <span>6.8 x10^9/L</span>
                    <span>4.5 - 11.0</span>
                    <span className="text-right text-[#16A34A]">NORMAL</span>
                  </div>

                  {/* Row: Platelets (Citation [1]) */}
                  <div
                    className={`grid grid-cols-5 py-2 px-2 rounded transition-all relative ${
                      activeCitationDemo === 1
                        ? 'bg-[#BDEFE7] border-2 border-[#087F8C] shadow-md ring-2 ring-[#087F8C]/20 font-semibold'
                        : 'text-[#334155]'
                    }`}
                  >
                    {activeCitationDemo === 1 && (
                      <div className="absolute -top-3 right-3 bg-[#087F8C] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm flex items-center gap-1 animate-pulse">
                        <BookmarkCheck className="w-3 h-3" />
                        Grounded Citation [1]
                      </div>
                    )}
                    <span className="col-span-2 text-[#123047] font-bold">Platelet Count</span>
                    <span className="font-bold text-[#DC2626]">120 x10^9/L</span>
                    <span>150 - 450</span>
                    <span className="text-right text-[#DC2626] font-bold">LOW</span>
                  </div>

                  {/* Comments */}
                  <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-[11px] text-[#475569]">
                    <strong>Pathologist Note:</strong> Smear demonstrates true thrombocytopenia with occasional giant platelets. Re-evaluate in 2-4 weeks.
                  </div>
                </div>
              </div>

              {/* Bottom viewer caption */}
              <div className="mt-4 flex items-center justify-between text-xs text-[#64748B]">
                <span className="flex items-center gap-1.5">
                  <MousePointerClick className="w-4 h-4 text-[#087F8C]" />
                  Active source bounding box automatically updates when you click citations.
                </span>
                <span className="font-mono text-[11px] bg-white px-2 py-1 rounded border border-[#E2E8F0]">
                  Coords: [80, 430, 920, 495]
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
