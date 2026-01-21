/**
 * 资产匹配确认组件
 * 在分析时展示新资产与已有资产的匹配情况，让用户确认
 */
import React, { useState, useCallback } from 'react';
import {
  Modal,
  List,
  Radio,
  Button,
  Tag,
  Space,
  Typography,
  Progress,
  Divider,
} from 'antd';
import { CheckCircleOutlined, PlusOutlined, LinkOutlined } from '@ant-design/icons';
import type { Character, Scene, Prop } from '../../types';
import type { MatchResult, AssetCandidate } from '../../services/AssetMatcher';

const { Text, Paragraph } = Typography;

interface AssetMatchConfirmProps {
  visible: boolean;
  matches: MatchResult[];
  existingAssets: {
    characters: Character[];
    scenes: Scene[];
    props: Prop[];
  };
  onConfirm: (decisions: AssetMatchDecision[]) => void;
  onCancel: () => void;
}

export interface AssetMatchDecision {
  candidate: AssetCandidate;
  action: 'create' | 'link';
  linkedAssetId?: string;
}

export const AssetMatchConfirm: React.FC<AssetMatchConfirmProps> = ({
  visible,
  matches,
  existingAssets,
  onConfirm,
  onCancel,
}) => {
  const [decisions, setDecisions] = useState<Record<string, AssetMatchDecision>>({});

  // 初始化决策（高置信度自动选择链接，低置信度选择新建）
  React.useEffect(() => {
    const initial: Record<string, AssetMatchDecision> = {};
    matches.forEach((match, idx) => {
      const key = `${idx}-${match.candidate.name}`;
      if (match.type === 'existing' && match.confidence >= 0.9) {
        initial[key] = {
          candidate: match.candidate,
          action: 'link',
          linkedAssetId: match.assetId,
        };
      } else {
        initial[key] = {
          candidate: match.candidate,
          action: 'create',
        };
      }
    });
    setDecisions(initial);
  }, [matches]);

  // 切换决策
  const handleDecisionChange = useCallback((key: string, action: 'create' | 'link', linkedAssetId?: string, candidate?: AssetCandidate) => {
    setDecisions(prev => ({
      ...prev,
      [key]: {
        candidate: candidate || prev[key]?.candidate,
        action,
        linkedAssetId: action === 'link' ? linkedAssetId : undefined,
      },
    }));
  }, []);

  // 确认
  const handleConfirm = useCallback(() => {
    const finalDecisions = Object.values(decisions);
    onConfirm(finalDecisions);
  }, [decisions, onConfirm]);

  // 获取可能匹配的已有资产
  const getPotentialMatches = (candidate: AssetCandidate): { id: string; name: string; type: string }[] => {
    const results: { id: string; name: string; type: string }[] = [];

    existingAssets.characters.forEach(c => {
      results.push({ id: c.id, name: c.name, type: '角色' });
    });
    existingAssets.scenes.forEach(s => {
      results.push({ id: s.id, name: s.name, type: '场景' });
    });
    existingAssets.props.forEach(p => {
      results.push({ id: p.id, name: p.name, type: '道具' });
    });

    return results;
  };

  // 统计
  const stats = {
    total: matches.length,
    linked: Object.values(decisions).filter(d => d.action === 'link').length,
    created: Object.values(decisions).filter(d => d.action === 'create').length,
  };

  return (
    <Modal
      title="资产匹配确认"
      open={visible}
      onCancel={onCancel}
      width={720}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button key="confirm" type="primary" onClick={handleConfirm}>
          确认决策
        </Button>,
      ]}
    >
      {/* 统计信息 */}
      <div className="mb-4 p-3 bg-gray-800 rounded-lg">
        <Space split={<Divider type="vertical" />}>
          <Text>共 {stats.total} 个资产</Text>
          <Text type="success">
            <LinkOutlined /> 复用 {stats.linked} 个
          </Text>
          <Text type="warning">
            <PlusOutlined /> 新建 {stats.created} 个
          </Text>
        </Space>
      </div>

      {/* 匹配列表 */}
      <List
        bordered
        dataSource={matches}
        style={{ maxHeight: 400, overflow: 'auto' }}
        renderItem={(match, idx) => {
          const key = `${idx}-${match.candidate.name}`;
          const decision = decisions[key];
          const potentialMatches = getPotentialMatches(match.candidate);

          return (
            <List.Item>
              <div style={{ width: '100%' }}>
                <div className="flex items-center justify-between mb-2">
                  <Space>
                    <Text strong>{match.candidate.name}</Text>
                    {match.candidate.type && (
                      <Tag>{match.candidate.type}</Tag>
                    )}
                  </Space>
                  {match.type === 'existing' && (
                    <Tag color={match.confidence >= 0.9 ? 'green' : 'orange'}>
                      置信度 {Math.round(match.confidence * 100)}%
                    </Tag>
                  )}
                </div>

                {match.candidate.description && (
                  <Paragraph
                    ellipsis={{ rows: 1 }}
                    type="secondary"
                    style={{ marginBottom: 8, fontSize: 12 }}
                  >
                    {match.candidate.description}
                  </Paragraph>
                )}

                <Radio.Group
                  value={decision?.action}
                  onChange={(e) => {
                    if (e.target.value === 'create') {
                      handleDecisionChange(key, 'create', undefined, match.candidate);
                    }
                  }}
                  size="small"
                >
                  <Radio value="create">
                    <PlusOutlined /> 新建资产
                  </Radio>
                  {match.type === 'existing' && match.assetId && (
                    <Radio
                      value="link"
                      onClick={() => handleDecisionChange(key, 'link', match.assetId, match.candidate)}
                    >
                      <LinkOutlined /> 链接到「{match.reason}」
                    </Radio>
                  )}
                </Radio.Group>

                {/* 如果原本判断为新建，但用户可能想手动链接到其他资产 */}
                {match.type === 'new' && potentialMatches.length > 0 && (
                  <div className="mt-2">
                    <Text type="secondary" className="text-xs">
                      或手动链接到：
                    </Text>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {potentialMatches.slice(0, 5).map(pm => (
                        <Tag
                          key={pm.id}
                          className="cursor-pointer"
                          onClick={() => handleDecisionChange(key, 'link', pm.id, match.candidate)}
                          color={decision?.linkedAssetId === pm.id ? 'green' : 'default'}
                        >
                          {pm.name}
                        </Tag>
                      ))}
                      {potentialMatches.length > 5 && (
                        <Tag>+{potentialMatches.length - 5} 更多</Tag>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </List.Item>
          );
        }}
      />
    </Modal>
  );
};

export default AssetMatchConfirm;
