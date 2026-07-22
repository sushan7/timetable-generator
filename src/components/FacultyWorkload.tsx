import { BarChart3, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Faculty } from '../types';

interface FacultyWorkloadProps {
  schedule: Record<string, (string | null)[]>;
  faculties: Faculty[];
  totalBatches: number;
}

export default function FacultyWorkload({ schedule, faculties, totalBatches }: FacultyWorkloadProps) {
  // Calculate how many periods each faculty member is teaching
  const workloadCount: Record<string, number> = {};
  
  Object.values(schedule).forEach(batchSchedule => {
    batchSchedule.forEach(facultyId => {
      if (facultyId && facultyId !== 'LUNCH') {
        workloadCount[facultyId] = (workloadCount[facultyId] || 0) + 1;
      }
    });
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-8">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-indigo-600" />
        <h2 className="font-semibold text-gray-800">Faculty Workload Distribution</h2>
      </div>
      
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {faculties.map(faculty => {
          const assignedPeriods = workloadCount[faculty.id] || 0;
          // Assuming a soft limit of max periods per day based on how many batches exist
          const isOverloaded = assignedPeriods > totalBatches; 
          const utilizationPercentage = Math.min((assignedPeriods / (totalBatches + 1)) * 100, 100);

          return (
            <div key={faculty.id} className="p-4 border border-gray-100 rounded-lg flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-gray-900">{faculty.name}</h3>
                  <p className="text-xs text-gray-500">{faculty.subject}</p>
                </div>
                {isOverloaded ? (
                  <AlertCircle className="w-5 h-5 text-red-500" title="High Workload" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-500" title="Optimal Load" />
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Assigned Classes</span>
                  <span className="font-medium text-gray-900">{assignedPeriods}</span>
                </div>
                
                {/* Visual Progress Bar */}
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      isOverloaded ? 'bg-red-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${utilizationPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}