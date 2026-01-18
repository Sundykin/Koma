import React, { ReactNode } from 'react';
import { EditorStep, EpisodeStepProgress } from '../types';
import { FileText, Users, Clapperboard, Scissors, Check, Lock } from 'lucide-react';
import { Tooltip } from 'antd';

interface StepNavigatorProps {
  currentStep: EditorStep;
  onStepChange: (step: EditorStep) => void;
  stepProgress?: EpisodeStepProgress;  // 各步骤完成状态
  actionButton?: ReactNode;  // 当前步骤的操作按钮
}

// 默认步骤进度（全部未开始）
const defaultStepProgress: EpisodeStepProgress = {
  script: 'pending',
  assets: 'pending',
  storyboard: 'pending',
  video: 'pending',
};

export const StepNavigator: React.FC<StepNavigatorProps> = ({
  currentStep,
  onStepChange,
  stepProgress = defaultStepProgress,
  actionButton,
}) => {
  const steps: { id: EditorStep; label: string; icon: any }[] = [
    { id: 'script', label: '剧本解析', icon: FileText },
    { id: 'assets', label: '角色场景', icon: Users },
    { id: 'storyboard', label: 'AI分镜', icon: Clapperboard },
    { id: 'video', label: '后期剪辑', icon: Scissors },
  ];

  const stepOrder: EditorStep[] = ['script', 'assets', 'storyboard', 'video'];
  const currentIndex = stepOrder.indexOf(currentStep);

  // 判断步骤是否可点击：当前步骤或已完成的步骤可点击
  const isStepClickable = (stepId: EditorStep, index: number): boolean => {
    if (stepId === currentStep) return true;  // 当前步骤可点击
    if (stepProgress[stepId] === 'completed') return true;  // 已完成的步骤可点击
    // 检查前一个步骤是否完成（允许进入下一步）
    if (index > 0) {
      const prevStep = stepOrder[index - 1];
      if (stepProgress[prevStep] === 'completed') return true;
    }
    return false;
  };

  const handleStepClick = (step: EditorStep, index: number) => {
    if (isStepClickable(step, index)) {
      onStepChange(step);
    }
  };

  return (
    <div className="w-full bg-[#141414] border-b border-gray-800 shadow-lg z-30">
      <div className="flex items-center justify-between w-full max-w-5xl mx-auto py-3 px-4">
        {/* 步骤条 */}
        <div className="flex items-center flex-1">
          {steps.map((step, index) => {
            const isActive = step.id === currentStep;
            const isCompleted = stepProgress[step.id] === 'completed';
            const clickable = isStepClickable(step.id, index);
            const isLocked = !clickable && !isActive;

            const stepNode = (
              <div
                onClick={() => handleStepClick(step.id, index)}
                className={`flex items-center gap-2 group relative z-10 select-none transition-opacity ${
                  clickable ? 'cursor-pointer' : 'cursor-not-allowed'
                } ${isLocked ? 'opacity-40' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    isActive
                      ? 'bg-green-600 border-green-500 text-white scale-105'
                      : isCompleted
                      ? 'bg-[#1a1a1a] border-green-600 text-green-500'
                      : 'bg-[#0f0f0f] border-gray-700 text-gray-600'
                  }`}
                >
                  {isCompleted && !isActive ? (
                    <Check className="w-4 h-4 stroke-[3px]" />
                  ) : isLocked ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    <step.icon className="w-4 h-4" />
                  )}
                </div>

                <span
                  className={`text-sm font-medium transition-colors duration-300 ${
                    isActive ? 'text-white' : isCompleted ? 'text-green-500' : 'text-gray-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );

            return (
              <React.Fragment key={step.id}>
                {/* 步骤节点 */}
                {isLocked ? (
                  <Tooltip title="请先完成前置步骤" placement="bottom">
                    {stepNode}
                  </Tooltip>
                ) : (
                  stepNode
                )}

                {/* 连接线 */}
                {index < steps.length - 1 && (
                  <div className="flex-1 h-[2px] mx-3 bg-gray-800 relative rounded-full overflow-hidden min-w-[40px]">
                    <div
                      className="absolute top-0 left-0 h-full bg-green-600 transition-all duration-500 ease-in-out"
                      style={{ width: stepProgress[step.id] === 'completed' ? '100%' : '0%' }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* 操作按钮区域 */}
        {actionButton && (
          <div className="ml-4 flex-shrink-0">
            {actionButton}
          </div>
        )}
      </div>
    </div>
  );
};