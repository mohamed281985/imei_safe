import React from 'react';
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface Step {
  id: number;
  label: string;
}

interface ReportProgressStepperProps {
  currentStep: number;
  steps: Step[];
  onNext: () => void;
  onPrevious: () => void;
  isNextDisabled?: boolean;
  isPreviousDisabled?: boolean;
}

const ReportProgressStepper: React.FC<ReportProgressStepperProps> = ({ 
  currentStep, 
  steps, 
  onNext, 
  onPrevious,
  isNextDisabled = false,
  isPreviousDisabled = false
}) => {
  return (
    <div className="w-full px-0 py-4">
      {/* شريط الخطوات */}
      <div className="flex items-center justify-between relative mb-6">
        {/* خط الاتصال بين الخطوات */}
        <div className="absolute left-0 right-0 top-1/2 transform -translate-y-1/2 h-1 bg-gray-200 z-0" />
        <div 
          className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-gradient-to-r from-blue-500 to-cyan-500 z-0 transition-all duration-500"
          style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
        />

        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          const isPending = stepNumber > currentStep;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center flex-1">
              {/* الدائرة */}
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  transition-all duration-300 shadow-md cursor-pointer
                  ${isCompleted 
                    ? 'bg-green-500 border-2 border-green-600' 
                    : isCurrent 
                      ? 'bg-gradient-to-br from-blue-500 to-cyan-500 border-2 border-blue-600 shadow-lg scale-110' 
                      : 'bg-gray-200 border-2 border-gray-300'
                  }
                `}
              >
                {isCompleted ? (
                  <CheckCircle className="w-6 h-6 text-white" />
                ) : (
                  <span className={`text-sm font-bold ${isCurrent ? 'text-white' : 'text-gray-500'}`}>
                    {stepNumber}
                  </span>
                )}
              </div>

              {/* التسمية */}
              <div className="mt-2 text-center">
                <p className={`
                  text-xs font-semibold transition-all duration-300
                  ${isCompleted 
                    ? 'text-green-600' 
                    : isCurrent 
                      ? 'text-blue-600 font-bold' 
                      : 'text-gray-500'
                  }
                `}>
                  {step.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* أزرار التنقل */}
      <div className="flex justify-between items-center mt-4">
        <button
          type="button"
          onClick={onPrevious}
          disabled={isPreviousDisabled}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300
            ${isPreviousDisabled 
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 shadow-md hover:shadow-lg'
            }
          `}
        >
          <ChevronRight className="w-5 h-5" />
          <span>السابق</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={isNextDisabled}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300
            ${isNextDisabled 
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 shadow-md hover:shadow-lg'
            }
          `}
        >
          <span>التالي</span>
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ReportProgressStepper;
