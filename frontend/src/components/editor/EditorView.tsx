import React from 'react';
import { Button } from 'antd';
import {
  LayoutDashboard,
  Sparkles,
  Users,
  Clapperboard,
  Scissors,
} from 'lucide-react';
import { Project, Episode, EditorStep, ScriptAnalysisResult, AppSettings } from '../../types';
import type { MentionItem } from '../../editor';
import { ScriptEditor } from '../../editor';
import { SimpleEditor } from './index';
import { AssetManager } from '../asset/AssetManager';
import { Storyboard } from '../storyboard/Storyboard';

interface EditorViewProps {
  activeProject: Project;
  activeEpisode: Episode | null;
  editorStep: EditorStep;
  scriptText: string;
  analysisData: ScriptAnalysisResult | null;
  appSettings: AppSettings;
  mentionItems: MentionItem[];
  onScriptChange: (text: string) => void;
  onStepChange: (step: EditorStep) => void;
  onViewChange: (view: 'projects') => void;
}

export const EditorView: React.FC<EditorViewProps> = ({
  activeProject,
  activeEpisode,
  editorStep,
  scriptText,
  analysisData,
  appSettings,
  mentionItems,
  onScriptChange,
  onStepChange,
  onViewChange,
}) => {
  return (
    <>
      {/* 剧本编辑器视图 */}
      {editorStep === 'script' && (
        <div className="flex h-full">
          {/* 编辑器主体 */}
          <div className="flex-1 flex flex-col p-4">
            <div className="flex-1 flex flex-col overflow-hidden">
              <ScriptEditor
                value={scriptText}
                onChange={onScriptChange}
                placeholder="在此开始创作... (支持直接粘贴小说或剧本，使用 @ 引用角色、场景、道具)"
                mentionItems={mentionItems}
                minHeight="100%"
                maxHeight="100%"
                showLineNumbers={true}
                darkTheme={true}
                style={{ height: '100%', flex: 1 }}
              />
            </div>

            {/* 底部状态栏 */}
            <div className="mt-3 flex justify-between items-center text-xs text-zinc-500">
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {scriptText.length} 字符 | 模型: <span className="text-blue-400 font-mono">
                  {appSettings.llmConfigs.find(c => c.isDefault)?.name || appSettings.llmConfigs[0]?.name || '未配置'}
                </span>
              </span>
            </div>
          </div>

          {/* 分析结果侧边栏 */}
          <div className={`w-80 border-l border-zinc-800 bg-zinc-900 flex flex-col transition-all ${analysisData ? 'translate-x-0' : 'translate-x-full hidden xl:flex'}`}>
            <div className="p-5 border-b border-zinc-800 bg-zinc-900">
              <h3 className="font-bold text-zinc-300 text-sm uppercase tracking-wider flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-purple-500" />
                智能分析概览
              </h3>
            </div>

            {analysisData ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {/* 角色卡片 */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs text-zinc-500 font-bold uppercase">
                    <span>核心角色</span>
                    <span className="bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded-full">{analysisData.characters.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {analysisData.characters.map(c => (
                      <div key={c.id} className="bg-zinc-800 p-2 rounded border border-zinc-700 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400">
                          {c.name.charAt(0)}
                        </div>
                        <span className="text-sm text-zinc-300 truncate">{c.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 场景列表 */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs text-zinc-500 font-bold uppercase">
                    <span>场景列表</span>
                    <span className="bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded-full">{analysisData.scenes.length}</span>
                  </div>
                  <div className="space-y-2">
                    {analysisData.scenes.map(s => (
                      <div key={s.id} className="text-xs bg-zinc-800 p-3 rounded border border-zinc-700 flex flex-col gap-1 hover:border-purple-500/30 transition-colors">
                        <span className="text-zinc-300 font-bold">{s.name}</span>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">{s.time === 'day' ? '☀️ 日' : '🌙 夜'}</span>
                          <span className="text-purple-400/80">{s.mood}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                  <Sparkles className="w-8 h-8 opacity-20" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-400">等待分析</p>
                  <p className="text-xs mt-1">输入剧本并点击下方按钮，AI 将自动提取角色与分镜。</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 资产管理视图 */}
      {editorStep === 'assets' && (
        activeProject ? (
          <AssetManager
            projectId={activeProject.id}
            ttiConfigId={activeProject.ttiConfigId}
            episodeId={activeEpisode?.id}
            episodeName={activeEpisode?.title || (activeEpisode ? `第${activeEpisode.number}集` : undefined)}
            script={scriptText}
            llmConfigId={activeProject.llmConfigId}
            characters={analysisData?.characters}
            scenes={analysisData?.scenes}
            props={analysisData?.props}
            onNext={() => onStepChange('storyboard')}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500 flex-col gap-4">
            <Users className="w-16 h-16 opacity-10" />
            <p>请先选择项目。</p>
            <Button type="link" onClick={() => onViewChange('projects')}>返回项目列表</Button>
          </div>
        )
      )}

      {/* 分镜视图 */}
      {editorStep === 'storyboard' && (
        activeProject ? (
          <Storyboard
            projectId={activeProject.id}
            episodeId={activeEpisode?.id}
            episodeName={activeEpisode?.title || (activeEpisode ? `第${activeEpisode.number}集` : undefined)}
            script={scriptText}
            llmConfigId={activeProject.llmConfigId}
            ttiConfigId={activeProject.ttiConfigId}
            settings={appSettings}
            mentionItems={mentionItems}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500 flex-col gap-4">
            <Clapperboard className="w-16 h-16 opacity-10" />
            <p>请先选择项目。</p>
            <Button type="link" onClick={() => onViewChange('projects')}>返回项目列表</Button>
          </div>
        )
      )}

      {/* 剪辑视图 */}
      {editorStep === 'video' && (
        analysisData ? (
          <SimpleEditor
            shots={analysisData.shots}
            projectId={activeProject?.id}
            episodeId={activeEpisode?.id}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500 flex-col gap-4">
            <Scissors className="w-16 h-16 opacity-10" />
            <p>需完成分镜生成后才能进入剪辑环节。</p>
            <Button type="link" onClick={() => onStepChange('script')}>返回剧本</Button>
          </div>
        )
      )}
    </>
  );
};
