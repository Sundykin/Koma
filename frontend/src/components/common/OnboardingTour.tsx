/**
 * 新手引导组件
 * 基于 Ant Design Tour，首次打开自动触发
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Tour, type TourProps } from 'antd';
import { useTranslation } from 'react-i18next';

const ONBOARDING_KEY = 'koma-onboarding-completed';

interface OnboardingTourProps {
  /** 项目列表区域的 ref */
  projectListRef?: React.RefObject<HTMLElement | null>;
  /** 当前视图 */
  view: string;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ view }) => {
  const { t } = useTranslation('onboarding');
  const [open, setOpen] = useState(false);

  const steps: TourProps['steps'] = useMemo(() => [
    {
      title: t('step0.title'),
      description: t('step0.desc'),
      cover: (
        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 48 }}>
          🎬
        </div>
      ),
    },
    {
      title: t('step1.title'),
      description: t('step1.desc'),
      placement: 'bottom' as const,
    },
    {
      title: t('step2.title'),
      description: t('step2.desc'),
      placement: 'right' as const,
    },
    {
      title: t('step3.title'),
      description: t('step3.desc'),
      placement: 'bottom' as const,
    },
    {
      title: t('step4.title'),
      description: t('step4.desc'),
      cover: (
        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 48 }}>
          🚀
        </div>
      ),
    },
  ], [t]);

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
      steps={steps}
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
