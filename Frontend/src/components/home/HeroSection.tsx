import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ShieldCheck,
  FileText,
  Table,
  ScanSearch,
  Quote,
  PlayCircle,
} from 'lucide-react';
import { MultimodalRagScene } from './MultimodalRagScene.tsx';
import { EcgLine } from './EcgLine.tsx';

/**
 * Landing hero — deep clinical-navy stage with the Multimodal Medical RAG
 * 3D scene: a pulsing knowledge core (medical cross) orbited by the three
 * ingested modalities while embedding particles stream into the index.
 */

const FLOAT_CHIPS = [
  { icon: FileText, label: 'Text chunks', position: 'top-6 left-2 sm:left-6', accent: 'text-[#2FD8E6]' },
  { icon: Table, label: 'Clinical tables', position: 'top-24 -right-1 sm:right-0', accent: 'text-[#3CD97B]' },
  { icon: ScanSearch, label: 'Radiology images', position: 'bottom-24 -left-1 sm:left-0', accent: 'text-[#A78BFA]' },
  { icon: Quote, label: 'Citation [1] • Page 2', position: 'bottom-6 right-4', accent: 'text-white/80' },
];

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden bg-[#071A2C]">
      {/* Layered ambience: radial teal glows + fine dot grid */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute -top-40 -left-40 w-[560px] h-[560px] rounded-full bg-[#087F8C]/25 blur-[140px]" />
        <div className="absolute top-1/3 -right-48 w-[620px] h-[620px] rounded-full bg-[#0AA1B2]/15 blur-[160px]" />
        <div className="absolute bottom-0 left-1/3 w-[420px] h-[420px] rounded-full bg-[#123047]/60 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage: 'radial-gradient(rgba(148, 224, 233, 0.9) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
        />
        {/* Fade into the light sections below */}
        <div className="absolute bottom-0 inset-x-0 h-28 bg-gradient-to-b from-transparent to-[#F7FAFC]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-24 md:pt-20 md:pb-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-6 items-center">
          {/* Left column — copy */}
          <div className="lg:col-span-6 flex flex-col items-start text-left">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-[#2FD8E6]/25 text-[#7EE7EF] text-xs font-semibold tracking-wide mb-6 backdrop-blur-sm"
            >
              <span className="relative flex w-2 h-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2FD8E6] opacity-60" />
                <span className="relative inline-flex rounded-full w-2 h-2 bg-[#2FD8E6]" />
              </span>
              Multimodal Medical RAG — Text, Tables & Imaging
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08 }}
              className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold text-white tracking-tight leading-[1.12] mb-6"
            >
              Your medical records,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2FD8E6] via-[#48C4D0] to-[#8F7BF0]">
                understood down to the citation.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.16 }}
              className="text-lg text-[#A7BCCB] mb-9 leading-relaxed max-w-xl"
            >
              Upload lab reports, prescriptions and imaging summaries. MediLens reads every
              text passage, table and clinical image, indexes it into a private vector core,
              and answers with evidence you can jump straight to — bounding box and all.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.24 }}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto mb-10"
            >
              <button
                onClick={() => navigate('/workspace')}
                className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold bg-[#0AA1B2] text-white hover:bg-[#0BB3C5] transition-all shadow-lg shadow-[#087F8C]/30 cursor-pointer"
              >
                <span>Open Your Workspace</span>
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </button>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-base font-medium text-white/90 bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/25 transition-all backdrop-blur-sm"
              >
                <PlayCircle className="w-5 h-5 text-[#7EE7EF]" />
                <span>See How It Works</span>
              </a>
            </motion.div>

            {/* Trust row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 border-t border-white/10 w-full"
            >
              {[
                { icon: ShieldCheck, label: 'AES-256-GCM + KMS-signed documents' },
                { icon: FileText, label: 'OCR-grade table & text extraction' },
                { icon: Quote, label: 'Every answer grounded in-source' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[#2FD8E6]" />
                  </div>
                  <span className="text-xs font-medium text-[#A7BCCB]">{label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right column — 3D multimodal scene */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="lg:col-span-6 relative h-[420px] sm:h-[500px] lg:h-[560px]"
          >
            {/* Ambient halo behind the canvas */}
            <div className="absolute inset-8 rounded-full bg-[#0AA1B2]/20 blur-[90px] pointer-events-none" />

            <div className="absolute inset-0">
              <MultimodalRagScene />
            </div>

            {/* Floating modality chips around the scene */}
            {FLOAT_CHIPS.map(({ icon: Icon, label, position, accent }) => (
              <div
                key={label}
                className={`absolute ${position} flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.07] border border-white/12 backdrop-blur-md shadow-lg text-xs font-semibold text-white/90 animate-float-slow`}
              >
                <Icon className={`w-4 h-4 ${accent}`} />
                <span>{label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* ECG strip grounding the hero */}
        <div className="relative mt-6 h-16 opacity-80">
          <EcgLine className="h-full" />
        </div>
      </div>
    </section>
  );
};
