/**
 * 新手引导组件
 * 基于 Ant Design Tour，首次打开自动触发
 */
import React, { useState, useEffect, useRef } from 'react';
import { Tour, type TourProps } from 'antd';

const ONBOARDING_KEY = 'koma-onboarding-completed';

interface OnboardingTourProps {
  /** 项目列表区域的 ref */
  projectListRef?: React.RefObject<HTMLElement | null>;
  /** 当前视图 */
  view: string;
}

const STEPS: TourProps['steps'] = [
  {
    title: '欢迎使用 Koma Studio 🎬',
    description: '这是一款 AI 驱动的短剧创作工具。让我们快速了解核心流程：从剧本到成品视频，只需三步。',
    cover: (
      <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 48 }}>
        🎬
      </div>
    ),
  },
  {
    title: '第一步：创建项目',
    description: '点击"新建项目"开始创作。选择短剧或解说模式，设置视觉风格。',
    placement: 'bottom',
  },
  {
    title: '第二步：配置 AI 服务',
    description: '在全局设置中配置 LLM（剧本解析）、TTI（文生图）、ITV（图生视频）、TTS（语音合成）服务。这是生成内容的基础。',
    placement: 'right',
  },
  {
    title: '三步工作流',
    description: '进入项目后，按照 资产管理 → AI分镜 → 后期剪辑 三步流程完成创作。每一步都有 AI 辅助。',
    placement: 'bottom',
  },
  {
    title: '开始创作吧！',
    description: '现在你已了解基本流程。创建第一个项目，体验 AI 短剧创作的魅力。如需重新查看引导，可在设置中找到。',
    cover: (
      <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 48 }}>
        🚀
      </div>
    ),
  },
];

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ view }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // 仅在项目列表页且首次打开时触发
    if (view !== 'projects') return;
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      // 延迟显示，等页面渲染完成
      const timer = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, [view]);

  const handleClose = () => {
    setOpen(false);
    localStorage.setItem(ONBOARDING_KEY, 'true');
  };

  return (
    <Tour
      open={open}
      onClose={handleClose}
      steps={STEPS}
      type="primary"
    />
  );
};

/** 重置引导状态（供设置页调用） */
export function resetOnboarding() {
  localStorage.removeItem(ONBOARDING_KEY);
}

/** 检查引导是否已完成 */
export function isOnboardingCompleted(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === 'true';
}
