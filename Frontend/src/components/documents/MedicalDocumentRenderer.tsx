import React, { useRef, useState, useEffect } from 'react';
import { MedicalDocumentPageData, ContentType } from '../../types/document.ts';
import { CitationHighlightOverlay } from './CitationHighlightOverlay.tsx';
import {
  FileText,
  AlertCircle,
  CheckCircle2,
  Activity,
  Layers,
  Pill,
  Hospital,
  Sparkles,
} from 'lucide-react';

interface MedicalDocumentRendererProps {
  pageData: MedicalDocumentPageData;
  zoomLevel: number;
  rotation: number;
}

export const MedicalDocumentRenderer: React.FC<MedicalDocumentRendererProps> = ({
  pageData,
  zoomLevel,
  rotation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 1120 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [zoomLevel, rotation, pageData.pageNumber]);

  const scale = zoomLevel / 100;

  return (
    <div
      className="transition-transform duration-150 origin-top flex justify-center py-4"
      style={{
        transform: `scale(${scale}) rotate(${rotation}deg)`,
      }}
    >
      <div
        ref={containerRef}
        id={`pdf-page-${pageData.pageNumber}`}
        className="relative bg-white text-[#123047] w-full max-w-[780px] min-h-[1080px] p-5 sm:p-10 shadow-xl border border-[#CBD5E1] rounded-lg select-text font-sans flex flex-col justify-between"
      >
        {/* Transparent Overlay for Citation Bounding Boxes */}
        <CitationHighlightOverlay
          pageNumber={pageData.pageNumber}
          containerWidth={dimensions.width}
          containerHeight={dimensions.height}
        />

        {/* --- Top Document Header --- */}
        <div>
          <div className="border-b-2 border-[#123047] pb-4 mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#123047] text-white flex items-center justify-center font-bold text-sm">
                <Hospital className="w-6 h-6 text-[#DDF4F5]" />
              </div>
              <div>
                <h2 className="text-base font-extrabold tracking-tight text-[#123047] uppercase">
                  {pageData.header.hospitalOrClinic}
                </h2>
                <p className="text-xs text-[#087F8C] font-semibold">
                  {pageData.header.department}
                </p>
              </div>
            </div>

            <div className="text-right text-[11px] text-[#64748B]">
              <span className="inline-block px-2 py-0.5 rounded bg-slate-100 font-mono font-semibold text-slate-700">
                OFFICIAL CLINICAL RECORD
              </span>
              <p className="mt-1">Page {pageData.pageNumber}</p>
            </div>
          </div>

          {/* Patient Demographic Box */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-[#64748B] uppercase font-bold block">Patient Name</span>
              <span className="font-bold text-[#123047]">{pageData.header.patientName}</span>
            </div>
            <div>
              <span className="text-[10px] text-[#64748B] uppercase font-bold block">Patient MRN</span>
              <span className="font-mono font-semibold text-[#123047]">{pageData.header.patientId}</span>
            </div>
            <div>
              <span className="text-[10px] text-[#64748B] uppercase font-bold block">DOB / Gender</span>
              <span className="font-medium text-[#123047]">
                {pageData.header.dob} • {pageData.header.gender}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[#64748B] uppercase font-bold block">Date Reported</span>
              <span className="font-medium text-[#123047]">{pageData.header.reportedDate}</span>
            </div>
          </div>

          {/* --- Content Sections --- */}
          <div className="space-y-6">
            {pageData.contentSections.map((section, sIdx) => {
              if (section.type === 'table' && section.rows) {
                return (
                  <div key={sIdx} className="space-y-2">
                    {section.heading && (
                      <h3 className="text-xs font-bold text-[#123047] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#CBD5E1] pb-1">
                        <Activity className="w-3.5 h-3.5 text-[#087F8C]" />
                        {section.heading}
                      </h3>
                    )}
                    <div className="border border-[#CBD5E1] rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#F1F5F9] text-[#475569] font-bold text-[11px] border-b border-[#CBD5E1]">
                            <th className="py-2 px-3">Test Name</th>
                            <th className="py-2 px-3">Result</th>
                            <th className="py-2 px-3">Standard Reference Interval</th>
                            <th className="py-2 px-3 text-right">Flag</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {section.rows.map((row, rIdx) => {
                            const isLow = row.flag === 'LOW';
                            const isHigh = row.flag === 'HIGH';
                            return (
                              <tr
                                key={rIdx}
                                className={`transition-colors hover:bg-slate-50/80 ${
                                  isLow ? 'bg-amber-50/30' : isHigh ? 'bg-red-50/30' : ''
                                }`}
                              >
                                <td className="py-2 px-3 font-medium text-[#123047]">
                                  {row.testName}
                                  {row.notes && (
                                    <span className="block text-[10px] text-[#64748B] font-normal italic mt-0.5">
                                      {row.notes}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-bold">
                                  <span className={isLow ? 'text-[#DC2626]' : isHigh ? 'text-[#DC2626]' : 'text-[#123047]'}>
                                    {row.result}
                                  </span>{' '}
                                  <span className="text-[10px] text-[#64748B] font-normal">{row.unit}</span>
                                </td>
                                <td className="py-2 px-3 text-[#475569] font-mono text-[11px]">
                                  {row.referenceRange} {row.unit}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-[11px]">
                                  {isLow ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-[#DC2626]">
                                      <AlertCircle className="w-3 h-3" />
                                      LOW
                                    </span>
                                  ) : isHigh ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-[#DC2626]">
                                      <AlertCircle className="w-3 h-3" />
                                      HIGH
                                    </span>
                                  ) : (
                                    <span className="text-[#16A34A] font-semibold">NORMAL</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }

              if (section.type === 'rxList' && section.rxItems) {
                return (
                  <div key={sIdx} className="space-y-3">
                    {section.heading && (
                      <h3 className="text-xs font-bold text-[#123047] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#CBD5E1] pb-1">
                        <Pill className="w-3.5 h-3.5 text-[#087F8C]" />
                        {section.heading}
                      </h3>
                    )}
                    <div className="space-y-2.5">
                      {section.rxItems.map((rx, rxIdx) => (
                        <div
                          key={rxIdx}
                          className="p-3.5 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#087F8C]/50 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-[10px] font-bold text-[#087F8C] bg-[#DDF4F5] px-2 py-0.5 rounded mr-2 uppercase">
                                Rx #{rxIdx + 1}
                              </span>
                              <strong className="text-sm font-bold text-[#123047]">
                                {rx.medication}
                              </strong>
                            </div>
                            <span className="text-xs font-semibold text-[#334155]">{rx.duration}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#475569]">
                            <div>
                              <span className="text-[#64748B]">Dosage:</span>{' '}
                              <strong className="text-[#123047]">{rx.dosage}</strong>
                            </div>
                            <div>
                              <span className="text-[#64748B]">Frequency:</span>{' '}
                              <strong className="text-[#123047]">{rx.frequency}</strong>
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-[#334155] bg-white p-2 rounded-lg border border-[#E2E8F0] italic">
                            Directions: {rx.instructions}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              if (section.type === 'radiologyViewer' && section.radiologyData) {
                const rad = section.radiologyData;
                return (
                  <div key={sIdx} className="space-y-3">
                    {section.heading && (
                      <h3 className="text-xs font-bold text-[#123047] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#CBD5E1] pb-1">
                        <Layers className="w-3.5 h-3.5 text-[#087F8C]" />
                        {section.heading}
                      </h3>
                    )}

                    {/* Multimodal Digital Imaging Representation Box */}
                    <div className="p-4 rounded-xl border-2 border-slate-300 bg-slate-900 text-white shadow-inner flex flex-col md:flex-row items-center gap-6">
                      {/* Stylized Radiological Scan Schematic */}
                      <div className="w-48 h-56 bg-gradient-to-b from-slate-950 via-slate-900 to-black rounded-lg border border-slate-700 flex flex-col items-center justify-center p-3 relative shrink-0 overflow-hidden">
                        {/* Lung fields contour */}
                        <div className="absolute inset-4 border border-teal-500/30 rounded-3xl flex items-center justify-around pointer-events-none">
                          <div className="w-12 h-28 border-2 border-teal-400/40 rounded-full blur-[0.5px]" />
                          <div className="w-12 h-28 border-2 border-teal-400/40 rounded-full blur-[0.5px]" />
                        </div>
                        {/* Cardiac silhouette */}
                        <div className="w-16 h-20 bg-teal-500/10 border border-teal-400/50 rounded-2xl transform rotate-12 flex items-center justify-center">
                          <span className="text-[8px] font-mono text-teal-300 font-bold">CTR 0.52</span>
                        </div>
                        {/* Scan telemetry tags */}
                        <div className="absolute top-2 left-2 text-[8px] font-mono text-slate-400">
                          PA CHEST • 120kVp
                        </div>
                        <div className="absolute bottom-2 right-2 text-[8px] font-mono text-teal-400">
                          DIAGNOSTIC VIEW
                        </div>
                      </div>

                      {/* Diagnostic Impressions */}
                      <div className="space-y-2 text-xs flex-1">
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-700">
                          <span className="text-[10px] text-teal-400 uppercase tracking-wider font-bold">
                            Diagnostic DR Evaluation
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">ST. JUDE PACS</span>
                        </div>
                        <p className="text-slate-300 leading-relaxed text-[11px]">
                          <strong className="text-white">Findings:</strong> {rad.findings}
                        </p>
                        <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700 text-teal-200 text-[11px]">
                          <strong>Impression:</strong> {rad.impression}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              if (section.type === 'keyValue' && section.pairs) {
                return (
                  <div key={sIdx} className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-3.5 space-y-2">
                    {section.heading && (
                      <h4 className="text-[11px] font-bold text-[#123047] uppercase tracking-wider">
                        {section.heading}
                      </h4>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {section.pairs.map((pair, pIdx) => (
                        <div key={pIdx}>
                          <span className="text-[#64748B] font-semibold">{pair.key}: </span>
                          <span className="text-[#123047] font-medium">{pair.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              if (section.type === 'paragraph' && section.paragraphs) {
                return (
                  <div key={sIdx} className="space-y-1.5">
                    {section.heading && (
                      <h4 className="text-xs font-bold text-[#123047] uppercase tracking-wider border-b border-[#E2E8F0] pb-1">
                        {section.heading}
                      </h4>
                    )}
                    {section.paragraphs.map((p, pIdx) => (
                      <p key={pIdx} className="text-xs text-[#334155] leading-relaxed bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
                        {p}
                      </p>
                    ))}
                  </div>
                );
              }

              return null;
            })}
          </div>
        </div>

        {/* --- Document Footer Note --- */}
        <div className="mt-8 pt-4 border-t border-[#CBD5E1] flex flex-col sm:flex-row items-center justify-between text-[10px] text-[#64748B] gap-2">
          <span>{pageData.footerNotes}</span>
          <span className="font-mono text-slate-400">Page {pageData.pageNumber}</span>
        </div>
      </div>
    </div>
  );
};
