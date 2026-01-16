import React from 'react';
import { EditorStep } from '../types';
import { FileText, Users, Clapperboard, Scissors, Check } from 'lucide-react';

interface StepNavigatorProps {
  currentStep: EditorStep;
  onStepChange: (step: EditorStep) => void;
}

export const StepNavigator: React.FC<StepNavigatorProps> = ({ currentStep, onStepChange }) => {
  const steps: { id: EditorStep; label: string; subLabel: string; icon: any }[] = [
    { id: 'script', label: '剧本解析', subLabel: 'Script Parsing', icon: FileText },
    { id: 'assets', label: '角色场景', subLabel: 'Assets Gen', icon: Users },
    { id: 'storyboard', label: 'AI分镜', subLabel: 'Storyboard', icon: Clapperboard },
    { id: 'video', label: '后期剪辑', subLabel: 'Editing', icon: Scissors },
  ];

  const stepOrder = ['script', 'assets', 'storyboard', 'video'];
  const currentIndex = stepOrder.indexOf(currentStep);

  return (
    <div className="w-full bg-[#141414] border-b border-gray-800 shadow-xl z-30">
        <div className="flex items-center justify-center w-full max-w-5xl mx-auto py-8 px-4">
        {steps.map((step, index) => {
            const isActive = step.id === currentStep;
            const isCompleted = index < currentIndex;
            const isFuture = index > currentIndex;
            
            return (
            <React.Fragment key={step.id}>
                {/* 步骤节点 */}
                <div 
                onClick={() => onStepChange(step.id)}
                className={`flex flex-col items-center gap-3 cursor-pointer group relative z-10 w-24 select-none ${isFuture ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                <div 
                    className={`w-14 h-14 rounded-full flex items-center justify-center border-[3px] transition-all duration-500 shadow-2xl ${
                    isActive 
                        ? 'bg-green-600 border-green-500 text-white shadow-green-900/50 scale-110' 
                        : isCompleted 
                        ? 'bg-[#1a1a1a] border-green-600 text-green-500' 
                        : 'bg-[#0f0f0f] border-gray-700 text-gray-600'
                    }`}
                >
                    {isCompleted ? <Check className="w-7 h-7 stroke-[3px]" /> : <step.icon className="w-6 h-6" />}
                </div>
                
                <div className="text-center flex flex-col">
                    <span 
                        className={`text-sm font-bold tracking-wide transition-colors duration-300 ${
                        isActive ? 'text-white' : isCompleted ? 'text-green-500' : 'text-gray-500'
                        }`}
                    >
                        {step.label}
                    </span>
                    <span className="text-[10px] uppercase font-mono text-gray-600 mt-0.5 tracking-wider">
                        {step.subLabel}
                    </span>
                </div>

                {/* 激活状态下的底部光晕点缀 */}
                {isActive && (
                    <div className="absolute -bottom-10 w-16 h-1 bg-green-500 rounded-full blur-[2px]"></div>
                )}
                </div>

                {/* 连接线 (最后一个节点不需要) */}
                {index < steps.length - 1 && (
                <div className="flex-1 h-[3px] mx-4 -mt-10 bg-gray-800 relative rounded-full overflow-hidden">
                    <div 
                    className={`absolute top-0 left-0 h-full bg-green-600 transition-all duration-700 ease-in-out`}
                    style={{ width: index < currentIndex ? '100%' : '0%' }}
                    />
                </div>
                )}
            </React.Fragment>
            );
        })}
        </div>
    </div>
  );
};