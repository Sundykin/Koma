/**
 * RecreationPage —— 二创工作台占位页
 *
 * 三场景卡片仅展示路线图，所有"开始"按钮当前为 disabled。
 * 后续 OpenSpec change `add-recreation-workflow-three-scenes` 实施时，
 * 把卡片的 onClick 接到各 Service：
 *   - trailer  → TrailerCutService（M1）
 *   - aspect   → AspectAdaptService（M2）
 *   - locale   → LocalizationService（M3）
 *
 * 与 ChatPage / LinghuiPage 同级，通过 view='recreation' 路由进入。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Tag, Typography } from 'antd';
import { Clapperboard, Film, Languages } from 'lucide-react';

const { Title, Paragraph, Text } = Typography;

interface SceneCardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const SceneCard: React.FC<SceneCardProps> = ({ icon, title, desc }) => (
  <Card
    size="small"
    hoverable={false}
    style={{ height: '100%', cursor: 'not-allowed', opacity: 0.85 }}
    styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12 } }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: 'var(--color-bg-hover, rgba(0,0,0,0.04))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <Text strong style={{ fontSize: 16 }}>
        {title}
      </Text>
    </div>
    <Paragraph type="secondary" style={{ marginBottom: 0, minHeight: 40 }}>
      {desc}
    </Paragraph>
  </Card>
);

export const RecreationPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '40px 48px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
          <Title level={2} style={{ margin: 0 }}>
            {t('recreation.title')}
          </Title>
          <Tag color="processing">{t('recreation.comingSoon')}</Tag>
        </div>
        <Paragraph type="secondary" style={{ marginBottom: 32 }}>
          {t('recreation.subtitle')}
        </Paragraph>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <SceneCard
            icon={<Clapperboard size={20} />}
            title={t('recreation.scenes.trailer.title')}
            desc={t('recreation.scenes.trailer.desc')}
          />
          <SceneCard
            icon={<Film size={20} />}
            title={t('recreation.scenes.aspect.title')}
            desc={t('recreation.scenes.aspect.desc')}
          />
          <SceneCard
            icon={<Languages size={20} />}
            title={t('recreation.scenes.localization.title')}
            desc={t('recreation.scenes.localization.desc')}
          />
        </div>
      </div>
    </div>
  );
};

export default RecreationPage;
