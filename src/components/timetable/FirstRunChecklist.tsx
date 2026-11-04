import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Layers, Settings, Play, CheckCircle2, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import Button from '../ui/Button';
import type { Faculty, Batch } from '../../types';

export interface FirstRunChecklistProps {
  faculties: Faculty[];
  batches: Batch[];
  currentDay: string;
  hasGenerated: boolean;
  allocationsCount: number;
  isGenerating: boolean;
  generationProgress?: { progress: number; stage: string } | null;
  onGenerate: () => void;
}

export const FirstRunChecklist: React.FC<FirstRunChecklistProps> = ({
  faculties,
  batches,
  currentDay,
  hasGenerated,
  allocationsCount,
  isGenerating,
  generationProgress,
  onGenerate,
}) => {
  const step1Done = faculties.length > 0;
  const step2Done = batches.length > 0;
  const step3Done = true; // Settings always have valid defaults
  const step4Done = hasGenerated && allocationsCount > 0;

  const completedSteps = [step1Done, step2Done, step3Done, step4Done].filter(Boolean).length;
  const progressPercent = Math.round((completedSteps / 4) * 100);

  return (
    <div className="p-6 sm:p-8 bg-[#F3EEE6]/60 rounded-xl border border-[#A89B8A]/40 space-y-8 max-w-4xl mx-auto shadow-sm">
      {/* Header Banner */}
      <div className="text-center space-y-2 max-w-xl mx-auto">
        <div className="w-12 h-12 bg-[#6B2638]/10 text-[#6B2638] rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
          <Sparkles className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-[#252326] tracking-tight">
          Welcome to Timetable Pro
        </h3>
        <p className="text-xs text-[#252326]/75 leading-relaxed">
          Follow the 4-step setup checklist below to configure your academic institution and generate a clash-free schedule for {currentDay}.
        </p>

        {/* Progress Bar */}
        <div className="pt-3 max-w-xs mx-auto space-y-1.5">
          <div className="flex justify-between text-[11px] font-semibold text-[#252326]/80">
            <span>Setup Progress</span>
            <span>{completedSteps} of 4 steps complete ({progressPercent}%)</span>
          </div>
          <div className="w-full h-2 bg-[#A89B8A]/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#6B2638] transition-all duration-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4-Step Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
        {/* Step 1: Faculty */}
        <div className={`p-4 rounded-lg border transition-all ${
          step1Done ? 'bg-white border-[#A89B8A]/40 shadow-xs' : 'bg-white/80 border-amber-300'
        } flex flex-col justify-between space-y-3`}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-[#6B2638] text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              {step1Done ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  Action required
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#252326]">
              <Users className="w-4 h-4 text-[#6B2638]" />
              <h4>Faculty Pool</h4>
            </div>
            <p className="text-[11px] text-[#252326]/70 leading-normal">
              {faculties.length > 0
                ? `${faculties.length} instructors loaded with subjects and load caps.`
                : 'Add or import instructor profiles and subject qualifications.'}
            </p>
          </div>
          <Link
            to="/faculty"
            className="text-xs font-bold text-[#6B2638] flex items-center gap-1 hover:underline pt-2 border-t border-stone-100"
          >
            Manage Faculty <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Step 2: Batches */}
        <div className={`p-4 rounded-lg border transition-all ${
          step2Done ? 'bg-white border-[#A89B8A]/40 shadow-xs' : 'bg-white/80 border-amber-300'
        } flex flex-col justify-between space-y-3`}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-[#6B2638] text-white text-xs font-bold flex items-center justify-center">
                2
              </span>
              {step2Done ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  Action required
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#252326]">
              <Layers className="w-4 h-4 text-[#6B2638]" />
              <h4>Batches & Sections</h4>
            </div>
            <p className="text-[11px] text-[#252326]/70 leading-normal">
              {batches.length > 0
                ? `${batches.length} sections defined across classrooms and buildings.`
                : 'Define batches, period timings, and room allocations.'}
            </p>
          </div>
          <Link
            to="/batches"
            className="text-xs font-bold text-[#6B2638] flex items-center gap-1 hover:underline pt-2 border-t border-stone-100"
          >
            Inspect Batches <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Step 3: Settings */}
        <div className="p-4 rounded-lg border bg-white border-[#A89B8A]/40 shadow-xs flex flex-col justify-between space-y-3">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-[#6B2638] text-white text-xs font-bold flex items-center justify-center">
                3
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ready
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#252326]">
              <Settings className="w-4 h-4 text-[#6B2638]" />
              <h4>Scheduler Settings</h4>
            </div>
            <p className="text-[11px] text-[#252326]/70 leading-normal">
              Core/language weights, period pacing, and travel gaps are configured.
            </p>
          </div>
          <Link
            to="/settings"
            className="text-xs font-bold text-[#6B2638] flex items-center gap-1 hover:underline pt-2 border-t border-stone-100"
          >
            Review Settings <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Step 4: Generate */}
        <div className={`p-4 rounded-lg border transition-all ${
          step4Done
            ? 'bg-white border-emerald-300 shadow-xs'
            : 'bg-white border-[#6B2638]/40 shadow-sm'
        } flex flex-col justify-between space-y-3`}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="w-6 h-6 rounded-full bg-[#6B2638] text-white text-xs font-bold flex items-center justify-center">
                4
              </span>
              {step4Done ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Generated
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6B2638] bg-[#6B2638]/10 px-2 py-0.5 rounded-full">
                  Ready to run
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#252326]">
              <Play className="w-4 h-4 text-[#6B2638]" />
              <h4>Run Scheduler</h4>
            </div>
            <p className="text-[11px] text-[#252326]/70 leading-normal">
              Execute constraint engine to allocate teachers and optimize slot distribution.
            </p>
          </div>

          <div className="pt-2 border-t border-stone-100">
            <Button
              size="sm"
              variant="primary"
              icon={isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              onClick={onGenerate}
              loading={isGenerating}
              disabled={isGenerating || faculties.length === 0 || batches.length === 0}
              className="w-full text-xs"
            >
              {isGenerating ? 'Generating...' : 'Generate Schedule'}
            </Button>
            {generationProgress && (
              <p className="text-[10px] text-[#6B2638] font-medium text-center mt-1 truncate">
                {generationProgress.stage}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirstRunChecklist;

